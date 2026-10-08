# MCP Hub

Orquestador local de MCP: **un único servidor MCP compartido** (el Hub) que gobierna tu ventana
de VS Code a través de un **bridge** (una extensión). Claude Code, Claude Desktop, Cursor y
cualquier cliente MCP compatible se conectan al mismo Hub y reutilizan las mismas herramientas, en
vez de mantener una configuración distinta por cliente.

## Arquitectura

```text
Claude Code / Claude Desktop / Cursor / otros MCP clients
                         |
                    MCP (Streamable HTTP)
                         |
                  +------+------+
                  |   MCP Hub   |  127.0.0.1:8765
                  | router      |
                  | sessions    |
                  | locks       |
                  | permissions |
                  | event bus   |
                  +------+------+
                         |
                  local bridge RPC  (loopback)
                         |
                  VS Code Bridge   127.0.0.1:8766  (extensión .vsix)
                         |
                       VS Code
```

El Hub expone un servidor HTTP local y el Bridge un API HTTP local, ambos **solo en `127.0.0.1`**.
La capa interna está desacoplada para poder cambiar el transporte del bridge (WebSocket/IPC) sin
tocar las tools MCP.

## Paquetes

- `@mcp-hub/hub`: servidor MCP, registry de tools, sesiones, locks, permisos y event bus.
- `mcp-hub-vscode-bridge`: extensión de VS Code que ejecuta las operaciones semánticas.
- `@mcp-hub/cli`: CLI (`init`, `start`, `status`, `clients`, `install`).

## Tools (31)

**Editor** — `vscode.editor.{get_active,get_selection,open,insert,replace,goto_line}`
**Workspace** — `vscode.workspace.{get,list_files,read_file,write_file,search}`
**Terminal** — `vscode.terminal.{list,create,execute}`
**Commands** — `vscode.commands.execute`
**Debug** (Fase 4) — `vscode.debug.{list,start,stop,set_breakpoints,list_breakpoints,evaluate}`
**LSP** (Fase 4) — `vscode.lsp.{definition,references,hover,symbols,diagnostics}`
**Hub** — `hub.session.{acquire,release,status,heartbeat}`, `hub.events.recent`

## Seguridad

- Hub y Bridge escuchan **solo en `127.0.0.1`**.
- `mcp-hub init` genera un token local; todas las peticiones requieren `Authorization: Bearer <token>`.
- Las operaciones mutables (abrir, escribir, ejecutar, debug) pasan por el `PermissionManager`
  (reglas allow/deny globales y por agente) y, cuando hay sesión, por un lock de workspace.
- `read-only` no adquiere lock: solo observa y lee.
- Control **semántico**, nunca automatización de UI por coordenadas.

## Puesta en marcha

### 1. Hub + CLI

```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js init     # crea ~/.mcp-hub/config.json con el token
node packages/cli/dist/index.js start     # arranca el Hub en 127.0.0.1:8765
node packages/cli/dist/index.js status    # RUNNING / STOPPED
```

### 2. Instalar el VS Code Bridge

```bash
# construir el .vsix
pnpm --filter mcp-hub-vscode-bridge build
pnpm --filter mcp-hub-vscode-bridge package
# → packages/vscode-bridge/mcp-hub-vscode-bridge-0.4.0.vsix

# instalarlo
code --install-extension packages/vscode-bridge/mcp-hub-vscode-bridge-*.vsix
```

El Bridge lee el token del entorno al arrancar VS Code, así que **exporta el token y lanza VS
Code desde esa misma shell**:

```bash
export MCP_HUB_TOKEN=$(grep -o '"token"[^,]*' ~/.mcp-hub/config.json | cut -d'"' -f4)
code .
```

Comprueba con la paleta de comandos → **MCP Hub: Status** (debe indicar el puerto 8766).

### 3. Conectar un cliente MCP

```bash
node packages/cli/dist/index.js install   # genera plantillas en ~/.mcp-hub/generated/
```

Las plantillas apuntan al endpoint `http://127.0.0.1:8765/mcp` con el bearer token. Los ficheros
son **plantillas**: la ruta de configuración exacta cambia según el cliente y el sistema, por eso
la CLI no sobrescribe la configuración del cliente automáticamente.

## Desarrollo

```bash
pnpm -r build          # compila los 3 paquetes
pnpm --filter @mcp-hub/hub test   # tests (event bus, locks, lease, permisos, bridge RPC)
```

## Vínculo de sesión (arbitraje multi-agente)

Las tools mutables (`open`, `write_file`, `execute`, `debug.*`…) **requieren** una sesión del Hub:

1. `hub.session.acquire` con `{ client, workspace, mode }` → devuelve un `id` de sesión.
2. En cada llamada `vscode.*`, pasa ese id como cabecera `x-mcp-hub-session` (preferido) o como
   argumento `_hubSession`.
3. La tool toma el lock del workspace para esa sesión; un segundo cliente `exclusive` en el mismo
   workspace queda bloqueado hasta que el primero haga `hub.session.release` o caduque su lease.
4. Renueva la sesión con `hub.session.heartbeat` (lease por defecto 30s).

Las tools de solo lectura no exigen sesión. Una llamada mutable sin sesión se rechaza con un
mensaje accionable.

## Limitaciones conocidas

- El SDK MCP sigue en v1 (`@modelcontextprotocol/sdk@^1.17.5`); la línea v2 (spec 2026-07-28)
  queda como mejora futura.
- El registro de MCPs externos (github/playwright/postgres bajo el Hub) está diseñado pero no
  implementado.
- Antes de usarlo en una máquina compartida conviene endurecer validación de esquemas, auditoría
  y límites de terminal.

Historial de versiones en [`CHANGELOG.md`](./CHANGELOG.md).
