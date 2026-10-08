import { randomUUID } from 'node:crypto';
import type { Session, SessionMode } from './types.js';

export class SessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly locks = new Map<string, string>();

  create(client: string, workspace: string | undefined, mode: SessionMode): Session {
    const now = new Date().toISOString();
    const session: Session = { id: randomUUID(), client, workspace, mode, createdAt: now, lastSeenAt: now };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session | undefined { return this.sessions.get(id); }

  touch(id: string): void {
    const s = this.sessions.get(id);
    if (s) s.lastSeenAt = new Date().toISOString();
  }

  acquire(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new Error(`Unknown session: ${id}`);
    if (!s.workspace || s.mode === 'read-only') return s;
    const owner = this.locks.get(s.workspace);
    if (owner && owner !== id) throw new Error(`Workspace locked by session ${owner}`);
    this.locks.set(s.workspace, id);
    return s;
  }

  release(id: string): void {
    for (const [workspace, owner] of this.locks) if (owner === id) this.locks.delete(workspace);
  }

  status() {
    return {
      sessions: [...this.sessions.values()],
      locks: [...this.locks.entries()].map(([workspace, owner]) => ({ workspace, owner }))
    };
  }
}
