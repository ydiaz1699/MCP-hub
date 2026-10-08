import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { SessionManager } from '../src/session-manager.js';
import { PermissionManager } from '../src/permissions.js';
import { EventBus } from '../src/event-bus.js';
import { BridgeClient } from '../src/bridge-client.js';

// A fake VS Code Bridge: records calls and echoes a canned result.
function fakeBridge(token: string) {
  const calls: any[] = [];
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('no'); return; }
    let body = ''; for await (const c of req) body += c;
    const input = JSON.parse(body);
    calls.push(input);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, result: { echoed: input.tool } }));
  });
  return { server, calls };
}

function listen(server: http.Server, port: number) {
  return new Promise<void>(resolve => server.listen(port, '127.0.0.1', resolve));
}

test('exclusive lock blocks a second session on the same workspace', () => {
  const sessions = new SessionManager(undefined); // in-memory
  const a = sessions.create('claude', '/ws/project', 'exclusive');
  const b = sessions.create('cursor', '/ws/project', 'exclusive');
  assert.equal(sessions.acquire(a.id).locked, false); // claude takes the lock
  // acquire no longer throws: it reports the lock is held by another session
  const second = sessions.acquire(b.id);
  assert.equal(second.locked, true);
  assert.equal(second.lockOwner, a.id);
  // but requireLock (used by mutating tools) DOES throw with an actionable message
  assert.throws(() => sessions.requireLock(b.id), /is locked by session/);
});

test('a blocked second session still exists and can take the lock after release (Option 1)', () => {
  const sessions = new SessionManager(undefined);
  const a = sessions.create('claude', '/ws/project', 'exclusive');
  const b = sessions.create('cursor', '/ws/project', 'exclusive');
  sessions.acquire(a.id);
  // b was created and is still a valid, usable session even though it couldn't lock
  assert.ok(sessions.get(b.id), 'blocked session must still exist');
  assert.equal(sessions.acquire(b.id).locked, true);
  // claude releases its lock (release removes claude's session + frees the lock)
  for (const [ws, owner] of (sessions as any).locks) if (owner === a.id) (sessions as any).locks.delete(ws);
  (sessions as any).sessions.delete(a.id);
  // now b can take the lock without re-creating a session
  assert.equal(sessions.acquire(b.id).locked, false);
  assert.doesNotThrow(() => sessions.requireLock(b.id));
});

test('read-only session never takes a lock', () => {
  const sessions = new SessionManager(undefined);
  const ro = sessions.create('viewer', '/ws/project', 'read-only');
  assert.equal(sessions.acquire(ro.id).locked, false);
  const other = sessions.create('writer', '/ws/project', 'exclusive');
  // read-only did not lock, so writer can still acquire
  assert.equal(sessions.acquire(other.id).locked, false);
});

test('releasing a session frees its lock for another client', () => {
  const sessions = new SessionManager(undefined);
  const a = sessions.create('claude', '/ws/project', 'exclusive');
  sessions.acquire(a.id);
  sessions.release(a.id);
  const b = sessions.create('cursor', '/ws/project', 'exclusive');
  assert.equal(sessions.acquire(b.id).locked, false); // free now
});

test('expired lease auto-releases the lock', async () => {
  const sessions = new SessionManager(undefined, 20); // 20ms lease
  const a = sessions.create('claude', '/ws/project', 'exclusive');
  sessions.acquire(a.id);
  await new Promise(r => setTimeout(r, 40));
  const b = sessions.create('cursor', '/ws/project', 'exclusive');
  assert.equal(sessions.acquire(b.id).locked, false); // a's lease expired → lock freed
});

test('permission deny blocks a tool globally', () => {
  const perms = new PermissionManager('/nonexistent');
  (perms as any).config = { deny: ['vscode.workspace.write_file'], agents: {} };
  assert.throws(() => perms.check('claude', 'vscode.workspace.write_file', {}), /Permission denied/);
});

test('per-agent allowlist blocks tools not on the list', () => {
  const perms = new PermissionManager('/nonexistent');
  (perms as any).config = { agents: { cursor: { allow: ['vscode.workspace.read_file'] } } };
  assert.throws(() => perms.check('cursor', 'vscode.workspace.write_file', {}), /not allowed/);
  assert.doesNotThrow(() => perms.check('cursor', 'vscode.workspace.read_file', {}));
});

test('command-scoped deny (tool:argument) blocks a specific command', () => {
  const perms = new PermissionManager('/nonexistent');
  (perms as any).config = { deny: ['vscode.commands.execute:workbench.action.openSettings'], agents: {} };
  assert.throws(
    () => perms.check('claude', 'vscode.commands.execute', { command: 'workbench.action.openSettings' }),
    /Permission denied/
  );
  assert.doesNotThrow(() => perms.check('claude', 'vscode.commands.execute', { command: 'editor.action.formatDocument' }));
});

test('BridgeClient forwards a tool call to the bridge over loopback', async () => {
  const token = 'test-token';
  const { server, calls } = fakeBridge(token);
  await listen(server, 8799);
  try {
    const client = new BridgeClient('http://127.0.0.1:8799');
    const result = await client.call({ tool: 'vscode.editor.open', args: { path: 'a.ts' } }, token);
    assert.deepEqual(result, { ok: true, result: { echoed: 'vscode.editor.open' } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'vscode.editor.open');
  } finally {
    server.close();
  }
});

test('BridgeClient rejects on a bad token (401)', async () => {
  const { server } = fakeBridge('right-token');
  await listen(server, 8800);
  try {
    const client = new BridgeClient('http://127.0.0.1:8800');
    await assert.rejects(() => client.call({ tool: 'vscode.editor.open', args: {} }, 'wrong-token'), /401/);
  } finally {
    server.close();
  }
});

import { HUB_SESSION_HEADER, resolveHubSession } from '../src/tool-registry.js';

test('resolveHubSession prefers header, then arg, then transport sessionId', () => {
  // header wins
  assert.equal(
    resolveHubSession({ _hubSession: 'arg-id' }, { requestInfo: { headers: { [HUB_SESSION_HEADER]: 'header-id' } }, sessionId: 'transport-id' }),
    'header-id'
  );
  // header as array (IsomorphicHeaders) still resolves to first value
  assert.equal(
    resolveHubSession({}, { requestInfo: { headers: { [HUB_SESSION_HEADER]: ['h1', 'h2'] } } }),
    'h1'
  );
  // arg is used when no header
  assert.equal(resolveHubSession({ _hubSession: 'arg-id' }, {}), 'arg-id');
  // transport sessionId as last resort
  assert.equal(resolveHubSession({}, { sessionId: 'transport-id' }), 'transport-id');
  // nothing available
  assert.equal(resolveHubSession({}, {}), undefined);
});
