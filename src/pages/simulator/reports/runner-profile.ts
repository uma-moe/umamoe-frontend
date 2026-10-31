import { runningStyleName } from '@/lib/race/replay/race-display';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { AptitudeGradeValue } from '@/components/game/AptitudeGrade.svelte';
import { APTITUDE_GRADES } from '../requests/stamina-request';
import { RUNNING_STYLES } from '../setup/trainee';
import type { SimulatorUma } from '../simulator-uma';

/** The runner's running style as the game names it, such as "Pace Chaser". */
export const runnerStyle = (uma: SimulatorUma, compact = false) =>
  runningStyleName(
    RUNNING_STYLES.findIndex((value) => value === uma.trainee.runningStyle) + 1,
    compact
  );

export interface RaceAptitude {
  key: 'surface' | 'distance' | 'style';
  label: string;
  grade: AptitudeGradeValue;
}

const SURFACES = ['Turf', 'Dirt'];
const DISTANCES = ['Sprint', 'Mile', 'Medium', 'Long'];

const isGrade = (value: string | undefined): value is AptitudeGradeValue =>
  APTITUDE_GRADES.some((grade) => grade === value);

/**
 * The three aptitudes the race applies: the course's surface and distance and the runner's own style.
 * Without a course, turf and medium stand in, matching the simulator's defaults.
 */
export function raceAptitudes(uma: SimulatorUma, course?: RaceCourse): RaceAptitude[] {
  const surface = (course?.surface ?? 1) - 1,
    distance = (course?.distance_type ?? 3) - 1,
    style = RUNNING_STYLES.findIndex((value) => value === uma.trainee.runningStyle);

  // Runaways use the front-runner aptitude.
  const styleColumn = style === 4 ? 0 : Math.max(0, style);
  const grade = (value: string | undefined) => (isGrade(value) ? value : 'G');

  return [
    {
      key: 'surface',
      label: SURFACES[surface] ?? 'Track',
      grade: grade(uma.trainee.groundAptitudes[surface])
    },
    {
      key: 'distance',
      label: DISTANCES[distance] ?? 'Distance',
      grade: grade(uma.trainee.distanceAptitudes[distance])
    },
    {
      key: 'style',
      label: runnerStyle(uma, true),
      grade: grade(uma.trainee.styleAptitudes[styleColumn])
    }
  ];
}
