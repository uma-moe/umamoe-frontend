<script lang="ts">
  interface Props {
    value: number;
    max?: number;
    label?: string;
    unit?: string;
    tone?: 'accent' | 'success' | 'warning' | 'danger';
    compact?: boolean;
  }

  let { value, max = 100, label, unit = '%', tone = 'accent', compact = false }: Props = $props();
  const percent = $derived(Math.max(0, Math.min(100, max === 0 ? 0 : (value / max) * 100)));
</script>

<div
  class="metric metric--{tone}"
  class:compact
  aria-label={label ? `${label}: ${value}${unit}` : `${value}${unit}`}
>
  {#if label}
    <span class="label">{label}</span>
  {/if}
  <span
    class="track"
    aria-hidden="true"
  >
    <span
      class="fill"
      style={`--metric-fill:${percent / 100}`}
    ></span>
  </span>
  <output>{value}{unit}</output>
</div>

<style>
  .metric {
    --metric-color: var(--color-accent);
    min-width: 110px;
    display: grid;
    grid-template-columns: minmax(48px, 1fr) auto;
    align-items: center;
    gap: 6px;
    color: var(--color-text);
    font-variant-numeric: tabular-nums;
  }
  .metric--success {
    --metric-color: var(--color-secondary);
  }
  .metric--warning {
    --metric-color: var(--color-warning);
  }
  .metric--danger {
    --metric-color: var(--color-danger);
  }
  .label {
    grid-column: 1 / -1;
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    line-height: 1.1;
  }
  .track {
    height: 7px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--color-surface-3);
  }
  .fill {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: inherit;
    background: var(--metric-color);
    transform: scaleX(var(--metric-fill));
    transform-origin: left center;
    transition: transform var(--duration-normal) var(--easing-standard);
  }
  output {
    min-width: 42px;
    color: var(--color-text);
    font-size: var(--font-xs);
    font-weight: 700;
    line-height: 1;
    text-align: right;
  }
  .compact {
    min-width: 90px;
    gap: 4px;
  }
  .compact .track {
    height: 5px;
  }
  .compact output {
    min-width: 38px;
    font-size: 10px;
  }
</style>
