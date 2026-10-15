<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import { histogram, rate, score, styleColors } from '../../analysis-view';
  import { sessionChart, sessionFeats, type SessionEntry } from './session-statistics';
  import { theme } from '@/stores/theme';

  interface Props {
    captures: ParsedRaceCapture[];
    entries: SessionEntry[];
    winners: SessionEntry[];
    active: boolean;
    oninspect: (members: RaceRunner[], title: string, race: number) => void;
  }

  let { captures, entries, winners, active, oninspect }: Props = $props();

  let scorePopulation = $state('all');

  const ink = $derived($theme === 'dark' ? '#abb4c3' : '#566071');
  const times = $derived(histogram(winners.map((e) => e.runner.result!.finishTime)));
  const scores = $derived(
    histogram(
      (scorePopulation === 'winners' ? winners : entries)
        .map((e) => score(e.runner))
        .filter((n) => n > 0)
    )
  );

  const feats = $derived(sessionFeats(winners));
</script>

{#if active}
  <div class="overview">
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="winning-times"
      title="Winning time distribution"
      description="The spread of race-winning finish times."
    >
      <LazyEChartsSurface
        height={210}
        label="Winning time distribution"
        option={sessionChart(
          ink,
          [
            {
              type: 'bar',
              data: times.counts,
              itemStyle: { color: '#69b7ee', borderRadius: [3, 3, 0, 0] }
            }
          ],
          {
            type: 'category',
            data: times.labels.map((value) => formatRaceTime(value, 2)),
            axisLabel: { rotate: 25 }
          }
        )}
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      expandable
      maximize
      id="score-distribution"
      title="Score distribution"
      state={scores.counts.length ? 'ready' : 'empty'}
      emptyDetail="Training scores were not included in these captures."
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          options={[
            { value: 'all', label: 'All runners' },
            { value: 'winners', label: 'Winners' }
          ]}
          bind:value={scorePopulation}
          label="Score population"
        />
      {/snippet}
      <LazyEChartsSurface
        height={210}
        label="Training score distribution"
        option={sessionChart(
          ink,
          [{ type: 'bar', data: scores.counts, itemStyle: { color: '#7bc8a0' } }],
          { type: 'category', data: scores.labels.map((n) => (n / 1000).toFixed(1) + 'k') }
        )}
      />
    </ChartFrame>
    <ChartFrame
      plain
      surface
      compact
      id="session-highlights"
      title="Notable performances"
    >
      <div class="highlights">
        {#each feats as feat}
          <div class="performance-row">
            <span>{feat.label}</span>
            <button
              onclick={() =>
                oninspect([feat.entry.runner], feat.entry.runner.name, feat.entry.race)}
              aria-label={'Inspect ' + feat.entry.runner.name + ' ' + feat.label + ' build'}
            >
              <RunnerReference
                name={feat.entry.runner.name}
                cardId={feat.entry.runner.cardId}
                compact
              /><Icon
                name="chevron"
                size={12}
              />
            </button>
            <strong class="performance-value">{feat.value}</strong>
          </div>
        {/each}
      </div>
    </ChartFrame>
  </div>
  <ChartFrame
    plain
    surface
    compact
    expandable
    maximize
    id="gate-results"
    title="Gate performance"
    description="Win rate for each starting gate."
  >
    <LazyEChartsSurface
      height={210}
      label="Win rate by gate"
      option={sessionChart(
        ink,
        [
          {
            type: 'bar',
            data: Array.from(
              { length: Math.max(0, ...captures.map((r) => r.runners.length)) },
              (_, i) => ({
                value: +rate(
                  winners.filter((e) => e.runner.index === i).length,
                  entries.filter((e) => e.runner.index === i).length
                ).toFixed(1),
                itemStyle: { color: styleColors[(i % 4) + 1] }
              })
            )
          }
        ],
        {
          type: 'category',
          data: Array.from(
            { length: Math.max(0, ...captures.map((r) => r.runners.length)) },
            (_, i) => String(i + 1)
          ),
          name: 'Gate'
        },
        { type: 'value', name: 'Win %' }
      )}
    />
  </ChartFrame>
{/if}

<style>
  .overview {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  .overview > :global(figure:last-child) {
    grid-column: 1/-1;
  }
  .overview > :global(figure:last-child .plot) {
    justify-content: center;
  }
  .highlights {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 24px;
  }
  .performance-row {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 0;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 11px;
  }
  .performance-row > span {
    color: var(--text-secondary);
  }
  .performance-row:nth-last-child(-n + 2) {
    border-bottom: 0;
  }
  .performance-row button {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .performance-row button:hover {
    color: var(--accent-primary);
  }
  .performance-row button :global(svg) {
    flex: none;
    transform: rotate(-90deg);
  }
  .performance-value {
    font-size: 14px;
    font-weight: 650;
    color: var(--accent-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (min-width: 1450px) {
    .overview {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .overview > :global(figure:last-child) {
      grid-column: auto;
    }
    .highlights {
      grid-template-columns: minmax(0, 1fr);
    }
    .performance-row:last-child {
      border-bottom: 0;
    }
    .performance-row:nth-last-child(2) {
      border-bottom: 1px solid var(--border-subtle);
    }
  }
  @media (max-width: 760px) {
    .overview {
      grid-template-columns: minmax(0, 1fr);
    }
    .overview > :global(figure:last-child) {
      grid-column: auto;
    }
    .highlights {
      grid-template-columns: minmax(0, 1fr);
    }
    .performance-row {
      grid-template-columns: 98px minmax(0, 1fr) auto;
      gap: 6px;
    }
    .performance-row:nth-last-child(2) {
      border-bottom: 1px solid var(--border-subtle);
    }
    .performance-row:last-child {
      border-bottom: 0;
    }
    .performance-value {
      font-size: 12px;
    }
  }
</style>
