import { existsSync, readFileSync } from 'node:fs';

export interface PermissionConfig { defaultMode?: 'exclusive' | 'shared' | 'read-only'; deny?: string[]; agents?: Record<string, { allow?: string[]; deny?: string[] }>; }
export class PermissionManager {
  private readonly config: PermissionConfig;
  constructor(file: string) {
    this.config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  }
  check(client: string, tool: string, args: Record<string, unknown> = {}) {
    const agent = this.config.agents?.[client];
    if ((this.config.deny ?? []).some(rule => rule === tool || rule === `${tool}:${String(args.command ?? '')}`)) throw new Error(`Permission denied: ${tool}`);
    if (agent?.deny?.includes(tool)) throw new Error(`Permission denied for ${client}: ${tool}`);
    if (agent?.allow?.length && !agent.allow.includes(tool)) throw new Error(`Tool not allowed for ${client}: ${tool}`);
  }
  defaultMode() { return this.config.defaultMode ?? 'exclusive'; }
}
