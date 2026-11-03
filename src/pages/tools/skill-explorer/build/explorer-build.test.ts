import { describe, expect, it } from 'vitest';
import { HttpError } from '@/services/http/http-client';
import {
  addToBuild,
  buildErrorText,
  parseBuildValues,
  removeFromBuild,
  sameBuild
} from './explorer-build';

describe('explorer builds', () => {
  it('lets a new version of a skill replace the one already in the build', () => {
    expect(addToBuild([200011, 200331], 200012)).toEqual([200331, 200012]);
    expect(removeFromBuild([200011, 200331], 200011)).toEqual([200331]);
  });

  it('compares builds by their skills, not their order', () => {
    expect(sameBuild([1, 2], [2, 1])).toBe(true);
    expect(sameBuild([1, 2], [1, 3])).toBe(false);
  });

  it('reads build values as course rows', () => {
    const sections = new Array(24).fill(0);
    sections[20] = 500;
    const values = parseBuildValues({
      course_id: 10506,
      style: 3,
      build: [200331],
      skills: [[200011, 2.5, 1.2, 0.5, 0.85, 1, sections, 1.25, 0]],
      races: 1968
    });

    expect(values.build).toEqual([200331]);
    expect(values.points[0]).toMatchObject({
      skillId: 200011,
      win: 2.5,
      expected: 1.25,
      rate: 0.5
    });
  });

  it('says when the build limit lets a visitor value the next build', () => {
    const refused = (error: string, headers: Record<string, string> = {}) => {
      const response = new Response(null, { status: 429, headers });
      return new HttpError(
        429,
        'Too Many Requests',
        '/api/sim/skill-explorer-build',
        { error },
        response
      );
    };

    expect(buildErrorText(refused('rate_limited', { 'retry-after': '125' }))).toBe(
      'You can value 3 builds every 10 minutes. Try again in 3 minutes.'
    );
    expect(buildErrorText(refused('run_in_progress'))).toMatch(/still running/);
  });
});
