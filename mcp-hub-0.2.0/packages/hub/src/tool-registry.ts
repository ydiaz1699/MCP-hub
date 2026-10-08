import { z } from 'zod';
import type { BridgeClient } from './bridge-client.js';
import type { SessionManager } from './session-manager.js';
import type { EventBus } from './event-bus.js';

const empty = z.object({}).passthrough();
const textArg = z.object({ text: z.string() });
const pathArg = z.object({ path: z.string() });

export function registerTools(server: any, bridge: BridgeClient, sessions: SessionManager, token: string, events: EventBus) {
  const call = async (tool: string, args: Record<string, unknown>, sessionId?: string, mutating = false) => {
    if (sessionId) sessions.touch(sessionId);
    if (mutating && sessionId) sessions.acquire(sessionId);
    const result = await bridge.call({ tool, args, sessionId }, token);
    events.publish('tool.completed', { tool, sessionId: sessionId ?? null });
    return result;
  };

  server.registerTool('vscode.editor.get_active', { description: 'Get active editor state', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.get_active', {}, extra?.sessionId)) }] }));
  server.registerTool('vscode.editor.get_selection', { description: 'Get current selection', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.get_selection', {}, extra?.sessionId)) }] }));
  server.registerTool('vscode.editor.open', { description: 'Open a file in VS Code', inputSchema: pathArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.open', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.editor.insert', { description: 'Insert text at the active cursor', inputSchema: textArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.insert', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.editor.replace', { description: 'Replace current selection', inputSchema: textArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.replace', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.editor.goto_line', { description: 'Move cursor to line', inputSchema: z.object({ line: z.number().int().min(1) }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.editor.goto_line', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.workspace.get', { description: 'Get workspace folders', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.get', {}, extra?.sessionId)) }] }));
  server.registerTool('vscode.workspace.list_files', { description: 'List files under a workspace path', inputSchema: z.object({ path: z.string().optional() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.list_files', args, extra?.sessionId)) }] }));
  server.registerTool('vscode.workspace.read_file', { description: 'Read a workspace file', inputSchema: pathArg.shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.read_file', args, extra?.sessionId)) }] }));
  server.registerTool('vscode.workspace.write_file', { description: 'Write a workspace file', inputSchema: z.object({ path: z.string(), content: z.string() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.write_file', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.workspace.search', { description: 'Search text in the workspace', inputSchema: z.object({ query: z.string() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.workspace.search', args, extra?.sessionId)) }] }));
  server.registerTool('vscode.terminal.list', { description: 'List terminals', inputSchema: empty.shape }, async (_args: unknown, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.list', {}, extra?.sessionId)) }] }));
  server.registerTool('vscode.terminal.create', { description: 'Create a terminal', inputSchema: z.object({ name: z.string().optional() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.create', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.terminal.execute', { description: 'Send a command to a terminal', inputSchema: z.object({ command: z.string(), terminal: z.string().optional() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.terminal.execute', args, extra?.sessionId, true)) }] }));
  server.registerTool('vscode.commands.execute', { description: 'Execute a VS Code command', inputSchema: z.object({ command: z.string(), arguments: z.array(z.unknown()).optional() }).shape }, async (args: any, extra: any) => ({ content: [{ type: 'text', text: JSON.stringify(await call('vscode.commands.execute', args, extra?.sessionId, true)) }] }));
  server.registerTool('hub.session.acquire', { description: 'Acquire exclusive workspace control', inputSchema: z.object({ client: z.string(), workspace: z.string(), mode: z.enum(['exclusive','shared','read-only']).default('exclusive') }).shape }, async (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(sessions.acquire(sessions.create(args.client, args.workspace, args.mode).id)) }] }));
  server.registerTool('hub.events.recent', { description: 'Get recent VS Code/Hub events', inputSchema: z.object({ limit: z.number().int().min(1).max(100).optional() }).shape }, async (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(events.recent(args.limit)) }] }));
  server.registerTool('hub.session.status', { description: 'Show Hub sessions and locks', inputSchema: empty.shape }, async () => ({ content: [{ type: 'text', text: JSON.stringify(sessions.status()) }] }));
  server.registerTool('hub.session.release', { description: 'Release a session lock', inputSchema: z.object({ sessionId: z.string() }).shape }, async (args: any) => { sessions.release(args.sessionId); return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] }; });
}
