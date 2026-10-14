<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    detail?: string;
    trend?: 'up' | 'down' | 'flat';
    tone?: 'neutral' | 'accent' | 'success' | 'warning';
    compact?: boolean;
    padding?: 'sm' | 'md';
    valueColor?: string;
  }
  let {
    label,
    value,
    detail,
    trend = 'flat',
    tone = 'neutral',
    compact = false,
    padding = 'md',
    valueColor
  }: Props = $props();
</script>

<article
  class="stat stat--{tone}"
  class:compact
  class:small-padding={padding === 'sm'}
>
  <span>{label}</span>
  <strong style:color={valueColor}>{value}</strong>
  {#if detail}
    <small class="trend--{trend}">{detail}</small>
  {/if}
</article>

<style>
  .stat {
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--card-surface-border);
    border-radius: var(--radius-md);
    background: var(--card-surface-bg);
  }
  span {
    display: block;
    overflow: hidden;
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    display: block;
    margin-top: var(--space-1);
    font-size: clamp(1.3rem, 5cqi, 1.8rem);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  small {
    display: block;
    margin-top: var(--space-1);
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  .stat--accent strong {
    color: var(--color-accent);
  }
  .stat--success strong {
    color: var(--color-success);
  }
  .stat--warning strong {
    color: var(--color-warning);
  }
  .trend--up {
    color: var(--color-success);
  }
  .trend--down {
    color: var(--color-danger);
  }
  .compact {
    padding: 0.75rem;
    text-align: center;
  }
  .compact span {
    margin-bottom: 0.25rem;
    color: var(--text-muted);
    font-size: 0.7rem;
    font-weight: 400;
    line-height: 1.5;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .compact strong {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.1rem;
    font-weight: 600;
    line-height: 1.5;
    font-variant-numeric: normal;
  }
  .compact small {
    margin-top: 0.15rem;
    color: var(--text-disabled);
    font-size: 0.7rem;
    line-height: 1.5;
  }
  :global([data-theme='light']) .compact {
    border-color: var(--card-surface-border);
  }
  @media (max-width: 768px) {
    .compact {
      padding: 0.6rem;
    }
    .compact strong {
      font-size: 0.95rem;
    }
    .compact span,
    .compact small {
      font-size: 0.6rem;
    }
  }
  @media (max-width: 480px) {
    .compact {
      padding: 0.5rem;
    }
    .compact strong {
      font-size: 0.85rem;
    }
  }
  .small-padding {
    padding: var(--space-1) var(--space-2);
  }
</style>
