import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { appHttp } from '@/services/http/app-http';
import { resourceCache } from '@/services/resources/resource-cache';
import { finalSpurtSection } from '@/lib/race/final-spurt';
import { TRACK_NAMES } from '@/lib/game-data/racing/courses';
import { racePhaseBands, type RacePhaseBand } from '../race-phase-bands';

export type Course = {
  raceTrackId: number;
  distance: number;
  surface: number;
  turn: number;
  laneMax?: number;
  corners: { start: number; length: number }[];
  straights: { start: number; end: number }[];
  slopes: { start: number; length: number; slope: number }[];
};

export type CourseShape = { distance: number; points: [number, number][] };

export type CourseData = {
  courses: Record<string, Course>;
  names: Record<number, string>;
  baseViewDistance?: number;
};

type CourseResource = Omit<Course, 'raceTrackId'> & {
  course_id: number;
  race_track_id: number;
  lane_max?: number;
};

type GeometryResource = {
  course_id: number;
  course_distance: number;
  position_x: number[];
  position_z: number[];
};

export function loadReplayCourses(): Promise<CourseData> {
  return resourceCache.load('simulator_courses', false, (value) => {
    const data = value as {
      courses: CourseResource[];
      race_parameters?: { around_horse?: { visible_distance_m?: number } };
    };

    if (!Array.isArray(data?.courses)) throw new Error('Course metadata is invalid.');
    const courses: CourseData['courses'] = {};

    for (const course of data.courses) {
      if (
        !course ||
        !Number.isSafeInteger(course.course_id) ||
        !Number.isFinite(course.distance) ||
        course.distance <= 0 ||
        !Number.isSafeInteger(course.race_track_id) ||
        ![course.corners, course.straights, course.slopes].every(Array.isArray)
      )
        throw new Error('Course metadata is invalid.');
      courses[course.course_id] = {
        ...course,
        raceTrackId: course.race_track_id,
        laneMax: course.lane_max
      };
    }

    const range = data.race_parameters?.around_horse?.visible_distance_m;
    return {
      courses,
      // Course dimensions and geometry come from the resource manifest; it carries no track names.
      names: TRACK_NAMES,
      baseViewDistance:
        typeof range === 'number' && Number.isFinite(range) && range > 0 ? range : undefined
    };
  });
}

export function loadReplayGeometry(): Promise<Record<string, CourseShape>> {
  return resourceCache.load('simulator_course_geometry', false, (value) => {
    const data = value as { courses: GeometryResource[] };

    if (!Array.isArray(data?.courses)) throw new Error('Course geometry data is invalid.');
    const shapes: Record<string, CourseShape> = {};

    for (const course of data.courses) {
      if (
        !course ||
        !Number.isSafeInteger(course.course_id) ||
        !Number.isFinite(course.course_distance) ||
        course.course_distance <= 0 ||
        !Array.isArray(course.position_x) ||
        !Array.isArray(course.position_z) ||
        course.position_x.length !== 1001 ||
        course.position_z.length !== 1001 ||
        !course.position_x.every(Number.isFinite) ||
        !course.position_z.every(Number.isFinite)
      )
        throw new Error('Course geometry data is invalid.');
      shapes[course.course_id] = {
        distance: course.course_distance,
        points: course.position_x.map((x, i) => [x, course.position_z[i]!])
      };
    }

    return shapes;
  });
}

// Exact IDs only: tracks of the same length are not interchangeable.
export async function resolveRaceCourseIds(
  instances: (number | undefined)[]
): Promise<Map<number, number>> {
  const ids = [
    ...new Set(
      instances.filter(
        (id): id is number => Number.isSafeInteger(id) && id! > 0 && id! <= 0xffffffff
      )
    )
  ];

  const known = new Map<number, number>();
  if (!ids.length) return known;
  try {
    const data = await resourceCache.load<{
      races: { race_instance_id: number; course_set_id: number }[];
    }>('room_match_races');

    for (const race of data.races ?? [])
      if (Number.isSafeInteger(race.race_instance_id) && Number.isSafeInteger(race.course_set_id))
        known.set(race.race_instance_id, race.course_set_id);
  } catch {
    /* The master lookup also covers captures outside Room Matches. */
  }

  const missing = ids.filter((id) => !known.has(id));
  if (missing.length) {
    try {
      const data = await appHttp.request<{ rows: [number, number][] }>('/resources/current/sql', {
        browserProof: true,
        query: {
          sql:
            'SELECT ri.id, r.course_set FROM race_instance ri JOIN race r ON r.id = ri.race_id WHERE ri.id IN (' +
            missing.join(',') +
            ')'
        }
      });

      for (const [id, course] of data.rows ?? [])
        if (missing.includes(id) && Number.isSafeInteger(course) && course > 0)
          known.set(id, course);
    } catch {
      /* Keep the capture usable; an unresolved course can be selected manually. */
    }
  }

  return known;
}

