<script
  lang="ts"
  module
>
  /** What a learned-skill total counts, for its tooltip. */
  export const LEARNED_SKILL_POINTS_NOTE =
    'base cost of learned skills including prerequisites, before hint discounts';
</script>

<script lang="ts">
  import { SKILL_POINTS_ICON } from '@/lib/game-assets/skill-points-icon';

  interface Props {
    /** The SP amount; missing when it cannot be priced. */
    value: number | null | undefined;
    /** Shown as "1,234 / 1,500" against what is available. */
    budget?: number;
    /** What the amount counts, shown on hover. */
    note?: string;
    /** Emphasised amounts lead a row, such as a build's total spend. */
    emphasis?: boolean;
  }

  let { value, budget, note, emphasis = false }: Props = $props();

  const format = (amount: number) => amount.toLocaleString('en-US');

  const amount = $derived(value === null || value === undefined ? '—' : format(value));
  const title = $derived(note === undefined ? 'Skill points' : 'Skill points: ' + note);
</script>

<!-- The hidden unit keeps the text "1,234 / 1,500 SP" for screen readers, copying and tests. -->
<span
  class="skill-points"
  class:emphasis
  {title}
>
  <img
    src={SKILL_POINTS_ICON}
    alt=""
    decoding="async"
  />
  <strong>{amount}</strong>
  {#if budget !== undefined}
    <span class="budget">/ {format(budget)}</span>
  {/if}
  <span class="sr-only">SP</span>
</span>

<style>
  .skill-points {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  img {
    width: 1.25em;
    height: 1.25em;
    flex: none;
    object-fit: contain;
  }
  strong {
    color: var(--text-primary);
    font-weight: 700;
  }
  .budget {
    color: var(--text-secondary);
    font-size: 0.85em;
    font-weight: 500;
  }
  .emphasis strong {
    font-size: 1.15em;
  }
</style>
