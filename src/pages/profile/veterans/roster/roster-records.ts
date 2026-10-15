import { characterImagePath, type CharacterData } from '@/lib/game-data/characters';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { aptitudeGrade } from '@/lib/profile/profile-display';
import {
  resolveVeteranFactors,
  veteranDisplay,
  type FactorTone,
  type VeteranDisplayRecord
} from '@/lib/profile/veterans/profile-veterans';
import type { profileVeteranAffinity } from '@/lib/profile/veterans/profile-veteran-metrics';
import { getRankInfoFromScore } from '@/lib/rank';
import type { AptitudeItem } from '@/components/game/AptitudeGrid.svelte';
import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
import type { LineageBranch, LineageNodeData } from '@/components/lineage/lineage-types';
import type { ProfileVeteran, SuccessionChara } from '../../profile-repository';
import { aptitudeFields, statFields, statIcon } from './roster-options';

export type VeteranAffinity = ReturnType<typeof profileVeteranAffinity>;

export interface VeteranLineage {
  root: LineageNodeData;
  branches: LineageBranch[];
}

export interface SummaryContext {
  characters: Map<number, CharacterData>;
  affinity?: VeteranAffinity;
  targetId?: number;
  target?: CharacterData;
}

export function factorGroups(items: ReturnType<typeof resolveVeteranFactors>) {
  return (['blue', 'pink', 'green', 'white'] as FactorTone[])
    .map((tone) => ({
      tone,
      items: items
        .filter((factor) => factor.tone === tone)
        .map((factor, index) => ({
          id: `${factor.encodedId}:${index}`,
          name: factor.name,
          level: factor.level
        }))
    }))
    .filter((group) => group.items.length);
}

export function veteranAptitudes(v: ProfileVeteran): AptitudeItem[] {
  return aptitudeFields.map((field) => ({
    id: field.id,
    label: field.label,
    group: field.group,
    grade: aptitudeGrade(v[field.id])
  }));
}

export function veteranSummary(
  item: VeteranDisplayRecord,
  { characters, affinity, targetId, target }: SummaryContext
): VeteranUiRecord {
  const v = item.veteran;
  return {
    id: String(v.trained_chara_id ?? v.id),
    name: item.name,
    image: item.image,
    rank: v.rank_score == null ? '' : getRankInfoFromScore(v.rank_score).label,
    score: v.rank_score ?? undefined,
    scenario: item.scenario === '-' ? undefined : item.scenario,
    detail: [item.distance, item.style].filter((value) => value && value !== '-').join(' · '),
    affinity: affinity?.main ?? Number.NaN,
    affinityTarget: targetId ? { id: targetId, name: target?.name ?? 'Selected Uma' } : undefined,
    affinityNote: targetId
      ? 'Affinity with ' +
        (target?.name ?? 'the target') +
        ': direct relation, both parent contributions and shared G1 wins.'
      : affinity?.recorded
        ? 'Stored main affinity; parent details unavailable'
        : 'Main = P1 + P2. Each parent includes base affinity and shared G1 wins.',
    aptitudes: veteranAptitudes(v),
    stats: [
      ...statFields.map((field) => ({
        id: field.id,
        label: field.label,
        value: (v[field.id] ?? 0).toLocaleString(),
        tone: field.id === 'wiz' ? ('wit' as const) : field.id,
        icon: statIcon(field.id)
      })),
      { id: 'total', label: 'Total', value: item.total.toLocaleString() }
    ],
    sparks: factorGroups(item.factors),
    parents: (v.succession_chara_array ?? [])
      .filter((parent) => parent.position_id === 10 || parent.position_id === 20)
      .map((parent) => ({
        id: String(parent.position_id),
        position: parent.position_id === 10 ? ('P1' as const) : ('P2' as const),
        name: characters.get(parent.card_id)?.name ?? 'Parent',
        image: characterImagePath(parent.card_id),
        affinity: (parent.position_id === 10 ? affinity?.p1 : affinity?.p2) ?? Number.NaN,
        sparks: factorGroups(resolveVeteranFactors(parent))
      }))
  };
}

export function veteranLineage(
  v: ProfileVeteran,
  characters: Map<number, CharacterData>,
  mainAffinity: number | undefined
): VeteranLineage {
  const rootDisplay = veteranDisplay(v, characters);
  const successors = v.succession_chara_array ?? [];
  const node = (
    item: SuccessionChara,
    role: 'parent' | 'grandparent',
    label: string
  ): LineageNodeData => ({
    id: `${v.trained_chara_id}:${item.position_id}`,
    name: characters.get(item.card_id)?.name ?? `Character ${item.card_id}`,
    image: characterImagePath(item.card_id),
    role,
    roleLabel: label,
    sparks: factorGroups(resolveVeteranFactors(item))
  });

  const branches = [10, 20]
    .map((position, index) => {
      const parent = successors.find((item) => item.position_id === position);
      if (!parent) return null;
      const base = position === 10 ? 11 : 21;
      return {
        id: `branch-${position}`,
        parent: node(parent, 'parent', index === 0 ? 'P1' : 'P2'),
        grandparents: successors
          .filter((item) => item.position_id === base || item.position_id === base + 1)
          .map((item, grandIndex) =>
            node(item, 'grandparent', `${index === 0 ? 'P1' : 'P2'} legacy ${grandIndex + 1}`)
          )
      };
    })
    .filter((branch): branch is LineageBranch => Boolean(branch));

  return {
    root: {
      id: `${v.trained_chara_id ?? v.id}`,
      name: rootDisplay.name,
      image: rootDisplay.image,
      role: 'main',
      roleLabel: 'Main',
      affinity: mainAffinity,
      sparks: factorGroups(rootDisplay.factors)
    },
    branches
  };
}

export function veteranSearchText(
  veteran: ProfileVeteran,
  context: SummaryContext,
  skillCatalog: Map<number, SkillData>
): string {
  const { characters } = context;
  const item = veteranDisplay(veteran, characters),
    summary = veteranSummary(item, context);

  return [
    summary.id,
    summary.name,
    summary.rank,
    summary.score,
    item.scenario,
    item.distance,
    item.style,
    ...(summary.stats ?? []).flatMap((stat) => [stat.label, stat.value]),
    ...item.factors.map((factor) => factor.name),
    ...item.skills.map((skill) => skillCatalog.get(Math.floor(skill / 10))?.name),
    ...(veteran.succession_chara_array ?? []).flatMap((parent) => [
      characters.get(parent.card_id)?.name,
      ...resolveVeteranFactors(parent).map((factor) => factor.name)
    ])
  ].join(' ');
}
