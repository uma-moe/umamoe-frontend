import { cmGet, loadCmSummary, snapshotPath } from '@/pages/competitive/champions-meeting/cm-data';
import type { Snapshot, TeamDetail, TeamSearchResponse } from '@/pages/competitive/hakuraku-types';
import { resolveRaceCourseIds } from '@/pages/competitive/race-analysis/replay/replay-course';
import { loadCourses } from '@/lib/game-data/racing/courses';
import { raceConditions } from './cm-presets';
import { simulatorUmaFromCm } from '../simulator-uma';

/** A small, explicit competitive benchmark, not a claim about the whole CM population. */
export async function loadCmBenchmark(snapshot: Snapshot, signal: AbortSignal) {
  if (!snapshot.raceInstanceId)
    throw new Error(
      'This dataset has no exact simulator course. Choose another dataset or use the current race field.'
    );
  const id = snapshot.snapshotId;
  const [summary, search, courseIds, courses] = await Promise.all([
    loadCmSummary(id, signal),
    cmGet<TeamSearchResponse>(
      snapshotPath(
        id,
        'teams?' +
          new URLSearchParams({
            slots: '[{},{},{}]',
            players: 'unique',
            sort: 'lower',
            limit: '6',
            offset: '0'
          })
      ),
      signal,
      id
    ),
    resolveRaceCourseIds([snapshot.raceInstanceId]),
    loadCourses()
  ]);

  const course = courses.get(courseIds.get(snapshot.raceInstanceId) ?? 0);
  const conditions = raceConditions(snapshot.meta.conditions);
  const mood = /\b(Awful|Bad|Normal|Good|Great) mood\b/i
    .exec(snapshot.meta.conditions)?.[1]
    ?.toLowerCase();

  const motivation = mood ? ['awful', 'bad', 'normal', 'good', 'great'].indexOf(mood) + 1 : 0;
  if (
    !course ||
    !conditions.season ||
    !conditions.weather ||
    !conditions.ground ||
    !snapshot.startTimeType ||
    !motivation
  ) {
    throw new Error(
      'The exact CM course or conditions could not be resolved. Use the current race field to set them manually.'
    );
  }

  const owners = new Set<string>();
  const selected = search.teams
    .filter((team) => {
      if (owners.has(team.owner.id)) return false;
      owners.add(team.owner.id);
      return true;
    })
    .slice(0, 6);

  if (selected.length < 2)
    throw new Error('This dataset needs at least two captured teams from different players.');
  const details = await Promise.all(
    selected.map((team) =>
      cmGet<TeamDetail>(snapshotPath(id, 'teams/' + encodeURIComponent(team.id)), signal, id)
    )
  );

  const teams = details.map((detail) => {
    if (
      detail.team.members.length !== 3 ||
      detail.team.members.some(
        (member) =>
          !Array.isArray(member.stats) ||
          member.stats.length !== 5 ||
          !Array.isArray(member.skills) ||
          !Array.isArray(member.aptitudes)
      )
    )
      throw new Error('A captured CM team is missing its trained build.');
    const umas = detail.team.members.map((build) => {
      const uma = simulatorUmaFromCm(build, summary);
      uma.trainee.motivation = String(motivation);
      uma.trainee.distanceAptitudes[course.distance_type - 1] = build.aptitudes[0];
      uma.trainee.groundAptitudes[course.surface - 1] = build.aptitudes[1];
      return uma;
    });

    return { id: detail.team.id, umas };
  });

  return {
    snapshot,
    course,
    teams,
    motivation,
    setup: {
      raceInstanceId: snapshot.raceInstanceId,
      raceType: 0,
      season: Number(conditions.season),
      weather: Number(conditions.weather),
      ground: Number(conditions.ground),
      startTimeType: snapshot.startTimeType
    }
  };
}

export type CmBenchmark = Awaited<ReturnType<typeof loadCmBenchmark>>;
