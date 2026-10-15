async function jsonBytes(response: Response, label = response.url): Promise<ArrayBuffer> {
  if (!response.ok) throw new Error(`${label || 'Asset'} returned ${response.status}.`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  if (typeof DecompressionStream === 'undefined')
    throw new Error('This browser cannot decode compressed data assets.');
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function readJsonResponse<T>(response: Response, label = response.url): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await jsonBytes(response, label))) as T;
}

/** Manifest SHA-256 covers the original JSON bytes, regardless of HTTP/gzip encoding. */
export async function hashJsonResponse(response: Response): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(await jsonBytes(response)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fetchJsonResource<T>(url: string, init: RequestInit = {}): Promise<T> {
  return readJsonResponse<T>(await fetch(url, { credentials: 'omit', ...init }), url);
}
