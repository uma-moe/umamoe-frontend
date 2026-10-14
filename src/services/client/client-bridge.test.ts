import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientBridge, validateDescriptor } from './client-bridge';
import { clientConnection, clientLastEnvelope, clientLastEvent } from './client-state';
import type { ClientEnvelope } from './generated/client-envelope';
import type { ClientConnectionDescriptor, ClientTransport, ClientTransportStatus } from './client-types';

class FakeTransport implements ClientTransport {
  envelopes = new Set<(envelope: ClientEnvelope) => void>();
  statuses = new Set<(status: ClientTransportStatus) => void>();
  connected = false;
  async connect(): Promise<void> { this.connected = true; this.emitStatus('open'); }
  disconnect(): void { this.connected = false; this.emitStatus('closed'); }
  requestSnapshot(): void {}
  subscribe(listener: (envelope: ClientEnvelope) => void): () => void { this.envelopes.add(listener); return () => this.envelopes.delete(listener); }
  subscribeStatus(listener: (status: ClientTransportStatus) => void): () => void { this.statuses.add(listener); return () => this.statuses.delete(listener); }
  emit(envelope: ClientEnvelope): void { for (const listener of this.envelopes) listener(envelope); }
  emitStatus(status: ClientTransportStatus): void { for (const listener of this.statuses) listener(status); }
}

const descriptor: ClientConnectionDescriptor = { endpoint: 'ws://127.0.0.1:32123/connect', token: 'short-lived-code', expiresAt: '2999-01-01T00:00:00.000Z' };

describe('ClientBridge', () => {
  beforeEach(() => { clientConnection.set('not-installed'); clientLastEnvelope.set(null); clientLastEvent.set(null); });

  it('connects through a typed transport and exposes envelopes through shared state', async () => {
    const transport = new FakeTransport();
    const bridge = new ClientBridge(transport, { autoReconnect: false });
    await bridge.connect(descriptor);
    expect(get(clientConnection)).toBe('connected');
    const envelope: ClientEnvelope = { protocolVersion: 1, messageId: 'm1', sequence: 1, timestamp: '2026-08-26T12:00:00.000Z', type: 'client.status', mode: 'event', payload: { ready: true } };
    transport.emit(envelope);
    expect(get(clientLastEnvelope)).toEqual(envelope);
    expect(get(clientLastEvent)).toBe(envelope.timestamp);
  });

  it('keeps cloud fallback independent from the local transport', async () => {
    const transport = new FakeTransport();
    const bridge = new ClientBridge(transport, { autoReconnect: false });
    await bridge.connect(descriptor);
    bridge.useCloudFallback();
    expect(transport.connected).toBe(false);
    expect(get(clientConnection)).toBe('cloud-fallback');
  });
});

describe('validateDescriptor', () => {
  it('rejects non-loopback endpoints and missing pairing codes', () => {
    expect(() => validateDescriptor({ ...descriptor, endpoint: 'wss://example.com/connect' })).toThrow(/this device/i);
    expect(() => validateDescriptor({ ...descriptor, token: '' })).toThrow(/pairing code/i);
  });
});
