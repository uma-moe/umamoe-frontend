<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import { gapText, lengthsText, winRateText, winText, type RacedGap } from './build-result';

  /**
   * The head of one build's card: its rank, what it is worth to her and what it costs. Where races in her real fields
   * ranked the builds, its worth is her win rate there, the theory's lengths beside it; otherwise the lengths. A build
   * after the pick also says how far behind the pick it is, as builds that buy nearly the same skills differ by little.
   */
  interface Props {
    title: string;
    /** The build worth the most, whose skills she should buy. */
    pick: boolean;
    spCost: number;
    /** Skills it buys, an upgrade and what it builds on counting as one. */
    count: number;
    /** Lengths it gains her over her build as it is. */
    lengths: number;
    /** Lengths it is worth less than the pick; absent for the pick. */
    behind?: number;
    /** Estimated win points (0–1) it is worth less than the pick, when the service sends them. */
    behindWin?: number;
    /** Her win rate with it in races of her real CM fields, when races ranked the builds: they are in its order. */
    winRate?: number;
    /** How far it trails the pick in those races; absent for the pick. */
    racedBehind?: RacedGap;
    /** What the races that checked it say, on hover. */
    check: string;
  }

  let {
    title,
    pick,
    spCost,
    count,
    lengths,
    behind,
    behindWin,
    winRate,
    racedBehind,
    check
  }: Props = $props();
</script>

<header class="head">
  <div class="rank">
    <h4>
      {title}
      {#if pick}<Badge tone="accent">Pick</Badge>{/if}
    </h4>
    <span class="spend">
      {count}
      {count === 1 ? 'skill' : 'skills'} · {spCost.toLocaleString('en-US')} SP
    </span>
  </div>
  <p
    class="score"
    title={check || undefined}
  >
    {#if winRate !== undefined}
      <strong>{winRateText(winRate)}</strong>
      <span>win rate</span>
      {#if racedBehind}
        <span class="behind">{gapText(racedBehind)} vs the pick</span>
      {/if}
      <span>{lengthsText(lengths)} theorized</span>
    {:else}
      <strong>{lengthsText(lengths, 2, false)}</strong>
      <span>lengths</span>
      {#if behindWin !== undefined}
        <span class="behind">≈ {winText(-behindWin)} win vs the pick</span>
      {:else if behind !== undefined}
        <span class="behind">{lengthsText(-behind)} vs the pick</span>
      {/if}
    {/if}
  </p>
</header>

<style>
  @import './build-column-head.css';
</style>
