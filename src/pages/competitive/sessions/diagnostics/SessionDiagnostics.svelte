<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
  import { lastSpurtResult, raceMetricHelp } from '@/lib/race/race-diagnostics';
  import { raceRunnerKey } from '@/lib/race/multi-race-analysis';
  import { hpRemainingColor } from '@/lib/race/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import LastSpurtResult from '@/pages/competitive/race-analysis/results/LastSpurtResult.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import SessionRunnerDiagnostics from './SessionRunnerDiagnostics.svelte';
  import { diagnosticEntries, diagnosticModes, outcomeRow } from './session-diagnostics';
  import { identity, portrait } from '../../analysis-view';
  import { theme } from '@/stores/theme';

  let {
    captures,
    skillNames,
    pending = false,
    onreplay,
    onbuild
  }: {
    captures: ParsedRaceCapture[];
    skillNames: Map<number, string>;
    pending?: boolean;
    onreplay?: (race: number, runner?: number, time?: number) => void;
    onbuild?: (runner: RaceRunner, race: number) => void;
  } = $props();

  let uma = $state('all'),
    expanded = $state(''),
    detailOpen = $state(true),
    mode = $state<string>();

  const id = $props.id();

  const entries = $derived(diagnosticEntries(captures));
  const choices = $derived(
    [...new Map(entries.map((e) => [raceRunnerKey(e.runner), e.runner])).entries()].map(
      ([value, runner]) => ({ value, label: runner.name, image: portrait(runner.cardId) })
    )
  );
  const filtered = $derived(
    entries.filter((e) => uma === 'all' || raceRunnerKey(e.runner) === uma)
  );
  const measured = $derived(filtered.filter((e) => e.horse));
  const selected = $derived(entries.find((e) => e.key === expanded));
  const outcomeRows = $derived(filtered.map((e) => outcomeRow(e, pending)));
  const modes = $derived(diagnosticModes(measured));
  const modeRows = $derived(
    modes.map((m) => ({
      id: m.id,
      name: m.name,
      mean: (m.duration / measured.length).toFixed(2),
      duration: m.duration.toFixed(2),
      entries: m.entries.size,
      periods: m.periods
    }))
  );

  $effect(() => {
    uma;
    expanded = '';
    mode = undefined;
  });

  function inspect(key: string) {
    expanded = expanded === key ? '' : key;
    detailOpen = true;
  }
</script>

<div
  class="session-diagnostics"
  aria-label="Detailed session analysis"
