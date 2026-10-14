import { writable } from 'svelte/store';
import type { ClientEnvelope } from './generated/client-envelope';
import type { ClientConnectionState, PersistencePreferences } from './client-types';

export const clientConnection = writable<ClientConnectionState>('not-installed');
export const persistencePreferences = writable<PersistencePreferences>({ veterans: 'manual', completedRaces: 'manual', diagnostics: false });
export const clientLastEvent = writable<string | null>(null);
export const clientLastEnvelope = writable<ClientEnvelope | null>(null);

export function setMockClientState(state: ClientConnectionState): void {
  clientConnection.set(state);
  clientLastEvent.set(state === 'connected' ? new Date().toISOString() : null);
}
