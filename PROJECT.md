# MCP Hub 0.4.0

Local MCP orchestrator for VS Code. One shared MCP server (the Hub) drives this VS Code window
through a loopback bridge, so Claude Code, Claude Desktop, Cursor and other MCP clients all reuse
the same semantic tools.

## Phase 4 (current)
- New `vscode.debug.*` tools: `list`, `start`, `stop`, `set_breakpoints`, `list_breakpoints`, `evaluate`.
- New `vscode.lsp.*` tools: `definition`, `references`, `hover`, `symbols`, `diagnostics`.
- VS Code Bridge packaged as an installable `.vsix` (`pnpm --filter mcp-hub-vscode-bridge package`).
- Repository consolidated to a single version at the repo root (the old `mcp-hub-0.2.0/` and
  `mcp-hub-0.3.0/` folders are gone — see `CHANGELOG.md`).
- Integration tests covering locks, lease expiry, permissions and the Bridge RPC path.
- **31 MCP tools total.**

## Phase 3
- Persistent sessions and workspace locks in `~/.mcp-hub/sessions.json`.
- Lease/heartbeat support (default 30 seconds).
- Permission manager with global and per-agent allow/deny rules.
- `hub.session.heartbeat` MCP tool.
- `POST /session/heartbeat` authenticated endpoint.
- Existing EventBus and client configuration generation from 0.2 remain.

## Phase 2
- EventBus + `GET /events` (NDJSON stream) + `POST /events`.
- `hub.events.recent` MCP tool and Bridge-emitted editor/selection/document/diagnostics events.
- `mcp-hub install` writes client config templates under `~/.mcp-hub/generated/`.

## Known gaps (not yet implemented)
- **Session binding.** The `vscode.*` tools read `extra.sessionId`, but MCP clients do not yet
  pass the Hub session id acquired via `hub.session.acquire`. Until a client supplies it, mutating
  tools run without taking a workspace lock. Wiring a client-supplied session id (header or tool
  argument) is the next step for true multi-agent arbitration.
- MCP SDK is still on v1 (`@modelcontextprotocol/sdk@^1.17.5`); the v2 line (spec 2026-07-28) is a
  future upgrade.

## Run
```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
```
