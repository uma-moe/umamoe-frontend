<script lang="ts">
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { supportCardImagePath } from '@/lib/game-data/support-cards/support-cards';
  import { cardProgression, TIER_DEFINITIONS, type TierCard } from '@/lib/tierlist/tierlist';

  let { card, limitBreak = 4 }: { card: TierCard; limitBreak?: number } = $props();

  const progression = $derived(cardProgression(card));
  const tier = $derived(card.tiers?.[limitBreak] ?? 'N/A');

  function color(tier: string): string {
    return TIER_DEFINITIONS.find((item) => item.name === tier)?.color ?? '#999';
  }

  const chart = $derived({
    animation: false,
    grid: { left: 24, right: 24, top: 36, bottom: 26 },
    xAxis: {
      type: 'category',
      data: ['LB0', 'LB1', 'LB2', 'LB3', 'LB4'],
      show: false,
      boundaryGap: false
    },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        smooth: 0.3,
        symbolSize: 12,
        lineStyle: { color: '#2196f3', width: 3 },
        data: card.scores.map((score, index) => ({
          value: score > 0 ? score : null,
          itemStyle: { color: color(card.tiers?.[index] ?? '') },
          label: {
            show: true,
            position: 'top',
            distance: 10,
            formatter: card.tiers?.[index] ?? '',
            color: '#fff',
            backgroundColor: color(card.tiers?.[index] ?? ''),
            borderRadius: 4,
            padding: [3, 6]
          }
        }))
      }
    ]
  });
</script>

<div class="tier-card-details">
  <header>
    <img
      src={supportCardImagePath(card.id)}
      alt={card.name}
    />
    <div>
      <h3>{card.name}</h3>
      <p>
        <strong>
          {(card.scores[limitBreak] ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
        </strong>
        <b style:background={color(tier)}>{tier}</b>
      </p>
    </div>
  </header>
  <section>
    <h4>Limit Break Progression</h4>
    <div class="progression-chart">
      <LazyEChartsSurface
        option={chart}
        label={`${card.name} limit break progression`}
        height={180}
      />
    </div>
  </section>
  <dl>
    <div>
      <dt>Power Spike:</dt>
      <dd>{progression.powerSpike}</dd>
    </div>
    <div>
      <dt>Total Growth:</dt>
      <dd>{Number(progression.growth) >= 0 ? '+' : ''}{progression.growth}%</dd>
    </div>
  </dl>
  <section>
    <h4>Tier Progression by LB</h4>
    <div class="tier-progression">
      {#each card.scores as score, index}
        <div class:unavailable={score <= 0}>
          <span>LB{index}</span>
          <b style:background={color(score > 0 ? (card.tiers?.[index] ?? '') : '')}>
            {score > 0 ? (card.tiers?.[index] ?? 'N/A') : 'N/A'}
          </b>
          {#if score > 0}
            <small>
              {score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </small>
          {/if}
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .tier-card-details {
    min-width: 0;
    color: var(--text-primary);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-primary);
  }
  header img {
    width: 80px;
    height: 80px;
    object-fit: fill;
    border-radius: var(--radius-md);
  }
  header > div {
    min-width: 0;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 1.1rem;
    line-height: 1.2;
  }
  header p {
    margin: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  header strong {
    color: var(--accent-primary);
  }
  b {
    display: inline-flex;
    justify-content: center;
    min-width: 28px;
    padding: 3px 6px;
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
  }
  section {
    margin-top: 16px;
  }
  h4 {
    margin: 0 0 8px;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }
  .progression-chart {
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
  }
  dl {
    margin: 12px 0;
    display: grid;
    gap: 8px;
    font-size: 0.85rem;
  }
  dl > div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  dt {
    color: var(--text-secondary);
  }
  dd {
    margin: 0;
    font-weight: 600;
  }
  .tier-progression {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
  }
  .tier-progression > div {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 8px 2px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
  }
  .tier-progression span {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .tier-progression small {
    font-size: 10px;
  }
  .unavailable {
    opacity: 0.5;
  }
  @media (max-width: 768px) {
    header img {
      width: 48px;
      height: 64px;
    }
    h3 {
      font-size: 1rem;
    }
  }
</style>
