/** Course and race conditions shared by the simulator pages. */

import {
  SURFACE_NAMES,
  TURN_NAMES,
  coursesForTrack,
  describeCourse,
  loadCourseCatalog,
  trackName,
  tracksWithCourses,
  type CourseCatalogEntry
} from '@/lib/catalog/course-catalog';
import { importSimulatorUmas, simulatorRoster } from './simulator-roster.svelte';
import type { SimulatorUma } from './simulator-uma';
import { resourceRepository } from '@/lib/catalog/resource-repository';
import type { Trainee } from './trainee';
import { EXAMPLE_RACE_SETTINGS } from './simulator-example';

export interface ConditionOption {
  value: string;
  label: string;
}

/** A condition picked from a row of buttons, with the game icon that stands for it. */
export interface ImageConditionOption extends ConditionOption {
  image: string;
}

/**
 * Game icons for the race conditions, published under `/game-assets`.
 *
 * `utx_ico_*` are the raw game textures; the English season tiles live beside
 * the other track details, already lettered for an English UI.
 */
const conditionIcon = (file: string): string => `/game-assets/textures/${file}`;
const seasonIcon = (file: string): string => `/game-assets/track_details/${file}`;

export const GROUND_OPTIONS: Array<ConditionOption> = [
  { value: '1', label: 'Good' },
  { value: '2', label: 'Yielding' },
  { value: '3', label: 'Soft' },
  { value: '4', label: 'Heavy' }
];

/**
 * There is no Morning tile in the game's icon set, so the picker offers the same
 * three times torema-sim does. The simulator still accepts a `start_time_type`
 * of 1 from anywhere else.
 */
export const TIME_OPTIONS: Array<ImageConditionOption> = [
  { value: '2', label: 'Midday', image: conditionIcon('utx_ico_timezone_00.png') },
  { value: '3', label: 'Evening', image: conditionIcon('utx_ico_timezone_01.png') },
  { value: '4', label: 'Night', image: conditionIcon('utx_ico_timezone_02.png') }
];

/**
 * The four seasons the English tile set letter. The game also has a Cherry
 * blossom condition, but it only ever shipped as a Japanese character, so the
 * picker leaves it out rather than mixing the two.
 */
export const SEASON_OPTIONS: Array<ImageConditionOption> = [
  { value: '1', label: 'Spring', image: seasonIcon('Spring.webp') },
  { value: '2', label: 'Summer', image: seasonIcon('Summer.webp') },
  { value: '3', label: 'Autumn', image: seasonIcon('Fall.webp') },
  { value: '4', label: 'Winter', image: seasonIcon('Winter.webp') }
];

export const WEATHER_OPTIONS: Array<ImageConditionOption> = [
  { value: '1', label: 'Sunny', image: conditionIcon('utx_ico_weather_00.png') },
  { value: '2', label: 'Cloudy', image: conditionIcon('utx_ico_weather_01.png') },
  { value: '3', label: 'Rainy', image: conditionIcon('utx_ico_weather_02.png') },
  { value: '4', label: 'Snowy', image: conditionIcon('utx_ico_weather_03.png') }
];

/** Race conditions the simulator takes as `setup`; strings because every field binds a string. */
export const simulatorSession = $state({
  /** The simulator's `course_id`. The track is derived from it, never stored. */
  courseId: String(EXAMPLE_RACE_SETTINGS.courseId),
  umaId: '',
  seed: String(Math.floor(Math.random() * 2 ** 31)),
  importNotice: 'Example CM20 field · 3 teams · 9 trained builds with skills. Edit any Uma to compare your own build.',
  sourceCourseId: String(EXAMPLE_RACE_SETTINGS.courseId),
  raceInstanceId: EXAMPLE_RACE_SETTINGS.raceInstanceId,
  ground: EXAMPLE_RACE_SETTINGS.ground,
  season: EXAMPLE_RACE_SETTINGS.season,
  weather: EXAMPLE_RACE_SETTINGS.weather,
  startTime: EXAMPLE_RACE_SETTINGS.startTime,
  get trainee(): Trainee { return (simulatorRoster.umas.find(uma => uma.id === simulatorSession.umaId) ?? simulatorRoster.umas[0]!).trainee; },
  set trainee(value: Trainee) { (simulatorRoster.umas.find(uma => uma.id === simulatorSession.umaId) ?? simulatorRoster.umas[0]!).trainee = value; }
});

/** Reuse the exact CM course ID; a failed lookup requires a manual selection. */
export async function openSimulatorField(umas: SimulatorUma[], options: { replace?: boolean; raceInstanceId?: number; startTimeType?: number; seed?: string } = {}): Promise<void> {
  let importedCourse: string | undefined;
  if (options.raceInstanceId) {
    const { resolveRaceCourseIds } = await import('@/pages/race-analysis/replay-course');
    const ids = await resolveRaceCourseIds([options.raceInstanceId]);
    await ensureSimulatorCatalog();
    const id = ids.get(options.raceInstanceId);
    importedCourse = id && simulatorCatalog.courses.has(id) ? String(id) : '';
  } else if (umas.some(uma => uma.source === 'CM Data')) importedCourse = '';
  // Validate capacity before changing the current course or conditions.
  importSimulatorUmas(umas, options.replace);
  if (importedCourse !== undefined) {
    simulatorSession.courseId = importedCourse;
    simulatorSession.sourceCourseId = importedCourse;
    simulatorSession.raceInstanceId = options.raceInstanceId ?? 0;
    simulatorSession.importNotice = importedCourse
      ? 'CM builds imported. Review the race conditions before running.'
      : 'CM builds imported. Select their course and review the race conditions before running.';
    const course = selectedCourse();
    if (course) for (const uma of umas) {
      if (!uma.capturedAptitudes) continue;
      uma.trainee.distanceAptitudes[course.distance_type - 1] = uma.capturedAptitudes[0];
      uma.trainee.groundAptitudes[course.surface - 1] = uma.capturedAptitudes[1];
    }
  }
  if (options.startTimeType) simulatorSession.startTime = String(options.startTimeType);
  if (options.seed) simulatorSession.seed = options.seed;
  simulatorSession.umaId = umas[0]?.id ?? '';
  const { router } = await import('@/routes/router');
  await router.navigate('/simulator/race');
}

