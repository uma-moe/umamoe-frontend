import { describeCourse, trackName, type RaceCourse } from '@/lib/game-data/racing/courses';
import type { OptimizeScenarioInput } from '../../requests/optimize-request';
import type { OptimizeFields } from '../../simulator-repository';
import type { RaceSetupInput } from '../../requests/stamina-request';
import type { SimulatorUma } from '../../simulator-uma';

export interface BuildRaces {
  /** The race scenarios, each with her alone. */
  scenarios: OptimizeScenarioInput[];
  /** The course that stands for the races: the CM's, or the first of the Team Trials pool. */
  course: RaceCourse;
  /** Where and against whom she raced, as short sentences for the result. */
  where: string[];
}

/** The simulator's own pack, said the same way for a CM and for Team Trials. */
const PACK = 'the simulator’s own pack of eight runners without skills';
const PACK_MEASURES =
  'The pack is the same in every race, so the result measures only her own time.';

/** A course in a sentence: `Nakayama Turf 2500m (Long) Right`. */
const courseName = (course: RaceCourse) =>
  trackName(course.race_track_id) + ' ' + describeCourse(course);

/**
 * Her races for the optimizer. The simulator races her with a fixed pack of its own and judges a build by the time she runs, so no one
 * to pass, block or follow. A CM is one course; Team Trials is every course in the pool, one scenario each, which the
 * server deals out over the races as the game draws a course per match.
 */
export function buildRaces(options: {
  her: SimulatorUma;
  seed: number;
  /** The CM's course. */
  course?: RaceCourse;
  /** Team Trials: the courses the game draws from, in place of `course`. */
  pool?: ReadonlyArray<RaceCourse>;
  /** How much each pool course counts, by course id; each counts the same when absent. */
  weights?: ReadonlyMap<number, number>;
  setup: RaceSetupInput;
}): BuildRaces | undefined {
  const { her, seed, setup, weights } = options;
  const pool = options.pool?.length ? options.pool : undefined;
  const course = pool?.[0] ?? options.course;
  if (!course) return undefined;
  const runner = { trainee: her.trainee, skills: her.skills, fanCount: her.fanCount };

  const scenario = (course: RaceCourse, name: string, setup: RaceSetupInput) => ({
    name,
    weight: weights?.get(course.course_id) ?? 1,
    courseId: course.course_id,
    seed,
    setup,
    runners: [runner]
  });

  if (!pool) {
    const name = trackName(course.race_track_id) + ' ' + describeCourse(course);
    return {
      course,
      where: ['She raced on ' + courseName(course) + ' against ' + PACK + '.', PACK_MEASURES],
      scenarios: [scenario(course, name, setup)]
    };
  }

  // A course drawn per race has no race of its own, so no race instance.
  const names = new Set<string>();
  const courses =
    pool.length + (pool.length === 1 ? ' Team Trials course' : ' Team Trials courses');
  return {
    course,
    where: [
      'She raced on ' + courses + ', one drawn per race as the game does, against ' + PACK + '.',
      PACK_MEASURES
    ],
    scenarios: pool.map((course) => {
      const siblings = pool.filter((other) => other.race_track_id === course.race_track_id);
      let name = trackName(course.race_track_id) + ' ' + describeCourse(course, siblings);
      if (names.has(name)) name += ' #' + course.course_id;
      names.add(name);
      return scenario(course, name, { ...setup, raceInstanceId: 0 });
    })
  };
}

/**
 * Who she raced against when the server raced her in real CM fields, as short sentences. The simulator takes CM fields
 * only from her own course; an older one could take them from the closest CM it had, so that course is named.
 */
export function fieldWhere(
  fields: OptimizeFields,
  goal: RaceCourse | undefined,
  courses: ReadonlyMap<number, RaceCourse>
): string[] {
  const races = fields.fields.toLocaleString('en-US') + (fields.fields === 1 ? ' race' : ' races');
  if (goal?.course_id === fields.course_id) {
    return [
      'She raced in ' +
        races +
        ' recorded at this CM, each time in place of a runner of her running style.'
    ];
  }

  const source = courses.get(fields.course_id);
  const sourceName = source ? courseName(source) : 'course ' + fields.course_id;
  return ['Her opponents came from ' + races + ' of the CM on ' + sourceName + '.'];
}
