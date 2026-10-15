<script lang="ts">
  import { onMount, onDestroy, untrack } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import {
    loadSkillCatalog,
    resolveEncodedSkill,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import { cmGet, snapshotPath, pct, number } from '../cm-data';
  import {
    activationBins,
    centralActivationWindow,
    type SkillDetail,
    type SkillOverview
  } from '../cm-exploration';
  import { courseSegments, type Course } from '../../race-analysis/replay/replay-course';

  let {
    overview,
    style = 'all',
    selected = $bindable([]),
    removable = true,
    course,
    courseLabel
  }: {
    overview: SkillOverview;
    style?: string;
    selected?: number[];
    removable?: boolean;
    course?: Course;
    courseLabel?: string;
  } = $props();
  const helpId = $props.id();

  let attempt = $state(0),
    cursor = $state(50),
    details = $state<Record<number, SkillDetail>>({}),
    failures = $state<Record<number, string>>({});
  let catalog = $state.raw(new Map<number, SkillCatalogEntry>());

  onMount(() => {
    void loadSkillCatalog()
      .then((value) => (catalog = value))
      .catch(() => {});
  });

  const name = (id: number) => resolveEncodedSkill(catalog, id).skill?.name ?? 'Skill ' + id;

  $effect(() => {
    overview.snapshotId;
    details = {};
    failures = {};
  });

  $effect(() => {
    const id = overview.snapshotId,
      ids = [...selected],
      distance = overview.courseDistance;
    attempt;
    if (!distance) return;
    const controller = new AbortController();
    for (const skill of ids) {
      if (untrack(() => details[skill])) continue;
      cmGet<SkillDetail>(snapshotPath(id, 'skills/details/' + skill), controller.signal, id)
        .then((value) => {
          if (controller.signal.aborted) return;
          if (
            value.skillId !== skill ||
            value.bucketCount !== 100 ||
            value.courseDistance !== distance
          )
            throw new Error('The activation data does not match this skill or course.');
          details[skill] = value;
          delete failures[skill];
        })
        .catch((e) => {
          if (!controller.signal.aborted) failures[skill] = e.message;
        });
    }
    return () => controller.abort();
  });

  const lanes = $derived(
    selected.map((id) => {
      const detail = details[id],
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
        bins,
        bars,
        total: bins.reduce((sum, n) => sum + n, 0),
        window: detail ? centralActivationWindow(bins, detail.courseDistance) : undefined
      };
    })
  );
  const distanceLabel = $derived(
    Math.round((cursor * overview.courseDistance) / 100) +
      '–' +
      Math.round(((cursor + 1) * overview.courseDistance) / 100) +
      ' m'
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
    phases.find((phase) => cursorDistance >= phase.start && cursorDistance < phase.end)!.label
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
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    cancelPointer();
    cursor =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 99
          : Math.max(
              0,
              Math.min(99, cursor + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1))
            );
  }

  function inspectDistance(event: PointerEvent) {
    target = event.currentTarget as SVGSVGElement;
    clientX = event.clientX;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      if (rect.width)
        cursor = Math.max(0, Math.min(99, Math.floor(((clientX - rect.left) / rect.width) * 100)));
    });
  }
</script>

