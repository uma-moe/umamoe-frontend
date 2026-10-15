import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { importSimulatorUmas } from '../../../simulator-roster.svelte';
import { simulatorRepository } from '../../../simulator-repository';
import { simulatorSession } from '../../../simulator-session.svelte';
import { buildMonteCarloRequest } from '../../../requests/race-sim-request';
import type { RaceSetupInput } from '../../../requests/stamina-request';
import type { SimulatorUma } from '../../../simulator-uma';
import { veteranTeams, pairingFrameOrders } from './veteran-pairings';
import { rankTeams, resultsMatchJobs, type TeamResult } from './team-results';

export type TeamSearchPlan = {
  target: CourseCatalogEntry;
  raceSetup: RaceSetupInput;
  pool: SimulatorUma[];
  fields: SimulatorUma[][];
  seeds: number[];
  sampleCount: number;
  total: number;
  key: string;
  description: string;
};

/** One Find my best team run: progress, the ranked teams, and what they raced against. */
export class TeamSearch {
  busy = $state(false);
  stop = $state(false);
  completed = $state(0);
  total = $state(0);
  failures = $state(0);
  error = $state('');
  top = $state.raw<TeamResult[]>([]);
  failedMessages = $state.raw<string[]>([]);
  opponents = $state.raw<SimulatorUma[]>([]);
  course = $state.raw<CourseCatalogEntry>();
  setup = $state.raw<RaceSetupInput>();
  description = $state('');
  key = $state('');

  useTeam(team: TeamResult) {
    importSimulatorUmas(
      [
        ...team.umas.map((uma) => ({
          ...uma,
          id: crypto.randomUUID(),
          teamId: 1,
          frameOrder: undefined
        })),
        ...this.opponents
      ],
      true
    );
    if (this.course && this.setup) {
      simulatorSession.courseId = String(this.course.course_id);
      simulatorSession.sourceCourseId = simulatorSession.courseId;
      simulatorSession.raceInstanceId = this.setup.raceInstanceId;
      simulatorSession.season = String(this.setup.season);
      simulatorSession.weather = String(this.setup.weather);
      simulatorSession.ground = String(this.setup.ground);
      simulatorSession.startTime = String(this.setup.startTimeType);
      simulatorSession.importNotice =
        'Your team from Find my best team, against the first opponents it raced. ' +
        this.description;
    }
  }

  async run({
    target,
    raceSetup,
    pool,
    fields,
    seeds,
    sampleCount,
    total,
    key,
    description
  }: TeamSearchPlan) {
    this.opponents = fields[0]!;
    this.course = target;
    this.setup = raceSetup;
    this.key = key;
    this.description = description;
    const iterator = veteranTeams(pool);
    this.top = [];
    this.completed = 0;
    this.failures = 0;
    this.failedMessages = [];
    this.error = '';
    this.stop = false;
    this.busy = true;
    this.total = total;
    let team: TeamResult | undefined,
      sample = 0,
      nextId = 0,
      engine = '';
    try {
      while (!this.stop) {
        const batch = [],
          jobs: { team: TeamResult; seed: number }[] = [];
        let bytes = 0;
        while (batch.length < 50) {
          if (!team || sample === sampleCount) {
            const next = iterator.next();
            if (next.done) break;
            team = {
              id: nextId++,
              umas: next.value,
              wins: 0,
              successes: 0,
              errors: 0,
              rankTotal: 0
            };
            sample = 0;
          }
          const gates = pairingFrameOrders(seeds[sample]!, 9);
          const race = buildMonteCarloRequest({
            courseId: target.course_id,
            seed: seeds[sample]!,
            setup: raceSetup,
            runners: [
              ...team.umas.map((uma) => ({ ...uma, teamId: 1, frameOrder: undefined })),
              ...fields[sample % fields.length]!
            ].map((uma, index) => ({
              trainee: uma.trainee,
              skills: uma.skills,
              teamId: uma.teamId,
              fanCount: uma.fanCount,
              frameOrder: gates[index]
            }))
          }).input;
          const size = new TextEncoder().encode(JSON.stringify(race)).length;
          if (batch.length && bytes + size > 7 * 1024 * 1024) break;
          batch.push(race);
          jobs.push({ team, seed: seeds[sample]! });
          bytes += size;
          sample++;
        }
        if (!batch.length) break;
        const response = (await simulatorRepository.batch({ body: { races: batch } })).result;
        const build = JSON.stringify(response.engine_builds);
        if (engine && build !== engine)
          throw Error(
            'The simulator’s data changed during the search. Search again to compare every team on the same data.'
          );
        engine = build;
        if (!resultsMatchJobs(response.results, jobs))
          throw Error('The simulator returned results that don’t match the races sent.');
        for (let index = 0; index < jobs.length; index++) {
          const job = jobs[index]!,
            result = response.results[index]!,
            record = job.team;
          if (result.error) {
            record.errors++;
            this.failures++;
            this.failedMessages = [
              ...this.failedMessages.slice(-9),
              record.umas.map((uma) => uma.name).join(', ') + ': ' + result.error
            ];
          } else {
            record.successes++;
            record.wins += Number(result.finish_order![0]! < 3);
            record.rankTotal += Math.min(
              ...[0, 1, 2].map((source) => result.finish_order!.indexOf(source) + 1)
            );
          }
          this.completed++;
          if (record.successes === sampleCount && !record.errors) {
            this.top = rankTeams(this.top, record);
          }
        }
      }
    } catch (reason) {
      this.error = (reason as Error).message;
    } finally {
      this.busy = false;
    }
  }
}
