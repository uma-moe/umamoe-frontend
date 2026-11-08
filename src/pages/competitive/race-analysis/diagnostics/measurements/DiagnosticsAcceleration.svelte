<script lang="ts">
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import {
    loadSkillEffects,
    type SkillEffectAlternative
  } from '@/lib/game-data/skills/skill-effects';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { theme } from '@/stores/theme';
  import {
    accelerationWindows,
    distanceAtTime,
    speedSamples,
    timeAtDistance
  } from './acceleration-activations';
  import { speedAccelerationChart, speedLines, type SpeedLineId } from './speed-acceleration-chart';

  let {
    capture,
    index,
    distance,
    skillNames,
    onseek
  }: {
    capture: ParsedRaceCapture;
    index: number;
    distance: number;
    skillNames: Map<number, string>;
    onseek: (time: number) => void;
  } = $props();

  const legendId = $props.id();

  let mechanics = $state.raw(new Map<number, SkillEffectAlternative[]>());
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  let hidden = $state<SpeedLineId[]>([]);

  const samples = $derived(speedSamples(capture, index, distance));
  const windows = $derived(accelerationWindows(capture, index, mechanics));
  const chart = $derived(
    speedAccelerationChart({
      samples,
      windows,
      raceDistance: distance,
      dark: $theme === 'dark',
      names: skillNames,
      toDistance: (time) => distanceAtTime(capture, index, time),
      hidden
    })
  );

  async function load() {
    status = 'loading';
    try {
      mechanics = await loadSkillEffects();
      status = 'ready';
    } catch {
      status = 'error';
    }
  }

  function seek(value: number) {
    const time = timeAtDistance(samples, value);
    if (time !== undefined) onseek(time);
  }

  function toggleLine(id: SpeedLineId, shown: boolean) {
    hidden = shown ? hidden.filter((line) => line !== id) : [...hidden, id];
  }

  onMount(() => {
    void load();
  });
</script>

<section
  class="report-card acceleration-report"
  aria-label="Speed and acceleration"
>
  <header class="section-heading">
    <div class="chart-title">
      <h3>Speed &amp; acceleration</h3>
      <InspectPopover label="About speed and acceleration">
        {#snippet trigger()}
          <InfoIcon />
        {/snippet}
        <p>
          Bars show active acceleration skills. Hover for measured acceleration; click to review in
          replay.
        </p>
      </InspectPopover>
    </div>
    <div
      class="legend"
      role="group"
      aria-label="Shown lines"
    >
      {#each speedLines as line}
        <div
          class="legend-item"
          style:--color-accent={line.color}
        >
          <Checkbox
            id={legendId + '-' + line.id}
            label={line.label}
            checked={!hidden.includes(line.id)}
            onchange={(shown) => toggleLine(line.id, shown)}
          />
        </div>
      {/each}
    </div>
  </header>
  {#if samples.length}
    <LazyEChartsSurface
      option={chart.option}
      height={chart.height}
      label="Current and target speed with acceleration skill windows"
      zoomable
      onaxisclick={seek}
    />
  {:else}
    <p class="status">No speed samples recorded.</p>
  {/if}
  {#if status === 'loading'}
    <p class="status">Loading acceleration skills…</p>
  {:else if status === 'error'}
    <p class="status">
      Could not load acceleration skills.
      <Button
        variant="secondary"
        size="sm"
        icon="refresh"
        onclick={load}
      >
        Retry
      </Button>
    </p>
  {/if}
</section>

<style>
  @import '../report-card.css';
  @import './diagnostics-acceleration.css';
</style>