export async function resolveReplayCourses(captures: ParsedRaceCapture[]): Promise<void> {
  const known = await resolveRaceCourseIds(
    captures.filter((c) => !c.courseId).map((c) => c.raceInstanceId)
  );

  for (const capture of captures)
    if (!capture.courseId && capture.raceInstanceId)
      capture.courseId = known.get(capture.raceInstanceId);
}

export async function loadRaceCourse(raceInstanceId?: number): Promise<Course | undefined> {
  if (!Number.isSafeInteger(raceInstanceId) || raceInstanceId! <= 0 || raceInstanceId! > 0xffffffff)
    return;
  const [data, ids] = await Promise.all([
    loadReplayCourses(),
    resolveRaceCourseIds([raceInstanceId])
  ]);

  const id = ids.get(raceInstanceId!);
  return id === undefined ? undefined : data.courses[id];
}

const SECTION_COLORS = {
  straight: '#64918c',
  finalStraight: '#419168',
  corner: '#7b7ea8',
  finalCorner: '#bb9148',
  unspecified: '#737d8a'
};

export function courseSegments(course: Course | undefined, includeGaps = false) {
  if (!course) return [];
  const lastStraight = Math.max(...course.straights.map((s) => s.start)),
    lastCorner = Math.max(...course.corners.map((s) => s.start));

  const segments = [
    ...course.straights.map((s) => ({
      start: s.start,
      end: s.end,
      label: s.start === lastStraight ? 'Final straight' : 'Straight',
      color: s.start === lastStraight ? SECTION_COLORS.finalStraight : SECTION_COLORS.straight
    })),
    ...course.corners.map((s) => ({
      start: s.start,
      end: s.start + s.length,
      label: s.start === lastCorner ? 'Final corner' : 'Corner',
      color: s.start === lastCorner ? SECTION_COLORS.finalCorner : SECTION_COLORS.corner
    }))
  ].sort((a, b) => a.start - b.start);

  if (!includeGaps) return segments;
  const boundaries = [
    ...new Set([0, course.distance, ...segments.flatMap((segment) => [segment.start, segment.end])])
  ]
    .filter((distance) => distance >= 0 && distance <= course.distance)
    .sort((a, b) => a - b);

  return boundaries.slice(0, -1).map((start, index) => ({
    ...(segments.find((segment) => start >= segment.start && start < segment.end) ?? {
      label: 'Unspecified',
      color: SECTION_COLORS.unspecified
    }),
    start,
    end: boundaries[index + 1]!
  }));
}

export function slopeColor(slope: number) {
  if (slope > 0) return '#bd7581';
  if (slope < 0) return '#719bdd';
  return '#9ca5b4';
}

export type SectionBorder = { distance: number; label: string; color: string };

const cornerNumber = (course: Course, start: number) =>
  course.corners
    .map((corner) => corner.start)
    .sort((a, b) => a - b)
    .indexOf(start) + 1;

/** Course sections with corners numbered in race order, as the simulator's course profile names them. */
export function numberedSegments(course: Course | undefined) {
  if (!course) return [];

  return courseSegments(course).map((segment) =>
    segment.label === 'Corner'
      ? { ...segment, label: 'Corner ' + cornerNumber(course, segment.start) }
      : segment
  );
}

