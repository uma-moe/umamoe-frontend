<script lang="ts">
  import {
    gapText,
    pointsText,
    tiedText,
    tiedWithPick,
    valueText,
    winRateText,
    winsGapText,
    type PickGap,
    type RacedGap,
    type TeamTrialsScore
  } from './build-result';
  import SkillPoints from '@/components/game/SkillPoints.svelte';

  /**
   * The head of one build's card: its rank, what it is worth to her and what it costs. Where races in her real fields
   * ranked the builds, its worth is her win rate there, the theory's lengths beside it; otherwise the lengths. Team
   * Trials shows her TT points instead, as her win rate against the optimizer's skill-less pack says nothing. A build
   * after the pick also says how far behind the pick it is, as builds that buy nearly the same skills differ by little:
   * where the check races cannot tell it from the pick, it says so in place of a win rate that only looks different.
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
    /** Her win rate with it against the pick's in the check races; absent for the pick. */
    pickGap?: PickGap;
    teamTrialsScore?: TeamTrialsScore;
    /** How far it trails the pick in those races; absent for the pick. */
    racedBehind?: RacedGap;
    /** What the races that checked it say, on hover. */
    check: string;
  }

  let {
    title,
    spCost,
    count,
    value,
    unit,
    behind,
    winRate,
    pickGap,
    teamTrialsScore,
    racedBehind,
    check
  }: Props = $props();
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
    {#if teamTrialsScore !== undefined}
      <span>TT score</span>
      <strong>{pointsText(teamTrialsScore.own)}</strong>
      <span
        title="Raw points per race before account bonuses. Own: skill activations, start, time and rushing. With other runners: adds place, margin and leading her style against the optimizer's skill-less pack, so it reads high."
      >
        own · {pointsText(teamTrialsScore.all)} with other runners
      </span>
      <span>{valueText(value, unit)} vs owned build in validation</span>
    {:else if winRate !== undefined}
      {#if pickGap && tiedWithPick(pickGap)}
        <strong>About as good as the recommended build</strong>
        <span>{tiedText(pickGap)}</span>
      {:else}
        <span>Optimizer win rate</span>
        <strong>{winRateText(winRate)}</strong>
        {#if pickGap}
          <span class:behind={pickGap.ahead < 0}>
            {winsGapText(pickGap)} than the recommended build
          </span>
        {/if}
      {/if}
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
