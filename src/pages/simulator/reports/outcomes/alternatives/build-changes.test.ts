import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { createSimulatorUma } from '../../../simulator-uma';
import { buildChanges, isSameBuild } from './build-changes';

// Only the fields the aptitude lookup reads: a turf mile.
const mile = { surface: 1, distance_type: 2 } as RaceCourse;

function currentBuild() {
  const uma = createSimulatorUma('Curren Chan');
  uma.trainee.runningStyle = 'Senko';
  uma.skills = [
    { skillId: 200011, level: 1 },
    { skillId: 200021, level: 1 }
  ];

  return uma;
}

describe('buildChanges', () => {
  it('finds no changes in an unchanged copy', () => {
    const current = currentBuild();

    const changes = buildChanges(current, structuredClone(current), mile);

    expect(isSameBuild(changes)).toBe(true);
  });

  it('notices stat changes', () => {
    const current = currentBuild();
    const alternative = structuredClone(current);
    alternative.trainee.speed = '1250';

    const changes = buildChanges(current, alternative, mile);

    expect(changes.statsChanged).toBe(true);
    expect(changes.aptitudesChanged).toBe(false);
  });

  it('counts only the aptitudes this race applies', () => {
    const current = currentBuild();
    const otherDistance = structuredClone(current);
    otherDistance.trainee.distanceAptitudes[2] = 'S';
    const raceDistance = structuredClone(current);
    raceDistance.trainee.distanceAptitudes[1] = 'S';

    const offCourse = buildChanges(current, otherDistance, mile);
    const onCourse = buildChanges(current, raceDistance, mile);

    expect(isSameBuild(offCourse)).toBe(true);
    expect(onCourse.aptitudesChanged).toBe(true);
  });

  it('treats a style change as an aptitude change', () => {
    const current = currentBuild();
    const alternative = structuredClone(current);
    alternative.trainee.runningStyle = 'Sashi';

    const changes = buildChanges(current, alternative, mile);

    expect(changes.aptitudesChanged).toBe(true);
  });

  it('treats a skill learned at another level as added, not removed', () => {
    const current = currentBuild();
    const alternative = structuredClone(current);
    alternative.skills = [{ skillId: 200011, level: 2 }, { skillId: 200031 }];

    const changes = buildChanges(current, alternative, mile);

    expect(changes.added.map((skill) => skill.skillId)).toEqual([200011, 200031]);
    expect(changes.removed.map((skill) => skill.skillId)).toEqual([200021]);
  });
});