/** Where corners begin and end inside the race, coloured by the section that follows. */
export function sectionBorders(course: Course | undefined): SectionBorder[] {
  if (!course) return [];
  const lastStraight = Math.max(...course.straights.map((s) => s.start)),
    lastCorner = Math.max(...course.corners.map((s) => s.start));

  const borders: SectionBorder[] = [];
  for (const corner of course.corners) {
    const final = corner.start === lastCorner,
      name = final ? 'Final corner' : 'Corner ' + cornerNumber(course, corner.start),
      end = corner.start + corner.length;

    borders.push({
      distance: corner.start,
      label: name + ' start',
      color: final ? SECTION_COLORS.finalCorner : SECTION_COLORS.corner
    });

    // Back-to-back corners share one border, named by the corner that starts there.
    if (course.corners.some((next) => next.start === end)) continue;

    const next = course.straights.find((straight) => straight.start === end);
    if (next?.start === lastStraight)
      borders.push({ distance: end, label: 'Final straight', color: SECTION_COLORS.finalStraight });
    else
      borders.push({
        distance: end,
        label: name + ' end',
        color: next ? SECTION_COLORS.straight : SECTION_COLORS.unspecified
      });
  }

  for (const straight of course.straights) {
    if (borders.some((border) => border.distance === straight.start)) continue;

    const final = straight.start === lastStraight;
    borders.push({
      distance: straight.start,
      label: final ? 'Final straight' : 'Straight',
      color: final ? SECTION_COLORS.finalStraight : SECTION_COLORS.straight
    });
  }

  return borders
    .filter((border) => border.distance > 0 && border.distance < course.distance)
    .sort((a, b) => a.distance - b.distance);
}

export type TrackStatus = {
  phase: RacePhaseBand;
  section?: { label: string; color: string };
  /** Gradient in ten-thousandths, as the course data gives it; 0 on level ground. */
  slope: number;
};

/** The race phase, course section and gradient at a distance. */
export function trackStatusAt(
  course: Course | undefined,
  raceDistance: number,
  distance: number
): TrackStatus {
  const fraction = raceDistance > 0 ? distance / raceDistance : 0;
  const phase = racePhaseBands.find((candidate) => fraction < candidate.end) ?? racePhaseBands[3];

  const section = numberedSegments(course).find(
    (segment) => distance >= segment.start && distance < segment.end
  );

  const slope =
    course?.slopes.find((run) => distance >= run.start && distance < run.start + run.length)
      ?.slope ?? 0;

  return { phase, section, slope };
}

export type CourseLandmarkKind = 'section' | 'slope' | 'phase' | 'finish';

export function courseLandmarks(course: Course | undefined) {
  if (!course) return [];
  const hills = course.slopes.filter((s) => s.slope !== 0);
  const spurt = finalSpurtSection(course.distance);
  const landmarks: { distance: number; label: string; color: string; kind: CourseLandmarkKind }[] =
    [
      ...sectionBorders(course).map((border) => ({ ...border, kind: 'section' as const })),
      ...hills.flatMap((s) => [
        {
          distance: s.start,
          label: (s.slope > 0 ? 'Uphill +' : 'Downhill ') + (s.slope / 10000).toFixed(1) + '%',
          color: slopeColor(s.slope),
          kind: 'slope' as const
        },
        ...(hills.some((next) => next.start === s.start + s.length)
          ? []
          : [
              {
                distance: s.start + s.length,
                label: 'Level ground',
                color: slopeColor(0),
                kind: 'slope' as const
              }
            ])
      ]),
      { distance: course.distance / 6, label: 'Mid race', color: '#69b7ee', kind: 'phase' },
      { distance: spurt.start, label: 'Final spurt window', color: spurt.color, kind: 'phase' },
      { distance: (course.distance * 5) / 6, label: 'Final leg', color: '#bd91d1', kind: 'phase' },
      { distance: course.distance, label: 'Finish', color: '#e5e7eb', kind: 'finish' }
    ];

  return landmarks
    .filter((m) => m.distance >= 0 && m.distance <= course.distance)
    .sort((a, b) => a.distance - b.distance);
}

export interface PositionKeepZone {
  /** Running style that keeps this gap: 2 Pace Chaser, 3 Late Surger, 4 End Closer. */
  style: number;
  start: number;
  end: number;
}

/** Distance bands behind the pacemaker where each running style keeps position, while it lasts. */
export function positionKeepZones(reference: number, raceDistance: number): PositionKeepZone[] {
  if (reference >= (raceDistance * 10) / 24) return [];

  const factor = 1 + (raceDistance - 1000) * 0.0008;
  return [
    { style: 2, min: 3, max: 5 * factor },
    { style: 3, min: 6.5 * factor, max: 7 * factor },
    { style: 4, min: 7.5 * factor, max: 8 * factor }
  ].map((zone) => ({ style: zone.style, start: reference - zone.max, end: reference - zone.min }));
}
