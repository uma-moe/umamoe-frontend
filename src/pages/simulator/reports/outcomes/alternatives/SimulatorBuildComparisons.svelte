<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorUmaEditor from '../../../setup/runner/editor/SimulatorUmaEditor.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import ReportRunnerPicker from '../../ReportRunnerPicker.svelte';
  import RunnerStatline from '../../RunnerStatline.svelte';
  import RunnerRaceAptitudes from '../../RunnerRaceAptitudes.svelte';
  import SimulatorRunnerFace from '../../SimulatorRunnerFace.svelte';
  import { buildFieldRunners, type MonteCarloInput } from '../../../requests/race-sim-request';
  import { simulatorRepository, type MonteCarloResult } from '../../../simulator-repository';
  import { compareOutcomes, reportNumber as n } from '../../simulation-report';
  import {
    finishSecondsToLengths,
    runnerOutcome,
    signedLengths,
    signedSeconds,
    type MarginUnit
  } from '../../simulation-comparison';
  import { buildChanges, isSameBuild } from './build-changes';
  import type { SimulatorUma } from '../../../simulator-uma';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';

  interface Alternative {
    /** The runner whose build this replaces. */
    source: number;
    uma: SimulatorUma;
    outcome?: ReturnType<typeof compareOutcomes>;
  }

  let {
    input,
    result,
    umas,
    sources,
    course,
    distance,
    unit = 'lengths',
    source = $bindable()
  }: {
    input: MonteCarloInput;
    result: MonteCarloResult;
    umas: SimulatorUma[];
    /** The runners whose builds can be tried, as tabs. */
    sources: number[];
    /** The course the batch ran on: it decides which aptitudes count. */
    course?: RaceCourse;
    distance: number;
    unit?: MarginUnit;
    /** The runner the report follows; picking a tab here follows her everywhere. */
    source?: number;
  } = $props();

  const MAX_ALTERNATIVES = 3;

  let alternatives = $state<Alternative[]>([]),
    editing = $state<SimulatorUma>(),
    editingIndex = $state(-1),
    editingSource = 0,
    open = $state(false),
    busy = $state(false),
    error = $state('');

  let request: AbortController | undefined;
  onDestroy(() => request?.abort());

  const active = $derived(source !== undefined && sources.includes(source) ? source : sources[0]!);
  const current = $derived(umas[active]!);
  const baseline = $derived(runnerOutcome(result, active));
  const rows = $derived(alternatives.filter((row) => row.source === active));

  // Only a clear gain earns the tag: with a single compared build there is nothing to rank.
  const best = $derived.by(() => {
    const compared = rows.flatMap((row) => (row.outcome ? [{ row, mean: row.outcome.mean }] : []));
    if (compared.length < 2) return undefined;

    const top = compared.reduce((a, b) => (b.mean > a.mean ? b : a));
    return top.mean > 0 ? top.row : undefined;
  });

  const alternativeBadge = (runner: number) => {
    const count = alternatives.filter((row) => row.source === runner).length;
    return count
      ? { badge: String(count), title: count + ' alternative build' + (count === 1 ? '' : 's') }
      : undefined;
  };

  const pct = (value: number | null | undefined) =>
    value == null ? '—' : n(value, value >= 10 || value === 0 ? 0 : 1) + '%';

  /** A percentage-point change; ± marks no change, as the report's margins do. */
  function points(value: number) {
    const rounded = Number(value.toFixed(1));
    if (rounded === 0) return '±0 pp';
    return (rounded > 0 ? '+' : '−') + Math.abs(rounded).toFixed(1) + ' pp';
  }

  const tone = (value: number | undefined) => {
    if (value === undefined || Math.abs(value) < 0.05) return '';
    return value > 0 ? 'good' : 'bad';
  };

  /** Time gained against the current build, in the report's leading unit. */
  function gained(seconds: number, digits = 2) {
    if (unit === 'seconds') return signedSeconds(seconds, digits + 1);
    return signedLengths(finishSecondsToLengths(result, active, seconds, distance), digits);
  }

  function add() {
    editingSource = active;
    editing = structuredClone($state.snapshot(current));
    editing.name = nextAlternativeName();
    editingIndex = -1;
    open = true;
  }

  // The runner's tab already names her, so alternatives only need telling apart.
  function nextAlternativeName() {
    const names = new Set(rows.map((row) => row.uma.name));
    let number = rows.length + 1;
    while (names.has('Alternative ' + number)) number++;
    return 'Alternative ' + number;
  }

  function edit(row: Alternative, index: number) {
    editing = row.uma;
    editingIndex = index;
    editingSource = row.source;
    open = true;
  }

  function save(uma: SimulatorUma) {
    if (editingIndex < 0) alternatives = [...alternatives, { source: editingSource, uma }];
    else
      alternatives = alternatives.map((row, i) =>
        i === editingIndex ? { ...row, uma, outcome: undefined } : row
      );
  }

  async function run() {
    if (!rows.length || busy) return;
    busy = true;
    error = '';
    const snapshot = active,
      variants = [...rows];

    request?.abort();
    request = new AbortController();
    try {
      const response = await simulatorRepository.comparison({
        body: {
          input,
          seeds: result.seeds,
          source_input_index: snapshot,
          alternatives: variants.map(({ uma }) => ({
            name: uma.name,
            runner: buildFieldRunners(umas.map((u, i) => (i === snapshot ? uma : u)))[snapshot]
          }))
        },
        signal: request.signal
      });

      const measured = response.result.alternatives.map(([, value]) =>
        compareOutcomes(result, value, snapshot)
      );

      alternatives = alternatives.map((row) => {
        const at = variants.indexOf(row);
        return at < 0 ? row : { ...row, outcome: measured[at] };
      });
    } catch (reason) {
      if (!request.signal.aborted)
        error = reason instanceof Error ? reason.message : 'Could not compare builds.';
    } finally {
      busy = false;
    }
  }