>
  <header>
    <div>
      <h3>
        Race behaviour <small>{measured.length} measured entries</small>
      </h3>
      <p>Averages include runners where the mode stayed inactive.</p>
    </div>
    <SelectField
      id={id + '-uma'}
      label="Diagnostic runner"
      options={[{ value: 'all', label: 'All runners' }, ...choices]}
      bind:value={uma}
    />
  </header>
  {#if measured.length}
    <DataTable
      columnHelp={raceMetricHelp}
      plain
      compact
      caption="Session race behaviour"
      rows={modeRows}
      rowKey="id"
      expandedRow={mode}
      columns={[
        { key: 'name', label: 'Mode' },
        { key: 'mean', label: 'Avg. active (s)', numeric: true },
        { key: 'duration', label: 'Total active (s)', numeric: true },
        { key: 'entries', label: 'Runners', numeric: true },
        { key: 'periods', label: 'Periods', numeric: true, sortable: false }
      ]}
    >
      {#snippet cell(row, column)}
        {#if column.key === 'periods'}
          <Button
            variant="ghost"
            size="sm"
            ariaExpanded={mode === row.id}
            ariaLabel={'Show session ' + row.name + ' periods'}
            onclick={() => (mode = mode === row.id ? undefined : String(row.id))}
          >
            <span class="period-label">
              {row.periods}
              <span
                class="period-chevron"
                class:open={mode === row.id}
              >
                <Icon
                  name="chevron"
                  size={12}
                />
              </span>
            </span>
          </Button>
        {:else}
          {row[column.key]}
        {/if}
      {/snippet}
      {#snippet rowDetail(row)}
        <ol class="mode-periods">
          {#each modes.find((m) => m.id === row.id)?.traces ?? [] as span}
            <li>
              <Button
                variant="ghost"
                size="sm"
                disabled={!onreplay}
                onclick={() => onreplay?.(span.race, span.runner, span.start)}
              >
                Race {span.race + 1}: {span.start.toFixed(3)}–{span.end.toFixed(3)} s ↗
              </Button><RunnerReference
                name={span.name}
                cardId={captures[span.race]?.runners.find((r) => r.index === span.runner)?.cardId}
                compact
              />
              <small>{(span.end - span.start).toFixed(2)} s</small>
            </li>
          {/each}
        </ol>
      {/snippet}
    </DataTable>
  {:else if pending}
    <p role="status">Preparing simulation details…</p>
  {:else}
    <p>
      Detailed simulation is unavailable for these runners. Recorded race results remain available
      below.
    </p>
  {/if}
  <section class="race-details">
    <header>
      <div>
        <h3>
          Detailed race results <small>{filtered.length} runner entries</small>
        </h3>
        <p>
          Expand a runner to inspect the same skills, HP changes, decisions and graphs as the
          single-race analysis.
        </p>
      </div>
    </header>
    <DataTable
      columnHelp={raceMetricHelp}
      plain
      compact
      caption="Session detailed race results"
      rows={outcomeRows}
      maxHeight={340}
      columns={[
        { key: 'name', label: 'Runner' },
        { key: 'race', label: 'Race', numeric: true },
        { key: 'finish', label: 'Finish', numeric: true },
        { key: 'time', label: 'Finish time', numeric: true },
        { key: 'hp', label: 'HP at finish', numeric: true },
        { key: 'spurt', label: 'Spurt delay', numeric: true },
        { key: 'loss', label: 'Course loss (m)', numeric: true },
        { key: 'start', label: 'Start delay (ms)', numeric: true },
        { key: 'blocked', label: 'Blocked (s)', numeric: true },
        ...(filtered.some((e) => !e.horse) ? [{ key: 'source', label: 'Simulation' }] : [])
      ]}
    >
      {#snippet cell(row, column)}
        {@const entry = entries.find((e) => e.key === row.id)!}
        {#if column.key === 'name'}
          <button
            class="runner-detail"
            aria-label={'Inspect race ' + row.race + ' ' + row.name + ' diagnostics'}
            aria-expanded={expanded === row.id}
            onclick={() => inspect(String(row.id))}
          >
            <ProfileVeteranIdentity summary={identity(entry.runner)} />
            <span
              class="expand-icon"
              class:open={expanded === row.id}
            >
              <Icon
                name="chevron"
                size={13}
              />
            </span>
          </button>
        {:else if column.key === 'hp'}
          <span
            class="finish-hp"
            style:color={hpRemainingColor(
              typeof row.percent === 'number' ? row.percent : undefined,
              $theme === 'dark'
            )}
          >
            {typeof row.hp === 'number'
              ? Math.round(row.hp).toLocaleString()
              : '—'}{#if typeof row.percent === 'number'}
              <small>
                ({row.percent.toFixed(1)}%)
              </small>
            {/if}
          </span>
        {:else if column.key === 'spurt'}
          <LastSpurtResult result={lastSpurtResult(entry.capture, entry.runner.index)} />
        {:else if column.key === 'start'}
          <span class:warning={row.delayed}>
            {typeof row.start === 'number' ? row.start.toFixed(1) : '—'}
          </span>
        {:else if typeof row[column.key] === 'number'}
          {Number(row[column.key]).toFixed(['loss', 'blocked'].includes(column.key) ? 2 : 0)}
        {:else}
          {row[column.key]}
        {/if}
      {/snippet}
    </DataTable>
  </section>
  {#if selected}
    <SessionRunnerDiagnostics
      id={id + '-runner-details'}
      {selected}
      {skillNames}
      bind:open={detailOpen}
      {onreplay}
      {onbuild}
      onrunner={(key) => (expanded = key)}
    />
  {/if}
</div>

<style>
  @import './session-diagnostics.css';
</style>
