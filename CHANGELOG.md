# Changelog

## 0.5.0

### Session binding (multi-agent arbitration)
- `vscode.*` tools resolve the governing Hub session from the `x-mcp-hub-session` header, the
  `_hubSession` tool argument, or the transport session id (in that priority).
- Mutating tools now **require** a session and take the workspace lock; calls without one are
  rejected with an actionable error. Permission checks run against the session's client.
- `_hubSession` is stripped from args before reaching the Bridge/VS Code.

### Fix: stateless MCP transport (preexisting bug)
- The Hub used a single shared `McpServer` and reconnected a new transport per `/mcp` request, so
  the SDK threw *"Already connected to a transport"* on the **second** MCP call — effectively the
  Hub could serve only one call per process. Now each request builds a fresh `McpServer` +
  transport (correct stateless pattern) and closes them on response end.

### Tests
- `resolveHubSession` priority (header > arg > transport). 11 tests total, all green.

## 0.4.0

### Repository consolidation
- The project now lives at the **repository root**. The previous duplicated folders
  `mcp-hub-0.2.0/` and `mcp-hub-0.3.0/` were removed. `0.3.0` was a strict superset of `0.2.0`
  (it added the permission manager, persistent sessions, and lease/heartbeat), so nothing was
  lost by dropping `0.2.0`.
- Added `pnpm-lock.yaml` for reproducible installs.
- Added root `LICENSE` (MIT).

### Phase 4 — new tool namespaces
- `vscode.debug.*`: `list`, `start`, `stop`, `set_breakpoints`, `list_breakpoints`, `evaluate`.
- `vscode.lsp.*`: `definition`, `references`, `hover`, `symbols`, `diagnostics`.
- Total MCP tools: **31**.

### VS Code Bridge packaging
- Extension `package.json` completed with the fields `vsce` requires (`publisher`, `displayName`,
  `description`, `license`, `repository`, `categories`).
- Added extension `README.md`, `LICENSE` and `.vscodeignore`.
- `pnpm --filter mcp-hub-vscode-bridge package` now produces an installable `.vsix`.

### Tests
- Added `packages/hub/test/integration.test.ts`: exclusive lock contention, read-only (no lock),
  release, lease expiry auto-release, global/per-agent/command-scoped permission rules, and the
  `BridgeClient` loopback RPC path (incl. 401 on bad token). 10 tests total, all green.

## 0.3.0
- Persistent sessions and workspace locks in `~/.mcp-hub/sessions.json`.
- Lease/heartbeat support (default 30s) + `hub.session.heartbeat` tool + `POST /session/heartbeat`.
- Permission manager with global and per-agent allow/deny rules.

## 0.2.0
- EventBus + `GET /events` (NDJSON) + `POST /events` + `hub.events.recent`.
- Bridge events (active editor, selection, document open/close, diagnostics).
- `mcp-hub install` generates client config templates under `~/.mcp-hub/generated/`.

## 0.1.0
- Initial MVP: Hub MCP server over Streamable HTTP, VS Code Bridge, CLI, in-memory sessions/locks,
  editor/workspace/terminal/commands tools.
