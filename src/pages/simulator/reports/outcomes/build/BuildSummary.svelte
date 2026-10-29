<script lang="ts">
  import SkillPoints from '@/components/game/SkillPoints.svelte';

  /** The purchase recommendation and its cost; comparison metrics live with the builds. */
  interface Props {
    /** The pick's skills, an upgrade and what it builds on counting as one. */
    count: number;
    spCost: number;
    budget?: number;
  }

  let { count, spCost, budget }: Props = $props();
</script>

<div class="summary">
  <p class="headline">
    {count === 0 ? 'Buy nothing' : 'Buy ' + count + (count === 1 ? ' skill' : ' skills')}
  </p>
  <p class="facts">
    {#if count}
      <SkillPoints
        value={spCost}
        {budget}
        emphasis
      />
    {/if}
  </p>
</div>

<style>
  .summary {
    display: grid;
    gap: 4px;
  }
  p {
    margin: 0;
  }
  .headline {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.15;
    color: var(--text-primary);
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 12px;
    font-size: 13px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
</style>
