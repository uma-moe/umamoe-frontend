import { clientConnection, clientLastEnvelope, clientLastEvent } from './client-state';
import type { ClientEnvelope } from './generated/client-envelope';
import type { ClientConnectionDescriptor, ClientConnectionState, ClientTransport, ClientTransportStatus } from './client-types';
import { LoopbackWebSocketTransport } from './websocket-transport';

interface ClientBridgeOptions {
  autoReconnect?: boolean;
  retryDelayMs?: number;
}

export class ClientBridge {
  #descriptor: ClientConnectionDescriptor | null = null;
  #manualDisconnect = false;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #connecting: Promise<void> | null = null;
  readonly #autoReconnect: boolean;
  readonly #retryDelayMs: number;

  constructor(private readonly transport: ClientTransport, options: ClientBridgeOptions = {}) {
    this.#autoReconnect = options.autoReconnect ?? true;
    this.#retryDelayMs = options.retryDelayMs ?? 1200;
    transport.subscribe((envelope) => this.#receive(envelope));
    transport.subscribeStatus?.((status) => this.#transportStatus(status));
  }

  async connect(descriptor: ClientConnectionDescriptor): Promise<void> {
    validateDescriptor(descriptor);
    if (this.#connecting) return this.#connecting;
    this.#descriptor = descriptor;
    this.#manualDisconnect = false;
    this.#clearReconnect();
    clientConnection.set('pairing');
    this.#connecting = this.transport.connect(descriptor)
      .then(() => clientConnection.set('connected'))
      .catch((reason: unknown) => {
        clientConnection.set(connectionFailureState(reason));
        throw reason;
      })
      .finally(() => { this.#connecting = null; });
    return this.#connecting;
  }

  disconnect(): void {
    this.#manualDisconnect = true;
    this.#clearReconnect();
    this.transport.disconnect();
    clientConnection.set(this.#descriptor ? 'detected' : 'not-installed');
  }

  useCloudFallback(): void {
    this.#manualDisconnect = true;
    this.#clearReconnect();
    this.transport.disconnect();
    clientConnection.set('cloud-fallback');
  }

  #receive(envelope: ClientEnvelope): void {
    clientLastEnvelope.set(envelope);
    clientLastEvent.set(envelope.timestamp);
    if (envelope.type === 'error' && envelope.payload.code === 'PROTOCOL_VERSION') clientConnection.set('version-incompatible');
  }

  #transportStatus(status: ClientTransportStatus): void {
    if (status === 'open') { clientConnection.set('connected'); return; }
    if (status !== 'closed' || this.#manualDisconnect) return;
    if (!this.#descriptor || Date.parse(this.#descriptor.expiresAt) <= Date.now()) { clientConnection.set('detected'); return; }
    if (!this.#autoReconnect) { clientConnection.set('reconnecting'); return; }
    clientConnection.set('reconnecting');
    this.#clearReconnect();
    this.#reconnectTimer = setTimeout(() => {
      const descriptor = this.#descriptor;
      if (!descriptor || this.#manualDisconnect) return;
      void this.connect(descriptor).catch(() => undefined);
    }, this.#retryDelayMs);
  }

  #clearReconnect(): void {
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = undefined;
  }
}

export function validateDescriptor(descriptor: ClientConnectionDescriptor): void {
  const endpoint = new URL(descriptor.endpoint);
  if (!['ws:', 'wss:'].includes(endpoint.protocol)) throw new Error('Pairing endpoint must use WebSocket transport.');
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(endpoint.hostname)) throw new Error('Pairing endpoint must stay on this device.');
  if (!descriptor.token.trim()) throw new Error('Enter the short-lived pairing code shown by the client.');
  if (!Number.isFinite(Date.parse(descriptor.expiresAt)) || Date.parse(descriptor.expiresAt) <= Date.now()) throw new Error('Pairing code has expired. Request a new code from the client.');
}

function connectionFailureState(reason: unknown): ClientConnectionState {
  const message = reason instanceof Error ? reason.message.toLowerCase() : '';
  if (message.includes('version') || message.includes('protocol')) return 'version-incompatible';
  if (message.includes('permission') || message.includes('blocked') || message.includes('local network')) return 'permission-blocked';
  return 'not-installed';
}

export const clientBridge = new ClientBridge(new LoopbackWebSocketTransport());