</script>

<ChartFrame
  id="simulation-build-comparison"
  title={'Try a different build · ' + current.name}
  description={'Change ' +
    current.name +
    '’s stats, aptitudes, style or skills and rerun the exact same races: opponents, gates, conditions and seeds stay fixed, so the difference comes from the build. Each row shows the stats and the three aptitudes this race applies, with changes from the current build highlighted. Gained is how far ahead of her current build the alternative finishes on average, with its 95% range; wins and full spurt show the change in percentage points and the current and alternative rate. Native random draws can diverge once a build changes, so small differences are noise.'}
>
  {#snippet actions()}<Button
      size="sm"
      variant="secondary"
      icon="add"
      disabled={rows.length >= MAX_ALTERNATIVES || busy}
      onclick={add}
    >
      Add alternative
    </Button>{#if rows.length}<Button
        size="sm"
        loading={busy}
        onclick={run}
      >
        Compare {rows.length} build{rows.length === 1 ? '' : 's'}
      </Button>{/if}{#if busy}<Button
        size="sm"
        variant="ghost"
        onclick={() => request?.abort()}
      >
        Cancel
      </Button>{/if}{/snippet}
  {#if sources.length > 1}
    <ReportRunnerPicker
      label="Runner for alternative builds"
      {sources}
      {active}
      {umas}
      summary={alternativeBadge}
      onselect={(runner) => (source = runner)}
    />
  {/if}
  {#if error}
    <p
      role="alert"
      class="note"
    >
      {error}
    </p>
  {/if}
  <section
    class="current-build"
    aria-label={current.name + '’s current build'}
  >
    <span class="who">
      <SimulatorRunnerFace
        cardId={current.cardId}
        size={30}
      />
      <span>
        <small>Current build</small>
        <strong>{current.name}</strong>
      </span>
    </span>
    <RunnerStatline
      uma={current}
      aligned
    />
    <RunnerRaceAptitudes
      uma={current}
      {course}
    />
    <span class="muted">{current.skills.length} skills</span>
    <dl class="baseline">
      <div>
        <dt>Wins</dt>
        <dd>{pct(baseline.winRate)}</dd>
      </div>
      <div>
        <dt>Full spurt</dt>
        <dd>{pct(baseline.fullSpurtRate)}</dd>
      </div>
    </dl>
  </section>
  {#if rows.length}
    <table aria-label={'Alternative builds for ' + current.name}>
      <thead>
        <tr>
          <th
            scope="col"
            class="name"
          >
            Build
          </th>
          <th
            scope="col"
            class="stats"
          >
            Stats
          </th>
          <th
            scope="col"
            class="aptitudes"
          >
            Aptitudes
          </th>
          <th
            scope="col"
            class="skills"
          >
            Skills
          </th>
          <th
            scope="col"
            class="metric"
            title="How far ahead of the current build the alternative finishes on average"
          >
            Gained
          </th>
          <th
            scope="col"
            class="metric"
          >
            Wins
          </th>
          <th
            scope="col"
            class="metric"
          >
            Full spurt
          </th>
          <th
            scope="col"
            class="row-actions"
          >
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each alternatives as row, index (row.uma.id + ':' + index)}
          {#if row.source === active}
            {@const changes = buildChanges(current, row.uma, course)}
            <tr>
              <th
                scope="row"
                class="name"
              >
                <span class="label">
                  {row.uma.name}
                  {#if row === best}
                    <span class="best">Best</span>
                  {/if}
                </span>
              </th>
              <td class="stats">
                <RunnerStatline
                  uma={row.uma}
                  baseline={current}
                  aligned
                />
              </td>
              <td class="aptitudes">
                <RunnerRaceAptitudes
                  uma={row.uma}
                  {course}
                  baseline={current}
                />
              </td>
              <td class="skills">
                {#if changes.added.length || changes.removed.length}
                  <span class="skill-changes">
                    {#each changes.added as skill (skill.skillId)}
                      <span
                        class="skill added"
                        title="Added or changed"
                      >
                        <b>+</b>
                        <RaceSkill id={skill.skillId} />
                      </span>
                    {/each}
                    {#each changes.removed as skill (skill.skillId)}
                      <span
                        class="skill removed"
                        title="Removed"
                      >
                        <b>−</b>
                        <RaceSkill id={skill.skillId} />
                      </span>
                    {/each}
                  </span>
                {:else}
                  <span class="muted">
                    {isSameBuild(changes) ? 'Same build' : 'Same skills'}
                  </span>
                {/if}
              </td>
              {#if row.outcome}
                {@const outcome = row.outcome}
                <td
                  class={'metric ' + tone(outcome.mean)}
                  data-label="Gained"
                >
                  <strong>{gained(outcome.mean)}</strong>
                  <small>
                    {outcome.interval
                      ? gained(outcome.interval[0]) + ' to ' + gained(outcome.interval[1])
                      : outcome.count + ' races'}
                  </small>
                </td>
                <td
                  class={'metric ' + tone(outcome.winChange)}
                  data-label="Wins"
                >
                  <strong>{points(outcome.winChange)}</strong>
                  <small>{pct(outcome.wins.before)} → {pct(outcome.wins.after)}</small>
                </td>
                <td
                  class={'metric ' + tone(outcome.spurtChange)}
                  data-label="Full spurt"
                >
                  {#if outcome.fullSpurt && outcome.spurtChange !== undefined}
                    <strong>{points(outcome.spurtChange)}</strong>
                    <small>{pct(outcome.fullSpurt.before)} → {pct(outcome.fullSpurt.after)}</small>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>
              {:else}
                <td
                  class="metric pending"
                  colspan="3"
                >
                  <span class="muted">Not compared yet · press Compare</span>
                </td>
              {/if}
              <td class="row-actions">
                <div class="actions">
                  <IconButton
                    size="sm"
                    icon="edit"
                    label={'Edit ' + row.uma.name}
                    disabled={busy}
                    onclick={() => edit(row, index)}
                  />
                  <IconButton
                    size="sm"
                    icon="trash"
                    label={'Remove ' + row.uma.name}
                    disabled={busy}
                    onclick={() => (alternatives = alternatives.filter((_, at) => at !== index))}
                  />
                </div>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="note">
      Add an alternative to copy {current.name}’s build, change it, and compare it on the same {result.runs}
      races.
    </p>
  {/if}
</ChartFrame>
{#if editing}
  <SimulatorUmaEditor
    uma={editing}
    {course}
    bind:open
    onsave={save}
  />
{/if}

<style>
  @import './build-comparisons.css';
</style>
