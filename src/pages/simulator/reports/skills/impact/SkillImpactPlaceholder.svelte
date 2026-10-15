<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import type { SkillImpactRow } from './skill-impact-gains';

  interface Props {
    rows: SkillImpactRow[];
    busy: boolean;
    runnerName: string;
    races: number;
    unique: (id: number) => boolean;
  }

  let { rows, busy, runnerName, races, unique }: Props = $props();
</script>

<div
  class="unmeasured"
  class:busy
>
  <p class="notice">
    <Icon
      name="info"
      size={14}
    />
    {#if busy}Measuring {runnerName}’s skills… each gain fills in as its races finish.{:else}What
      each skill is worth needs its own run: Measure replays {races}
      races per skill with that skill switched off, {(rows.length * races).toLocaleString()} races for
      all
      {rows.length} of {runnerName}’s skills.{/if}
  </p>
  <div class="chip-grid">
    {#each rows as row (row.id)}<span class="placeholder">
        <RaceSkill
          id={row.id}
          fill
          level={unique(row.id) || row.level > 1 ? 'Lv ' + row.level : undefined}
        />
        <i
          class="skeleton bar-skeleton"
          aria-hidden="true"
          style:--length={35 + ((row.id * 37) % 50) + '%'}
        ></i>
        <i
          class="skeleton value-skeleton"
          aria-hidden="true"
        ></i>
      </span>{/each}
  </div>
</div>

<style>
  /* Before measuring: every skill with a grey placeholder for its gain bar and value, so the empty result reads as "run it". */
  .notice {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .notice :global(svg) {
    flex: none;
  }
  .chip-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 4px 16px;
  }
  .placeholder {
    display: grid;
    grid-template-columns: minmax(0, 210px) minmax(40px, 1fr) 34px;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .skeleton {
    height: 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-secondary) 16%, transparent);
  }
  .bar-skeleton {
    width: var(--length);
  }
  .value-skeleton {
    height: 10px;
  }
  .busy .skeleton {
    background:
      linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--text-primary) 14%, transparent) 50%,
          transparent 100%
        )
        0 0 / 200% 100% no-repeat,
      color-mix(in srgb, var(--text-secondary) 16%, transparent);
    animation: skeleton-shimmer 1.4s linear infinite;
  }
  @keyframes skeleton-shimmer {
    from {
      background-position:
        150% 0,
        0 0;
    }
    to {
      background-position:
        -50% 0,
        0 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .busy .skeleton {
      animation: none;
    }
  }
  @media (max-width: 600px) {
    .chip-grid {
      grid-template-columns: 1fr;
    }
    .placeholder {
      grid-template-columns: minmax(0, 1fr) 60px 30px;
    }
  }
</style>
