import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import type { Build, Summary } from '@/pages/competitive/hakuraku-types';
import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { aptitudeGrade } from '@/lib/profile/profile-display';
import { createTrainee, RUNNING_STYLES, traineeStats, type Trainee } from './setup/trainee';
import type { MonteCarloSkillInput } from './requests/race-sim-request';

export interface SimulatorUma {
  id: string;
  name: string;
  cardId?: number;
  trainee: Trainee;
  skills: MonteCarloSkillInput[];
  teamId?: number;
  /** Team color captured with a run, independent of later setup edits. */
  teamColor?: string;
  frameOrder?: number;
  fanCount?: number;
  source?: string;
  capturedAptitudes?: Build['aptitudes'];
}

export function createSimulatorUma(name = 'Uma'): SimulatorUma {
  return { id: crypto.randomUUID(), name, trainee: createTrainee(), skills: [] };
}

/** Browser storage can outlive a form schema; restore known fields without trusting saved nested objects. */
export function restoreSimulatorUma(value: unknown, fallback: SimulatorUma): SimulatorUma {
  if (!isSavedRecord(value) || typeof value.name !== 'string') return fallback;
  const saved = value.trainee;
  if (!isSavedRecord(saved)) return fallback;
  const trainee = createTrainee();
  for (const field of [
    'speed',
    'stamina',
    'power',
    'guts',
    'wisdom',
    'runningStyle',
    'motivation'
  ] as const) {
    if (!(field in saved)) continue;
    const input = saved[field];
    if (typeof input === 'string' || (typeof input === 'number' && Number.isFinite(input)))
      trainee[field] = String(input);
  }

  for (const field of ['distanceAptitudes', 'styleAptitudes', 'groundAptitudes'] as const) {
    if (!(field in saved)) continue;
    const input = saved[field];
    if (!Array.isArray(input)) continue;
    trainee[field] = trainee[field].map((grade, index) =>
      typeof input[index] === 'string' ? input[index] : grade
    );
  }

  const restored: SimulatorUma = { ...fallback, name: value.name, trainee, skills: [] };

  if ('id' in value && typeof value.id === 'string') restored.id = value.id;
  for (const field of ['cardId', 'teamId', 'frameOrder', 'fanCount'] as const) {
    if (!(field in value)) continue;
    const input = value[field];
    if (typeof input === 'number' && Number.isFinite(input)) restored[field] = input;
  }

  for (const field of ['teamColor', 'source'] as const) {
    if (!(field in value)) continue;
    const input = value[field];
    if (typeof input === 'string') restored[field] = input;
  }

  if ('capturedAptitudes' in value && Array.isArray(value.capturedAptitudes)) {
    const [distance, ground, style] = value.capturedAptitudes;
    if (typeof distance === 'string' && typeof ground === 'string' && typeof style === 'string')
      restored.capturedAptitudes = [distance, ground, style];
  }

  if (!('skills' in value) || !Array.isArray(value.skills)) return restored;
  restored.skills = value.skills.flatMap((skill) => {
    if (skill === null || typeof skill !== 'object' || !('skillId' in skill)) return [];
    const id = skill.skillId;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return [];
    if (!('level' in skill) || skill.level === undefined) return [{ skillId: id }];
    const level = skill.level;
    return [
      {
        skillId: id,
        level:
          typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6
            ? level
            : 1
      }
    ];
  });

  return restored;
}

function isSavedRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function simulatorUmaFromVeteran(veteran: ProfileVeteran, name: string): SimulatorUma {
  if (
    [veteran.speed, veteran.stamina, veteran.power, veteran.guts, veteran.wiz].some(
      (value) => value == null
    )
  ) {
    throw new Error('This veteran is missing trained stats and cannot be simulated.');
  }

  const skills = veteran.skill_array?.length
    ? veteran.skill_array.map((skill) => ({ skillId: skill.skill_id, level: skill.level }))
    : (veteran.skills ?? []).map((encoded) => ({
        skillId: Math.floor(encoded / 10),
        level: encoded % 10 || 1
      }));

  return {
    ...createSimulatorUma(name),
    cardId: veteran.card_id ?? undefined,
    skills,
    fanCount: veteran.fans ?? undefined,
    source: 'Veterans',
    trainee: createTrainee({
      speed: String(veteran.speed),
      stamina: String(veteran.stamina),
      power: String(veteran.power),
      guts: String(veteran.guts),
      wisdom: String(veteran.wiz),
      runningStyle: RUNNING_STYLES[(veteran.running_style ?? 1) - 1] ?? 'Nige',
      groundAptitudes: [veteran.proper_ground_turf, veteran.proper_ground_dirt].map(aptitudeGrade),
      distanceAptitudes: [
        veteran.proper_distance_short,
        veteran.proper_distance_mile,
        veteran.proper_distance_middle,
        veteran.proper_distance_long
      ].map(aptitudeGrade),
      styleAptitudes: [
        veteran.proper_running_style_nige,
        veteran.proper_running_style_senko,
        veteran.proper_running_style_sashi,
        veteran.proper_running_style_oikomi
      ].map(aptitudeGrade)
    })
  };
}

export function simulatorUmaFromCm(
  build: Pick<Build, 'card' | 'racingStyle' | 'stats' | 'aptitudes' | 'skills'>,
  data: {
    cards: Summary['cards'];
    meta: Pick<Summary['meta'], 'courseDistance' | 'courseSurface'>;
  },
  teamId = 0
): SimulatorUma {
  const trainee = createTrainee({
    speed: String(build.stats[0]),
    stamina: String(build.stats[1]),
    power: String(build.stats[2]),
    guts: String(build.stats[3]),
    wisdom: String(build.stats[4]),
    motivation: '5',
    runningStyle: RUNNING_STYLES[build.racingStyle - 1] ?? 'Nige'
  });

  // Captured CM builds record the three aptitudes for that course, not a full grid.
  const distance = ['Sprint', 'Mile', 'Medium', 'Long'].indexOf(
    data.meta.courseDistance ?? 'Medium'
  );

  trainee.distanceAptitudes[distance] = build.aptitudes[0];
  trainee.groundAptitudes[data.meta.courseSurface === 'Dirt' ? 1 : 0] = build.aptitudes[1];
  trainee.styleAptitudes[
    build.racingStyle === 5 ? 0 : Math.min(3, Math.max(0, build.racingStyle - 1))
  ] = build.aptitudes[2];
  return {
    ...createSimulatorUma(data.cards[build.card]?.name ?? `Uma ${build.card}`),
    cardId: build.card,
    trainee,
    teamId,
    source: 'CM Data',
    capturedAptitudes: [...build.aptitudes],
    skills: build.skills.map(([skillId, level]) => ({ skillId, level }))
  };
}

export function simulatorUmaSummary(uma: SimulatorUma, index = 0, course?: RaceCourse): RaceRunner {
  const style = RUNNING_STYLES.indexOf(uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]);
  const grades = 'GFEDCBAS';
  const grade = (value?: string) => (value ? grades.indexOf(value) + 1 : undefined);
  const stats = traineeStats(uma.trainee);
  return {
    index,
    cardId: uma.cardId,
    name: uma.name,
    trainerName: uma.source ?? 'Manual build',
    isPlayer: index === 0,
    stats: { ...stats, wit: stats.wisdom },
    skillIds: uma.skills.map((skill) => skill.skillId),
    aptitudes: {
      surface: grade(uma.trainee.groundAptitudes[(course?.surface ?? 1) - 1]),
      distance: grade(uma.trainee.distanceAptitudes[(course?.distance_type ?? 3) - 1]),
      style: grade(uma.trainee.styleAptitudes[style === 4 ? 0 : Math.min(3, Math.max(0, style))])
    },
    raw: {
      runningStyle: style + 1,
      ...(uma.teamId ? { team_id: uma.teamId } : {}),
      ...(uma.teamColor ? { team_color: uma.teamColor } : {})
    }
  };
}
