<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import SimulatorRunnerFace from '../../reports/SimulatorRunnerFace.svelte';
  import { simulatorRoster, importSimulatorUmas } from '../../simulator-roster.svelte';
  import { simulatorRepository } from '../../simulator-repository';
  import { winRateInterval } from '../../simulator-results';
  import { simulatorSession } from '../../simulator-session.svelte';
  import type { CmBenchmark } from '../../courses/cm-benchmark';
  import CmOpponents from '../../shell/CmOpponents.svelte';
  import { buildMonteCarloRequest } from '../../requests/race-sim-request';
  import type { RaceSetupInput } from '../../requests/stamina-request';
  import type { SimulatorUma } from '../../simulator-uma';
  import VeteranList from './VeteranList.svelte';
  import { loadVeteranEntries, type VeteranEntry } from './veteran-entries';
  import {
    veteranTeamCount,
    veteranTeams,
    pairingSeeds,
    benchmarkFields,
    pairingFrameOrders
  } from './veteran-pairings';

  /**
   * Find my best team: every team of three from the Veterans picked, raced against the same opponents, seeds and gates,
   * ranked by how often one of the three wins. The answer comes first, with the teams close behind it.
   */
  let {
    open = $bindable(false),
    course,
    setup,
    seed,
    initialSnapshot = ''
  }: {
    open?: boolean;
    course?: CourseCatalogEntry;
    setup: RaceSetupInput;
    seed: number;
    initialSnapshot?: string;
  } = $props();

  type TeamResult = {
    id: number;
    umas: SimulatorUma[];
    wins: number;
    successes: number;
    errors: number;
    rankTotal: number;
  };

  const uid = $props.id();

  // Your Veterans: every one with trained stats is picked to start with.
  let accountId = $state(''),
    entries = $state.raw<VeteranEntry[]>([]),
    picked = $state<string[]>([]),
    poolLoading = $state(false),
    poolError = $state('');
  $effect(() => {
    if (open) accountId = $activeWorkspace.accountId ?? '';
  });
  $effect(() => {
    if (!open || !$authReady) return;
    const id = accountId;
    $authUser;
    let active = true;
    poolLoading = true;
    poolError = '';
    void loadVeteranEntries(id)
      .then((result) => {
        if (!active) return;
        entries = result.entries;
        picked = result.entries.map((entry) => entry.key);
      })
      .catch((reason) => {
        if (active)
          poolError = reason instanceof Error ? reason.message : 'Couldn’t load Veterans.';
      })
      .finally(() => {
        if (active) poolLoading = false;
      });
    return () => {
      active = false;
    };
  });
  const candidates = $derived.by(() => {
    const keys = new Set(picked);
    return entries.filter((entry) => keys.has(entry.key)).map((entry) => entry.uma);
  });
  const teams = $derived(veteranTeamCount(candidates));

  // Opponents: the leading teams of a CM dataset, or six runners from the race field.
  let opponentSource = $state(''),
    snapshotId = $state(''),
    benchmark = $state.raw<CmBenchmark>(),
    benchmarkLoading = $state(false),
    opponentIds = $state<string[]>([]);
  $effect(() => {
    if (open && !opponentSource)
      opponentSource =
        initialSnapshot || !simulatorRoster.configured || simulatorRoster.umas.length < 6
          ? 'cm'
          : 'field';
  });
  $effect(() => {
    if (open && !opponentIds.length && simulatorRoster.umas.length >= 6)
      opponentIds = simulatorRoster.umas.slice(-6).map((uma) => uma.id);
  });
  const opponents = $derived(
    opponentIds.flatMap((id) => simulatorRoster.umas.filter((uma) => uma.id === id))
  );
  function toggleOpponent(id: string) {
    opponentIds = opponentIds.includes(id)
      ? opponentIds.filter((item) => item !== id)
      : opponentIds.length < 6
        ? [...opponentIds, id]
        : opponentIds;
  }
  /** The course the teams race on: the dataset's, or the race's. */
  const raceCourse = $derived(opponentSource === 'cm' ? benchmark?.course : course);

  // The run.
  let samples = $state('100'),
    busy = $state(false),
    stop = $state(false),
    completed = $state(0),
    total = $state(0),
    failures = $state(0),
    error = $state(''),
    top = $state.raw<TeamResult[]>([]),
    failedMessages = $state.raw<string[]>([]),
    searchOpponents = $state.raw<SimulatorUma[]>([]),
    searchCourse = $state.raw<CourseCatalogEntry>(),
    searchSetup = $state.raw<RaceSetupInput>(),
    searchDescription = $state(''),
    searchKey = $state('');
  $effect(() => {
    if (!open) stop = true;
  });
  const validSamples = $derived(
    /^\d+$/.test(String(samples)) && Number(samples) >= 1 && Number(samples) <= 1000
  );
  const races = $derived(validSamples ? teams * Number(samples) : 0);
  const blocked = $derived(
    poolLoading
      ? 'Loading your Veterans…'
      : !teams
        ? candidates.length < 3
          ? 'Pick at least three Veterans.'
          : 'Pick three different characters; variants of one can’t race together.'
        : !validSamples
          ? 'Races per team must be 1 to 1,000.'
          : !(Number.isInteger(seed) && seed >= -2147483648 && seed <= 2147483647)
            ? 'Fix the race seed first.'
            : opponentSource === 'cm'
              ? benchmarkLoading
                ? 'Loading the CM teams…'
                : !benchmark
                  ? 'Choose a CM dataset that loads, or race the field.'
                  : ''
              : !course
                ? 'Pick a course first.'
                : opponents.length !== 6
                  ? 'Pick six opponents.'
                  : ''
  );
  const inputKey = $derived(
    JSON.stringify([picked, opponentSource, snapshotId, opponentIds, samples, seed])
  );
  const stale = $derived(!!top.length && !busy && searchKey !== inputKey);
  const best = $derived(top[0]);

  const rate = (team: TeamResult) => (team.successes ? (team.wins / team.successes) * 100 : 0);
  const interval = (team: TeamResult) => winRateInterval(team.wins, team.successes);
  const bestPlace = (team: TeamResult) => (team.successes ? team.rankTotal / team.successes : 0);

  function useTeam(team: TeamResult) {
    importSimulatorUmas(
      [
        ...team.umas.map((uma) => ({
          ...uma,
          id: crypto.randomUUID(),
          teamId: 1,
          frameOrder: undefined
        })),
        ...searchOpponents
      ],
      true
    );
    if (searchCourse && searchSetup) {
      simulatorSession.courseId = String(searchCourse.course_id);
      simulatorSession.sourceCourseId = simulatorSession.courseId;
      simulatorSession.raceInstanceId = searchSetup.raceInstanceId;
      simulatorSession.season = String(searchSetup.season);
      simulatorSession.weather = String(searchSetup.weather);
      simulatorSession.ground = String(searchSetup.ground);
      simulatorSession.startTime = String(searchSetup.startTimeType);
      simulatorSession.importNotice =
        'Your team from Find my best team, against the first opponents it raced. ' +
        searchDescription;
    }
    open = false;
  }

  async function search() {
    if (blocked || busy) return;
    const cm = opponentSource === 'cm' ? benchmark : undefined;
    const target = structuredClone($state.snapshot(cm?.course ?? course!)),
      raceSetup = structuredClone($state.snapshot(cm?.setup ?? setup));
    const pool = structuredClone($state.snapshot(candidates)),
      sampleCount = Number(samples),
      seeds = pairingSeeds(seed, sampleCount);
    if (cm) for (const uma of pool) uma.trainee.motivation = String(cm.motivation);
    const fields = cm
      ? benchmarkFields(structuredClone(cm.teams.map((team) => team.umas)))
      : [
          structuredClone($state.snapshot(opponents)).map((uma, index) => ({
            ...uma,
            teamId: index < 3 ? 2 : 3,
            frameOrder: undefined
          }))
        ];
    searchOpponents = fields[0]!;
    searchCourse = target;
    searchSetup = raceSetup;
    searchKey = inputKey;
    searchDescription = cm
      ? `${cm.snapshot.label} · ${cm.teams.length} leading teams · ${Math.min(fields.length, sampleCount)} opponent pairings.`
      : 'Six opponents from the race field.';
    const iterator = veteranTeams(pool);
    top = [];
    completed = 0;
    failures = 0;
    failedMessages = [];
    error = '';
    stop = false;
    busy = true;
    total = teams * sampleCount;
    let team: TeamResult | undefined,
      sample = 0,
      nextId = 0,
      engine = '';
    try {
      while (!stop) {
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
        if (
          response.results.length !== jobs.length ||
          response.results.some(
            (result, index) =>
              result.seed !== jobs[index]!.seed ||
              (!result.error &&
                (!result.finish_order ||
                  result.finish_order.length !== 9 ||
                  new Set(result.finish_order).size !== 9 ||
                  result.finish_order.some(
                    (source) => !Number.isInteger(source) || source < 0 || source > 8
                  )))
          )
        )
          throw Error('The simulator returned results that don’t match the races sent.');
        for (let index = 0; index < jobs.length; index++) {
          const job = jobs[index]!,
            result = response.results[index]!,
            record = job.team;
          if (result.error) {
            record.errors++;
            failures++;
            failedMessages = [
              ...failedMessages.slice(-9),
              record.umas.map((uma) => uma.name).join(', ') + ': ' + result.error
            ];
          } else {
            record.successes++;
            record.wins += Number(result.finish_order![0]! < 3);
            record.rankTotal += Math.min(
              ...[0, 1, 2].map((source) => result.finish_order!.indexOf(source) + 1)
            );
          }
          completed++;
          if (record.successes === sampleCount && !record.errors) {
            // Keep the best 50 teams; the rest are only counted.
            top = [...top, record]
              .sort(
                (a, b) =>
                  b.wins / b.successes - a.wins / a.successes ||
                  a.rankTotal / a.successes - b.rankTotal / b.successes ||
                  a.id - b.id
              )
              .slice(0, 50);
          }
        }
      }
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      busy = false;
    }
  }
  const SOURCES = [
    { value: 'cm', label: 'Top CM teams' },
    { value: 'field', label: 'Race field' }
  ];
