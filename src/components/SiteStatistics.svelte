<script lang="ts">
  import StatisticsStrip from './data/StatisticsStrip.svelte';
  import type { SiteStatistics } from '@/services/site/site-statistics';

  let { stats }: { stats?: SiteStatistics } = $props();

  const counters = $derived(
    [
      { icon: 'check' as const, label: 'Tasks Today', value: stats?.today.tasks_24h ?? 0 },
      {
        icon: 'refresh' as const,
        label: 'Updated Today',
        value: stats?.freshness.accounts_24h ?? 0
      },
      { icon: 'community' as const, label: 'Trainers', value: stats?.freshness.accounts_7d ?? 0 },
      {
        icon: 'user' as const,
        label: 'Total Umas Tracked',
        value: stats?.freshness.umas_tracked ?? 0
      }
    ].map((counter) => ({ ...counter, value: counter.value.toLocaleString() }))
  );
</script>

<StatisticsStrip
  label="Site statistics"
  items={counters}
  busy={!stats}
/>
