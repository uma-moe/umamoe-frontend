import { describeCourse, trackName, type CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import type { OptimizeScenarioInput } from '../../requests/optimize-request';
import type { OptimizeFields } from '../../simulator-repository';
import type { RaceSetupInput } from '../../requests/stamina-request';
import type { SimulatorUma } from '../../simulator-uma';

export interface BuildRaces {
  /** The race scenarios, each with her alone. */
  scenarios: OptimizeScenarioInput[];
  /** The course that stands for the races: the CM's, or the first of the Team Trials pool. */
  course: CourseCatalogEntry;
  /** Where she raced, in words, for the result. */
  where: string;
}

/**
 * Her races for the optimizer. The simulator races her with a fixed pack of its own and judges a build by the time she runs, so no one
 * to pass, block or follow. A CM is one course; Team Trials is every course in the pool, one scenario each, which the
 * server deals out over the races as the game draws a course per match.
 */
export function buildRaces(options: {
  her: SimulatorUma;
  seed: number;
  /** The CM's course. */
  course?: CourseCatalogEntry;
  /** Team Trials: the courses the game draws from, in place of `course`. */
  pool?: ReadonlyArray<CourseCatalogEntry>;
  setup: RaceSetupInput;
}): BuildRaces | undefined {
  const { her, seed, setup } = options;
  const pool = options.pool?.length ? options.pool : undefined;
  const course = pool?.[0] ?? options.course;
  if (!course) return undefined;
  const runner = { trainee: her.trainee, skills: her.skills, fanCount: her.fanCount };
  const scenario = (course: CourseCatalogEntry, name: string, setup: RaceSetupInput) => ({
    name,
    weight: 1,
    courseId: course.course_id,
    seed,
    setup,
    runners: [runner]
  });
  if (!pool) {
    const name = trackName(course.race_track_id) + ' · ' + describeCourse(course);
    return {
      course,
      where: 'She raced with the pack on ' + name + '.',
      scenarios: [scenario(course, name, setup)]
    };
  }

  // A course drawn per race has no race of its own, so no race instance.
  const names = new Set<string>();
  return {
    course,
    where:
      'She raced with the pack on ' +
      pool.length +
      (pool.length === 1 ? ' course' : ' courses') +
      ', one drawn per race as Team Trials does.',
    scenarios: pool.map((course) => {
      const siblings = pool.filter((other) => other.race_track_id === course.race_track_id);
      let name = trackName(course.race_track_id) + ' · ' + describeCourse(course, siblings);
      if (names.has(name)) name += ' #' + course.course_id;
      names.add(name);
      return scenario(course, name, { ...setup, raceInstanceId: 0 });
    })
  };
}

/**
 * Where she raced when the server raced her in real CM fields, in words: how many, from which CM course, and whether
 * that is the course she runs or the closest one recorded.
 */
export function fieldWhere(
  fields: OptimizeFields,
  course: CourseCatalogEntry | undefined,
  courses: ReadonlyMap<number, CourseCatalogEntry>
): string {
  const source = courses.get(fields.course_id);
  const name = source
    ? trackName(source.race_track_id) + ' · ' + describeCourse(source)
    : 'course ' + fields.course_id;
  return course?.course_id === fields.course_id
    ? 'She raced ' +
        fields.fields +
        ' real CM fields from this CM, in place of a runner of her style.'
    : 'She raced ' +
        fields.fields +
        ' CM fields from ' +
        name +
        ', the closest CM recorded, in place of a runner of her style. Their runners were rebuilt for this race: ' +
        'aptitudes, course and weather skills, and stamina for the distance.';
}
