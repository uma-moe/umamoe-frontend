import { getAuthToken } from '@/services/auth/auth-token';
import { loadCharacterCatalog } from '@/lib/catalog/character-catalog';
import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { getRankInfoFromScore } from '@/lib/rank';
import { mergeVeterans } from '@/lib/veterans/veteran-profile';
import { profileRepository, type ProfileVeteran } from '@/pages/profile/profile-repository';
import { deviceVeteranParents } from '@/pages/veterans/veteran-library';
import { simulatorUmaFromVeteran, type SimulatorUma } from '../simulator-uma';
import { RUNNING_STYLES } from './trainee';

/** A Veteran ready for the simulator: its build, and what the pickers sort and filter by. */
export interface VeteranEntry {
  key: string;
  uma: SimulatorUma;
  /** Rank label, such as UG8, from the rank score. */
  rank?: string;
  score?: number;
  /** Speed to wit, summed. */
  total: number;
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
  const [local, remote, characters] = await Promise.all([
    deviceVeteranParents(),
    accountId ? profileRepository.load(accountId) : Promise.resolve(undefined),
    loadCharacterCatalog()
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
    const name = characters.get(veteran.card_id ?? 0)?.name ?? 'Veteran';
    entries.push({
      key: String(veteran.trained_chara_id ?? veteran.id),
      uma: simulatorUmaFromVeteran(veteran, name),
      rank: veteran.rank_score != null ? getRankInfoFromScore(veteran.rank_score).label : undefined,
      score: veteran.rank_score ?? undefined,
      total: stats.reduce<number>((sum, value) => sum + (value ?? 0), 0),
      created: Date.parse(veteran.creation_time ?? '') || 0
    });
  }
  entries.sort((a, b) => b.created - a.created || (b.score ?? 0) - (a.score ?? 0));
  return { entries, missing };
}

const GRADES = 'SABCDEFG';

/** Her aptitudes on this course for her running style: distance, surface and style. */
export function courseAptitudes(uma: SimulatorUma, course?: CourseCatalogEntry): string[] {
  const style = RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]);
  return [
    uma.trainee.distanceAptitudes[(course?.distance_type ?? 3) - 1] ?? 'A',
    uma.trainee.groundAptitudes[(course?.surface ?? 1) - 1] ?? 'A',
    uma.trainee.styleAptitudes[style === 4 ? 0 : Math.max(0, style)] ?? 'A'
  ];
}

/** How far her course aptitudes fall below A: 0 when all three are A or better. */
export function courseFit(uma: SimulatorUma, course?: CourseCatalogEntry): number {
  return courseAptitudes(uma, course).reduce(
    (sum, grade) => sum + Math.max(0, GRADES.indexOf(grade) - 1),
    0
  );
}

/** A copy to place in a field: its own id, so the same Veteran can be added twice. */
export function placeVeteran(entry: VeteranEntry): SimulatorUma {
  return { ...(JSON.parse(JSON.stringify(entry.uma)) as SimulatorUma), id: crypto.randomUUID() };
}
