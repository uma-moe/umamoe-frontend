<script lang="ts">
  import { onMount } from 'svelte';
  import type { Requirement, Summary, TeamDistributionResponse } from '../../hakuraku-types';
  import { cmGet, snapshotPath, pct, number } from '../cm-data';
  import { fieldChart, inlineFieldChart } from './archetype-field-chart';
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { theme } from '@/stores/theme';

  interface Props {
    data: Summary;
    parsed: { slots: Requirement[]; error: string };
    mode: string;
    sort: string;
    attempt: number;
    onretry: () => void;
  }

  let { data, parsed, mode, sort, attempt, onretry }: Props = $props();

  let distribution = $state<TeamDistributionResponse>(),
    distributionError = $state(''),
    distributionExpanded = $state(false),
    fieldGraphHeight = $state(144),
    mobileTraining = $state(false);

  const population = $derived(
    parsed.slots.length === 3 &&
      parsed.slots.every((s) => s.style && !s.card && !s.chara && !s.anyOf && !s.exclude)
      ? data.archetypes.find(
          (r) =>
            r.key ===
            parsed.slots
              .map((s) => s.style)
              .sort((a, b) => a! - b!)
              .join('-')
        )
      : undefined
  );
  const chart = $derived(fieldChart(distribution, population, $theme === 'dark', mobileTraining));
  const inlineChart = $derived(inlineFieldChart(chart));

  onMount(() => {
    const mobile = matchMedia('(max-width:767px)');
    const adaptTraining = () => (mobileTraining = mobile.matches);
    adaptTraining();
    mobile.addEventListener('change', adaptTraining);
    return () => mobile.removeEventListener('change', adaptTraining);
  });

  $effect(() => {
    const id = data.snapshotId;
    const params = new URLSearchParams({
      slots: JSON.stringify(parsed.slots),
      players: mode,
      sort
    });
    attempt;
    distribution = undefined;
    distributionError = '';
    if (parsed.error) return;
    const controller = new AbortController();
    cmGet<TeamDistributionResponse>(
      snapshotPath(id, 'team-distribution?' + params),
      controller.signal,
      id
    )
      .then((v) => {
        if (!controller.signal.aborted) distribution = v;
      })
      .catch((e) => {
        if (!controller.signal.aborted) distributionError = e.message;
      });
    return () => controller.abort();
  });
</script>

<section class="field-panel">
  <ChartFrame
    plain
    compact
    maximize
    id="cm-team-distribution"
    title="Matching field"
    expandable
    bind:expanded={distributionExpanded}
    state={distributionError ? 'error' : distribution ? 'ready' : 'loading'}
  >
    {#snippet actions()}
      {#if distributionError}
        <Button
          size="sm"
          variant="secondary"
          onclick={onretry}
        >
          Retry distribution
        </Button>
      {/if}
    {/snippet}
    {#if distribution}
      <div
        class="field-content"
        class:expanded={distributionExpanded}
      >
        <div
          class="field-graph"
          class:expanded={distributionExpanded}
          bind:clientHeight={fieldGraphHeight}
        >
          <LazyEChartsSurface
            option={distributionExpanded ? chart : inlineChart}
            label="Number of teams at each reliable win rate"
            height={fieldGraphHeight || 144}
          />
        </div>
        <dl class="field-stats">
          <div>
            <dt>{mode === 'unique' ? 'Player-best teams' : 'Matching teams'}</dt>
            <dd>{number(distribution.totalTeams)}</dd>
          </div>
          <div>
            <dt>Typical team</dt>
            <dd>{distribution.median === null ? '—' : pct(distribution.median)}</dd>
          </div>
          <div>
            <dt>Top 10% from</dt>
            <dd>{distribution.topDecile === null ? '—' : pct(distribution.topDecile)}</dd>
          </div>
        </dl>
      </div>
      {#if distributionExpanded && population}
        <p class="field-help">
          Gold line: this style lineup’s average ({pct(population.team)}).
        </p>
      {/if}
      <p class="field-help">Win rates use the low end of each team’s estimate.</p>
    {/if}
  </ChartFrame>
</section>

<style>
  @import './archetype-text.css';
  @import './cm-archetype-field.css';
</style>
