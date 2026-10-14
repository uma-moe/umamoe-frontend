import type { ClientEnvelope } from './generated/client-envelope';
import type { ClientConnectionDescriptor, ClientTransport, ClientTransportStatus } from './client-types';

export class LoopbackWebSocketTransport implements ClientTransport {
  #socket: WebSocket | null = null;
  #listeners = new Set<(envelope: ClientEnvelope) => void>();
  #statusListeners = new Set<(status: ClientTransportStatus) => void>();
  #lastSequence = -1;

  async connect(descriptor: ClientConnectionDescriptor): Promise<void> {
    const endpoint = new URL(descriptor.endpoint);
    if (!['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname)) throw new Error('Client endpoint must use a loopback host.');
    if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Client endpoint must use WebSocket transport.');
    if (!descriptor.token.trim()) throw new Error('Pairing token is required.');
    if (Date.parse(descriptor.expiresAt) <= Date.now()) throw new Error('Pairing descriptor has expired.');
    endpoint.searchParams.set('token', descriptor.token);
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(endpoint);
      const timeout = window.setTimeout(() => { socket.close(); reject(new Error('Local client connection timed out.')); }, 4000);
      socket.onopen = () => { window.clearTimeout(timeout); this.#socket = socket; this.#emitStatus('open'); resolve(); };
      socket.onerror = () => { window.clearTimeout(timeout); this.#emitStatus('error'); reject(new Error('Could not connect to the local client.')); };
      socket.onmessage = (event) => this.#receive(event.data);
      socket.onclose = () => { if (this.#socket === socket) this.#socket = null; this.#emitStatus('closed'); };
    });
  }

  disconnect(): void { this.#socket?.close(1000, 'Website disconnected'); this.#socket = null; }
  requestSnapshot(): void { this.#socket?.send(JSON.stringify({ type: 'snapshot.request', afterSequence: this.#lastSequence })); }
  subscribe(listener: (envelope: ClientEnvelope) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  subscribeStatus(listener: (status: ClientTransportStatus) => void): () => void { this.#statusListeners.add(listener); return () => this.#statusListeners.delete(listener); }

  #receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let envelope: ClientEnvelope;
    try { envelope = JSON.parse(raw) as ClientEnvelope; } catch { return; }
    if (!isClientEnvelope(envelope) || envelope.sequence <= this.#lastSequence) return;
    if (this.#lastSequence >= 0 && envelope.sequence !== this.#lastSequence + 1) this.requestSnapshot();
    this.#lastSequence = envelope.sequence;
    for (const listener of this.#listeners) listener(envelope);
  }

  #emitStatus(status: ClientTransportStatus): void { for (const listener of this.#statusListeners) listener(status); }
}

function isClientEnvelope(value: unknown): value is ClientEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<ClientEnvelope>;
  return envelope.protocolVersion === 1 && typeof envelope.messageId === 'string' && Number.isInteger(envelope.sequence) && typeof envelope.timestamp === 'string' && typeof envelope.type === 'string' && ['snapshot', 'delta', 'event'].includes(String(envelope.mode)) && !!envelope.payload && typeof envelope.payload === 'object';
}
