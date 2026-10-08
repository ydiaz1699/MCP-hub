export type HubEvent = {
  id: string;
  type: string;
  timestamp: string;
  payload: unknown;
};

export class EventBus {
  private readonly events: HubEvent[] = [];
  private readonly subscribers = new Set<(event: HubEvent) => void>();

  publish(type: string, payload: unknown): HubEvent {
    const event: HubEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`, type, timestamp: new Date().toISOString(), payload };
    this.events.push(event);
    if (this.events.length > 500) this.events.shift();
    for (const subscriber of this.subscribers) subscriber(event);
    return event;
  }

  recent(limit = 50): HubEvent[] { return this.events.slice(-Math.max(1, Math.min(limit, 500))); }
  subscribe(fn: (event: HubEvent) => void): () => void { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
}
