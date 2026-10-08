# MCP Hub 0.3.0

Local MCP orchestrator for VS Code.

## Phase 3
- Persistent sessions and workspace locks in `~/.mcp-hub/sessions.json`.
- Lease/heartbeat support (default 30 seconds).
- Permission manager with global and per-agent allow/deny rules.
- `hub.session.heartbeat` MCP tool.
- `POST /session/heartbeat` authenticated endpoint.
- Existing EventBus and client configuration generation from 0.2 remain.

## Run
```bash
pnpm install
pnpm -r build
node packages/cli/dist/index.js init
node packages/cli/dist/index.js start
```
