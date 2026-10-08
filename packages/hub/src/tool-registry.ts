import { z } from 'zod';
import type { BridgeClient } from './bridge-client.js';
import type { SessionManager } from './session-manager.js';
import type { EventBus } from './event-bus.js';
import type { PermissionManager } from './permissions.js';

// Every vscode.* tool accepts an optional `_hubSession` so clients that cannot set custom HTTP
// headers can still bind the call to a Hub session via a tool argument. Declared in the schema so
// Zod does not strip it before the handler sees it.
const SESSION_FIELD = { _hubSession: z.string().optional() };
const empty = z.object({ ...SESSION_FIELD }).passthrough();
const textArg = z.object({ text: z.string(), ...SESSION_FIELD });
const pathArg = z.object({ path: z.string(), ...SESSION_FIELD });

export const HUB_SESSION_HEADER = 'x-mcp-hub-session';

/**
 * Resolve the Hub session id that governs this call.
 * Priority: HTTP header `x-mcp-hub-session` > tool argument `_hubSession` > transport session id.
 * This is what binds a `tools/call` to a session created via `hub.session.acquire`, so mutating
 * tools can take the workspace lock and permissions are checked against the right client.
 */
export function resolveHubSession(args: Record<string, unknown>, extra: any): string | undefined {
  const header = extra?.requestInfo?.headers?.[HUB_SESSION_HEADER];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromArg = typeof args?._hubSession === 'string' ? (args._hubSession as string) : undefined;
  return fromHeader ?? fromArg ?? extra?.sessionId;
}