</script>

<Dialog
  bind:open
  title="Find my best team"
  icon="veterans"
  maxWidth="1180px"
  maxHeight="92dvh"
>
  <div class="team-search">
    <section
      class="panel pool"
      aria-label="Your Veterans"
    >
      <header>
        <h3>Your Veterans</h3>
        <span class="sub">
          {picked.length} picked ·
          <strong>{teams.toLocaleString()}</strong>
          {teams === 1 ? 'team' : 'teams'}
        </span>
        {#if $workspaces.length > 1}
          <div class="collection">
            <SelectFieldSlim
              id="{uid}-account"
              label="Collection"
              hideLabel
              value={accountId}
              disabled={busy}
              onchange={(value) => (accountId = value)}
              options={$workspaces.map((workspace) => ({
                value: workspace.accountId ?? '',
                label: workspace.label
              }))}
            />
          </div>
        {/if}
      </header>
      {#if poolLoading}
        <Spinner
          centered
          label="Loading Veterans…"
        />
      {:else if poolError}
        <p
          class="note bad"
          role="alert"
        >
          {poolError}
        </p>
      {:else if !entries.length}
        <p class="note">
          No Veterans with trained stats here yet.
          <a href="/veterans">Upload your game export</a>
          to race them.
        </p>
      {:else}
        <div class="pool-list">
          <VeteranList
            {entries}
            course={raceCourse}
            mode="multi"
            compact
            bind:selected={picked}
          />
        </div>
      {/if}
    </section>

    <div class="side">
      <section
        class="panel against"
        aria-label="Opponents"
      >
        <header>
          <h3>Against</h3>
          <SegmentedControl
            label="Opponents"
            compact
            options={SOURCES}
            bind:value={opponentSource}
          />
        </header>
        {#if opponentSource === 'cm'}
          <CmOpponents
            bind:snapshotId
            bind:benchmark
            bind:loading={benchmarkLoading}
            {initialSnapshot}
            disabled={busy}
            note={'Your team races two of these ' +
              (benchmark ? benchmark.teams.length + ' ' : '') +
              'leading teams at a time, on the CM’s course, conditions and mood.'}
          />
        {:else if simulatorRoster.umas.length < 6}
          <p class="note">The race field needs six runners to race against.</p>
        {:else}
          <ul
            class="field-picks"
            aria-label="Opponents from the race field"
          >
            {#each simulatorRoster.umas as uma (uma.id)}
              {@const order = opponentIds.indexOf(uma.id)}
              <li>
                <button
                  type="button"
                  class="pick"
                  class:on={order >= 0}
                  aria-pressed={order >= 0}
                  disabled={busy || (order < 0 && opponentIds.length >= 6)}
                  onclick={() => toggleOpponent(uma.id)}
                >
                  <SimulatorRunnerFace
                    cardId={uma.cardId}
                    size={24}
                  />
                  <span>{uma.name}</span>
                  {#if order >= 0}<small>Team {order < 3 ? 'A' : 'B'}</small>{/if}
                </button>
              </li>
            {/each}
          </ul>
          <p class="note">
            {opponents.length} of 6 picked. The first three race as one team, the next three as another.
          </p>
        {/if}
      </section>

      <div class="run">
        <div class="samples">
          <TextField
            id="{uid}-samples"
            label="Races per team"
            type="number"
            min={1}
            max={1000}
            bind:value={samples}
            disabled={busy}
          />
        </div>
        <p class="cost">
          <strong>{races.toLocaleString()}</strong>
          races
          {#if races > 200000}<span class="warn">
              · that takes a while; pick fewer Veterans or races
            </span>{/if}
        </p>
        {#if busy}
          <Button
            variant="secondary"
            onclick={() => (stop = true)}
            disabled={stop}
          >
            {stop ? 'Stopping…' : 'Stop'}
          </Button>
        {:else}
          <Button
            icon="chart"
            disabled={!!blocked}
            onclick={search}
          >
            Find the best team
          </Button>
        {/if}
      </div>
      {#if blocked && !busy}<p class="blocked">{blocked}</p>{/if}
      {#if busy || completed}
        <div
          class="progress"
          role="status"
        >
          <progress
            max={total || 1}
            value={completed}
          ></progress>
          <span>
            {completed.toLocaleString()} of {total.toLocaleString()} races{busy
              ? ''
              : completed < total
                ? ' · stopped'
                : ' · done'}
          </span>
        </div>
      {/if}
      {#if error}<p
          class="note bad"
          role="alert"
        >
          {error}
        </p>{/if}
      {#if failures}
        <details class="failures">
          <summary>
            {failures}
            {failures === 1 ? 'race' : 'races'} failed; those teams are left out of the ranking
          </summary>
          {#each failedMessages as message}<p>{message}</p>{/each}
        </details>
      {/if}

      <section
        class="results"
        class:stale
        aria-label="Best teams"
      >
        {#if best}
          {@const range = interval(best)}
          <div class="answer">
            <p class="label">{busy ? 'Best so far' : 'Best team'}</p>
            <ul class="lineup">
              {#each best.umas as uma (uma.id)}
                <li>
                  <SimulatorRunnerFace
                    cardId={uma.cardId}
                    size={40}
                  />
                  <span>{uma.name}</span>
                </li>
              {/each}
            </ul>
            <p class="headline">
              Wins <strong>{rate(best).toFixed(1)}%</strong>
              <span>({range[0].toFixed(1)}–{range[1].toFixed(1)}%)</span>
            </p>
            <p class="detail">
              Best finisher places {bestPlace(best).toFixed(2)} on average · {best.successes.toLocaleString()}
              races
            </p>
            <Button
              icon="race"
              disabled={busy}
              onclick={() => useTeam(best)}
            >
              Race this team
            </Button>
            {#if stale}<p class="stale-note">
                Setup changed since this search
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  disabled={!!blocked}
                  onclick={search}
                >
                  Search again
                </Button>
              </p>{/if}
          </div>
          {#if top.length > 1}
            <h4>Close behind</h4>
            <ol class="others">
              {#each top.slice(1) as team, index (team.id)}
                {@const range = interval(team)}
                <li>
                  <span class="place">{index + 2}</span>
                  <span class="faces">
                    {#each team.umas as uma (uma.id)}
                      <SimulatorRunnerFace
                        cardId={uma.cardId}
                        size={24}
                      />
                    {/each}
                  </span>
                  <span class="names">{team.umas.map((uma) => uma.name).join(' · ')}</span>
                  <span
                    class="rate"
                    title="{range[0].toFixed(1)}–{range[1].toFixed(1)}%"
                  >
                    <strong>{rate(team).toFixed(1)}%</strong>
                    <small>{bestPlace(team).toFixed(2)}</small>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    ariaLabel={'Race ' + team.umas.map((uma) => uma.name).join(', ')}
                    onclick={() => useTeam(team)}
                  >
                    Race
                  </Button>
                </li>
              {/each}
            </ol>
            <p class="note">
              Win rate is how often one of the three wins; the small number is where the best
              finisher places on average. Showing the best {top.length}.
            </p>
          {/if}
        {:else if !busy}
          <div class="idle">
            <p class="headline">Which three should race?</p>
            <p class="detail">
              Pick your Veterans and who they race, then Find the best team. Every team gets the
              same opponents, seeds and gates.
            </p>
          </div>
        {/if}
      </section>
    </div>
  </div>
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => {
        stop = true;
        open = false;
      }}
    >
      Close
    </Button>
  {/snippet}
</Dialog>

<style>
  .team-search {
    display: grid;
    grid-template-columns: minmax(300px, 0.9fr) minmax(0, 1.1fr);
    gap: 14px;
    align-items: start;
    min-width: 0;
  }
  .panel {
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
  }
  .panel header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    min-height: 30px;
    margin-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
  }
  .sub {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .sub strong {
    color: var(--text-primary);
  }
  .collection {
    margin-left: auto;
    min-width: 160px;
  }
  .pool-list {
    max-height: min(62dvh, 640px);
    overflow: auto;
    margin: 0 -6px;
    padding: 0 6px;
    scrollbar-gutter: stable;
  }
  .against header :global(.segments) {
    margin-left: auto;
  }

  .field-picks {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 4px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: 34px;
    padding: 3px 8px 3px 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .pick span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pick small {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent-primary);
  }
  .pick.on {
    border-color: color-mix(in srgb, var(--accent-primary) 45%, transparent);
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
  }
  .pick:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .side {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .run {
    --control-height: 38px;
    display: flex;
    align-items: end;
    gap: 10px;
  }
  .samples {
    width: 120px;
  }
  .samples :global(label) {
    font-size: 12px;
  }
  .cost {
    flex: 1;
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .cost strong {
    color: var(--text-primary);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .warn {
    color: var(--accent-warning);
  }
  .run :global(.ui-button) {
    min-height: 38px;
  }
  .blocked {
    margin: -4px 0 0;
    font-size: 12px;
    color: var(--accent-warning);
    text-align: right;
  }
  .progress {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .progress progress {
    flex: 1;
    height: 8px;
    accent-color: var(--accent-primary);
  }
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .note.bad {
    color: var(--accent-error);
  }
  .failures {
    font-size: 12px;
    color: var(--accent-warning);
  }
  .failures summary {
    cursor: pointer;
  }
  .failures p {
    margin: 4px 0 0;
    color: var(--text-secondary);
  }
  .results {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .answer,
  .idle {
    display: grid;
    gap: 6px;
    justify-items: start;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
  }
  .answer {
    border-color: color-mix(in srgb, var(--accent-success) 40%, var(--border-subtle));
  }
  .answer p,
  .idle p {
    margin: 0;
  }
  .label {
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .lineup {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .lineup li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 650;
  }
  .headline {
    font-size: 15px;
    color: var(--text-secondary);
  }
  .headline strong {
    font-size: 24px;
    font-weight: 700;
    color: var(--accent-success);
    font-variant-numeric: tabular-nums;
  }
  .headline span {
    font-size: 12px;
  }
  .idle .headline {
    font-size: 16px;
    font-weight: 650;
    color: var(--text-primary);
  }
  .detail {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .stale-note {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 12px;
    color: var(--accent-warning);
  }
  .stale .lineup,
  .stale .headline,
  .stale .detail,
  .stale .others {
    opacity: 0.5;
  }
  h4 {
    margin: 4px 0 0;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .others {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .others li {
    display: grid;
    grid-template-columns: 22px auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
  }
  .place {
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .faces {
    display: flex;
    gap: 2px;
  }
  .names {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rate {
    display: grid;
    justify-items: end;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .rate small {
    font-size: 10px;
    color: var(--text-secondary);
  }
  @media (max-width: 900px) {
    .team-search {
      grid-template-columns: minmax(0, 1fr);
    }
    .pool-list {
      max-height: 44dvh;
    }
  }
  @media (max-width: 560px) {
    .run {
      flex-wrap: wrap;
    }
    .cost {
      margin-bottom: 12px;
    }
    .run :global(.ui-button) {
      width: 100%;
      min-height: 44px;
    }
    .others li {
      grid-template-columns: 18px auto minmax(0, 1fr) auto;
    }
    .others li :global(.ui-button) {
      grid-column: 2 / -1;
      justify-self: end;
    }
    .names {
      white-space: normal;
    }
  }
</style>
