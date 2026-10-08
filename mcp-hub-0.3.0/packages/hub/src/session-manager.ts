import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Session, SessionMode } from './types.js';

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly locks = new Map<string, string>();
  constructor(private readonly file?: string, private readonly leaseMs = 30_000) { this.load(); }

  private load() {
    if (!this.file || !existsSync(this.file)) return;
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { sessions?: Session[]; locks?: [string,string][] };
      for (const s of data.sessions ?? []) this.sessions.set(s.id, s);
      for (const [workspace, owner] of data.locks ?? []) this.locks.set(workspace, owner);
      this.cleanupExpired();
    } catch { /* start clean if persisted state is corrupt */ }
  }
  private save() {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ sessions: [...this.sessions.values()], locks: [...this.locks.entries()] }, null, 2));
  }
  private cleanupExpired() {
    const now = Date.now();
    for (const [id, s] of this.sessions) if (s.leaseUntil && Date.parse(s.leaseUntil) <= now) { this.release(id); this.sessions.delete(id); }
  }
  create(client: string, workspace: string | undefined, mode: SessionMode): Session {
    const now = new Date().toISOString();
    const session: Session = { id: randomUUID(), client, workspace, mode, createdAt: now, lastSeenAt: now, leaseUntil: new Date(Date.now()+this.leaseMs).toISOString() };
    this.sessions.set(session.id, session); this.save(); return session;
  }
  get(id: string): Session | undefined { this.cleanupExpired(); return this.sessions.get(id); }
  touch(id: string): Session {
    const s = this.get(id); if (!s) throw new Error(`Unknown session: ${id}`);
    s.lastSeenAt = new Date().toISOString(); s.leaseUntil = new Date(Date.now()+this.leaseMs).toISOString(); this.save(); return s;
  }
  acquire(id: string): Session {
    const s = this.touch(id);
    if (!s.workspace || s.mode === 'read-only') return s;
    const owner = this.locks.get(s.workspace);
    if (owner && owner !== id) throw new Error(`Workspace locked by session ${owner}`);
    this.locks.set(s.workspace, id); this.save(); return s;
  }
  heartbeat(id: string) { return this.touch(id); }
  release(id: string): void {
    for (const [workspace, owner] of this.locks) if (owner === id) this.locks.delete(workspace);
    this.sessions.delete(id); this.save();
  }
  status() {
    this.cleanupExpired();
    return { sessions: [...this.sessions.values()], locks: [...this.locks.entries()].map(([workspace, owner]) => ({ workspace, owner })) };
  }
}
