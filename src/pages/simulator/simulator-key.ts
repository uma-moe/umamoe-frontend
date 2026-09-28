/**
 * The API key the simulator routes demand, kept in this browser only.
 *
 * `/api/sim/*` authenticates with `X-API-Key`, and uma.moe only ever shows a
 * key's raw value once (the account list stores a prefix). So the lab asks for
 * one and remembers it locally rather than trying to recover it server-side.
 */

const STORAGE_KEY = 'uma.simulator.api-key';

export function readApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function writeApiKey(key: string): void {
  try {
    const trimmed = key.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private-mode storage failures must not make the field untypable.
  }
}
