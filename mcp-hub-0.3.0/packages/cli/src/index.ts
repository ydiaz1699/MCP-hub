#!/usr/bin/env node
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';
import { writeGenerated } from './client-config.js';
import { randomBytes } from 'node:crypto';

const home = process.env.MCP_HUB_HOME ?? join(process.env.HOME ?? process.cwd(), '.mcp-hub');
const config = join(home, 'config.json');
const cmd = process.argv[2] ?? 'status';

function init() {
  mkdirSync(home, { recursive: true });
  if (!existsSync(config)) {
    writeFileSync(config, JSON.stringify({ host: '127.0.0.1', port: 8765, bridgeUrl: 'http://127.0.0.1:8766', token: randomBytes(32).toString('hex') }, null, 2));
    const permissions = join(home, 'permissions.json');
    if (!existsSync(permissions)) writeFileSync(permissions, JSON.stringify({ defaultMode: 'exclusive', deny: ['vscode.commands.execute:workbench.action.openSettings'], agents: {} }, null, 2));
    console.log(`Initialized ${home}`);
  } else console.log(`Already initialized: ${home}`);
}
function start() {
  if (!existsSync(config)) init();
  const c = JSON.parse(readFileSync(config, 'utf8'));
  const child = spawn(process.execPath, [join(process.cwd(), 'packages/hub/dist/index.js')], { detached: true, stdio: 'ignore', env: { ...process.env, MCP_HUB_HOME: home, MCP_HUB_TOKEN: c.token } });
  child.unref(); console.log(`MCP Hub started on http://${c.host}:${c.port}/mcp`);
}
async function status() {
  if (!existsSync(config)) { console.log('Not initialized. Run: mcp-hub init'); return; }
  const c = JSON.parse(readFileSync(config, 'utf8'));
  try { const r = await fetch(`http://${c.host}:${c.port}/health`, { headers: { authorization: `Bearer ${c.token}` } }); console.log(r.ok ? 'MCP Hub: RUNNING' : `MCP Hub: HTTP ${r.status}`); }
  catch { console.log('MCP Hub: STOPPED'); }
}
function clients() { console.log('Client discovery is intentionally conservative in MVP. Configure MCP clients with the /mcp endpoint and local bearer token.'); }
function install() {
  if (!existsSync(config)) init();
  for (const client of ['claude-code', 'claude-desktop', 'cursor'] as const) console.log(`${client}: ${writeGenerated(home, client)}`);
  console.log('Generated client configurations under ' + join(home, 'generated'));
}
function proxy() { console.log('Use the generated MCP configuration or the Hub /mcp endpoint directly.'); }

switch (cmd) { case 'init': init(); break; case 'start': start(); break; case 'status': await status(); break; case 'clients': clients(); break; case 'install': install(); break; case 'proxy': proxy(); break; default: console.log('Usage: mcp-hub init|start|status|clients|install'); }
