# MCP Hub

MVP de un orquestador local de MCP con un único servidor MCP compartido y un bridge como extensión de VS Code.

## Arquitectura

```text
Claude Code / Claude Desktop / Cursor / otros MCP clients
                         |
                    MCP Protocol
                         |
                  +------+------+
                  |   MCP Hub   |
                  | router      |
                  | sessions    |
                  | locks       |
                  | permissions |
                  +------+------+
                         |
                  local bridge API
                         |
                  VS Code Bridge
                         |
                       VS Code
```

El MVP usa un servidor HTTP local del Hub y un API HTTP local del Bridge. La capa interna está desacoplada para poder reemplazar posteriormente el transporte del bridge por WebSocket/IPC sin cambiar las tools MCP.

## Paquetes

- `@mcp-hub/hub`: servidor MCP, registry, sesiones y locks.
- `@mcp-hub/vscode-bridge`: extensión VS Code que ejecuta operaciones semánticas.
- `@mcp-hub/cli`: CLI inicial para `init`, `start`, `status`, `clients`, `install`.

## Tools MVP

- `vscode.editor.get_active`
- `vscode.editor.get_selection`
- `vscode.editor.open`
- `vscode.editor.insert`
- `vscode.editor.replace`
- `vscode.editor.goto_line`
- `vscode.workspace.get`
- `vscode.workspace.list_files`
- `vscode.workspace.read_file`
- `vscode.workspace.write_file`
- `vscode.workspace.search`
- `vscode.terminal.list`
- `vscode.terminal.create`
- `vscode.terminal.execute`
- `vscode.commands.execute`
- `hub.session.acquire`
- `hub.session.release`
- `hub.session.status`

## Seguridad MVP

- El Hub escucha solamente en `127.0.0.1`.
- Se genera un token local durante `mcp-hub init`.
- Las operaciones mutables requieren una sesión con lock del workspace en modo `exclusive`.
- `read-only` no adquiere lock y puede observar/leer.

## Arranque de desarrollo

```bash
pnpm install
pnpm build
node packages/hub/dist/index.js
```

Después instala/ejecuta la extensión `packages/vscode-bridge` desde VS Code en modo desarrollo.

> Nota: este repositorio es un esqueleto MVP. Antes de publicar o usarlo en una máquina compartida conviene endurecer autenticación, validación de esquemas, auditoría y límites de terminal.

## Phase 2

Phase 2 adds:

- `EventBus` inside the Hub.
- `GET /events` as an NDJSON event stream.
- `POST /events` for Bridge-originated events.
- `hub.events.recent` MCP tool.
- VS Code Bridge events for active editor, selection, opened/closed documents and diagnostics.
- `mcp-hub install` generates client configuration templates for Claude Code, Claude Desktop and Cursor under `~/.mcp-hub/generated/`.
- A basic EventBus test using Node's test runner.

The generated client files are templates: exact installation paths differ by client and operating system, so the CLI deliberately does not overwrite vendor configuration files automatically.
