import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoopbackWebSocketTransport } from './websocket-transport';

class SocketStub {
  static instances: SocketStub[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(readonly url: URL) {
    SocketStub.instances.push(this);
  }

  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

beforeEach(() => {
  SocketStub.instances = [];
  vi.stubGlobal('WebSocket', SocketStub);
});

afterEach(() => vi.unstubAllGlobals());

const descriptor = () => ({
  endpoint: 'ws://127.0.0.1:8181',
  token: 'local-pairing',
  expiresAt: new Date(Date.now() + 60_000).toISOString()
});

const envelope = (sequence: number) => ({
  protocolVersion: 1,
  messageId: `message-${sequence}`,
  sequence,
  timestamp: new Date().toISOString(),
  type: 'client.status',
  mode: 'event',
  payload: {}
});

it('rejects malformed messages without advancing sequence tracking', async () => {
  const transport = new LoopbackWebSocketTransport();
  const received = vi.fn();
  transport.subscribe(received);
  const connection = transport.connect(descriptor());
  const socket = SocketStub.instances[0];
  if (!socket) throw new Error('Expected a WebSocket connection.');
  socket.onopen?.();
  await connection;

  for (const invalid of [
    null,
    [],
    { ...envelope(0), type: 'unknown' },
    { ...envelope(0), payload: [] },
    { ...envelope(0), accountRef: 1 },
    { ...envelope(0), sequence: -1 }
  ])
    socket.receive(invalid);
  expect(received).not.toHaveBeenCalled();
  socket.receive(envelope(0));
  socket.receive(envelope(0));
  socket.receive(envelope(2));
  expect(received).toHaveBeenCalledTimes(2);
  expect(socket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'snapshot.request', afterSequence: 0 })
  );

  transport.disconnect();
});

it('rejects invalid expiry dates before opening a socket', async () => {
  const transport = new LoopbackWebSocketTransport();
  await expect(transport.connect({ ...descriptor(), expiresAt: 'invalid' })).rejects.toThrow(
    'expired'
  );

  expect(SocketStub.instances).toHaveLength(0);
});
