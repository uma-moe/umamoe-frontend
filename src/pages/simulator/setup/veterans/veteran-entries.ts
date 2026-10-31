import { getAuthToken } from '@/services/auth/auth-token';
import type { AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
import type { AptitudeItem } from '@/components/game/AptitudeGrid.svelte';
import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
import { characterImagePath, loadCharacters } from '@/lib/game-data/characters';
import { loadSkills, skillPointTotal } from '@/lib/game-data/skills/skills';
import { DISTANCE_NAMES, SURFACE_NAMES, type RaceCourse } from '@/lib/game-data/racing/courses';
import { getRankInfoFromScore } from '@/lib/rank';
import { encodedSkills } from '@/lib/profile/veterans/profile-veterans';
import { mergeVeterans } from '@/lib/veterans/records/veteran-profile';
import { profileRepository, type ProfileVeteran } from '@/pages/profile/profile-repository';
import { scenarioLabel } from '@/lib/game-data/scenarios';
import { deviceVeteranParents } from '@/pages/veterans/collection/veteran-library';
import { simulatorUmaFromVeteran, type SimulatorUma } from '../../simulator-uma';
import { RUNNING_STYLES } from '../trainee';

const STYLE_NAMES: Record<string, string> = {
  Nige: 'Front',
  Senko: 'Pace',
  Sashi: 'Late',
  Oikomi: 'End',
  Oonige: 'Runaway'
};

/** A Veteran ready for the simulator: its build, and what the pickers sort and filter by. */
export interface VeteranEntry {
  key: string;
  uma: SimulatorUma;
  /** Portrait, name, scenario and running style, as the Veterans page shows them. */
  summary: VeteranUiRecord;
  rarity?: number;
  /** Rank label, such as UG8, from the rank score. */
  rank?: string;
  score?: number;
  /** Speed to wit, summed. */
  total: number;
  learnedSkills: number;
  /** Base SP of the learned skills; missing when a skill can't be priced. */
  skillPoints: number | null;
  /** When it was trained, for newest first. */
  created: number;
}

/**
 * A collection's Veterans with trained stats, newest first: the account's synced ones and this device's own. Records
 * without stats can't race, so they are counted apart.
 */
export async function loadVeteranEntries(
  accountId: string
): Promise<{ entries: VeteranEntry[]; missing: number }> {
  const token = getAuthToken();
  const [local, remote, characters, skills] = await Promise.all([
    deviceVeteranParents(),
    accountId ? profileRepository.load(accountId) : Promise.resolve(undefined),
    loadCharacters(),
    loadSkills()
  ]);

  if (token !== getAuthToken()) throw new Error('Your sign-in session changed. Open this again.');
  const veterans = mergeVeterans(
    remote?.veterans ?? [],
    (local as unknown as ProfileVeteran[]).filter(
      (veteran) => (veteran.trainer_id ?? '') === accountId
    )
  );

  const entries: VeteranEntry[] = [];
  let missing = 0;
  for (const veteran of veterans) {
    const stats = [veteran.speed, veteran.stamina, veteran.power, veteran.guts, veteran.wiz];
    if (stats.some((value) => value == null)) {
      missing++;
      continue;
    }

    const key = String(veteran.trained_chara_id ?? veteran.id);
    const name = characters.get(veteran.card_id ?? 0)?.name ?? 'Veteran';
    const uma = simulatorUmaFromVeteran(veteran, name);
    const rank =
      veteran.rank_score != null ? getRankInfoFromScore(veteran.rank_score).label : undefined;
    const learned = encodedSkills(veteran);

    entries.push({
      key,
      uma,
      summary: {
        id: key,
        name,
        image: veteran.card_id ? characterImagePath(veteran.card_id) : undefined,
        rank: rank ?? '',
        scenario: veteran.scenario_id
          ? (scenarioLabel(veteran.scenario_id) ?? 'Scenario ' + veteran.scenario_id)
          : undefined,
        detail: STYLE_NAMES[uma.trainee.runningStyle],
        affinity: Number.NaN,
        sparks: []
      },
      rarity: veteran.rarity ?? undefined,
      rank,
      score: veteran.rank_score ?? undefined,
      total: stats.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      learnedSkills: learned.length,
      skillPoints: skillPointTotal(skills, learned),
      created: Date.parse(veteran.creation_time ?? '') || 0
    });
  }

  entries.sort((a, b) => b.created - a.created || (b.score ?? 0) - (a.score ?? 0));
  return { entries, missing };
}

const GRADES = 'SABCDEFG';

/** Her aptitudes on this course for her running style: distance, surface and style. */
export function courseAptitudes(uma: SimulatorUma, course?: RaceCourse): string[] {
  const style = RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]);
  return [
    uma.trainee.distanceAptitudes[(course?.distance_type ?? 3) - 1] ?? 'A',
    uma.trainee.groundAptitudes[(course?.surface ?? 1) - 1] ?? 'A',
    uma.trainee.styleAptitudes[style === 4 ? 0 : Math.max(0, style)] ?? 'A'
  ];
}

const isGrade = (grade: string): grade is AptitudeGradeValue =>
  grade.length === 1 && GRADES.includes(grade);

/** Her course aptitudes as the Veterans page draws them, each under the distance, surface or style it grades. */
export function courseAptitudeItems(uma: SimulatorUma, course?: RaceCourse): AptitudeItem[] {
  const [distance, surface, style] = courseAptitudes(uma, course);
  const items = [
    {
      id: 'distance',
      group: 'Distance',
      label: DISTANCE_NAMES[course?.distance_type ?? 3],
      grade: distance
    },
    { id: 'surface', group: 'Track', label: SURFACE_NAMES[course?.surface ?? 1], grade: surface },
    { id: 'style', group: 'Style', label: STYLE_NAMES[uma.trainee.runningStyle], grade: style }
  ];

  return items.map((item) => ({
    ...item,
    label: item.label ?? item.group,
    grade: item.grade !== undefined && isGrade(item.grade) ? item.grade : 'G'
  }));
}

/** How far her course aptitudes fall below A: 0 when all three are A or better. */
export function courseFit(uma: SimulatorUma, course?: RaceCourse): number {
  return courseAptitudes(uma, course).reduce(
    (sum, grade) => sum + Math.max(0, GRADES.indexOf(grade) - 1),
    0
  );
}

/** A copy to place in a field: its own id, so the same Veteran can be added twice. */
export function placeVeteran(entry: VeteranEntry): SimulatorUma {
  return { ...(JSON.parse(JSON.stringify(entry.uma)) as SimulatorUma), id: crypto.randomUUID() };
}
