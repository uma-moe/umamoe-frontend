import type { VeteranRecord } from '../generated/veteran-record';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, minimum?: number): value is number {
  return Number.isInteger(value) && (minimum === undefined || Number(value) >= minimum);
}

function validItems(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((item) => object(item) && integer(item.id) && integer(item.level, 0))
  );
}

function validationErrors(value: unknown): string[] {
  if (!object(value)) return ['record must be an object'];
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof value.recordId !== 'string' || !value.recordId.trim())
    errors.push('recordId must be a non-empty string');
  if (!integer(value.cardId, 1)) errors.push('cardId must be a positive integer');
  if (!object(value.stats)) errors.push('stats must be an object');
  else
    for (const key of ['speed', 'stamina', 'power', 'guts', 'wisdom'])
      if (!integer(value.stats[key], 0)) errors.push(`stats.${key} must be a non-negative integer`);
  if (!validItems(value.skills)) errors.push('skills must contain integer id/level pairs');
  if (!validItems(value.factors)) errors.push('factors must contain integer id/level pairs');
  if (
    !Array.isArray(value.parents) ||
    !value.parents.every(
      (parent) =>
        object(parent) &&
        integer(parent.positionId) &&
        integer(parent.cardId) &&
        validItems(parent.factors)
    )
  )
    errors.push('parents must contain valid positionId, cardId, and factors');
  return errors;
}

export function validateVeteranRecord(value: unknown): VeteranRecord {
  const errors = validationErrors(value);
  if (!errors.length) return value as VeteranRecord;
  throw new Error(`Invalid Veteran record: ${errors.slice(0, 5).join('; ')}`);
}

export function validateVeteranRecords(values: unknown[]): VeteranRecord[] {
  return values.map((value, index) => {
    try {
      return validateVeteranRecord(value);
    } catch (error) {
      throw new Error(
        `Veteran ${index + 1}: ${error instanceof Error ? error.message : 'invalid record'}`
      );
    }
  });
}
