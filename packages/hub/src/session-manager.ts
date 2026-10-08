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
  /**
   * Try to take the workspace lock for a session WITHOUT throwing.
   * Returns the current lock state so callers can decide what to do:
   * - read-only sessions / sessions without a workspace never take a lock (locked:false).
   * - if the lock is free (or already ours) we take it and return locked:false.
   * - if another session owns it, we DO NOT throw; we return locked:true + lockOwner.
   * This lets a second agent still hold a valid session (to observe/queue) instead of
   * being left with no session at all.
   */
  acquire(id: string): { session: Session; locked: boolean; lockOwner?: string } {
    const s = this.touch(id);
    if (!s.workspace || s.mode === 'read-only') return { session: s, locked: false };
    const owner = this.locks.get(s.workspace);
    if (owner && owner !== id) return { session: s, locked: true, lockOwner: owner };
    this.locks.set(s.workspace, id); this.save();
    return { session: s, locked: false };
  }

  /**
   * Enforce the lock for a mutating operation. Throws with an actionable message if the
   * session cannot own the workspace lock. Used by mutating tools.
   */
  requireLock(id: string): Session {
    const { session, locked, lockOwner } = this.acquire(id);
    if (locked) throw new Error(`Workspace "${session.workspace}" is locked by session ${lockOwner}. Wait for it to release (hub.session.release) or its lease to expire, then retry.`);
    return session;
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
