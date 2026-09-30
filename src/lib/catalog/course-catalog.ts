import { resourceRepository } from './resource-repository';

/** One row of `simulator_courses`: the geometry the simulator loads, plus what the pickers show. */
export interface CourseCatalogEntry {
  course_id: number;
  distance: number;
  distance_type: number;
  surface: number;
  race_track_id: number;
  /** 1 = right-handed, 2 = left-handed, 4 = straight (Niigata 1000m). */
  turn: number;
  /** Layout variant; only meaningful where two courses share a distance and surface. */
  course: number;
}

let courseCatalog: Promise<Map<number, CourseCatalogEntry>> | undefined;
resourceRepository.onUpdate(name => { if (name === 'simulator_courses') courseCatalog = undefined; });

/** Course geometry keyed by `course_id`, shared by every simulator surface. */
export function loadCourseCatalog(): Promise<Map<number, CourseCatalogEntry>> {
  courseCatalog ??= resourceRepository.load<{ courses: CourseCatalogEntry[] }>('simulator_courses')
    .then(data => new Map(data.courses.map(course => [course.course_id, course])))
    .catch(error => { courseCatalog = undefined; throw error; });
  return courseCatalog;
}

export const SURFACE_NAMES: Record<number, string> = { 1: 'Turf', 2: 'Dirt' };
export const DISTANCE_NAMES: Record<number, string> = { 1: 'Sprint', 2: 'Mile', 3: 'Medium', 4: 'Long' };
export const TURN_NAMES: Record<number, string> = { 1: 'Right', 2: 'Left', 4: 'Straight' };

/** `race_track_id` to English track name, matching the game's own ids. The resource carries no names. */
export const TRACK_NAMES: Record<number, string> = {
  10001: 'Sapporo', 10002: 'Hakodate', 10003: 'Niigata', 10004: 'Fukushima',
  10005: 'Nakayama', 10006: 'Tokyo', 10007: 'Chukyo', 10008: 'Kyoto',
  10009: 'Hanshin', 10010: 'Kokura', 10101: 'Ooi', 10103: 'Kawasaki',
  10104: 'Funabashi', 10105: 'Morioka', 10201: 'Longchamp'
};

/** Track name, falling back to the raw id so an unrecognised track stays usable. */
export function trackName(trackId: number): string {
  return TRACK_NAMES[trackId] ?? `Track ${trackId}`;
}

/**
 * `Turf 1600m (Mile) Right` — the shape the course select and the race bar read in.
 *
 * Three tracks run two layouts at the same distance and surface (Kyoto 1400 and
 * 1600, Niigata 2000). Nothing public tells them apart but the internal `course`
 * variant, so the label carries it when a sibling collides; otherwise the picker
 * would show two entries with the same words.
 */
export function describeCourse(course: CourseCatalogEntry, siblings: ReadonlyArray<CourseCatalogEntry> = []): string {
  const collides = siblings.some(other => other.course_id !== course.course_id && other.distance === course.distance && other.surface === course.surface);
  const distanceType = DISTANCE_NAMES[course.distance_type];
  return [
    `${SURFACE_NAMES[course.surface] ?? 'Unknown'} ${course.distance}m${distanceType ? ` (${distanceType})` : ''}`,
    TURN_NAMES[course.turn],
    collides ? `(${course.course})` : ''
  ].filter(Boolean).join(' ');
}

/** Tracks that actually have courses, name-sorted. */
export function tracksWithCourses(courses: ReadonlyMap<number, CourseCatalogEntry>): Array<{ trackId: number; name: string }> {
  const trackIds = new Set<number>();
  for (const course of courses.values()) trackIds.add(course.race_track_id);
  return [...trackIds].map(trackId => ({ trackId, name: trackName(trackId) })).sort((left, right) => left.name.localeCompare(right.name));
}

/** A track's courses, shortest first. */
export function coursesForTrack(courses: ReadonlyMap<number, CourseCatalogEntry>, trackId: number): Array<CourseCatalogEntry> {
  return [...courses.values()].filter(course => course.race_track_id === trackId).sort((left, right) => left.distance - right.distance || left.surface - right.surface);
}
