export type SessionMode = 'exclusive' | 'shared' | 'read-only';

export interface Session {
  id: string;
  client: string;
  workspace?: string;
  mode: SessionMode;
  createdAt: string;
  lastSeenAt: string;
  leaseUntil?: string;
}

export interface BridgeRequest {
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
}
