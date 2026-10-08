import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BridgeClient } from './bridge-client.js';
import { SessionManager } from './session-manager.js';
import { registerTools } from './tool-registry.js';
import { EventBus } from './event-bus.js';
import { PermissionManager } from './permissions.js';

const root = process.env.MCP_HUB_HOME ?? join(process.env.HOME ?? process.cwd(), '.mcp-hub');
const configPath = process.env.MCP_HUB_CONFIG ?? join(root, 'config.json');
const fallback = { host: '127.0.0.1', port: 8765, bridgeUrl: 'http://127.0.0.1:8766' };
let config: any = fallback;
if (existsSync(configPath)) config = { ...fallback, ...JSON.parse(readFileSync(configPath, 'utf8')) };
const token = process.env.MCP_HUB_TOKEN ?? config.token;
if (!token) throw new Error(`Missing MCP_HUB_TOKEN. Run: mcp-hub init`);

const sessions = new SessionManager(join(root, 'sessions.json'));
const permissions = new PermissionManager(join(root, 'permissions.json'));
const events = new EventBus();
const bridge = new BridgeClient(config.bridgeUrl ?? 'http://127.0.0.1:8766');

function auth(req: http.IncomingMessage) {
  return req.headers.authorization === `Bearer ${token}`;
}

// In stateless mode (sessionIdGenerator: undefined) each HTTP request must use a FRESH
// McpServer + transport. A single shared server would throw "Already connected to a transport"
// on the second request. The Hub's real state (sessions, locks, events) lives in the long-lived
// managers above, so recreating the thin MCP server per request is cheap and correct.
function buildServer() {
  const server = new McpServer({ name: 'mcp-hub', version: '0.5.0' });
  registerTools(server, bridge, sessions, token, events, permissions);
  return server;
}

const httpServer = http.createServer(async (req, res) => {
  if (!auth(req)) { res.writeHead(401); res.end('Unauthorized'); return; }
  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', connection: 'keep-alive' });
    for (const event of events.recent()) res.write(JSON.stringify(event) + '\n');
    const unsubscribe = events.subscribe(event => res.write(JSON.stringify(event) + '\n'));
    req.on('close', unsubscribe);
    return;
  }
  if (req.method === 'POST' && req.url === '/events') {
    let body = ''; for await (const chunk of req) body += chunk;
    try { const input = JSON.parse(body); events.publish(input.type, input.payload); res.writeHead(202); res.end(); }
    catch { res.writeHead(400); res.end('Bad event'); }
    return;
  }
  if (req.method === 'POST' && req.url === '/session/heartbeat') { let body=''; for await (const chunk of req) body += chunk; try { const { sessionId } = JSON.parse(body); res.writeHead(200, {'content-type':'application/json'}); res.end(JSON.stringify(sessions.heartbeat(sessionId))); } catch { res.writeHead(400); res.end('Bad session'); } return; }
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true })); return; }
  if (req.url?.startsWith('/mcp')) {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }
  res.writeHead(404); res.end('Not found');
});

httpServer.listen(config.port, config.host, () => {
  console.log(`MCP Hub listening on http://${config.host}:${config.port}/mcp`);
});
