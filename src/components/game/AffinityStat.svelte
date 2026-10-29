<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    value: number;
    label?: string;
    kind?: 'base' | 'race' | 'total';
    compact?: boolean;
  }

  let { value, label, kind = 'base', compact = false }: Props = $props();

  const defaultLabels = { base: 'Affinity', race: 'Race affinity', total: 'Total affinity' };

  const displayLabel = $derived(label ?? defaultLabels[kind]);
</script>

<span
  class="affinity affinity--{kind}"
  class:compact
  aria-label={`${displayLabel}: ${value}`}
  title={displayLabel}
>
  {#if compact}
    <Icon
      name={kind === 'race' ? 'trophy' : 'heart'}
      size={12}
    />
  {/if}
  <b>{value}</b>
  {#if !compact}
    <small>{displayLabel}</small>
  {/if}
</span>

<style>
  .affinity {
    width: fit-content;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    color: var(--affinity-color, var(--color-pink));
  }
  .affinity--race {
    --affinity-color: var(--accent-warning);
  }
  b {
    font-size: 18px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
  }
  small {
    color: var(--color-text-muted);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .compact {
    min-height: 21px;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    padding: 1px 4px;
    border: 1px solid color-mix(in srgb, var(--affinity-color, var(--accent-pink)) 38%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--affinity-color, var(--accent-pink)) 9%, transparent);
    color: var(--affinity-color, var(--accent-pink));
  }
  .compact b {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    line-height: normal;
  }
</style>
