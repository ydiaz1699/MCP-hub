# MCP Hub 0.4.0

Local MCP orchestrator for VS Code. One shared MCP server (the Hub) drives this VS Code window
through a loopback bridge, so Claude Code, Claude Desktop, Cursor and other MCP clients all reuse
the same semantic tools.

## Phase 6 (current) — non-throwing lock acquisition
- `hub.session.acquire` now **always** returns a usable session id. If the workspace is already
  locked by another session it returns `{ session, locked: true, lockOwner }` instead of failing,
  so a second agent keeps a valid session to observe/queue and can take the lock later (after the
  owner releases or its lease expires) without re-creating a session.
- Mutating tools call `SessionManager.requireLock()`, which throws an actionable
  *"Workspace X is locked by session Y…"* message — the correct error (previously a blocked second
  agent got the misleading "requires a Hub session").
- Verified end-to-end over MCP: Claude locks → Cursor acquires (locked:true) → Cursor write
  blocked with the right message → Claude writes → Claude releases → Cursor writes with its
  original session. 12 tests green.

## Phase 5 — session binding + stateless fix
- **Session binding.** `vscode.*` tools now resolve the governing Hub session from (in priority
  order) the `x-mcp-hub-session` HTTP header, the `_hubSession` tool argument, or the transport
  session id. Mutating tools now **require** a session and take the workspace lock; calls without
  one are rejected with an actionable message. Permissions are checked against the session's client.
- **Stateless transport fix (bug).** The Hub created a single shared `McpServer` and reconnected a
  new transport on every `/mcp` request, so the SDK threw *"Already connected to a transport"* on
  the **second** request — the Hub could only serve one MCP call per process lifetime. Now a fresh
  `McpServer` + transport is built per request (correct stateless pattern); long-lived state stays
  in the session/lock/event managers.

## Phase 4
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
- MCP SDK is still on v1 (`@modelcontextprotocol/sdk@^1.17.5`); the v2 line (spec 2026-07-28) is a
  future upgrade.
- External MCP registry (github/playwright/postgres under the Hub) is designed but not built.

## How clients bind a session (multi-agent arbitration)
1. Call `hub.session.acquire` with `{ client, workspace, mode }` → returns a session `id`.
2. On every subsequent `vscode.*` call, pass that id as the `x-mcp-hub-session` header
   (preferred) or the `_hubSession` tool argument.
3. Mutating tools take the workspace lock for that session; a second `exclusive` client on the same
   workspace is blocked until the first releases (`hub.session.release`) or its lease expires.
4. Keep the session alive with `hub.session.heartbeat` (default lease 30s).

## Run
```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
```
