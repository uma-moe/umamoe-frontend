<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  export interface StatisticsItem {
    icon: IconName;
    label: string;
    value: string;
    href?: string;
  }

  interface Props {
    label: string;
    items: StatisticsItem[];
    busy?: boolean;
    /** Replaces the counters, for example with an unavailable notice and a retry action. */
    status?: Snippet;
  }

  let { label, items, busy = false, status }: Props = $props();
</script>

<section
  class="stats"
  aria-label={label}
  aria-busy={busy}
>
  {#if status}
    <div class="stats-status">{@render status()}</div>
  {:else}
    <div class="stats-grid">
      {#each items as item}
        <svelte:element
          this={item.href ? 'a' : 'div'}
          href={item.href}
          class="stat-card"
          class:linked={Boolean(item.href)}
        >
          <Icon
            name={item.icon}
            size={22}
          />
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </svelte:element>
      {/each}
    </div>
  {/if}
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
    color: inherit;
    text-decoration: none;
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
    transition: color 0.2s;
  }
  .stat-card span {
    grid-column: 2;
    color: var(--text-secondary);
    font-size: var(--font-xs);
    line-height: 1.4;
  }
  .linked:hover strong,
  .linked:focus-visible strong {
    color: var(--accent-primary);
  }
  .stats-status {
    max-width: 1440px;
    min-height: 62px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin: 0 auto;
    padding: 10px 0;
    color: var(--text-secondary);
    font-size: var(--font-sm);
    text-align: center;
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
