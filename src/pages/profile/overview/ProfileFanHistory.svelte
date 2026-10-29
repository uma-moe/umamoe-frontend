<script lang="ts">
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import {
    formatProfileNumber as format,
    signedProfileGain as signed,
    profileGainColor
  } from '@/lib/profile/profile-display';
  import type { MonthlyFans } from '../profile-repository';

  let { monthly }: { monthly: MonthlyFans[] } = $props();

  let expanded = $state(false);

  function month(value: number): string {
    return (
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
        value - 1
      ] ?? ''
    );
  }
</script>

<section
  class="fan-history"
  aria-label="Fan History"
>
  <Disclosure
    id="profile-fan-history"
    title="Fan History"
    icon="timeline"
    description={`${monthly.length} ${monthly.length === 1 ? 'month' : 'months'} · Monthly totals, gains and ranks`}
    bind:open={expanded}
  >
    {#if expanded}
      <DataTable
        caption="Fan History"
        columns={[
          { key: 'period', label: 'Month' },
          { key: 'fans', label: 'Fans', numeric: true },
          { key: 'gain', label: 'Gain', numeric: true },
          { key: 'days', label: 'Days', numeric: true },
          { key: 'average', label: 'Avg/Day', numeric: true },
          { key: 'rank', label: 'Rank', numeric: true },
          { key: 'circle', label: 'Circle' }
        ]}
        rows={monthly.map((row) => ({
          period: month(row.month) + ' ' + row.year,
          fans: format(row.total_fans),
          gain: signed(row.monthly_gain),
          gainValue: row.monthly_gain,
          days: row.active_days,
          average: format(row.avg_daily),
          rank: '#' + format(row.rank),
          circle: row.circle_name || '-',
          circleId: row.circle_id
        }))}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'gain'}
            <span style:color={profileGainColor(Number(row.gainValue))}>
              {row.gain}
            </span>
          {:else if column.key === 'circle' && row.circleId}
            <a href={'/circles/' + row.circleId}>
              {row.circle}
            </a>
          {:else}
            {row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    {/if}
  </Disclosure>
</section>

<style>
  .fan-history {
    min-width: 0;
    display: grid;
    gap: var(--space-3);
  }
  a {
    color: var(--color-accent);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
