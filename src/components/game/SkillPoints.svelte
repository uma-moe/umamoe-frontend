<script
  lang="ts"
  module
>
  /** What a learned-skill total counts, for its tooltip. */
  export const LEARNED_SKILL_POINTS_NOTE =
    'Base cost of learned skills including prerequisites, before hint discounts';
</script>

<script lang="ts">
  interface Props {
    /** The SP amount; missing when it cannot be priced. */
    value: number | null | undefined;
    /** Shown as "1,234 / 1,500 SP" against what is available. */
    budget?: number;
    /** What the amount counts, shown on hover. */
    note?: string;
    /** Emphasised amounts lead a row, such as a build's total spend. */
    emphasis?: boolean;
  }

  let { value, budget, note, emphasis = false }: Props = $props();

  const format = (amount: number) => amount.toLocaleString('en-US');

  const amount = $derived(value === null || value === undefined ? '—' : format(value));
  // One muted run after the amount keeps the text "1,234 / 1,500 SP" single-spaced for copying and tests.
  const unit = $derived(budget === undefined ? 'SP' : '/ ' + format(budget) + ' SP');
</script>

<span
  class="skill-points"
  class:emphasis
  title={note}
>
  <strong>{amount}</strong>
  <span class="unit">{unit}</span>
</span>

<style>
  .skill-points {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25em;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  strong {
    color: var(--text-primary);
    font-weight: 700;
  }
  .unit {
    color: var(--text-secondary);
    font-size: 0.85em;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .emphasis strong {
    font-size: 1.15em;
  }
</style>
