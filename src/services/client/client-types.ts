import type { ClientEnvelope } from './generated/client-envelope';

export type ClientConnectionState = 'not-installed' | 'detected' | 'pairing' | 'connected' | 'reconnecting' | 'permission-blocked' | 'version-incompatible' | 'cloud-fallback';

export interface ClientConnectionDescriptor { endpoint: string; token: string; expiresAt: string; }
export type ClientTransportStatus = 'open' | 'closed' | 'error';
export interface ClientTransport {
  connect(descriptor: ClientConnectionDescriptor): Promise<void>;
  disconnect(): void;
  requestSnapshot(): void;
  subscribe(listener: (envelope: ClientEnvelope) => void): () => void;
  subscribeStatus?(listener: (status: ClientTransportStatus) => void): () => void;
}

export interface PersistencePreferences {
  veterans: 'automatic' | 'manual';
  completedRaces: 'automatic' | 'manual';
  diagnostics: boolean;
}
