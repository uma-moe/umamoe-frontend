<script lang="ts">
  import { lengthsText, winRateText } from './build-result';

  /**
   * The answer at a glance: how many skills to buy, their SP and what they are worth to her: her win rate in races of
   * her real fields when races ranked the builds, the lengths they gain her otherwise.
   */
  interface Props {
    /** The pick's skills, an upgrade and what it builds on counting as one. */
    count: number;
    spCost: number;
    budget?: number;
    /** Lengths the pick gains her over her build as it is. */
    lengths: number;
    /** Her win rate with the pick in the races that ranked the builds, when races ranked them. */
    winRate?: number;
  }

  let { count, spCost, budget, lengths, winRate }: Props = $props();
</script>

<div class="summary">
  <p class="headline">
    {count === 0 ? 'Buy nothing' : 'Buy ' + count + (count === 1 ? ' skill' : ' skills')}
  </p>
  <p class="facts">
    {#if count}
      <span>
        <strong>{spCost.toLocaleString('en-US')}</strong>
        {budget === undefined ? 'SP' : '/ ' + budget.toLocaleString('en-US') + ' SP'}
      </span>
      {#if winRate !== undefined}
        <span class="score">{winRateText(winRate)} win rate in her CM fields</span>
        <span>{lengthsText(lengths, 2, false)} lengths theorized</span>
      {:else}
        <span class="score">{lengthsText(lengths, 2, false)} lengths</span>
      {/if}
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
  .facts strong {
    font-weight: 650;
    color: var(--text-secondary);
  }
  .score {
    font-weight: 650;
    color: var(--accent-success);
  }
</style>
