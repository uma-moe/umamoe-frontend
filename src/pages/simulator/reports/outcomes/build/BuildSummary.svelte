<script lang="ts">
  import type { OptimizeEstimate } from '../../../simulator-repository';
  import { amount, type StatCell } from './build-result';

  /** The answer at a glance: how many skills to buy and their SP, beside what they gain her and how she races. */
  interface Props {
    /** The best build's skills, an upgrade and what it builds on counting as one. */
    count: number;
    spCost: number;
    budget?: number;
    gain?: OptimizeEstimate;
    /** Gains are runners beaten in real CM fields, not seconds. */
    field: boolean;
    stats: StatCell[];
  }

  let { count, spCost, budget, gain, field, stats }: Props = $props();
</script>

<div class="summary">
  <div class="answer">
    <p class="headline">
      {count === 0 ? 'Buy nothing' : 'Buy ' + count + (count === 1 ? ' skill' : ' skills')}
    </p>
    {#if count}
      <p class="spend">
        <strong>{spCost.toLocaleString('en-US')}</strong>
        {budget === undefined ? 'SP' : '/ ' + budget.toLocaleString('en-US') + ' SP'}
      </p>
    {/if}
  </div>

  <dl class="strip">
    {#if gain}
      <div
        class="gain"
        class:loss={gain.mean < 0}
      >
        <dt>{field ? 'More runners beaten' : 'Saves per race'}</dt>
        <dd>
          {amount(gain.mean, field)}
          <small>± {gain.standard_error.toFixed(2)}</small>
        </dd>
      </div>
    {/if}
    {#each stats as stat (stat.label)}
      <div>
        <dt>{stat.label}</dt>
        <dd>{stat.text}</dd>
      </div>
    {/each}
  </dl>
</div>

<style>
  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px 32px;
  }
  .answer {
    display: grid;
    gap: 2px;
  }
  p {
    margin: 0;
  }
  .headline {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--text-primary);
  }
  .spend {
    font-size: 13px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .spend strong {
    font-weight: 650;
    color: var(--text-secondary);
  }
  /* The gain, then her race stats, each label over its value. */
  .strip {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
  }
  .strip div {
    display: grid;
    gap: 2px;
    padding: 0 18px;
    border-left: 1px solid var(--border-subtle);
  }
  .strip div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  dt {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  dd {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    line-height: 1.2;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .gain dd {
    font-size: 22px;
    font-weight: 700;
    color: var(--accent-success);
  }
  .gain.loss dd {
    color: var(--accent-warning);
  }
  .gain small {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
  }
  @media (max-width: 767px) {
    .strip {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px 0;
      width: 100%;
    }
    .strip div {
      padding: 0 10px;
    }
    .strip div:nth-child(3n + 1) {
      padding-left: 0;
      border-left: 0;
    }
  }
</style>
