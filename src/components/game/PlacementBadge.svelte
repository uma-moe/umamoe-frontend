<script lang="ts">
  import Icon from '../Icon.svelte';

  interface Props {
    placement: number;
    compact?: boolean;
  }

  let { placement, compact = false }: Props = $props();

  const suffix = $derived.by(() => {
    const lastTwoDigits = placement % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return 'th';
    switch (placement % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  });
</script>

<span
  class="placement placement--{Math.min(placement, 4)}"
  class:compact
  aria-label={`${placement}${suffix} place`}
>
  <Icon
    name="trophy"
    size={compact ? 12 : 15}
  />
  <b>{placement}{suffix}</b>
</span>

<style>
  .placement {
    width: fit-content;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, currentColor 34%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, currentColor 9%, var(--surface-1));
    color: var(--color-text-muted);
    font-size: 10px;
    box-shadow: none;
  }
  b {
    font-weight: 800;
    line-height: 1;
  }
  .placement--1 {
    color: #ffd700;
  }
  .placement--2 {
    color: #c0c0c0;
  }
  .placement--3 {
    color: #cd7f32;
  }
  .compact {
    min-height: 22px;
    padding: 1px 6px;
    font-size: 9px;
  }
</style>
