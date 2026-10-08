# MCP Hub

Local MCP orchestrator for semantic control of VS Code through a dedicated extension bridge.

## Architecture

MCP clients -> MCP Hub -> VS Code Bridge -> VS Code Extension API

The Hub owns MCP transport, tool registration, sessions, locks, permissions and events. The Bridge owns access to the VS Code Extension API.

## Phase 1 MVP

- TypeScript monorepo.
- Streamable HTTP MCP server.
- VS Code Bridge over localhost HTTP.
- Editor/workspace/terminal/commands tools.
- Session manager with exclusive/shared/read-only modes.
- CLI for init/start/status/clients/install.

## Phase 2

- EventBus and recent-event API.
- NDJSON event stream at `GET /events`.
- Authenticated event ingestion at `POST /events`.
- Bridge telemetry for editor, selection, documents and diagnostics.
- `hub.events.recent` MCP tool.
- Generated client configuration templates for Claude Code, Claude Desktop and Cursor.
- EventBus automated test.

## Next

1. Enforce permission policies per tool/agent.
2. Persist sessions and locks.
3. Add robust Bridge reconnect/heartbeat.
4. Add terminal output capture.
5. Add diagnostics payload details.
6. Add integration tests with a real VS Code extension host.
7. Package and sign the VSIX.
8. Add optional bridges such as Chrome or Windows.
