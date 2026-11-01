<script
  module
  lang="ts"
>
  import type { Snippet } from 'svelte';
  import type { Course } from '../replay-course';

  export type EnsembleTimeline = Snippet<
    [
      {
        ticks: number[];
        time: number;
        startTime: number;
        endTime: number;
        runner: number;
        seek: (time: number) => void;
        course?: Course;
        timeAt: (distance: number) => number | undefined;
        distanceMax: number;
      }
    ]
  >;
</script>

<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SkillActivityTimeline from '../../results/SkillActivityTimeline.svelte';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayTimeline from './ReplayTimeline.svelte';
  import ReplayTelemetry from './ReplayTelemetry.svelte';
  import ReplayTelemetryActions from './ReplayTelemetryActions.svelte';
  import ReplaySkillFeed from './ReplaySkillFeed.svelte';

  let {
    replay,
    course,
    skillNames,
    showSkills,
    visibility,
    ensembleTimeline,
    selected = $bindable('0'),
    expanded = $bindable(false)
  }: {
    replay: ReplayState;
    course?: Course;
    skillNames: Map<number, string>;
    showSkills: boolean;
    visibility: Record<number, number>;
    ensembleTimeline?: EnsembleTimeline;
    selected?: string;
    expanded?: boolean;
  } = $props();

  let metric = $state('combined'),
    chartEvents = $state(true),
    compare = $state(false);

  const chartRunners = $derived(
    compare ? replay.capture.runners : replay.runner ? [replay.runner] : []
  );

  const selectedFinish = $derived(replay.finishTimes.get(replay.runner?.index ?? 0));
  const telemetryEnd = $derived(
    replay.ensemble
      ? replay.bounds.endTime
      : Math.max(
          replay.bounds.startTime,
          Math.min(
            replay.bounds.endTime,
            compare
              ? Math.max(
                  ...chartRunners.map(
                    (r) => replay.finishTimes.get(r.index) ?? replay.bounds.endTime
                  )
                )
              : (selectedFinish ?? replay.bounds.endTime)
          )
        )
  );

  // Target speed needs a detailed simulation; a mean race has no acceleration trace.
  $effect(() => {
    const unavailable =
      (metric === 'target' && !replay.capture.detailed) ||
      (metric === 'acceleration' && Boolean(replay.ensemble));

    if (unavailable) metric = 'speed';
  });
</script>

<div class="replay-timeline">
  <ReplayTimeline
    frames={replay.capture.frames}
    bounds={replay.bounds}
    timelineEnd={telemetryEnd}
    {course}
    bind:time={replay.time}
    bind:speed={replay.speed}
    playing={replay.playing}
    minimal={!!replay.ensemble}
    phase={replay.phase}
    leader={replay.leader}
    onplay={replay.play}
    onseek={replay.seek}
  >
    {#snippet actions()}
      {#if !expanded}
        <div class="playback-actions-options">
          <ReplayTelemetryActions
            bind:metric
            bind:compare
            bind:chartEvents
            detailed={!!replay.capture.detailed}
            ensemble={!!replay.ensemble}
          />
        </div>
        {#if !replay.ensemble}
          <span id="runner-telemetry-expand">
            <Button
              variant="secondary"
              size="sm"
              icon="expand"
              ariaLabel="Expand Race telemetry"
              onclick={() => (expanded = true)}
            >
              <span class="expand-text">Expand</span>
            </Button>
          </span>
        {/if}
      {/if}
    {/snippet}
    {#snippet menu()}
      {#if !expanded}
        <!-- Focus returns to this menu when the expanded chart closes; ChartFrame finds it by this id. -->
        <span id="runner-telemetry-expand">
          <ReplayTelemetryActions
            menu
            bind:metric
            bind:compare
            bind:chartEvents
            detailed={!!replay.capture.detailed}
            ensemble={!!replay.ensemble}
            onexpand={replay.ensemble ? undefined : () => (expanded = true)}
          />
        </span>
      {/if}
    {/snippet}
    {#snippet telemetry()}
      <ReplayTelemetry
        {replay}
        {skillNames}
        {chartRunners}
        {telemetryEnd}
        bind:metric
        bind:compare
        bind:chartEvents
        bind:expanded
      />
    {/snippet}
    {#snippet children(ticks)}
      {#if replay.runner && replay.ensemble && ensembleTimeline}
        {@render ensembleTimeline({
          ticks,
          time: replay.time,
          startTime: replay.bounds.startTime,
          endTime: telemetryEnd,
          runner: replay.runner.index,
          seek: replay.seek,
          course,
          timeAt: (distance) => replay.timeAtDistance(distance),
          distanceMax: replay.bounds.distanceMax
        })}
      {/if}
      {#if replay.runner && !replay.ensemble}
        <SkillActivityTimeline
          capture={replay.capture}
          index={replay.runner.index}
          {skillNames}
          time={replay.time}
          {ticks}
          startTime={replay.bounds.startTime}
          endTime={telemetryEnd}
          onseek={replay.seek}
        />
      {/if}
      {#if showSkills && !replay.ensemble}
        <ReplaySkillFeed
          events={replay.recentSkills}
          runners={replay.capture.runners}
          {visibility}
          inspected={replay.runner?.index}
          {skillNames}
          onselect={(index, time) => {
            selected = String(index);
            replay.seek(time);
          }}
        />
      {/if}
    {/snippet}
  </ReplayTimeline>
</div>

<style>
  .replay-timeline {
    grid-column: 1/-1;
    grid-row: 3;
    min-width: 0;
    margin-top: 0;
  }
  @media (min-width: 951px) {
    .replay-timeline :global(.period-track),
    .replay-timeline :global(.strip-label) {
      height: 32px;
      min-height: 32px;
    }
    .replay-timeline :global(.skill-period),
    .replay-timeline :global(.skill-group) {
      top: 1px;
    }
  }
  @media (max-width: 950px) {
    .replay-timeline {
      grid-column: auto;
      grid-row: auto;
      order: 2;
    }
  }
  .playback-actions-options {
    display: contents;
  }
  @container playback (max-width: 1400px) {
    .expand-text {
      display: none;
    }
  }
  :global(.ensemble-view) .replay-timeline {
    margin-top: 8px;
  }
</style>
