<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { raceMetricHelp, type HorseDiagnostics } from '@/lib/race/capture/race-diagnostics';
  import Button from '@/components/controls/Button.svelte';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import PlotZoomControls from '@/components/charts/PlotZoomControls.svelte';
  import { chartTooltipContent, chartTooltipStyle } from '@/components/charts/chart-tooltip';
  import { PlotZoom, type PlotArea } from '@/components/charts/plot-zoom.svelte';
  import { theme } from '@/stores/theme';
  import SeekTimeButton from '../SeekTimeButton.svelte';
  import DiagnosticsRunnerReference from '../DiagnosticsRunnerReference.svelte';
  import {
    display,
    modePeriods,
    modeRows,
    modeTone,
    runnerName,
    seekRow,
    seekTimeLabel,
    timeLabel,
    type ModePeriod
  } from '../diagnostics-format';
  import { phaseSpans, placement, timeTicks } from './race-behaviour-chart';

  let {
    capture,
    index,
    horse,
    distance,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    horse: HorseDiagnostics | undefined;
    /** The race distance, where the chart's phase bands come from. */
    distance: number;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();

  const columns: TableColumn[] = [
    {
      key: 'time',
      label: 'First',
      helpKey: 'First (s)',
      numeric: true,
      sortable: false,
      priority: 'secondary'
    },
    { key: 'mode', label: 'Mode', sortable: false },
    {
      key: 'duration',
      label: 'Active time',
      helpKey: 'Active time (s)',
      numeric: true,
      sortable: false
    },
    { key: 'when', label: 'When', sortable: false }
  ];

  // A generous estimate of the axis font's width per character, so a phase name never runs past its band.
  const phaseLabelCharWidth = 5;
  const phaseLabelPadding = 4;

  const toneColors = {
    good: 'var(--accent-success)',
    bad: 'var(--accent-error)',
    neutral: 'var(--text-secondary)'
  };

  const zoom = new PlotZoom({ x: true, y: false });

  let chart = $state<HTMLElement>();
  let axisWidth = $state(0);
  let expanded = $state<string[]>([]);
  let hovered = $state<{ period: ModePeriod; left: number; top: number; flip: boolean }>();

  const periods = $derived(modePeriods(capture, horse, index));

  const periodsByMode = $derived.by(() => {
    const grouped = new Map<string, ModePeriod[]>();

    for (const period of periods) {
      const modeList = grouped.get(period.key);
      if (modeList === undefined) grouped.set(period.key, [period]);
      else modeList.push(period);
    }

    return grouped;
  });

  // An expanded mode is followed by one row per occurrence; `occurrence` 0 marks the mode's own row.
  const rows = $derived(
    modeRows(periods).flatMap((row) => {
      const modeRow = { ...row, key: row.id, occurrence: 0 };
      if (!expanded.includes(row.id)) return [modeRow];

      const occurrenceRows = (periodsByMode.get(row.id) ?? []).map((period, position) => ({
        id: period.id,
        key: row.id,
        mode: row.mode,
        duration: period.duration,
        periods: 1,
        time: period.time,
        occurrence: position + 1
      }));
      return [modeRow, ...occurrenceRows];
    })
  );

  const raceEnd = $derived(
    Math.max(
      capture.frames.at(-1)?.time ?? 0,
      ...periods.map((period) => period.time + period.duration)
    )
  );

  const view = $derived(zoom.visible('x', 0, raceEnd));
  // A time label needs about 56 px, so a narrow chart steps its ticks further apart.
  const ticks = $derived(
    timeTicks(view.min, view.max, Math.min(6, Math.max(2, Math.floor(axisWidth / 56))))
  );
  const phases = $derived(phaseSpans({ capture, index, distance, raceEnd }));
  const tooltipStyle = $derived(chartTooltipStyle($theme === 'dark'));

  const share = (time: number) => (time - view.min) / (view.max - view.min);
  const percent = (time: number) => share(time) * 100 + '%';

  /** Whether a phase name fits over its band; a band too narrow for it is named by its colour alone. */
  const phaseLabelFits = (label: string, bandPercent: number) =>
    (bandPercent / 100) * axisWidth >= label.length * phaseLabelCharWidth + phaseLabelPadding;

  /** The chart column inside the table, read from the first lane so the other columns can size freely. */
  function plotArea(): PlotArea {
    const lane = chart?.querySelector('.lane');
    if (!chart || !lane) return { left: 0, right: 1, top: 0, bottom: 1 };

    const bounds = chart.getBoundingClientRect();
    const laneBounds = lane.getBoundingClientRect();
    return {
      left: laneBounds.left - bounds.left,
      right: laneBounds.right - bounds.left,
      top: 0,
      bottom: bounds.height
    };
  }

  function toggle(key: string) {
    expanded = expanded.includes(key)
      ? expanded.filter((open) => open !== key)
      : [...expanded, key];
  }

  /** The periods a row draws: every occurrence of its mode, or the one occurrence it lists. */
  function rowPeriods(key: string, occurrence: number): ModePeriod[] {
    const modeList = periodsByMode.get(key) ?? [];
    if (occurrence === 0) return modeList;

    const period = modeList[occurrence - 1];
    return period === undefined ? [] : [period];
  }

  function showPeriod(period: ModePeriod, target: HTMLElement) {
    const bounds = target.getBoundingClientRect();
    const centre = bounds.left + bounds.width / 2;

    hovered = { period, left: centre, top: bounds.top, flip: centre > window.innerWidth / 2 };
  }

  function periodTooltip(period: ModePeriod) {
    const tooltipRows = [
      {
        label: 'Duration',
        value: period.duration.toFixed(2) + ' s',
        color: toneColors[modeTone(period.key)]
      },
      { label: 'Start', value: seekTimeLabel(period.time) },
      { label: 'End', value: seekTimeLabel(period.time + period.duration) }
    ];

    if (period.phase !== '—')
      tooltipRows.push({ label: 'Phase', value: String(display(period.phase, 'phase')) });
    if (period.blockerHorseIndex >= 0)
      tooltipRows.push({
        label: 'Blocked by',
        value: runnerName(capture, period.blockerHorseIndex)
      });

    return chartTooltipContent(period.mode, tooltipRows);
  }
</script>

<svelte:window onscroll={() => (hovered = undefined)} />

<section
  class="report-block report-card race-behaviour"
  aria-label="Runner race modes"
>
  <header class="section-heading">
    <h3>Race behaviour</h3>
    {#if periods.length}
      <PlotZoomControls
        {zoom}
        hint={false}
      />
    {/if}
  </header>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The chart column takes keyboard zoom and pan.) -->
  <div
    bind:this={chart}
    class="behaviour-chart"
    class:zoomed={zoom.zoomed}
    role="group"
    tabindex="0"
    aria-label="Race modes over the race. Plus and minus zoom, arrow keys pan, Home resets."
    {@attach zoom.gestures(plotArea)}
  >
    <DataTable
      columnHelp={raceMetricHelp}
      plain
      compact
      caption="Race modes"
      {rows}
      {columns}
      rowKey="id"
      pinnedColumns={0}
      emptyMessage="No race modes recorded."
      onrowclick={(row) => seekRow(row, onseek)}
    >
      {#snippet columnHeader(column)}
        {#if column.key === 'when'}
          <div
            class="axis"
            bind:clientWidth={axisWidth}
            aria-hidden="true"
          >
            {#each phases as phase (phase.label)}
              {@const band = placement(phase.start, phase.end, view)}
              {#if band && phaseLabelFits(phase.label, band.width)}
                <span
                  class="phase-label"
                  style:left={band.left + '%'}
                  style:max-width={band.width + '%'}
                >
                  {phase.label}
                </span>
              {/if}
            {/each}
            {#each ticks as tick (tick)}
              <span
                class="tick-label"
                class:at-start={share(tick) < 0.04}
                class:at-end={share(tick) > 0.96}
                style:left={percent(tick)}
              >
                {timeLabel(tick)}
              </span>
            {/each}
          </div>
        {/if}
      {/snippet}
      {#snippet cell(row, column)}
        {@const key = String(row.key)}
        {@const occurrence = Number(row.occurrence)}
        {@const tone = modeTone(key)}
        {#if column.key === 'time'}
          <SeekTimeButton
            time={Number(row.time)}
            {onseek}
          />
        {:else if column.key === 'mode' && occurrence > 0}
          {@const period = rowPeriods(key, occurrence)[0]}
          <span class="occurrence">
            {#if period && period.blockerHorseIndex >= 0}
              <DiagnosticsRunnerReference
                {capture}
                {index}
                value={period.blockerHorseIndex}
                {onselect}
              />
            {:else if period && period.phase !== '—'}
              {display(period.phase, 'phase')}
            {:else}
              Occurrence {occurrence}
            {/if}
          </span>
        {:else if column.key === 'mode'}
          {@const open = expanded.includes(key)}
          <span class="mode">
            <span class="mode-name">{row.mode}</span>
            {#if Number(row.periods) > 1}
              <span
                class="occurrence-toggle"
                class:open
              >
                <Button
                  variant="secondary"
                  size="sm"
                  icon="chevron"
                  ariaLabel={'Show ' + row.mode + ' occurrences'}
                  ariaExpanded={open}
                  onclick={() => toggle(key)}
                >
                  ×{row.periods}
                </Button>
              </span>
            {/if}
          </span>
        {:else if column.key === 'duration'}
          <span
            class="duration"
            class:occurrence-duration={occurrence > 0}
            class:good={tone === 'good'}
            class:bad={tone === 'bad'}
          >
            {Number(row.duration).toFixed(2)} s
          </span>
        {:else if column.key === 'when'}
          <div
            class="lane"
            role="group"
            aria-label={occurrence > 0
              ? row.mode + ' occurrence ' + occurrence
              : row.mode + ' periods'}
          >
            {#each phases as phase (phase.label)}
              {@const band = placement(phase.start, phase.end, view)}
              {#if band}
                <i
                  class="phase-band"
                  style:left={band.left + '%'}
                  style:width={band.width + '%'}
                  style:--phase-color={phase.color}
                ></i>
              {/if}
            {/each}
            {#each ticks as tick (tick)}
              <i
                class="grid-line"
                style:left={percent(tick)}
              ></i>
            {/each}
            {#each rowPeriods(key, occurrence) as period (period.id)}
              {@const bar = placement(period.time, period.time + period.duration, view)}
              {#if bar}
                <button
                  class="period"
                  type="button"
                  style:left={bar.left + '%'}
                  style:width={bar.width + '%'}
                  style:--period-color={toneColors[tone]}
                  aria-label={'Review ' +
                    period.mode +
                    ' from ' +
                    seekTimeLabel(period.time) +
                    ', ' +
                    period.duration.toFixed(2) +
                    ' s'}
                  onclick={() => onseek(period.time)}
                  onpointerenter={(event) => showPeriod(period, event.currentTarget)}
                  onpointerleave={() => (hovered = undefined)}
                  onfocus={(event) => showPeriod(period, event.currentTarget)}
                  onblur={() => (hovered = undefined)}
                ></button>
              {/if}
            {/each}
          </div>
        {/if}
      {/snippet}
    </DataTable>
  </div>
</section>

{#if hovered}
  <div
    class="period-tooltip"
    class:flip={hovered.flip}
    style:left={hovered.left + 'px'}
    style:top={hovered.top + 'px'}
    style:background-color={tooltipStyle.backgroundColor}
    style:border-color={tooltipStyle.borderColor}
    style:color={tooltipStyle.textStyle.color}
    aria-hidden="true"
  >
    <!-- The markup escapes every label and value. -->
    {@html periodTooltip(hovered.period)}
  </div>
{/if}

<style>
  @import '../diagnostics-section.css';
  @import '../report-card.css';
  @import './report-section.css';
  @import './race-behaviour.css';
</style>