export function selectedRaceInstanceId(): number {
  return simulatorSession.courseId === simulatorSession.sourceCourseId ? simulatorSession.raceInstanceId : 0;
}

export interface SimulatorCatalogState {
  courses: Map<number, CourseCatalogEntry>;
  loading: boolean;
  error: string;
  /** Set once the reader closes the current failure, so navigation does not reopen it. */
  errorDismissed: boolean;
}

export const simulatorCatalog = $state<SimulatorCatalogState>({
  courses: new Map(),
  loading: true,
  error: '',
  errorDismissed: false
});

let catalogLoad: Promise<void> | undefined;
resourceRepository.onUpdate(name => { if (name === 'simulator_courses') { catalogLoad = undefined; void ensureSimulatorCatalog(); } });

/** Loads the course master data once per session, for every surface. */
export function ensureSimulatorCatalog(): Promise<void> {
  catalogLoad ??= loadCourseCatalog()
    .then((courses) => {
      simulatorCatalog.courses = courses;
      simulatorCatalog.loading = false;
      simulatorCatalog.error = '';
      simulatorCatalog.errorDismissed = false;
      // Land on a real course so the page is runnable before anyone picks one.
      if (!simulatorSession.courseId) {
        const firstTrack = tracksWithCourses(courses)[0];
        const firstCourse = firstTrack && coursesForTrack(courses, firstTrack.trackId)[0];
        if (firstCourse) simulatorSession.courseId = String(firstCourse.course_id);
      }
    })
    .catch((reason: unknown) => {
      // Clearing the handle lets a later navigation retry the load.
      catalogLoad = undefined;
      simulatorCatalog.loading = false;
      const message = reason instanceof Error ? reason.message : 'Could not load race data.';
      // A repeat of the failure the reader already closed stays closed; a
      // different one is news and shows again.
      if (message !== simulatorCatalog.error) simulatorCatalog.errorDismissed = false;
      simulatorCatalog.error = message;
    });
  return catalogLoad;
}

/** Whether the current load failure should be on screen. */
export function catalogErrorVisible(): boolean {
  return simulatorCatalog.error !== '' && !simulatorCatalog.errorDismissed;
}

/** Hides the current load failure until a different one arrives. */
export function dismissCatalogError(): void {
  simulatorCatalog.errorDismissed = true;
}

/** The course the session points at. */
export function selectedCourse(): CourseCatalogEntry | undefined {
  return simulatorCatalog.courses.get(Number(simulatorSession.courseId));
}

/** Track of the selected course. */
export function selectedTrackId(): number | undefined {
  return selectedCourse()?.race_track_id;
}

/** Course length in metres, for effect rows that must not fire past the finish. */
export function selectedCourseDistanceM(): number | undefined {
  return selectedCourse()?.distance;
}

/**
 * The simulator's `setup.race_instance_id`.
 *
 * It names a specific scheduled race — a career race or a Champions Meeting
 * meeting — which a course picker does not express, so it is left unset and the
 * course drives the run. Point this at a real race id if a mode ever needs to
 * target a named race.
 */
export const RACE_INSTANCE_NONE = 0;

/** Track picker options, name-sorted. */
export function trackOptions(): Array<{ value: string; label: string }> {
  return tracksWithCourses(simulatorCatalog.courses).map((track) => ({
    value: String(track.trackId),
    label: track.name
  }));
}

/** The selected track's courses, shortest first, labelled with direction. */
export function courseOptions(): Array<{ value: string; label: string; keywords: string }> {
  const trackId = selectedTrackId();
  if (trackId === undefined) return [];
  const siblings = coursesForTrack(simulatorCatalog.courses, trackId);
  return siblings.map((course) => ({
    value: String(course.course_id),
    label: [`${SURFACE_NAMES[course.surface] ?? 'Unknown'} ${course.distance.toLocaleString('en-US')} m`,
      `(${TURN_NAMES[course.turn] ?? 'Unknown'}${siblings.some(other => other.course_id !== course.course_id && other.distance === course.distance && other.surface === course.surface) ? ', layout '+course.course : ''})`].join(' '),
    keywords: `course ${course.course_id} ${describeCourse(course, siblings)}`
  }));
}

/**
 * Moves the session to a track, landing on its shortest course.
 *
 * The track is not stored: picking one is expressed by picking a course of it,
 * which is the only thing the simulator request actually needs.
 */
export function selectTrack(trackId: string): void {
  const first = coursesForTrack(simulatorCatalog.courses, Number(trackId))[0];
  if (first) simulatorSession.courseId = String(first.course_id);
}

/** Label for a value in one of the condition option lists. */
export function optionLabel(
  options: ReadonlyArray<ConditionOption>,
  value: string
): string {
  return options.find((option) => option.value === value)?.label ?? '';
}
