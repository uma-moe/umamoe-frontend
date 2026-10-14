import type { VeteranRecord } from './generated/veteran-record';

export interface AffinityData {
  chars: number[];
  aff2: number[];
  aff3: number[];
}

export interface VeteranRelationBreakdown {
  targetParentOne: number;
  targetParentTwo: number;
  targetParentOneGrandparentOne: number;
  targetParentOneGrandparentTwo: number;
  targetParentTwoGrandparentOne: number;
  targetParentTwoGrandparentTwo: number;
  parentPair: number;
  parentOneTotal: number;
  parentTwoTotal: number;
  total: number;
}

export interface VeteranPairScore {
  parentOne: VeteranRecord;
  parentTwo: VeteranRecord;
  relation: VeteranRelationBreakdown;
}

function baseCharacterId(cardId: number | null | undefined): number | null {
  if (!cardId || !Number.isFinite(cardId)) return null;
  return Math.floor(cardId / 100);
}

function grandparents(record: VeteranRecord): [number | null, number | null] {
  const sorted = [...record.parents].sort((left, right) => left.positionId - right.positionId);
  const left = sorted.find((parent) => parent.positionId === 10) ?? sorted[0];
  const right = sorted.find((parent) => parent.positionId === 20) ?? sorted.find((parent) => parent !== left);
  return [baseCharacterId(left?.cardId), baseCharacterId(right?.cardId)];
}

export function veteranBaseCharacterId(record: VeteranRecord): number | null {
  return baseCharacterId(record.cardId);
}

export class VeteranAffinityEngine {
  private readonly indexes = new Map<number, number>();
  private readonly size: number;

  constructor(private readonly data: AffinityData) {
    if (!Array.isArray(data.chars) || !Array.isArray(data.aff2) || !Array.isArray(data.aff3)) {
      throw new Error('The affinity resource has an invalid shape.');
    }
    this.size = data.chars.length;
    for (let index = 0; index < this.size; index += 1) {
      const characterId = data.chars[index];
      if (characterId !== undefined) this.indexes.set(characterId, index);
    }
  }

  get ready(): boolean {
    return this.size > 0;
  }

  get characterIds(): readonly number[] { return this.data.chars; }

  pair(first: number | null, second: number | null): number {
    if (first == null || second == null) return 0;
    const left = this.indexes.get(first);
    const right = this.indexes.get(second);
    if (left == null || right == null) return 0;
    return this.data.aff2[left * this.size + right] ?? 0;
  }

  triple(first: number | null, second: number | null, third: number | null): number {
    if (first == null || second == null || third == null) return 0;
    const left = this.indexes.get(first);
    const middle = this.indexes.get(second);
    const right = this.indexes.get(third);
    if (left == null || middle == null || right == null) return 0;
    return this.data.aff3[left * this.size * this.size + middle * this.size + right] ?? 0;
  }

  scoreVeteranPair(targetCharacterId: number, parentOne: VeteranRecord, parentTwo: VeteranRecord): VeteranRelationBreakdown {
    const parentOneId = veteranBaseCharacterId(parentOne);
    const parentTwoId = veteranBaseCharacterId(parentTwo);
    const [parentOneGrandparentOne, parentOneGrandparentTwo] = grandparents(parentOne);
    const [parentTwoGrandparentOne, parentTwoGrandparentTwo] = grandparents(parentTwo);
    const targetParentOne = this.pair(targetCharacterId, parentOneId);
    const targetParentTwo = this.pair(targetCharacterId, parentTwoId);
    const targetParentOneGrandparentOne = this.triple(targetCharacterId, parentOneId, parentOneGrandparentOne);
    const targetParentOneGrandparentTwo = this.triple(targetCharacterId, parentOneId, parentOneGrandparentTwo);
    const targetParentTwoGrandparentOne = this.triple(targetCharacterId, parentTwoId, parentTwoGrandparentOne);
    const targetParentTwoGrandparentTwo = this.triple(targetCharacterId, parentTwoId, parentTwoGrandparentTwo);
    const parentPair = this.pair(parentOneId, parentTwoId);
    const parentOneTotal = targetParentOne + targetParentOneGrandparentOne + targetParentOneGrandparentTwo;
    const parentTwoTotal = targetParentTwo + targetParentTwoGrandparentOne + targetParentTwoGrandparentTwo;
    return {
      targetParentOne,
      targetParentTwo,
      targetParentOneGrandparentOne,
      targetParentOneGrandparentTwo,
      targetParentTwoGrandparentOne,
      targetParentTwoGrandparentTwo,
      parentPair,
      parentOneTotal,
      parentTwoTotal,
      total: parentOneTotal + parentTwoTotal + parentPair
    };
  }
}

export function rankVeteranPairs(
  engine: VeteranAffinityEngine,
  targetCharacterId: number,
  records: readonly VeteranRecord[],
  limit = 20
): VeteranPairScore[] {
  const candidates = records.filter((record) => veteranBaseCharacterId(record) !== targetCharacterId);
  const scores: VeteranPairScore[] = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const parentOne = candidates[left];
      const parentTwo = candidates[right];
      if (!parentOne || !parentTwo) continue;
      scores.push({ parentOne, parentTwo, relation: engine.scoreVeteranPair(targetCharacterId, parentOne, parentTwo) });
    }
  }
  scores.sort((left, right) => right.relation.total - left.relation.total
    || (right.parentOne.rankScore ?? 0) + (right.parentTwo.rankScore ?? 0) - (left.parentOne.rankScore ?? 0) - (left.parentTwo.rankScore ?? 0));
  return limit > 0 ? scores.slice(0, limit) : scores;
}
