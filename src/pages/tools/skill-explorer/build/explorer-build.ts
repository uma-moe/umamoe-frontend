import { appHttp } from '@/services/http/app-http';
import { HttpError } from '@/services/http/http-client';
import { finiteNumber, isRecord } from '../json-guards';
import { parseRow, type SkillPoint, type StyleKey } from '../skill-explorer-data';
import { skillFamily } from '../skill-explorer-view';

/** The simulator values builds of 1 to 20 skills. */
export const MAX_BUILD_SKILLS = 20;

/** A visitor values this many builds every `BUILD_WINDOW_MINUTES`; the backend refuses more. */
export const BUILD_RUNS = 3;
export const BUILD_WINDOW_MINUTES = 10;

/** Every skill's values in a build the visitor picked, on one course for one style. */
export interface BuildValues {
  build: number[];
  points: SkillPoint[];
}

/** `build` with `skillId` added; another version of the same skill (○, ◎ or gold) makes way for it. */
export function addToBuild(build: readonly number[], skillId: number): number[] {
  const family = skillFamily(skillId);
  return [...build.filter((id) => skillFamily(id) !== family), skillId];
}

export function removeFromBuild(build: readonly number[], skillId: number): number[] {
  return build.filter((id) => id !== skillId);
}

/** Whether two builds hold the same skills, in any order. */
export function sameBuild(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false;

  const skills = new Set(left);
  return right.every((id) => skills.has(id));
}

export function parseBuildValues(value: unknown): BuildValues {
  if (!isRecord(value) || !Array.isArray(value.build) || !Array.isArray(value.skills))
    throw new Error('The simulator returned invalid build values.');

  return {
    build: value.build.map((id) => finiteNumber(id, 'build skill')),
    points: value.skills.map(parseRow)
  };
}

/**
 * Races every skill in `build` on one course for one style. A build nobody asked for before takes the simulator about
 * ten seconds; one asked for recently comes back at once.
 */
export async function valueBuild(
  courseId: number,
  style: Exclude<StyleKey, 'all'>,
  build: readonly number[],
  signal?: AbortSignal
): Promise<BuildValues> {
  const body = await appHttp.request<unknown>('/api/sim/skill-explorer-build', {
    method: 'POST',
    body: { course_id: courseId, style: Number(style), build: [...build] },
    browserProof: !import.meta.env.DEV,
    ...(signal ? { signal } : {})
  });
  return parseBuildValues(body);
}

/** Why a build could not be valued, in words; the backend's refusals come back as 429s with an error code. */
export function buildErrorText(error: unknown): string {
  if (!(error instanceof HttpError) || error.status !== 429)
    return error instanceof Error ? error.message : 'The simulator did not answer.';

  const code = isRecord(error.body) ? error.body.error : undefined;
  if (code === 'run_in_progress')
    return 'Your last simulator request is still running. Try again once it finishes.';
  if (code !== 'rate_limited') return 'The simulator is busy. Try again in a minute.';

  const seconds = Number.parseInt(error.response.headers.get('retry-after') ?? '', 10);
  const minutes = Number.isFinite(seconds)
    ? Math.max(1, Math.ceil(seconds / 60))
    : BUILD_WINDOW_MINUTES;
  return `You can value ${BUILD_RUNS} builds every ${BUILD_WINDOW_MINUTES} minutes. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
}