export function registerTools(server: any, bridge: BridgeClient, sessions: SessionManager, token: string, events: EventBus, permissions: PermissionManager) {
  const call = async (tool: string, rawArgs: Record<string, unknown>, extra: any, mutating = false) => {
    const sessionId = resolveHubSession(rawArgs, extra);
    // strip the control field so it never reaches the Bridge/VS Code
    const { _hubSession, ...args } = rawArgs ?? {};
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (sessionId && !session) throw new Error(`Unknown or expired Hub session: ${sessionId}. Call hub.session.acquire first.`);
    if (session) sessions.touch(sessionId!);
    permissions.check(session?.client ?? 'anonymous', tool, args);
    if (mutating) {
      if (!sessionId) throw new Error(`Mutating tool "${tool}" requires a Hub session. Call hub.session.acquire and pass its id via the "${HUB_SESSION_HEADER}" header or the "_hubSession" argument.`);
      sessions.acquire(sessionId);
    }
    const result = await bridge.call({ tool, args, sessionId }, token);
    events.publish('tool.completed', { tool, sessionId: sessionId ?? null });
    return result;
  };

  server.registerTool('vscode.editor.get_active', { description: 'Get active editor state', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.get_active', {}, extra)) }] }));
  server.registerTool('vscode.editor.get_selection', { description: 'Get current selection', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.get_selection', {}, extra)) }] }));
  server.registerTool('vscode.editor.open', { description: 'Open a file in VS Code', inputSchema: pathArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.open', args, extra, true)) }] }));
  server.registerTool('vscode.editor.insert', { description: 'Insert text at the active cursor', inputSchema: textArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.insert', args, extra, true)) }] }));
  server.registerTool('vscode.editor.replace', { description: 'Replace current selection', inputSchema: textArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.replace', args, extra, true)) }] }));
  server.registerTool('vscode.editor.goto_line', { description: 'Move cursor to line', inputSchema: z.object({ line: z.number().int().min(1), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.goto_line', args, extra, true)) }] }));
  server.registerTool('vscode.workspace.get', { description: 'Get workspace folders', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.get', {}, extra)) }] }));
  server.registerTool('vscode.workspace.list_files', { description: 'List files under a workspace path', inputSchema: z.object({ path: z.string().optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.list_files', args, extra)) }] }));
  server.registerTool('vscode.workspace.read_file', { description: 'Read a workspace file', inputSchema: pathArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.read_file', args, extra)) }] }));
  server.registerTool('vscode.workspace.write_file', { description: 'Write a workspace file', inputSchema: z.object({ path: z.string(), content: z.string(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.write_file', args, extra, true)) }] }));
  server.registerTool('vscode.workspace.search', { description: 'Search text in the workspace', inputSchema: z.object({ query: z.string(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.search', args, extra)) }] }));
  server.registerTool('vscode.terminal.list', { description: 'List terminals', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.list', {}, extra)) }] }));
  server.registerTool('vscode.terminal.create', { description: 'Create a terminal', inputSchema: z.object({ name: z.string().optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.create', args, extra, true)) }] }));
  server.registerTool('vscode.terminal.execute', { description: 'Send a command to a terminal', inputSchema: z.object({ command: z.string(), terminal: z.string().optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.execute', args, extra, true)) }] }));
  server.registerTool('vscode.commands.execute', { description: 'Execute a VS Code command', inputSchema: z.object({ command: z.string(), arguments: z.array(z.unknown()).optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.commands.execute', args, extra, true)) }] }));
  // ---- Phase 4: debug ----
  server.registerTool('vscode.debug.list', { description: 'List active debug sessions', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.list', {}, extra)) }] }));
  server.registerTool('vscode.debug.start', { description: 'Start a debug session by launch-config name', inputSchema: z.object({ name: z.string().optional(), configuration: z.unknown().optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.start', args, extra, true)) }] }));
  server.registerTool('vscode.debug.stop', { description: 'Stop the active debug session', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.stop', {}, extra, true)) }] }));
  server.registerTool('vscode.debug.set_breakpoints', { description: 'Add source breakpoints at the given lines', inputSchema: z.object({ path: z.string(), lines: z.array(z.number().int().min(1)), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.set_breakpoints', args, extra, true)) }] }));
  server.registerTool('vscode.debug.list_breakpoints', { description: 'List current source breakpoints', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.list_breakpoints', {}, extra)) }] }));
  server.registerTool('vscode.debug.evaluate', { description: 'Evaluate an expression in the active debug session', inputSchema: z.object({ expression: z.string(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.debug.evaluate', args, extra)) }] }));

  // ---- Phase 4: language server (LSP) ----
  server.registerTool('vscode.lsp.definition', { description: 'Go to definition at a position', inputSchema: z.object({ path: z.string(), line: z.number().int().min(1), character: z.number().int().min(1).optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.lsp.definition', args, extra)) }] }));
  server.registerTool('vscode.lsp.references', { description: 'Find references at a position', inputSchema: z.object({ path: z.string(), line: z.number().int().min(1), character: z.number().int().min(1).optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.lsp.references', args, extra)) }] }));
  server.registerTool('vscode.lsp.hover', { description: 'Get hover info at a position', inputSchema: z.object({ path: z.string(), line: z.number().int().min(1), character: z.number().int().min(1).optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.lsp.hover', args, extra)) }] }));
  server.registerTool('vscode.lsp.symbols', { description: 'List document symbols of a file', inputSchema: pathArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.lsp.symbols', args, extra)) }] }));
  server.registerTool('vscode.lsp.diagnostics', { description: 'Get diagnostics (file or whole workspace)', inputSchema: z.object({ path: z.string().optional(), ...SESSION_FIELD }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.lsp.diagnostics', args, extra)) }] }));

  server.registerTool('hub.session.acquire', { description: 'Create and acquire a workspace session', inputSchema: z.object({ client: z.string(), workspace: z.string(), mode: z.enum(['exclusive','shared','read-only']).optional() }).shape }, async (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(sessions.acquire(sessions.create(args.client, args.workspace, args.mode ?? permissions.defaultMode()).id)) }] }));
  server.registerTool('hub.events.recent', { description: 'Get recent VS Code/Hub events', inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }).shape }, async (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(events.recent(args.limit)) }] }));
  server.registerTool('hub.session.status', { description: 'Show Hub sessions and locks', inputSchema: empty.shape }, async () => ({ content: [{ type: 'text', text: JSON.stringify(sessions.status()) }] }));
  server.registerTool('hub.session.heartbeat', { description: 'Renew a session lease', inputSchema: z.object({ sessionId: z.string() }).shape }, async (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(sessions.heartbeat(args.sessionId)) }] }));
  server.registerTool('hub.session.release', { description: 'Release a session lock', inputSchema: z.object({ sessionId: z.string() }).shape }, async (args: any) => { sessions.release(args.sessionId); return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }; });
}
