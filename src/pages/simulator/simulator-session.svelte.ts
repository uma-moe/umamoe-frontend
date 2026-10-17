/** Course and race conditions shared by the simulator pages. */

import {
  SURFACE_NAMES,
  TURN_NAMES,
  coursesForTrack,
  describeCourse,
  loadCourses,
  trackName,
  tracksWithCourses,
  type RaceCourse
} from '@/lib/game-data/racing/courses';
import { importSimulatorUmas, simulatorRoster } from './simulator-roster.svelte';
import type { SimulatorUma } from './simulator-uma';
import { resourceCache } from '@/services/resources/resource-cache';
import type { Trainee } from './setup/trainee';
import { EXAMPLE_RACE_SETTINGS } from './simulator-example';
import { nextMeeting, numberMeetings, type NextMeeting } from './courses/cm-presets';
import { timelineRepository } from '@/pages/timeline/timeline-repository';
import morningIcon from '@/assets/images/simulator/time-morning.svg';

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
 * The game's icon set has no Morning tile, so Morning uses a drawn sunrise in
 * the same flat badge style as the other three.
 */
export const TIME_OPTIONS: Array<ImageConditionOption> = [
  { value: '1', label: 'Morning', image: morningIcon },
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
  /**
   * The simulator's `course_id`. The track is derived from it, never stored. Empty until something picks a course;
   * the course data load then starts on the next Champions Meeting.
   */
  courseId: '',
  umaId: '',
  seed: String(Math.floor(Math.random() * 2 ** 31)),
  /** Feedback on the last import or preset, shown under the race field; empty when there is nothing to say. */
  importNotice: '',
  sourceCourseId: String(EXAMPLE_RACE_SETTINGS.courseId),
  raceInstanceId: EXAMPLE_RACE_SETTINGS.raceInstanceId,
  ground: EXAMPLE_RACE_SETTINGS.ground,
  season: EXAMPLE_RACE_SETTINGS.season,
  weather: EXAMPLE_RACE_SETTINGS.weather,
  startTime: EXAMPLE_RACE_SETTINGS.startTime,
  get trainee(): Trainee {
    return (
      simulatorRoster.umas.find((uma) => uma.id === simulatorSession.umaId) ??
      simulatorRoster.umas[0]!
    ).trainee;
  },
  set trainee(value: Trainee) {
    (
      simulatorRoster.umas.find((uma) => uma.id === simulatorSession.umaId) ??
      simulatorRoster.umas[0]!
    ).trainee = value;
  }
});

/** Reuse the exact CM course ID; a failed lookup requires a manual selection. */
export async function openSimulatorField(
  umas: SimulatorUma[],
  options: {
    replace?: boolean;
    raceInstanceId?: number;
    startTimeType?: number;
    seed?: string;
  } = {}
): Promise<void> {
  let importedCourse: string | undefined;
  if (options.raceInstanceId) {
    const { resolveRaceCourseIds } =
      await import('@/pages/competitive/race-analysis/replay/replay-course');

    const ids = await resolveRaceCourseIds([options.raceInstanceId]);
    await ensureSimulatorCourses();
    const id = ids.get(options.raceInstanceId);
    importedCourse = id && simulatorCourseData.courses.has(id) ? String(id) : '';
  } else if (umas.some((uma) => uma.source === 'CM Data')) importedCourse = '';

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
    if (course)
      for (const uma of umas) {
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
  return simulatorSession.courseId === simulatorSession.sourceCourseId
    ? simulatorSession.raceInstanceId
    : 0;
}

export interface SimulatorCourseDataState {
  courses: Map<number, RaceCourse>;
  loading: boolean;
  error: string;
  /** Set once the reader closes the current failure, so navigation does not reopen it. */
  errorDismissed: boolean;
}

export const simulatorCourseData = $state<SimulatorCourseDataState>({
  courses: new Map(),
  loading: true,
  error: '',
  errorDismissed: false
});

let courseDataLoad: Promise<void> | undefined;
resourceCache.onUpdate((name) => {
  if (name === 'simulator_courses') {
    courseDataLoad = undefined;
    void ensureSimulatorCourses();
  }
});

/** Loads the course master data once per session, for every surface. */
export function ensureSimulatorCourses(): Promise<void> {
  courseDataLoad ??= loadCourses()
    .then(async (courses) => {
      const start = simulatorSession.courseId ? undefined : await startingCourse(courses);
      simulatorCourseData.courses = courses;
      simulatorCourseData.loading = false;
      simulatorCourseData.error = '';
      simulatorCourseData.errorDismissed = false;
      // Something may have picked a course while the schedule loaded; that pick stands.
      if (start && !simulatorSession.courseId) Object.assign(simulatorSession, start);
    })
    .catch((reason: unknown) => {
      // Clearing the handle lets a later navigation retry the load.
      courseDataLoad = undefined;
      simulatorCourseData.loading = false;
      const message = reason instanceof Error ? reason.message : 'Could not load race data.';
      // A repeat of the failure the reader already closed stays closed; a
      // different one is news and shows again.
      if (message !== simulatorCourseData.error) simulatorCourseData.errorDismissed = false;
      simulatorCourseData.error = message;
    });

  return courseDataLoad;
}

/** A course and the conditions that go with it, as the session holds them. */
type CourseSetup = Pick<
  typeof simulatorSession,
  'courseId' | 'ground' | 'weather' | 'season' | 'startTime'
>;

const COURSE_STORAGE_KEY = 'uma.simulator.course';

/** The course and conditions this browser last used, when they are still a course of ours. */
function restoreCourse(courses: Map<number, RaceCourse>): CourseSetup | undefined {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(COURSE_STORAGE_KEY) ?? 'null');
    if (!data || typeof data !== 'object') return undefined;

    const { courseId, ground, weather, season, startTime } = data as Record<string, unknown>;
    if (typeof courseId !== 'string' || !courses.has(Number(courseId))) return undefined;

    const text = (value: unknown, fallback: string) =>
      typeof value === 'string' ? value : fallback;
    return {
      courseId,
      ground: text(ground, simulatorSession.ground),
      weather: text(weather, simulatorSession.weather),
      season: text(season, simulatorSession.season),
      startTime: text(startTime, simulatorSession.startTime)
    };
  } catch {
    /* Storage can be unavailable or hold something else; start elsewhere then. */
    return undefined;
  }
}

