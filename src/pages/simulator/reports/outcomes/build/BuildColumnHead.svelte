<script lang="ts">
  import { gapText, valueText, winRateText, type RacedGap } from './build-result';
  import SkillPoints from '@/components/game/SkillPoints.svelte';

  /**
   * The head of one build's card: its rank, what it is worth to her and what it costs. Where races in her real fields
   * ranked the builds, its worth is her win rate there, the theory's lengths beside it; otherwise the lengths. A build
   * after the pick also says how far behind the pick it is, as builds that buy nearly the same skills differ by little.
   */
  interface Props {
    title: string;
    spCost: number;
    /** Skills it buys, an upgrade and what it builds on counting as one. */
    count: number;
    /** Lengths it gains her over her build as it is. */
    value: number | undefined;
    unit?: 'seconds';
    /** Lengths it is worth less than the pick; absent for the pick. */
    behind?: number;
    /** Her win rate with it in races of her real CM fields, when races ranked the builds: they are in its order. */
    winRate?: number;
    /** How far it trails the pick in those races; absent for the pick. */
    racedBehind?: RacedGap;
    /** What the races that checked it say, on hover. */
    check: string;
  }

  let { title, spCost, count, value, unit, behind, winRate, racedBehind, check }: Props = $props();
</script>

<header class="head">
  <div class="rank">
    <h4>{title}</h4>
    <span class="spend">
      {count}
      {count === 1 ? 'skill' : 'skills'} for
      <SkillPoints value={spCost} />
    </span>
  </div>
  <p
    class="score"
    title={check || undefined}
  >
    {#if winRate !== undefined}
      <span>Optimizer win rate</span>
      <strong>{winRateText(winRate)}</strong>
      {#if racedBehind}
        <span class="behind">{gapText(racedBehind)} vs the pick</span>
      {/if}
      <span>
        {valueText(value, unit)}
        {unit === 'seconds' ? 'vs owned build in validation' : 'theorized'}
      </span>
    {:else}
      <strong>{valueText(value, unit, 2, false)}</strong>
      <span>{unit === 'seconds' ? 'seconds saved' : 'lengths'}</span>
      {#if behind !== undefined}
        <span class="behind">{valueText(-behind, unit)} vs the pick</span>
      {/if}
    {/if}
  </p>
</header>

<style>
  @import './build-column-head.css';
</style>
