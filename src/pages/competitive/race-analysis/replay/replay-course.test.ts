import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resourceCache } from '@/services/resources/resource-cache';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { appHttp } from '@/services/http/app-http';
import {
  loadReplayCourses,
  loadReplayGeometry,
  loadRaceCourse,
  resolveReplayCourses,
  courseLandmarks,
  courseSegments,
  numberedSegments,
  sectionBorders,
  positionKeepZones
} from './replay-course';
import { replayTrack, trackPointAtDistance } from './replay-track';

const fixture = JSON.parse(
  gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString()
);

afterEach(() => {
  resourceCache.invalidate();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('loads published course metadata and full geometry by course ID through resources', async () => {
  const fetch = vi.fn(async (url: string) => {
    if (url.endsWith('manifest.json')) return Response.json({ version: 'test' });
    const name = url.split('/').at(-1)!.split('.')[0]!;
    if (!fixture[name]) throw Error('Unexpected resource ' + url);
    return Response.json(fixture[name]);
  });

  vi.stubGlobal('fetch', fetch);
  const courses = await loadReplayCourses(),
    shapes = await loadReplayGeometry();

  expect(courses.courses['10606']).toMatchObject({ raceTrackId: 10006, distance: 2400 });
  expect(shapes['10606']!.points).toHaveLength(1001);
  expect(shapes['10606']!.distance).toBe(2400);
  const points = replayTrack(shapes['10606']!);
  expect(trackPointAtDistance(points, 2500)).toEqual(points.at(-1));
  expect(fetch).toHaveBeenCalledWith(
    '/resources/test/simulator_course_geometry.json.gz',
    expect.anything()
  );

  resourceCache.invalidate();
  const invalid = {
    ...fixture.simulator_course_geometry,
    courses: [{ ...fixture.simulator_course_geometry.courses[0], position_z: [0] }]
  };

  fetch.mockImplementation(async (url: string) =>
    Response.json(url.endsWith('manifest.json') ? { version: 'test' } : invalid)
  );

  await expect(loadReplayGeometry()).rejects.toThrow('Course geometry data is invalid.');
});

it('resolves course IDs from race instances without replacing the captured course or guessing by distance', async () => {
  const capture = (raceInstanceId?: number, courseId?: number): ParsedRaceCapture => ({
    source: 'api',
    fileName: 'race.json',
    raceInstanceId,
    courseId,
    track: {},
    runners: [],
    frames: [],
    events: []
  });

  const captures = [
    capture(800023),
    capture(800023, 10606),
    capture(100101),
    capture(),
    capture(-1)
  ];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json(
        url.endsWith('manifest.json')
          ? { version: 'test' }
          : { races: [{ race_instance_id: 800023, course_set_id: 10506 }] }
      )
    )
  );

  const query = vi.spyOn(appHttp, 'request').mockResolvedValue({ rows: [[100101, 10611]] });
  await resolveReplayCourses(captures);
  expect(captures.map((c) => c.courseId)).toEqual([10506, 10606, 10611, undefined, undefined]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]?.[1]?.query?.sql).toContain('WHERE ri.id IN (100101)');
});

it('uses resource distances and grades for upcoming section, slope and phase markers', () => {
  const landmarks = courseLandmarks({
    raceTrackId: 10006,
    distance: 1200,
    surface: 1,
    turn: 2,
    corners: [{ start: 200, length: 400 }],
    straights: [
      { start: 0, end: 200 },
      { start: 600, end: 1200 }
    ],
    slopes: [
      { start: 300, length: 100, slope: 15000 },
      { start: 400, length: 100, slope: -10000 }
    ]
  });

  expect(landmarks).toContainEqual({
    distance: 300,
    label: 'Uphill +1.5%',
    color: '#bd7581',
    kind: 'slope'
  });
  expect(landmarks).toContainEqual({
    distance: 400,
    label: 'Downhill -1.0%',
    color: '#719bdd',
    kind: 'slope'
  });
  expect(landmarks.filter((m) => m.distance === 400).some((m) => m.label === 'Level ground')).toBe(
    false
  );
  expect(landmarks.find((m) => m.label === 'Final spurt window')?.distance).toBe(800);
  expect(landmarks.at(-1)?.label).toBe('Finish');
  expect(courseLandmarks(undefined)).toEqual([]);
});

