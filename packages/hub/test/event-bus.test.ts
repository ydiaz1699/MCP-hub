import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/event-bus.js';

test('EventBus stores and publishes events', () => {
  const bus = new EventBus();
  const seen: string[] = [];
  const unsubscribe = bus.subscribe(e => seen.push(e.type));
  bus.publish('editor.changed', { path: 'a.ts' });
  unsubscribe();
  bus.publish('terminal.output', { text: 'ok' });
  assert.deepEqual(seen, ['editor.changed']);
  assert.equal(bus.recent(1)[0].type, 'terminal.output');
});
