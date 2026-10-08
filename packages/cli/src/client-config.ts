import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ClientName = 'claude-code' | 'claude-desktop' | 'cursor';

export function clientConfig(home: string, client: ClientName) {
  const config = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'));
  const server = { url: `http://${config.host}:${config.port}/mcp`, headers: { Authorization: `Bearer ${config.token}` } };
  if (client === 'claude-code') return { mcpServers: { 'mcp-hub': server } };
  if (client === 'cursor') return { mcpServers: { 'mcp-hub': server } };
  return { mcpServers: { 'mcp-hub': { command: 'mcp-hub', args: ['proxy'], env: { MCP_HUB_HOME: home } } } };
}

export function writeGenerated(home: string, client: ClientName) {
  const dir = join(home, 'generated');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${client}.json`);
  writeFileSync(file, JSON.stringify(clientConfig(home, client), null, 2) + '\n');
  return file;
}
