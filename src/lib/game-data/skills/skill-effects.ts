import { resourceCache } from '@/services/resources/resource-cache';
import type { SkillData } from '@/lib/game-data/skills/skills';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Skill mechanics have an invalid ${label}.`);
  return value;
}

export interface SkillEffect {
  kind: number;
  value: number;
  target: number;
}

export interface SkillEffectAlternative {
  seconds: number;
  variableDuration: boolean;
  effects: SkillEffect[];
}

/** Global mechanic entries distinguish released skills from future names in the text resource. */
export async function loadSkillEffects(): Promise<Map<number, SkillEffectAlternative[]>> {
  return parseSkillEffects(await resourceCache.load<unknown>('simulator_skills'));
}

export function releasedSkills(
  skills: ReadonlyMap<number, SkillData>,
  mechanics: ReadonlyMap<number, unknown>
): Map<number, SkillData> {
  return new Map([...skills].filter(([id]) => mechanics.has(id)));
}

export function parseSkillEffects(value: unknown): Map<number, SkillEffectAlternative[]> {
  if (!isRecord(value) || !Array.isArray(value.skills))
    throw new Error('Skill effect data has no skills.');

  return new Map(
    value.skills.map((skill: unknown) => {
      if (!isRecord(skill) || !Array.isArray(skill.alternatives))
        throw new Error('Skill effect data has an invalid skill.');

      const alternatives = skill.alternatives.map((alternative: unknown) => {
        if (!isRecord(alternative) || !Array.isArray(alternative.effects))
          throw new Error('Skill effect data has an invalid alternative.');

        return {
          seconds: finiteNumber(alternative.base_duration, 'effect duration') / 10_000,
          variableDuration:
            finiteNumber(alternative.duration_scaling ?? 1, 'duration scaling') !== 1,
          effects: alternative.effects.map((effect: unknown) => {
            if (!isRecord(effect)) throw new Error('Skill effect data has an invalid effect.');
            return {
              kind: finiteNumber(effect.effect_type, 'effect type'),
              value: finiteNumber(effect.modifier, 'effect strength') / 10_000,
              target: finiteNumber(effect.target, 'effect target')
            };
          })
        };
      });

      return [finiteNumber(skill.skill_id, 'skill id'), alternatives];
    })
  );
}
