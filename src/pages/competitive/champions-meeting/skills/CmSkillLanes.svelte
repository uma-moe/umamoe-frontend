<script lang="ts">
  import InfoBadge from '@/components/feedback/InfoBadge.svelte';
  import { onDestroy, untrack } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { pct, number } from '../cm-data';
  import { activationBins, centralActivationWindow, type SkillOverview } from '../cm-exploration';
  import { courseSegments, type Course } from '../../race-analysis/replay/replay-course';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';
  import { courseTerrain, slopeLabel } from '../../race-analysis/replay/replay-timeline';
  import { activationTiming, skillBucketMetrics, type BucketRange } from './cm-skill-analysis';
  import CmSkillBreakdown from './CmSkillBreakdown.svelte';
  import CmSkillComparisonReadout from './CmSkillComparisonReadout.svelte';
  import { comparisonLines } from './cm-skill-comparison';
  import type { CmSkillDetails } from './cm-skill-details.svelte';

  let {
    overview,
    style = 'all',
    selected = $bindable([]),
    removable = true,
    details,
    colors,
    skillName,
    aliases,
    onclose,
    course,
    courseLabel
  }: {
    overview: SkillOverview;
    style?: string;
    selected?: number[];
    removable?: boolean;
    details: CmSkillDetails;
    colors: Record<number, string>;
    skillName: (id: number) => string;
    aliases?: string;
    onclose?: () => void;
    course?: Course;
    courseLabel?: string;
  } = $props();

  const helpId = $props.id();

  let cursor = $state(50);
  let range = $state<BucketRange>();
  let anchor: number | undefined;
  let dragging = false;

  $effect(() => {
    overview.snapshotId;
    range = undefined;
  });

  $effect(() => {
    const ids = [...selected];
    untrack(() => {
      for (const id of ids) void details.load(id);
    });
  });

  const lanes = $derived(
    selected.map((id) => {
      const detail = details.values[id],
        bins = detail ? activationBins(detail, style) : Array<number>(100).fill(0);

      const peak = Math.max(1, ...bins);
      const bars = bins
        .map((count, bin) => {
          const height = (count / peak) * 74;
          return count > 0
            ? 'M' + (bin * 10 + 1) + ',' + (96 - height) + 'h8v' + height + 'h-8Z'
            : '';
        })
        .join('');

      return {
        id,
        detail,
        bins,
        peak,
        bars,
        total: bins.reduce((sum, n) => sum + n, 0),
        timing: activationTiming(bins, overview.courseDistance),
        window: detail ? centralActivationWindow(bins, detail.courseDistance) : undefined
      };
    })
  );

  const plottedLanes = $derived(removable ? lanes.slice(0, 1) : lanes);
  const lineData = $derived(comparisonLines(lanes));

  const distanceLabel = $derived(
    Math.round((cursor * overview.courseDistance) / 100) +
      '–' +
      Math.round(((cursor + 1) * overview.courseDistance) / 100) +
      ' m'
  );

  const cursorDescription = $derived(
    distanceLabel +
      ': ' +
      lanes
        .map((series) => {
          const label = removable ? skillName(series.id) + ' ' : '';
          if (!series.detail)
            return label + (details.errors[series.id] ? 'data unavailable' : 'loading');
          const count = series.bins[cursor] ?? 0;

          const relative = removable
            ? pct(count / series.peak) + ' of this skill’s peak'
            : pct(count / Math.max(1, series.total));
          return label + number(count) + ' events, ' + relative;
        })
        .join('; ')
  );

  const spurt = $derived(finalSpurtSection(overview.courseDistance));
  const slopes = $derived(course ? courseTerrain(course).slopes : []);
  const rangeLabel = $derived(
    range
      ? Math.round((range.start * overview.courseDistance) / 100) +
          '–' +
          Math.round(((range.end + 1) * overview.courseDistance) / 100) +
          ' m'
      : ''
  );

  // Race phases use 4, 12, 4, 4 of 24 course sections: https://github.com/jalbarrang/torena-sim/blob/main/docs/mechanics/README.md#phase-phase
  const phases = $derived([
    {
      label: 'Early race',
      short: 'Early',
      start: 0,
      end: overview.courseDistance / 6,
      color: 'var(--text-secondary)'
    },
    {
      label: 'Mid race',
      short: 'Mid',
      start: overview.courseDistance / 6,
      end: (overview.courseDistance * 2) / 3,
      color: 'var(--accent-primary)'
    },
    {
      label: 'Late race',
      short: 'Late',
      start: (overview.courseDistance * 2) / 3,
      end: (overview.courseDistance * 5) / 6,
      color: 'var(--accent-warning)'
    },
    {
      label: 'Final leg',
      short: 'Final',
      start: (overview.courseDistance * 5) / 6,
      end: overview.courseDistance,
      color: 'var(--accent-purple)'
    }
  ]);

  const segments = $derived.by(() => {
    const sections = courseSegments(course),
      first = sections[0];

    return first && first.start > 0
      ? [{ start: 0, end: first.start, label: 'Start section', color: '#8c939f' }, ...sections]
      : sections;
  });

  const cursorDistance = $derived(((cursor + 0.5) * overview.courseDistance) / 100);
  const currentPhase = $derived(
    phases.find((phase) => cursorDistance >= phase.start && cursorDistance < phase.end)?.label
  );

  const currentSegment = $derived(
    segments.find((segment) => cursorDistance >= segment.start && cursorDistance < segment.end)
      ?.label
  );

  const slope = $derived(
    course?.slopes.find((s) => cursorDistance >= s.start && cursorDistance < s.start + s.length)
      ?.slope ?? 0
  );

  const courseReading = $derived(
    [
      currentPhase,
      currentSegment,
      course
        ? slope
          ? (slope > 0 ? 'Uphill +' : 'Downhill ') + (slope / 10000).toFixed(1) + '%'
          : 'Level ground'
        : undefined
    ]
      .filter(Boolean)
      .join(' · ')
  );

  const sectionLabel = (label: string, start: number, end: number) =>
    label + ' · ' + number(Math.round(start)) + '–' + number(Math.round(end)) + ' m';

  function remove(id: number) {
    selected = selected.filter((value) => value !== id);
  }

  let frame = 0,
    clientX = 0,
    target: SVGSVGElement;

  function cancelPointer() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  onDestroy(cancelPointer);

  function inspectWithKeyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      clearRange();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    cancelPointer();
    const previous = cursor;
    cursor =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 99
          : Math.max(
              0,
              Math.min(99, cursor + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1))
            );
    if (event.shiftKey) {
      anchor ??= previous;
      range = { start: Math.min(anchor, cursor), end: Math.max(anchor, cursor) };
    } else {
      anchor = undefined;
    }
  }

  function clearRange() {
    cancelPointer();
    range = undefined;
    anchor = undefined;
    dragging = false;
  }

  function beginRange(event: PointerEvent) {
    if (event.button !== 0) return;
    cancelPointer();
    dragging = true;
    anchor = undefined;
    const chart = event.currentTarget;
    if (!(chart instanceof SVGSVGElement)) return;
    if (event.isTrusted) chart.setPointerCapture(event.pointerId);
    target = chart;
    clientX = event.clientX;
    readPointer();
    anchor = cursor;
  }

  function endRange() {
    if (frame) {
      cancelPointer();
      readPointer();
    }
    dragging = false;
    anchor = undefined;
  }

  function readPointer() {
    if (!target.isConnected) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width) return;
    cursor = Math.max(0, Math.min(99, Math.floor(((clientX - rect.left) / rect.width) * 100)));
    if (dragging && anchor !== undefined && cursor !== anchor) {
      range = { start: Math.min(anchor, cursor), end: Math.max(anchor, cursor) };
    }
  }

  function inspectDistance(event: PointerEvent) {
    const chart = event.currentTarget;
    if (!(chart instanceof SVGSVGElement)) return;

    target = chart;
    clientX = event.clientX;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      readPointer();
    });
  }
