/** Narrowing for the Skill Explorer's data files, which arrive as untyped JSON. */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Skill Explorer data has an invalid ${label}.`);
  return value;
}

export function numberList(value: unknown, label: string): number[] {
  if (!Array.isArray(value)) throw new Error(`Skill Explorer data has an invalid ${label}.`);
  return value.map((entry) => finiteNumber(entry, label));
}
