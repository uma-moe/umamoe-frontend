import { raceAptitudes } from '../../runner-profile';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { MonteCarloSkillInput } from '../../../requests/race-sim-request';
import type { SimulatorUma } from '../../../simulator-uma';

const STAT_KEYS = ['speed', 'stamina', 'power', 'guts', 'wisdom'] as const;

/** What an alternative build changes, for this race, compared with the runner's current build. */
export interface BuildChanges {
  statsChanged: boolean;
  /** The course's surface or distance aptitude, or the style or its aptitude, differs. */
  aptitudesChanged: boolean;
  /** Skills the alternative adds or learns at another level. */
  added: MonteCarloSkillInput[];
  removed: MonteCarloSkillInput[];
}

export function buildChanges(
  current: SimulatorUma,
  alternative: SimulatorUma,
  course?: RaceCourse
): BuildChanges {
  const statsChanged = STAT_KEYS.some((key) => alternative.trainee[key] !== current.trainee[key]);

  const before = raceAptitudes(current, course),
    after = raceAptitudes(alternative, course);

  const aptitudesChanged = after.some(
    (aptitude, index) =>
      aptitude.grade !== before[index]?.grade || aptitude.label !== before[index]?.label
  );

  const added = alternative.skills.filter(
    (skill) =>
      !current.skills.some((old) => old.skillId === skill.skillId && old.level === skill.level)
  );

  const removed = current.skills.filter(
    (skill) => !alternative.skills.some((next) => next.skillId === skill.skillId)
  );

  return { statsChanged, aptitudesChanged, added, removed };
}

export const isSameBuild = (changes: BuildChanges) =>
  !changes.statsChanged &&
  !changes.aptitudesChanged &&
  changes.added.length === 0 &&
  changes.removed.length === 0;
