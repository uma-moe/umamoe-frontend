<script lang="ts">
  import { traineeStats } from '../setup/trainee';
  import type { SimulatorUma } from '../simulator-uma';

  /** A runner's five stats on one text-height line; with a baseline, stats that differ from it are marked. */
  let {
    uma,
    baseline,
    aligned = false
  }: {
    uma: SimulatorUma;
    baseline?: SimulatorUma;
    /** Fixed columns, so the stats of builds listed one under another line up. */
    aligned?: boolean;
  } = $props();

  const STATS = [
    { key: 'speed', label: 'Speed', icon: 'speed' },
    { key: 'stamina', label: 'Stamina', icon: 'stamina' },
    { key: 'power', label: 'Power', icon: 'power' },
    { key: 'guts', label: 'Guts', icon: 'guts' },
    { key: 'wisdom', label: 'Wit', icon: 'wit' }
  ] as const;

  const stats = $derived(traineeStats(uma.trainee));
  const before = $derived(baseline ? traineeStats(baseline.trainee) : undefined);
</script>

<span
  class="statline"
  class:aligned
  role="list"
  aria-label={uma.name + ' stats'}
>
  {#each STATS as stat (stat.key)}
    {@const value = stats[stat.key]}
    {@const change = before ? value - before[stat.key] : 0}
    <span
      role="listitem"
      class="stat"
      class:up={change > 0}
      class:down={change < 0}
      title={stat.label +
        ' ' +
        value +
        (change ? ' (' + (change > 0 ? '+' : '') + change + ' vs the current build)' : '')}
    >
      <img
        src={'/assets/images/icon/stats/' + stat.icon + '.webp'}
        alt=""
        decoding="async"
      />
      <span class="sr-only">{stat.label}</span>
      {value}
    </span>
  {/each}
</span>

<style>
  .statline {
    display: inline-flex;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 46px;
    color: var(--text-primary);
  }
  img {
    width: 13px;
    height: 13px;
    object-fit: contain;
  }
  .up {
    color: var(--accent-success);
    font-weight: 650;
  }
  .down {
    color: var(--accent-error);
    font-weight: 650;
  }
  .aligned {
    display: inline-grid;
    grid-template-columns: repeat(5, 46px);
    gap: 2px;
  }
  .aligned .stat {
    min-width: 0;
    gap: 3px;
    padding: 1px 2px;
    border-radius: 4px;
    line-height: 16px;
  }
  .aligned img {
    width: 14px;
    height: 14px;
  }
  .aligned .up {
    background: rgb(var(--accent-success-rgb) / 0.12);
  }
  .aligned .down {
    background: rgb(var(--accent-error-rgb) / 0.12);
  }
</style>
