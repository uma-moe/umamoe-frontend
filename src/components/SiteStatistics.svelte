<script lang="ts">
  import Icon from './Icon.svelte';
  import type { SiteStatistics } from '@/services/site-statistics';

  let { stats }: { stats?: SiteStatistics } = $props();

  const counters = $derived([
    { icon: 'check' as const, label: 'Tasks Today', value: stats?.today.tasks_24h ?? 0 },
    { icon: 'refresh' as const, label: 'Updated Today', value: stats?.freshness.accounts_24h ?? 0 },
    { icon: 'community' as const, label: 'Trainers', value: stats?.freshness.accounts_7d ?? 0 },
    {
      icon: 'user' as const,
      label: 'Total Umas Tracked',
      value: stats?.freshness.umas_tracked ?? 0
    }
  ]);
</script>

<section
  class="stats"
  aria-label="Site statistics"
>
  <div class="stats-grid">
    {#each counters as counter}
      <div class="stat-card">
        <Icon
          name={counter.icon}
          size={22}
        />
        <strong>{counter.value.toLocaleString()}</strong>
        <span>{counter.label}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  .stats {
    width: 100%;
    box-sizing: border-box;
    padding: 0 24px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-secondary);
  }
  .stats-grid {
    max-width: 1440px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 0 auto;
    padding: 14px 0;
    gap: 24px;
  }
  .stat-card {
    position: relative;
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, auto);
    justify-content: center;
    align-content: center;
    gap: 2px 10px;
  }
  .stat-card + .stat-card::before {
    content: '';
    position: absolute;
    left: -12px;
    top: 10%;
    height: 80%;
    width: 1px;
    background: var(--border-subtle);
  }
  .stat-card :global(svg) {
    grid-row: 1/3;
    align-self: center;
    color: var(--accent-primary);
    opacity: 0.8;
  }
  .stat-card strong {
    color: var(--text-primary);
    font-size: clamp(20px, 1.6vw, 26px);
    font-weight: 650;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .stat-card span {
    grid-column: 2;
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.4;
  }
  @media (max-width: 768px) {
    .stat-card {
      grid-template-columns: minmax(0, 1fr);
      justify-items: center;
    }
    .stat-card :global(svg) {
      display: none;
    }
    .stat-card span {
      grid-column: 1;
      text-align: center;
    }
  }
  @media (max-width: 560px) {
    .stats {
      padding: 0 16px;
    }
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 16px;
      padding: 12px 0;
    }
    .stat-card strong {
      font-size: 20px;
    }
    .stat-card + .stat-card::before {
      display: none;
    }
  }
</style>
