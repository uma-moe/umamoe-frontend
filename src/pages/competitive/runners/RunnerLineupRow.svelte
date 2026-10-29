<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Artwork from '@/components/game/Artwork.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import { identity, stats } from '../analysis-view';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';

  let {
    runner,
    outfit,
    style,
    color,
    showStats = true,
    dense = false,
    sp,
    metadata
  }: {
    runner: RaceRunner;
    outfit?: string;
    style?: string;
    color?: string;
    showStats?: boolean;
    dense?: boolean;
    sp?: number | null;
    metadata?: Snippet;
  } = $props();

  const summary = $derived(identity(runner));
</script>

{#snippet results()}
  {#if sp !== undefined || metadata}
    <div class="member-results">
      {#if sp !== undefined}
        <SkillPoints
          value={sp}
          note={LEARNED_SKILL_POINTS_NOTE}
        />
      {/if}
      {@render metadata?.()}
    </div>
  {/if}
{/snippet}

<div
  class="lineup-row"
  class:compact={!showStats}
  class:dense
>
  <Artwork
    src={summary.image}
    alt=""
    size="sm"
  />
  <div class="member-content">
    {#if dense}
      <div class="member-heading"><h3 title={runner.name}>{runner.name}</h3></div>
      <div class="member-meta">
        <small style:color>{style ?? summary.detail}</small>
        {@render results()}
      </div>
    {:else}
      <div class="member-line">
        <h3 title={runner.name}>{runner.name}</h3>
        {#if showStats}
          <div class="member-stats">
            <StatStrip
              items={stats(runner)}
              presentation="values"
              compact
              label={runner.name + ' build stats'}
            />
          </div>
        {/if}
      </div>
      <div class="member-meta">
        <small>
          {#if outfit}
            <span>{outfit}</span>
          {/if}
          <span style:color>{style ?? summary.detail}</span>
        </small>
        {@render results()}
      </div>
    {/if}
  </div>
  {#if dense && showStats}
    <div class="member-stats">
      <StatStrip
        items={stats(runner)}
        presentation="values"
        compact
        label={runner.name + ' build stats'}
      />
    </div>
  {/if}
</div>

<style>
  .lineup-row {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 9px;
    align-items: center;
    min-width: 0;
    width: 100%;
    container-type: inline-size;
  }
  .lineup-row :global(.art) {
    width: 48px;
    height: 48px;
    border: 0;
    background: transparent;
  }
  .lineup-row :global(.art img) {
    object-fit: contain;
    object-position: center bottom;
  }
  .member-content {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .member-line {
    display: flex;
    align-items: center;
    gap: 3px 8px;
    flex-wrap: wrap;
    min-width: 0;
  }
  h3 {
    min-width: 0;
    margin: 0 auto 0 0;
    font-size: 13px;
    font-weight: 650;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .member-stats {
    width: min(232px, 100%);
    flex: none;
    min-width: 0;
    margin-left: auto;
  }
  .member-stats :global(.values.compact) {
    gap: 4px;
    grid-template-columns: repeat(var(--stat-count), auto);
    justify-content: space-between;
  }
  /* A four-digit box per value keeps each stat in the same column on every row, whatever its digits. */
  .member-stats :global(.values.compact dd) {
    min-width: 4ch;
  }
  .member-meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 3px 8px;
    min-width: 0;
  }
  .member-results {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: 8px;
    margin-left: auto;
  }
  .member-meta > small {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    min-width: 0;
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .compact {
    grid-template-columns: 36px minmax(0, 1fr);
    gap: 7px;
  }
  .compact :global(.art) {
    width: 36px;
    height: 36px;
  }
  .compact h3 {
    font-size: 12px;
  }
  .compact .member-meta > small {
    font-size: 10px;
  }
  @container (max-width:340px) {
    .member-content {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .member-line {
      display: contents;
    }
    h3 {
      width: 100%;
      font-size: 12px;
    }
    .member-meta {
      width: 100%;
      order: 2;
    }
    .member-meta > small {
      font-size: 10px;
    }
    .member-stats {
      order: 3;
      width: 100%;
      margin-left: 0;
    }
    .member-stats :global(.values.compact > div) {
      justify-content: flex-start;
    }
  }
  .dense {
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 6px 10px;
  }
  .dense :global(.art) {
    grid-row: 1 / 3;
    width: 52px;
    height: 72px;
    background: color-mix(in srgb, var(--runner-color, var(--accent-primary)) 8%, transparent);
    border-radius: var(--radius-sm);
  }
  .dense :global(.art img) {
    object-fit: cover;
    object-position: center;
  }
  .dense .member-content {
    display: grid;
    gap: 2px;
    align-self: end;
  }
  .member-heading {
    min-width: 0;
  }
  .dense h3 {
    width: auto;
    min-width: 0;
    margin: 0;
    font-size: 13px;
  }
  .dense .member-meta {
    width: auto;
    order: 0;
  }
  .dense .member-meta > small {
    font-size: 10px;
    white-space: nowrap;
  }
  .dense .member-stats {
    grid-column: 2;
    width: 100%;
    margin: 0;
    order: 0;
    align-self: start;
  }
  .dense .member-stats :global(.values.compact) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
  }
  .dense .member-stats :global(.values.compact > div) {
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 3px 0;
    border-radius: 4px;
    background: color-mix(in srgb, var(--stat-color) 7%, transparent);
  }
  .dense .member-stats :global(.values.compact img) {
    width: 12px;
    height: 12px;
  }
  .dense .member-stats :global(.values.compact dd) {
    font-size: 12px;
    line-height: 1.3;
  }
</style>
