import * as vscode from 'vscode';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';

const port = Number(process.env.MCP_HUB_BRIDGE_PORT ?? 8766);
const token = process.env.MCP_HUB_TOKEN ?? '';
const hubUrl = process.env.MCP_HUB_URL ?? 'http://127.0.0.1:8765';

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function emit(type: string, payload: unknown) {
  try { await fetch(`${hubUrl}/events`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ type, payload }) }); } catch {}
}

async function execute(tool: string, args: any): Promise<any> {
  switch (tool) {
    case 'vscode.editor.get_active': {
      const e = vscode.window.activeTextEditor;
      return e ? { path: e.document.uri.fsPath, languageId: e.document.languageId, line: e.selection.active.line + 1, character: e.selection.active.character + 1 } : null;
    }
    case 'vscode.editor.get_selection': {
      const e = vscode.window.activeTextEditor;
      return e ? { text: e.document.getText(e.selection), start: e.selection.start, end: e.selection.end } : null;
    }
    case 'vscode.editor.open': {
      const uri = vscode.Uri.file(path.resolve(workspaceRoot() ?? process.cwd(), args.path));
      const doc = await vscode.workspace.openTextDocument(uri); await vscode.window.showTextDocument(doc);
      return { path: doc.uri.fsPath };
    }
    case 'vscode.editor.insert': {
      const e = vscode.window.activeTextEditor; if (!e) throw new Error('No active editor');
      await e.edit(edit => edit.insert(e.selection.active, args.text)); return { ok: true };
    }
    case 'vscode.editor.replace': {
      const e = vscode.window.activeTextEditor; if (!e) throw new Error('No active editor');
      await e.edit(edit => edit.replace(e.selection, args.text)); return { ok: true };
    }
    case 'vscode.editor.goto_line': {
      const e = vscode.window.activeTextEditor; if (!e) throw new Error('No active editor');
      const pos = new vscode.Position(Math.max(0, args.line - 1), 0); e.selection = new vscode.Selection(pos, pos); e.revealRange(new vscode.Range(pos, pos)); return { ok: true };
    }
    case 'vscode.workspace.get': return { folders: vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) ?? [] };
    case 'vscode.workspace.list_files': {
      const base = args.path ? vscode.Uri.file(path.resolve(workspaceRoot() ?? process.cwd(), args.path)) : vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!base) return [];
      const entries = await vscode.workspace.fs.readDirectory(base); return entries.map(([name, type]) => ({ name, type }));
    }
    case 'vscode.workspace.read_file': {
      const uri = vscode.Uri.file(path.resolve(workspaceRoot() ?? process.cwd(), args.path)); return { path: uri.fsPath, content: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8') };
    }
    case 'vscode.workspace.write_file': {
      const uri = vscode.Uri.file(path.resolve(workspaceRoot() ?? process.cwd(), args.path)); await vscode.workspace.fs.writeFile(uri, Buffer.from(args.content, 'utf8')); return { ok: true, path: uri.fsPath };
    }
    case 'vscode.workspace.search': {
      const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,dist}/**', 500);
      const hits: any[] = [];
      for (const uri of files) { try { const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'); if (text.includes(args.query)) hits.push(uri.fsPath); } catch {} }
      return hits;
    }
    case 'vscode.terminal.list': return vscode.window.terminals.map(t => ({ name: t.name }));
    case 'vscode.terminal.create': { const t = vscode.window.createTerminal(args.name); t.show(); return { name: t.name }; }
    case 'vscode.terminal.execute': { const t = vscode.window.terminals.find(x => x.name === args.terminal) ?? vscode.window.createTerminal(args.terminal); t.show(); t.sendText(args.command); return { ok: true, terminal: t.name }; }
    case 'vscode.commands.execute': return await vscode.commands.executeCommand(args.command, ...(args.arguments ?? []));
    default: throw new Error(`Unknown tool: ${tool}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('Unauthorized'); return; }
    if (req.method !== 'POST' || req.url !== '/rpc') { res.writeHead(404); res.end('Not found'); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    try { const input = JSON.parse(body); const result = await execute(input.tool, input.args ?? {}); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); }
    catch (error) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })); }
  });
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => void emit('active_editor.changed', e ? { path: e.document.uri.fsPath } : null)));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(e => void emit('selection.changed', { path: e.textEditor.document.uri.fsPath, text: e.textEditor.document.getText(e.selections[0]) })));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(d => void emit('document.opened', { path: d.uri.fsPath })));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => void emit('document.closed', { path: d.uri.fsPath })));
  context.subscriptions.push(vscode.languages.onDidChangeDiagnostics(e => void emit('diagnostics.changed', { uris: e.uris.map(u => u.fsPath) })));

  server.listen(port, '127.0.0.1');
  context.subscriptions.push({ dispose: () => server.close() });
  context.subscriptions.push(vscode.commands.registerCommand('mcpHub.status', () => vscode.window.showInformationMessage(`MCP Hub Bridge listening on 127.0.0.1:${port}`)));
}
export function deactivate() {}
