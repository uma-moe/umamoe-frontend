<script lang="ts">
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import {
    loadSkillEffects,
    type SkillEffectAlternative
  } from '@/lib/game-data/skills/skill-effects';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';
  import {
    accelerationWindows,
    distanceAtTime,
    speedSamples,
    timeAtDistance
  } from './acceleration-activations';
  import { speedAccelerationChart } from './speed-acceleration-chart';

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

  let mechanics = $state.raw(new Map<number, SkillEffectAlternative[]>());
  let status = $state<'loading' | 'ready' | 'error'>('loading');
  const samples = $derived(speedSamples(capture, index, distance));
  const windows = $derived(accelerationWindows(capture, index, mechanics));
  const chart = $derived(
    speedAccelerationChart({
      samples,
      windows,
      raceDistance: distance,
      dark: $theme === 'dark',
      names: skillNames,
      toDistance: (time) => distanceAtTime(capture, index, time)
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

  onMount(() => {
    void load();
  });
</script>

<section
  class="report-block report-card acceleration-report"
  aria-label="Speed and acceleration"
>
  <header class="section-heading">
    <h3>Speed &amp; acceleration</h3>
  </header>
  {#if samples.length}
    <LazyEChartsSurface
      option={chart.option}
      height={chart.height}
      label="Current and target speed with acceleration skill windows"
      zoomable
      onaxisclick={seek}
    />
  {:else}<p>No speed samples recorded.</p>{/if}
  {#if status === 'loading'}<p>Loading acceleration skills…</p>
  {:else if status === 'error'}<p>
      Could not load acceleration skills. <button
        class="retry"
        type="button"
        onclick={load}
      >
        Retry
      </button>
    </p>
  {:else if !windows.length}<p>No acceleration skills activated.</p>{/if}
  <p>
    Bars show active acceleration skills. Hover for measured acceleration; click to review in
    replay.
  </p>
</section>

<style>
  @import '../report-card.css';
  @import '../report/report-section.css';
  .section-heading {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }
  p {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .retry {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-primary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }
</style>
