<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MAX_COUNT } from './hp-plan';
  import HpStepper from './HpStepper.svelte';

  /** How many of one kind of skill: a label, what each one does, and a count to type or step. */
  let {
    label,
    name,
    detail,
    value = $bindable(0),
    max = MAX_COUNT,
    tier,
    icon,
    compact = false,
    below,
    children
  }: {
    /** Short visible label, such as "Gold". */
    label: string;
    /** Full accessible name, such as "Gold recovery skills". */
    name: string;
    /** What each one does, such as "+5.5%". */
    detail?: string;
    value?: number;
    max?: number;
    /** Colors it as the game colors skills: gold, white, rainbow for unique. */
    tier?: 'gold' | 'white' | 'unique';
    /** The game's skill icon for this kind and tier. */
    icon?: string;
    /**
     * For a table whose row and column say what it is: icon and count, with what each one does between them when the
     * cell has room for it, and in the tooltip always.
     */
    compact?: boolean;
    /** Choices under the label, in place of the detail. */
    below?: Snippet;
    /** Extra choices after the count, such as how much each one does. */
    children?: Snippet;
  } = $props();
</script>

<!-- The cell measures its own width, so a narrow counter drops its icon instead of wrapping. -->
<div class="cell">
  <div
    class="counter {tier ? 'tier-' + tier : ''}"
    class:active={value > 0}
    class:with-below={!!below}
    class:compact
    role="group"
    aria-label={name}
    title={compact ? name + (detail ? ': ' + detail + ' each' : '') : undefined}
  >
    {#if icon}<img
        class="icon"
        src={icon}
        alt=""
        width="24"
        height="24"
        loading="lazy"
      />{/if}
    {#if !compact}<span class="label">
        {label}{#if below}{@render below()}{:else if detail}<small>{detail}</small>{/if}
      </span>{:else if detail}<small
        class="each"
        aria-hidden="true"
      >
        {detail}
      </small>{/if}
    <HpStepper
      {name}
      {max}
      small={compact}
      bind:value
    />
    {@render children?.()}
  </div>
</div>

<style>
  .cell {
    min-width: 0;
    container: hp-counter / inline-size;
  }
  /* Each kind in its game color: a tinted edge and label at zero, a tinted fill once counted. */
  .counter {
    --tier: 148 163 184;
    --tier-text: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: var(--tile-height, 38px);
    padding: 2px 4px 2px 8px;
    border: 1px solid rgb(var(--tier) / 0.3);
    border-radius: 8px;
    background: var(--surface-2, transparent);
  }
  .counter.active {
    border-color: rgb(var(--tier) / 0.6);
    background: rgb(var(--tier) / 0.12);
  }
  .tier-gold {
    --tier: 255 193 7;
    --tier-text: #ffe08a;
  }
  .tier-white {
    --tier: 203 213 225;
    --tier-text: var(--text-primary);
  }
  /* Unique: the game's rainbow edge. */
  .tier-unique {
    --tier: 255 209 102;
    --tier-text: #ffe8a6;
    border-color: transparent;
    background:
      linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
      linear-gradient(135deg, #ff8a65, #ffd166 30%, #5eead4 58%, #64b5f6 76%, #ce93d8) border-box;
  }
  .tier-unique.active {
    border-color: transparent;
    background:
      linear-gradient(rgb(var(--tier) / 0.1), rgb(var(--tier) / 0.1)) padding-box,
      linear-gradient(var(--surface-2), var(--surface-2)) padding-box,
      linear-gradient(135deg, #ff8a65, #ffd166 30%, #5eead4 58%, #64b5f6 76%, #ce93d8) border-box;
  }
  :global(:root[data-theme='light']) .tier-gold {
    --tier: 217 119 6;
    --tier-text: #92400e;
  }
  :global(:root[data-theme='light']) .tier-white {
    --tier: 100 116 139;
  }
  :global(:root[data-theme='light']) .tier-unique {
    --tier: 217 119 6;
    --tier-text: #713f12;
  }
  .icon {
    flex: none;
    width: 24px;
    height: 24px;
    margin-right: -2px;
    object-fit: contain;
  }
  /* What it is, with what each one does under it. */
  .label {
    display: grid;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--tier-text);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
  }
  .label small {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  /* Icon and count side by side in the middle of a narrow cell; with room, what each one does fills the gap. */
  .compact {
    justify-content: center;
    gap: 6px;
    padding-left: 6px;
  }
  .compact .icon {
    width: 20px;
    height: 20px;
    margin-right: 0;
  }
  .each {
    display: none;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--tier-text);
    opacity: 0.85;
  }
  @container hp-counter (min-width: 150px) {
    .compact {
      justify-content: flex-start;
    }
    .each {
      display: block;
    }
  }
  @container hp-counter (max-width: 205px) {
    .counter:not(.compact) .icon {
      display: none;
    }
  }
  @container hp-counter (max-width: 104px) {
    .icon {
      display: none;
    }
  }
  /* Choices under the label take more room. */
  @container hp-counter (max-width: 285px) {
    .with-below .icon {
      display: none;
    }
  }
</style>
