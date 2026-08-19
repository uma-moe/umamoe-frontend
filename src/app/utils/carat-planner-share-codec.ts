import { CaratPlan } from '../models/carat-planner.model';

const SHARE_FORMAT_VERSION = 1;
const MAX_PLAN_BYTES = 262_144;
const MAX_SHARE_PAYLOAD_CHARS = 7_500;

interface PlannerShareEnvelope {
  v: number;
  p: CaratPlan;
}

export interface DecodedPlannerShare {
  plan: unknown;
  fingerprint: string;
}

export class PlannerShareTooLargeError extends Error {
  constructor() {
    super('This plan is too large for a self-contained link. Log in to create a short link.');
  }
}

export async function encodeCompactPlannerShare(plan: CaratPlan): Promise<string> {
  const source = new TextEncoder().encode(JSON.stringify({
    v: SHARE_FORMAT_VERSION,
    p: plan,
  } satisfies PlannerShareEnvelope));
  if (source.byteLength > MAX_PLAN_BYTES) throw new PlannerShareTooLargeError();

  let codec = 'j';
  let encodedBytes = source;
  if (typeof CompressionStream !== 'undefined') {
    codec = 'g';
    encodedBytes = await transformBytes(
      source,
      new CompressionStream('gzip'),
      MAX_PLAN_BYTES,
      () => new PlannerShareTooLargeError(),
    );
  }

  const payload = `${codec}.${encodeBase64Url(encodedBytes)}`;
  if (payload.length > MAX_SHARE_PAYLOAD_CHARS) throw new PlannerShareTooLargeError();
  return payload;
}

export async function decodeCompactPlannerShare(payload: string): Promise<DecodedPlannerShare> {
  const value = payload.trim();
  if (!value || value.length > MAX_SHARE_PAYLOAD_CHARS || value[1] !== '.') {
    throw new Error('This compact plan link is invalid.');
  }

  const codec = value[0];
  const encoded = value.slice(2);
  if (!/^[a-zA-Z0-9_-]+$/.test(encoded)) {
    throw new Error('This compact plan link is invalid.');
  }

  const packed = decodeBase64Url(encoded);
  let source: Uint8Array;
  if (codec === 'g') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot open compressed plan links.');
    }
    source = await transformBytes(
      packed,
      new DecompressionStream('gzip'),
      MAX_PLAN_BYTES,
      () => new Error('This compact plan link is too large.'),
    );
  } else if (codec === 'j') {
    source = packed;
  } else {
    throw new Error('This compact plan link uses an unsupported format.');
  }

  if (source.byteLength > MAX_PLAN_BYTES) throw new Error('This compact plan link is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(source));
  } catch {
    throw new Error('This compact plan link is invalid.');
  }
  if (!isShareEnvelope(parsed)) throw new Error('This compact plan link contains no usable plan.');

  return {
    plan: parsed.p,
    fingerprint: await fingerprint(value),
  };
}

async function transformBytes(
  source: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  maxOutputBytes: number,
  tooLargeError: () => Error,
): Promise<Uint8Array> {
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(transform) as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxOutputBytes) {
        await reader.cancel();
        throw tooLargeError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  try {
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  } catch {
    throw new Error('This compact plan link is invalid.');
  }
}

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    try {
      const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
      return [...digest.subarray(0, 8)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {}
  }

  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isShareEnvelope(value: unknown): value is PlannerShareEnvelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlannerShareEnvelope>;
  return record.v === SHARE_FORMAT_VERSION && !!record.p && typeof record.p === 'object';
}