/** Keeps the course and its conditions in this browser; call it from an effect so every change is kept. */
export function saveSimulatorCourse(): void {
  const { courseId, ground, weather, season, startTime } = simulatorSession;
  if (!courseId) return;

  const data = JSON.stringify({ courseId, ground, weather, season, startTime });
  try {
    localStorage.setItem(COURSE_STORAGE_KEY, data);
  } catch {
    /* Storage can be full or disabled; the course still works for this visit. */
  }
}

/**
 * Where a session opens before anyone picks a course: the one kept from last time, else the next Champions Meeting's
 * with its conditions, else the example's, else the first track's shortest.
 */
async function startingCourse(
  courses: Map<number, RaceCourse>
): Promise<Partial<CourseSetup> | undefined> {
  const kept = restoreCourse(courses);
  if (kept) return kept;

  const meeting = await loadNextMeeting(courses);
  if (meeting) {
    const { ground, season, weather } = meeting.preset;
    return {
      courseId: String(meeting.course.course_id),
      ...(ground && { ground }),
      ...(season && { season }),
      ...(weather && { weather })
    };
  }

  if (courses.has(EXAMPLE_RACE_SETTINGS.courseId))
    return { courseId: String(EXAMPLE_RACE_SETTINGS.courseId) };

  const firstTrack = tracksWithCourses(courses)[0];
  const firstCourse = firstTrack && coursesForTrack(courses, firstTrack.trackId)[0];
  return firstCourse ? { courseId: String(firstCourse.course_id) } : undefined;
}

/** The next Champions Meeting on the timeline, or none when the timeline cannot be read. */
async function loadNextMeeting(courses: Map<number, RaceCourse>): Promise<NextMeeting | undefined> {
  try {
    const { events } = await timelineRepository.load();
    return nextMeeting(numberMeetings(events), [...courses.values()], Date.now());
  } catch {
    // Without the schedule, the example course stands in.
    return undefined;
  }
}

/** Whether the current load failure should be on screen. */
export function courseDataErrorVisible(): boolean {
  return simulatorCourseData.error !== '' && !simulatorCourseData.errorDismissed;
}

/** Hides the current load failure until a different one arrives. */
export function dismissCourseDataError(): void {
  simulatorCourseData.errorDismissed = true;
}

/** The course the session points at. */
export function selectedCourse(): RaceCourse | undefined {
  return simulatorCourseData.courses.get(Number(simulatorSession.courseId));
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
  return tracksWithCourses(simulatorCourseData.courses).map((track) => ({
    value: String(track.trackId),
    label: track.name
  }));
}

/** The selected track's courses, shortest first, labelled with direction. */
export function courseOptions(): Array<{ value: string; label: string; keywords: string }> {
  const trackId = selectedTrackId();
  if (trackId === undefined) return [];
  const siblings = coursesForTrack(simulatorCourseData.courses, trackId);
  return siblings.map((course) => ({
    value: String(course.course_id),
    label: [
      `${SURFACE_NAMES[course.surface] ?? 'Unknown'} ${course.distance.toLocaleString('en-US')} m`,
      `(${TURN_NAMES[course.turn] ?? 'Unknown'}${siblings.some((other) => other.course_id !== course.course_id && other.distance === course.distance && other.surface === course.surface) ? ', layout ' + course.course : ''})`
    ].join(' '),
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
  const first = coursesForTrack(simulatorCourseData.courses, Number(trackId))[0];
  if (first) simulatorSession.courseId = String(first.course_id);
}

/** Label for a value in one of the condition option lists. */
export function optionLabel(options: ReadonlyArray<ConditionOption>, value: string): string {
  return options.find((option) => option.value === value)?.label ?? '';
}
