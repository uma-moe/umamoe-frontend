<script lang="ts">
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { lastSpurtResult, raceMetricHelp } from '@/lib/race/capture/race-diagnostics';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { portrait, stats } from '@/pages/competitive/analysis-view';
  import DataTable from '@/components/data/DataTable.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import LastSpurtResult from './LastSpurtResult.svelte';
  import { n, raceResultRows } from './replay-results';

  let {
    capture,
    selectedIndex,
    oninspect
  }: { capture: ParsedRaceCapture; selectedIndex?: number; oninspect: (index: number) => void } =
    $props();

  let catalog = $state.raw(new Map<number, SkillData>());

  onMount(() => {
    void loadSkills()
      .then((v) => (catalog = v))
      .catch(() => {});
  });

  const rows = $derived(raceResultRows(capture, catalog));
  const hasModes = $derived(
    rows.some(
      (row) =>
        typeof row.duel === 'number' ||
        typeof row.downhill === 'number' ||
        typeof row.paceUp === 'number'
    )
  );

  const hasLoss = $derived(rows.some((row) => typeof row.loss === 'number'));
  const hasIncidents = $derived(
    rows.some((row) => typeof row.blocked === 'number' || typeof row.rushed === 'number')
  );

  function inspect(id: number) {
    oninspect(id);
  }
</script>

<section
  class="results"
  aria-label="Detailed race results"
>
  <header>
    <div class="results-title">
      <h2>Race results</h2>
      <InspectPopover label="Reading race results">
        {#snippet trigger()}
          <span class="help">
            <Icon
              name="info"
              size={15}
            />
          </span>
        {/snippet}
        <h3>Reading race results</h3>
        <p>
          Compare finish times, the gap to the previous finisher, last-spurt delay, selected speed
          and remaining HP. Delayed spurts and speed reductions are highlighted. Delay is measured
          from the first spurt check; a speed reduction compares the selected speed with the
          full-spurt target. Select a runner to inspect their race below.
        </p>
        <p>
          Start delay, build stats and starting HP are shown for each runner. Mode durations,
          rushing and course loss appear when the capture includes those measurements. Missing
          measurements are not treated as zero.
        </p>
      </InspectPopover>
    </div>
  </header>
  <div class="results-context">
    <span>Select one of {capture.runners.length} runners to inspect their race</span>
    {#if !hasModes && !hasLoss && !hasIncidents}
      <span>Recorded results (additional telemetry requires detailed simulation)</span>
    {/if}
  </div>
  <DataTable
    columnHelp={raceMetricHelp}
    plain
    compact
    caption="Race results"
    {rows}
    rowKey="id"
    onrowclick={(row) => inspect(Number(row.id))}
    columns={[
      { key: 'place', label: 'Finish', numeric: true },
      { key: 'name', label: 'Runner' },
      { key: 'time', label: 'Time / gap', numeric: true },
      { key: 'delay', label: 'Start delay', numeric: true },
      { key: 'spurt', label: 'Spurt delay', numeric: true },
      { key: 'hp', label: 'HP result', numeric: true },
      ...(hasModes
        ? [{ key: 'duel', label: 'Race modes (s)', numeric: true, sortable: false }]
        : []),
      ...(hasLoss ? [{ key: 'loss', label: 'Course loss (m)', numeric: true }] : []),
      ...(hasIncidents
        ? [{ key: 'blocked', label: 'Incidents (s)', numeric: true, sortable: false }]
        : []),
      { key: 'sp', label: 'Build', numeric: true, sortable: false }
    ]}
  >
    {#snippet cell(row, col)}
      {@const r = capture.runners.find((r) => r.index === Number(row.id))!}
      {#if col.key === 'name'}
        <button
          class="runner-name"
          class:focused={selectedIndex === r.index}
          aria-label={'Inspect ' + r.name}
          aria-pressed={selectedIndex === r.index}
          onclick={() => inspect(r.index)}
        >
          <Artwork
            src={portrait(r.cardId)}
            alt=""
            size="xs"
          />
          <span>
            <strong>{r.name}</strong>
            <small>Gate {row.gate}, {row.style}</small>
          </span>
          <Icon
            name="arrow-right"
            size={14}
          />
        </button>
      {:else if col.key === 'place'}
        <strong
          class="finish"
          class:winner={row.place === 1}
        >
          {row.place}
        </strong>
      {:else if col.key === 'time'}
        <strong class="finish-time">
          {formatRaceTime(typeof row.time === 'number' ? row.time : undefined)}
        </strong>
        <small>
          {#if row.place === 1}
            Winner
          {:else if row.gap !== '—'}
            +{n(row.gap, 1)} m
            <span class="gap-context">to previous</span>
          {/if}
        </small>
      {:else if col.key === 'delay'}
        <span class:warning={row.late === 'Late start' || row.late === 'Lost acceleration frame'}>
          {typeof row.delay === 'number' ? n(row.delay, 1) + ' ms' : '—'}
        </span>
        {#if row.late === 'Late start' || row.late === 'Lost acceleration frame'}
          <small class="warning">
            {row.late}
          </small>
        {/if}
      {:else if col.key === 'spurt'}
        <LastSpurtResult result={lastSpurtResult(capture, r.index)} />
      {:else if col.key === 'hp'}
        <span class:warning={typeof row.exhausted === 'number'}>
          {typeof row.exhausted === 'number'
            ? 'Empty at ' + n(row.exhausted, 0) + ' m'
            : typeof row.hp === 'number'
              ? n(row.hp, 0) + ' HP left'
              : '—'}
        </span>
        {#if typeof row.startHp === 'number'}
          <small>
            Started with {n(row.startHp, 0)} HP{#if typeof row.deficit === 'number' && row.deficit > 0}
              ,
              {n(row.deficit, 0)} short
            {/if}
          </small>
        {/if}
      {:else if col.key === 'duel'}
        <span class="mode-value">
          <span>Duel</span>
          <b>{n(row.duel)}</b>
        </span>
        <span
          class="mode-value"
          title={'Downhill before late race: ' +
            (typeof row.downhill === 'number' && typeof row.downhillLate === 'number'
              ? n(row.downhill - row.downhillLate)
              : '—') +
            ' s'}
        >
          <span>Downhill</span>
          <b>
            {n(row.downhill)}
            <small class="inline">({n(row.downhillLate)} late)</small>
          </b>
        </span>
        <span class="mode-value">
          <span>Pace ↑ / ↓</span>
          <b>{n(row.paceUp)} / {n(row.paceDown)}</b>
        </span>
      {:else if col.key === 'blocked'}
        <span class="mode-value">
          <span>Blocked</span>
          <b>{n(row.blocked)}</b>
        </span>
        <span class="mode-value">
          <span>Rushed</span>
          <b>{n(row.rushed)}</b>
        </span>
      {:else if col.key === 'sp'}
        <div class="build-cell">
          <div class="result-stats">
            <StatStrip
              items={stats(r)}
              label={r.name + ' build stats'}
              presentation="values"
              compact
            />
          </div>
          <small>
            {#if typeof row.sp === 'number'}
              {Number(row.sp).toLocaleString()} SP
            {/if}{#if typeof row.popularity === 'number'}
              (Popularity {row.popularity})
            {/if}
          </small>
        </div>
      {:else}
        {typeof row[col.key] === 'number' &&
        ['duel', 'downhill', 'loss', 'blocked', 'rushed'].includes(col.key)
          ? n(row[col.key])
          : row[col.key]}
      {/if}
    {/snippet}
  </DataTable>
</section>

<style>
  @import './replay-results.css';
</style>