</script>

<section
  class="timing"
  class:comparison={removable}
>
  <span
    id={helpId}
    class="sr-only"
  >
    Hover or tap to inspect a distance. Use arrow keys, Home or End while focused. Drag or hold
    Shift with arrow keys to select a range; Escape clears it. {removable
      ? 'Each line is normalized to its own peak: the busiest distance bucket is 100%.'
      : 'Bars count all activations.'} Outcomes count each runner entry once, at its first activation.
  </span>
  <div
    class="lanes"
    aria-label={removable ? 'Skill activation comparison' : 'Skill activation lanes'}
  >
    {#each plottedLanes as lane}
      {@const reading = lane.detail
        ? skillBucketMetrics(lane.detail.styles, style, range ?? { start: cursor, end: cursor })
        : undefined}
      <section
        class="lane"
        style:--lane-color="var(--accent-primary)"
      >
        <div class="chart-heading">
          <div class="chart-identity">
            {#if !removable}
              <strong class="skill-title">{skillName(lane.id)}</strong>
              <span class="skill-variants">
                {#if aliases}{aliases} ·
                {/if}ID {lane.id}
              </span>
            {/if}
            {#if removable}
              <span class="event-count">Normalized activations · each skill’s peak = 100%</span>
            {:else}
              <span class="event-count">
                <strong>{details.values[lane.id] ? number(lane.total) : '—'}</strong>
                activation events
              </span>
            {/if}
          </div>
          <span class="course-name">
            {courseLabel ?? number(overview.courseDistance) + ' m course'}
          </span>
          <InspectPopover
            label="How to read activation distances"
            align="end"
          >
            {#snippet trigger()}<InfoBadge />{/snippet}
            {#if !removable}<div class="lane-reading">
                <span>
                  Mean / median <strong>
                    {lane.timing
                      ? '~' +
                        number(Math.round(lane.timing.mean)) +
                        ' / ~' +
                        number(Math.round(lane.timing.median)) +
                        ' m'
                      : '—'}
                  </strong>
                </span>
                <span>
                  Central 80% of events <strong>
                    {details.values[lane.id]
                      ? lane.window
                        ? lane.window.join('–') + ' m'
                        : 'No events'
                      : '—'}
                  </strong>
                </span>
              </div>{/if}
            <div class="activation-help">
              <h3>Activation distances</h3>
              <p>
                Hover or tap to inspect a bucket. Drag across the chart, or hold Shift with the
                arrow keys, to compare outcomes in a distance range. Escape clears the range.
              </p>
              <p>
                {FINAL_SPURT_HELP} The final leg is a separate boundary at the last sixth of the course.
              </p>
              <p>
                {removable
                  ? 'Each skill is scaled independently: its busiest distance bucket is 100%. This compares activation patterns regardless of event totals or how spread out the activations are. The table retains actual counts and outcome rates. Colour and dash patterns identify each skill.'
                  : 'Bars count every activation, including repeats, and scale to each skill’s peak.'}
                Outcome rates count each runner entry once, at its first activation. Mean and median distances
                are bucket estimates; the central 80% spans the 10th–90th percentile.
              </p>
            </div>
          </InspectPopover>
          {#if onclose}
            <IconButton
              icon="close"
              size="sm"
              label="Close skill details"
              onclick={onclose}
            />
          {/if}
        </div>
        <div class="chart-layout">
          <div class="distance-chart">
            <div class="chart-stack">
              <div
                class="spurt-band"
                style:left={(spurt.start / overview.courseDistance) * 100 + '%'}
                title={FINAL_SPURT_HELP}
              >
                <span class="spurt-label">
                  Late race · Final spurt from {number(Math.round(spurt.start))} m
                </span>
                <span
                  class="spurt-short"
                  aria-hidden="true"
                >
                  Late / Spurt
                </span>
              </div>
              <div class="lane-chart">
                <div
                  class="phase-background"
                  role="img"
                  aria-label={'Race legs: ' +
                    phases.map((p) => sectionLabel(p.label, p.start, p.end)).join('; ')}
                >
                  {#each phases as phase}
                    <span
                      style:left={(phase.start / overview.courseDistance) * 100 + '%'}
                      style:width={((phase.end - phase.start) / overview.courseDistance) * 100 +
                        '%'}
                      style:--phase-color={phase.color}
                    >
                      <span class="phase-label">{phase.label}</span>
                      <span class="phase-short">{phase.short}</span>
                    </span>
                  {/each}
                </div>
                {#if !removable && details.errors[lane.id]}
                  <div class="activation-error">
                    <p role="alert">{details.errors[lane.id]}</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onclick={() => details.load(lane.id)}
                    >
                      Retry activation data
                    </Button>
                  </div>
                {:else if !removable && !details.values[lane.id]}
                  <Spinner
                    size={32}
                    centered
                    label={'Loading ' + skillName(lane.id) + '…'}
                  />
                {:else}
                  <svg
                    viewBox="0 0 1000 100"
                    role="slider"
                    tabindex="0"
                    aria-label={removable
                      ? 'Compared skill activation distributions'
                      : skillName(lane.id) + ' activation distribution'}
                    aria-describedby={helpId}
                    aria-valuemin={0}
                    aria-valuemax={99}
                    aria-valuenow={cursor}
                    aria-valuetext={cursorDescription}
                    preserveAspectRatio="none"
                    onpointermove={inspectDistance}
                    onpointerdown={beginRange}
                    onpointerup={endRange}
                    onpointercancel={endRange}
                    onlostpointercapture={endRange}
                    onkeydown={inspectWithKeyboard}
                  >
                    {#each [0, 250, 500, 750, 1000] as x}
                      <line
                        x1={x}
                        x2={x}
                        y1="20"
                        y2="100"
                        class="guide"
                      />
                    {/each}
                    <title>
                      {cursorDescription}
                    </title>
                    {#if removable}
                      {#each [24, 60, 96] as y}<line
                          x1="0"
                          x2="1000"
                          y1={y}
                          y2={y}
                          class="guide"
                        />{/each}
                      {#each lineData.lines as series (series.id)}
                        {#if series.detail && series.total}
                          <path
                            class="comparison-line"
                            data-skill={series.id}
                            d={series.path}
                            fill="none"
                            stroke={series.color}
                            stroke-dasharray={series.dash}
                            vector-effect="non-scaling-stroke"
                          >
                            <title>{skillName(series.id)}</title>
                          </path>
                          <circle
                            class="line-point"
                            cx={cursor * 10 + 5}
                            cy={96 - (series.normalizedBins[cursor] ?? 0) * 72}
                            r="3"
                            fill={series.color}
                          />
                        {/if}
                      {/each}
                    {:else}
                      <path
                        d={lane.bars}
                        fill="var(--lane-color)"
                      />
                    {/if}
                    {#if !removable && lane.timing}
                      <line
                        class="timing-marker"
                        x1={(lane.timing.mean / overview.courseDistance) * 1000}
                        x2={(lane.timing.mean / overview.courseDistance) * 1000}
                        y1="20"
                        y2="100"
                      >
                        <title>
                          Mean activation: approximately {Math.round(lane.timing.mean)} m
                        </title>
                      </line>
                    {/if}
                    {#if range}
                      <rect
                        class="selected-range"
                        x={range.start * 10}
                        y="18"
                        width={(range.end - range.start + 1) * 10}
                        height="82"
                      />
                    {/if}
                  </svg>
                {/if}
                {#if removable && lanes.every((series) => series.detail && !series.total)}
                  <p class="comparison-empty">No activation events in this running style.</p>
                {/if}
                {#if removable}<span class="line-scale">
                    100%
                    <span>0%</span>
                  </span>{/if}
                <div class="distance-axis">
                  {#each [0, 0.25, 0.5, 0.75, 1] as f}<span>
                      {number(Math.round(overview.courseDistance * f))} m
                    </span>{/each}
                </div>
              </div>
              <div
                class="course-bands"
                role="img"
                aria-label={course
                  ? 'Course sections: ' +
                    segments.map((s) => sectionLabel(s.label, s.start, s.end)).join('; ')
                  : 'Track sections unavailable'}
              >
                {#each segments as segment}
                  <span
                    style:left={(segment.start / overview.courseDistance) * 100 + '%'}
                    style:width={((segment.end - segment.start) / overview.courseDistance) * 100 +
                      '%'}
                    style:--segment-color={segment.color}
                    title={sectionLabel(segment.label, segment.start, segment.end)}
                  >
                    <span>{segment.label}</span>
                  </span>
                {:else}
                  <span class="track-unavailable">Track sections unavailable</span>
                {/each}
              </div>
              {#if course}
                <div
                  class="slope-bands"
                  role="img"
                  aria-label="Course slopes"
                >
                  {#each slopes as section}
                    <span
                      style:left={(section.start / overview.courseDistance) * 100 + '%'}
                      style:width={((section.end - section.start) / overview.courseDistance) * 100 +
                        '%'}
                      style:--slope-color={section.slope > 0
                        ? '#bd7581'
                        : section.slope < 0
                          ? '#719bdd'
                          : '#737d89'}
                      title={sectionLabel(slopeLabel(section.slope), section.start, section.end)}
                    >
                      {slopeLabel(section.slope)}
                    </span>
                  {/each}
                </div>
              {/if}
              {#if removable || details.values[lane.id]}
                <span
                  class="course-cursor"
                  style:left={cursor + 0.5 + '%'}
                  aria-hidden="true"
                ></span>
              {/if}
            </div>
          </div>
          {#if removable}
            <div class="comparison-distance">
              <div class="inspection-distance">
                <strong class="range-toolbar">
                  {range ? 'Selected ' + rangeLabel : distanceLabel}
                </strong>
                <p
                  class="course-reading"
                  title={courseReading}
                >
                  {range ? 'First activation in range' : courseReading}
                </p>
              </div>
              <div class="inspection-action">
                {#if range}<Button
                    size="sm"
                    variant="secondary"
                    onclick={clearRange}
                  >
                    Clear distance range
                  </Button>
                {:else}<p class="chart-instruction">Drag to select a distance range.</p>{/if}
              </div>
            </div>
            <CmSkillComparisonReadout
              series={lineData.lines}
              {details}
              {style}
              {cursor}
              {range}
              {skillName}
              onremove={remove}
            />
          {:else}<aside
              class="lane-inspection"
              aria-label="Outcomes at inspected distance"
            >
              <div class="inspection-distance">
                <div class="range-toolbar">
                  <strong>{range ? 'Selected ' + rangeLabel : distanceLabel}</strong>
                </div>
                <p
                  class="course-reading"
                  title={courseReading}
                >
                  {range ? 'First activation in range' : courseReading}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Activation events</dt>
                  <dd>
                    {reading ? number(reading.procs) : '—'}
                    <small>{reading ? pct(reading.procs / Math.max(1, lane.total)) : ''}</small>
                  </dd>
                </div>
                <div>
                  <dt>First activations</dt>
                  <dd>{reading ? number(reading.entries) : '—'}</dd>
                </div>
                <div>
                  <dt>Individual wins</dt>
                  <dd>
                    {reading ? number(reading.wins) : '—'}
                    <small>{reading?.entries ? pct(reading.wins / reading.entries) : '—'}</small>
                  </dd>
                </div>
                <div>
                  <dt>Team wins</dt>
                  <dd>
                    {reading ? number(reading.teamWins) : '—'}
                    <small>
                      {reading?.entries ? pct(reading.teamWins / reading.entries) : '—'}
                    </small>
                  </dd>
                </div>
              </dl>
              <div class="inspection-action">
                {#if range}
                  <Button
                    size="sm"
                    variant="secondary"
                    onclick={clearRange}
                  >
                    Clear distance range
                  </Button>
                {:else}
                  <p class="chart-instruction">Drag to select a distance range.</p>
                {/if}
              </div>
            </aside>{/if}
        </div>
        {#if !removable && lane.detail}
          <CmSkillBreakdown
            {overview}
            {colors}
            skills={[{ detail: lane.detail }]}
            {skillName}
            {style}
            {range}
          />
        {/if}
      </section>
    {/each}
  </div>
  {#if removable && lanes.some((lane) => lane.detail)}
    <CmSkillBreakdown
      {overview}
      {colors}
      skills={lineData.lines.flatMap((series) =>
        series.detail ? [{ detail: series.detail, color: series.color, dash: series.dash }] : []
      )}
      {style}
      {range}
      {skillName}
      comparison
    />
  {/if}
</section>

<style>
  @import './cm-skill-lanes.css';
</style>
