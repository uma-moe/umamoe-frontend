<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
  import {
    diagnosticHorse,
    diagnosticLabel,
    frontBlockingSpans,
    lastSpurtResult,
    runnerHpResult,
    raceMetricHelp
  } from '@/lib/race/race-diagnostics';
  import { raceRunnerKey } from '@/lib/race/multi-race-analysis';
  import { formatRaceTime, hpRemainingColor } from '@/lib/race/race-display';
  import DataTable from '@/components/data/DataTable.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import ProfileVeteranIdentity from '@/pages/profile/veterans/ProfileVeteranIdentity.svelte';
  import RunnerBuild from '../runners/RunnerBuild.svelte';
  import ReplayDiagnostics from '@/pages/race-analysis/ReplayDiagnostics.svelte';
  import LastSpurtResult from '@/pages/race-analysis/LastSpurtResult.svelte';
  import RunnerReference from '../runners/RunnerReference.svelte';
  import { identity, portrait } from '../analysis-view';
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

  const entries = $derived(
    captures.flatMap((capture, race) =>
      capture.runners.map((runner) => ({
        capture,
        race,
        runner,
        horse: diagnosticHorse(capture, runner.index),
        key: race + ':' + runner.index
      }))
    )
  );
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
  const outcomeRows = $derived(
    filtered.map((e) => {
      const h = e.horse,
        spurtResult = lastSpurtResult(e.capture, e.runner.index),
        hp = runnerHpResult(e.capture, e.runner.index);
      return {
        id: e.key,
        name: e.runner.name,
        race: e.race + 1,
        finish: e.runner.result?.finishOrder ?? '—',
        time: formatRaceTime(
          e.runner.result?.finishTimeRaw && e.runner.result.finishTimeRaw > 0
            ? e.runner.result.finishTimeRaw
            : e.runner.result?.finishTime
        ),
        hp: hp.finish ?? '—',
        percent: hp.percent ?? '—',
        spurt: spurtResult.delay ?? '—',
        loss: h?.worldTransformDistanceLoss ?? '—',
        start:
          e.runner.result?.startDelayTime !== undefined
            ? e.runner.result.startDelayTime * 1000
            : '—',
        delayed: Number(
          h?.lostStartAccelerationFrame === true ||
            (!!e.runner.result && (e.runner.result.startDelayTime ?? 0) >= 0.08)
        ),
        blocked: h?.frontBlockSpans?.reduce((sum, s) => sum + s.endTime - s.startTime, 0) ?? '—',
        source: h ? 'Detailed' : pending ? 'Processing' : 'Unavailable'
      };
    })
  );
  const modes = $derived.by(() => {
    const totals = new Map<
      string,
      {
        id: string;
        name: string;
        duration: number;
        periods: number;
        entries: Set<string>;
        traces: { race: number; runner: number; name: string; start: number; end: number }[];
      }
    >();
    for (const e of measured)
      for (const [key, flag] of Object.entries(e.capture.detailed?.annotations.flags ?? {})) {
        const spans = e.horse!.spans.filter((s) => (s.mask & flag) !== 0);
        if (!spans.length) continue;
        const row = totals.get(key) ?? {
          id: key,
          name: diagnosticLabel(key),
          duration: 0,
          periods: 0,
          entries: new Set(),
          traces: []
        };
        for (const span of spans) {
          row.duration += span.endTime - span.startTime;
          row.periods++;
          row.traces.push({
            race: e.race,
            runner: e.runner.index,
            name: e.runner.name,
            start: span.startTime,
            end: span.endTime
          });
        }
        row.entries.add(e.key);
        totals.set(key, row);
      }
    return [...totals.values()];
  });
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
    <Disclosure
      id={id + '-runner-details'}
      title={'Race ' + (selected.race + 1) + ': ' + selected.runner.name}
      description={selected.capture.fileName}
      compact
      bind:open={detailOpen}
    >
      <div class="selected-runner">
        <span>Gate {selected.runner.index + 1}</span>
        <div>
          {#if onbuild}
            <Button
              size="sm"
              variant="secondary"
              icon="clipboard"
              onclick={() => onbuild?.(selected.runner, selected.race)}
            >
              Build details
            </Button>
          {/if}<Button
            size="sm"
            variant="secondary"
            icon="race"
            disabled={!onreplay}
            onclick={() => onreplay?.(selected.race, selected.runner.index)}
          >
            Watch in replay
          </Button>
        </div>
      </div>
      <ReplayDiagnostics
        capture={selected.capture}
        index={selected.runner.index}
        {skillNames}
        distance={selected.capture.raceDistance ??
          Math.max(0, ...(selected.capture.frames.at(-1)?.horses.map((h) => h.distance) ?? []))}
        onseek={(time) => onreplay?.(selected.race, selected.runner.index, time)}
        onselect={(index) => {
          expanded = selected.race + ':' + index;
          detailOpen = true;
        }}
      >
        {#snippet overview()}
          <div class="selected-overview">
            <RunnerBuild
              runner={selected.runner}
              {skillNames}
              compact
              raceContext={{ distance: selected.capture.raceDistance }}
            />
          </div>
        {/snippet}
        {#snippet blocking()}
          <section class="session-blocking">
            <h4>Front blocking</h4>
            {#each frontBlockingSpans(selected.capture).filter((s) => s.horseIndex === selected.runner.index) as span}
              {@const blocker = selected.capture.runners.find(
                (r) => r.index === span.blockerHorseIndex
              )}
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!onreplay}
                  onclick={() => onreplay?.(selected.race, selected.runner.index, span.startTime)}
                >
                  {span.startTime.toFixed(3)} s ↗
                </Button>
                <span>Blocked by</span>
                {#if blocker}
                  <RunnerReference
                    name={blocker.name}
                    cardId={blocker.cardId}
                    compact
                  />
                {/if}
                <strong>{(span.endTime - span.startTime).toFixed(2)} s</strong>
              </div>
            {:else}
              <p>No front blocking recorded.</p>
            {/each}
          </section>
        {/snippet}
      </ReplayDiagnostics>
    </Disclosure>
  {/if}
</div>

<style>
  .session-diagnostics {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
  }
  .race-details {
    min-width: 0;
    border-top: 1px solid var(--border-subtle);
    padding-top: 12px;
  }
  .session-diagnostics > header,
  section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
  }
  header > :global(.field) {
    width: 240px;
    flex: none;
  }
  h3,
  h4,
  p {
    margin: 0;
  }
  h3 {
    font-size: 15px;
    font-weight: 650;
  }
  h4 {
    font-size: 13px;
  }
  h3 small {
    display: inline;
    margin-left: 6px;
  }
  p,
  small {
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  p {
    margin-top: 3px;
  }
  small {
    font-weight: 400;
  }
  .race-details > header {
    margin-bottom: 8px;
  }
  .session-diagnostics :global(table) {
    font-size: 12px;
  }
  .session-diagnostics :global(.compact th),
  .session-diagnostics :global(.compact td) {
    padding: 4px 8px;
  }
  .session-diagnostics :global(th),
  .session-diagnostics :global(.sort) {
    text-transform: none;
    letter-spacing: 0;
    font-size: 11px;
  }
  .runner-detail {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-primary);
    text-align: left;
    font: inherit;
    cursor: pointer;
  }
  .runner-detail :global(.veteran-identity) {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 7px;
  }
  .runner-detail :global(.portrait) {
    height: 40px;
  }
  .runner-detail :global(.identity) {
    gap: 3px;
  }
  .runner-detail :global(.identity h3) {
    font-size: 12px;
    white-space: normal;
  }
  .runner-detail :global(.scenario),
  .runner-detail :global(.race-style) {
    font-size: 10px;
  }
  .expand-icon {
    margin-left: auto;
    color: var(--accent-primary);
    transform: rotate(-90deg);
  }
  .expand-icon.open {
    transform: none;
  }
  .runner-detail[aria-expanded='true'] {
    color: var(--accent-primary);
  }
  .finish-hp {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    white-space: nowrap;
  }
  .finish-hp small {
    color: inherit;
    font-size: 10px;
  }
  .period-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .period-chevron {
    display: flex;
    align-items: center;
  }
  .period-chevron.open {
    transform: rotate(180deg);
  }
  .mode-periods {
    list-style: none;
    margin: 0;
    padding: 4px 8px;
    background: var(--surface-2);
    max-height: 220px;
    overflow: auto;
  }
  .mode-periods > li,
  .selected-runner,
  .session-blocking > div {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .mode-periods small,
  .session-blocking strong {
    margin-left: auto;
  }
  .selected-runner {
    justify-content: space-between;
    flex-wrap: wrap;
    margin: 4px 0 10px;
    color: var(--text-secondary);
  }
  .selected-runner > div {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .session-blocking h4 {
    margin-bottom: 4px;
  }
  .session-blocking strong {
    font-weight: 500;
  }
  .warning {
    color: var(--accent-warning);
  }
  .selected-overview {
    min-width: 0;
  }
  .selected-overview :global(.build) {
    display: grid;
    grid-template-columns: minmax(220px, 0.9fr) minmax(0, 1.8fr);
    align-items: center;
    gap: 20px;
  }
  .selected-overview :global(.build-identity) {
    padding: 0;
  }
  .selected-overview :global(.build-content) {
    padding: 0;
  }
  .selected-overview :global(.veteran-identity) {
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 10px;
  }
  .selected-overview :global(.portrait) {
    height: 52px;
  }
  .selected-overview :global(.identity h3) {
    font-size: 14px;
  }
  @media (max-width: 760px) {
    header > :global(.field) {
      width: 100%;
    }
    .mode-periods > li {
      flex-wrap: wrap;
      gap: 2px 8px;
    }
    .selected-overview :global(.build) {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    .selected-runner > div {
      margin-left: auto;
    }
  }
</style>