it('names where each corner starts and ends, leading into the final straight', () => {
  const course = {
    raceTrackId: 10006,
    distance: 2000,
    surface: 1,
    turn: 2,
    corners: [
      { start: 400, length: 300 },
      { start: 1000, length: 400 }
    ],
    straights: [
      { start: 0, end: 400 },
      { start: 700, end: 1000 },
      { start: 1400, end: 2000 }
    ],
    slopes: []
  };

  const borders = sectionBorders(course).map(({ distance, label }) => ({ distance, label }));

  expect(borders).toEqual([
    { distance: 400, label: 'Corner 1 start' },
    { distance: 700, label: 'Corner 1 end' },
    { distance: 1000, label: 'Final corner start' },
    { distance: 1400, label: 'Final straight' }
  ]);
  expect(sectionBorders(undefined)).toEqual([]);
});

it('numbers back-to-back corners and gives them one shared border', () => {
  const course = {
    raceTrackId: 10006,
    distance: 2000,
    surface: 1,
    turn: 2,
    corners: [
      { start: 300, length: 200 },
      { start: 500, length: 200 },
      { start: 1200, length: 300 }
    ],
    straights: [
      { start: 0, end: 300 },
      { start: 700, end: 1200 },
      { start: 1500, end: 2000 }
    ],
    slopes: []
  };

  const borders = sectionBorders(course).map(({ distance, label }) => ({ distance, label }));
  const sections = numberedSegments(course).map((segment) => segment.label);

  expect(borders).toEqual([
    { distance: 300, label: 'Corner 1 start' },
    { distance: 500, label: 'Corner 2 start' },
    { distance: 700, label: 'Corner 2 end' },
    { distance: 1200, label: 'Final corner start' },
    { distance: 1500, label: 'Final straight' }
  ]);
  expect(sections).toEqual([
    'Straight',
    'Corner 1',
    'Corner 2',
    'Straight',
    'Final corner',
    'Final straight'
  ]);
});

it('ends a corner without a following straight as a plain corner end', () => {
  const course = {
    raceTrackId: 10006,
    distance: 1600,
    surface: 1,
    turn: 2,
    corners: [{ start: 600, length: 400 }],
    straights: [{ start: 0, end: 600 }],
    slopes: []
  };

  expect(sectionBorders(course).map((border) => border.label)).toEqual([
    'Final corner start',
    'Final corner end'
  ]);
});

it('loads a meeting course by its exact race instance and leaves unknown courses unavailable', async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith('manifest.json')
        ? { version: 'test' }
        : url.includes('simulator_courses')
          ? fixture.simulator_courses
          : { races: [{ race_instance_id: 800023, course_set_id: 10506 }] }
    )
  );

  vi.stubGlobal('fetch', fetch);
  const query = vi.spyOn(appHttp, 'request').mockResolvedValue({ rows: [] });
  expect(await loadRaceCourse()).toBeUndefined();
  expect(await loadRaceCourse(-1)).toBeUndefined();
  expect(fetch).not.toHaveBeenCalled();
  expect(await loadRaceCourse(800023)).toMatchObject({
    raceTrackId: 10005,
    distance: 2500,
    turn: 1
  });

  expect(query).not.toHaveBeenCalled();
  expect(await loadRaceCourse(800024)).toBeUndefined();
  expect(query.mock.calls[0]?.[1]?.query?.sql).toContain('WHERE ri.id IN (800024)');
});

it('fills unrecorded section ranges without assuming a straight or changing replay segments', () => {
  const course = {
    raceTrackId: 10005,
    distance: 1200,
    surface: 1,
    turn: 1,
    corners: [{ start: 100, length: 300 }],
    straights: [{ start: 600, end: 1000 }],
    slopes: []
  };

  expect(courseSegments(course)).toHaveLength(2);
  expect(
    courseSegments(course, true).map(({ start, end, label }) => ({ start, end, label }))
  ).toEqual([
    { start: 0, end: 100, label: 'Unspecified' },
    { start: 100, end: 400, label: 'Final corner' },
    { start: 400, end: 600, label: 'Unspecified' },
    { start: 600, end: 1000, label: 'Final straight' },
    { start: 1000, end: 1200, label: 'Unspecified' }
  ]);

  expect(courseSegments({ ...course, corners: [], straights: [] }, true)).toEqual([
    { start: 0, end: 1200, label: 'Unspecified', color: '#737d8a' }
  ]);

  expect(courseSegments(undefined, true)).toEqual([]);
});

it('places position keep zones behind the leader until position keeping ends', () => {
  const zones = positionKeepZones(500, 2000);

  expect(zones.map((zone) => zone.style)).toEqual([2, 3, 4]);
  expect(zones.map((zone) => zone.end)).toEqual([497, 500 - 6.5 * 1.8, 500 - 7.5 * 1.8]);
  expect(zones[0]?.start).toBeCloseTo(500 - 5 * 1.8);
  expect(positionKeepZones((2000 * 10) / 24, 2000)).toEqual([]);
});