<section class="timing">
  {#if selected.length}
    <div class="course-context">
      <div class="course-identity">
        {#if !removable}
          <span class="event-count">
            <strong>{details[lanes[0]!.id] ? number(lanes[0]!.total) : '—'}</strong>
            activation events
          </span>
        {/if}
        <span>{courseLabel ?? number(overview.courseDistance) + ' m course'}</span>
      </div>
      <div class="course-tools">
        <span class="course-reading">{courseReading}</span>
        <InspectPopover
          label="How to read activation distances"
          align="end"
        >
          {#snippet trigger()}
            <Icon
              name="info"
              size={15}
            />
          {/snippet}
          <div class="activation-help">
            <h3>How to read activation distances</h3>
            <p>
              Hover or tap a chart to inspect events and the course at that distance. Use arrow keys
              while the chart is focused, or Home and End to reach either end.
            </p>
            <p>
              Shaded regions show the race legs. The final leg covers the last sixth of the course;
              each runner’s last spurt can begin at a different distance. The strip below marks
              straights and corners, and the readout shows the slope at the cursor.
            </p>
            <p>
              Each chart scales to its own peak, so bar heights across skills do not indicate equal
              event counts. The central 80% range covers the 10th–90th percentile of events.
              Repeated activations count separately.
            </p>
          </div>
        </InspectPopover>
      </div>
    </div>
  {/if}
  <span
    id={helpId}
    class="sr-only"
  >
    Use arrow keys, Home, or End to inspect activation distances. Shading shows race legs and the
    strip below shows course sections. Each skill’s bars scale to its own peak.
  </span>
  <div
    class="lanes"
    aria-label="Skill activation lanes"
  >
    {#each lanes as lane, index (lane.id)}
      <section
        class="lane"
        class:card={removable}
        aria-labelledby={removable ? helpId + '-' + lane.id : undefined}
        style:--lane-color={[
          'var(--accent-primary)',
          'var(--accent-purple)',
          'var(--accent-secondary)'
        ][index % 3]}
      >
        {#if removable}
          <div class="lane-heading">
            <span
              class="lane-identity"
              id={helpId + '-' + lane.id}
            >
              <RaceSkill id={lane.id} />
              <small>[Id {lane.id}]</small>
            </span>
            <p class="event-count">
              <strong>{details[lane.id] ? number(lane.total) : '—'}</strong>
              events
            </p>
            <IconButton
              icon="close"
              size="sm"
              label={'Remove ' + name(lane.id) + ' from comparison'}
              onclick={() => remove(lane.id)}
            />
          </div>
        {/if}
        <div class="chart-stack">
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
                  style:width={((phase.end - phase.start) / overview.courseDistance) * 100 + '%'}
                  style:--phase-color={phase.color}
                >
                  <span class="phase-label">{phase.label}</span>
                  <span class="phase-short">{phase.short}</span>
                </span>
              {/each}
            </div>
            {#if failures[lane.id]}
              <div class="activation-error">
                <p role="alert">{failures[lane.id]}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onclick={() => {
                    delete failures[lane.id];
                    attempt++;
                  }}
                >
                  Retry activation data
                </Button>
              </div>
            {:else if !details[lane.id]}
              <Spinner
                size={32}
                centered
                label={'Loading ' + name(lane.id) + '…'}
              />
            {:else}
              <svg
                viewBox="0 0 1000 100"
                role="slider"
                tabindex="0"
                aria-label={name(lane.id) + ' activation distribution'}
                aria-describedby={helpId}
                aria-valuemin={0}
                aria-valuemax={99}
                aria-valuenow={cursor}
                aria-valuetext={distanceLabel +
                  ': ' +
                  number(lane.bins[cursor] ?? 0) +
                  ' events, ' +
                  pct((lane.bins[cursor] ?? 0) / Math.max(1, lane.total))}
                preserveAspectRatio="none"
                onpointermove={inspectDistance}
                onpointerdown={inspectDistance}
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
                  {distanceLabel}: {number(lane.bins[cursor] ?? 0)} events ({pct(
                    (lane.bins[cursor] ?? 0) / Math.max(1, lane.total)
                  )})
                </title>
                <path
                  d={lane.bars}
                  fill="var(--lane-color)"
                />
              </svg>
            {/if}
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
                style:width={((segment.end - segment.start) / overview.courseDistance) * 100 + '%'}
                style:--segment-color={segment.color}
                title={sectionLabel(segment.label, segment.start, segment.end)}
              >
                <span>{segment.label}</span>
              </span>
            {:else}
              <span class="track-unavailable">Track sections unavailable</span>
            {/each}
          </div>
          {#if details[lane.id]}
            <span
              class="course-cursor"
              style:left={cursor + 0.5 + '%'}
              aria-hidden="true"
            ></span>
          {/if}
        </div>
        <div class="distance-axis">
          {#each [0, 0.5, 1] as f}
            <span>
              {number(Math.round(overview.courseDistance * f))} m
            </span>
          {/each}
        </div>
        <div class="lane-reading">
          <span>
            Central 80% of events <strong>
              {details[lane.id] ? (lane.window ? lane.window.join('–') + ' m' : 'No events') : '—'}
            </strong>
          </span>
          <span>
            {distanceLabel}
            <strong>
              {details[lane.id]
                ? number(lane.bins[cursor] ?? 0) +
                  ' events · ' +
                  pct((lane.bins[cursor] ?? 0) / Math.max(1, lane.total))
                : '—'}
            </strong>
          </span>
        </div>
      </section>
    {:else}
      <div class="empty">
        <h3>Choose skills from the table.</h3>
        <p>Add skills to inspect their distributions on the same distance axis.</p>
      </div>
    {/each}
  </div>
</section>

<style>
  @import './cm-skill-lanes.css';
</style>
