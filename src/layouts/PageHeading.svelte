<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    id?: string;
    description?: string;
    metadata?: string;
    eyebrow?: string;
    tone?: 'brand' | 'primary' | 'warning' | 'rainbow';
    actions?: Snippet;
    leading?: Snippet;
    flush?: boolean;
    mobileHeading?: 'default' | 'actions-only';
    compact?: boolean;
  }

  let {
    title,
    id,
    description,
    metadata,
    eyebrow,
    tone = 'brand',
    actions,
    leading,
    flush = false,
    mobileHeading = 'default',
    compact = false
  }: Props = $props();
</script>

<header
  class="page-heading"
  class:flush
  class:compact
  class:actions-only={mobileHeading === 'actions-only'}
  data-tone={tone}
>
  <div>
    {#if eyebrow}
      <span class="eyebrow">{eyebrow}</span>
    {/if}
    <div class="heading-title">
      {#if leading}
        <div class="heading-leading">{@render leading()}</div>
      {/if}
      <h1 {id}>{title}</h1>
    </div>
    {#if metadata}
      <div class="heading-meta">
        {#if description}
          <p>{description}</p>
        {/if}
        <span>{metadata}</span>
      </div>
    {:else if description}
      <p>{description}</p>
    {/if}
  </div>
  {#if actions}
    <div class="page-actions">{@render actions()}</div>
  {/if}
</header>

<style>
  .page-heading {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0;
    padding: var(--space-6) var(--page-gutter-current, 0px);
    color: var(--color-text);
  }
  .page-heading > div:first-child {
    min-width: 0;
  }
  .eyebrow {
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    font-weight: 600;
  }
  .heading-title,
  .heading-leading {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .heading-leading {
    flex: none;
  }
  h1 {
    margin: var(--space-2) 0;
    font-size: clamp(24px, 2.4vw, 32px);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.035em;
    overflow-wrap: anywhere;
  }
  p {
    max-width: 92ch;
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--font-md);
    font-weight: 500;
    line-height: 1.4;
  }
  .heading-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .heading-meta > span {
    color: var(--text-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .page-actions {
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .flush {
    padding-bottom: 12px;
  }
  .compact {
    padding-block: 12px;
    gap: 12px;
  }
  .compact h1 {
    margin: 0 0 4px;
    font-size: 24px;
  }
  .compact p {
    font-size: 12px;
  }
  @media (max-width: 767px) {
    .page-heading {
      padding-block: 12px;
      gap: 8px;
    }
    h1 {
      margin: 4px 0;
      font-size: 24px;
    }
    p {
      font-size: 12px;
    }
    .heading-meta > span {
      font-size: 11px;
    }
    .page-actions {
      justify-content: flex-start;
      gap: 4px;
    }
    .flush.actions-only {
      position: sticky;
      z-index: calc(var(--z-header) - 1);
      top: var(--utility-height);
      display: block;
      padding: 6px 4px;
      border-bottom: 1px solid var(--border-primary);
      background: var(--bg-secondary);
      box-shadow: 0 5px 14px rgb(0 0 0 / 0.2);
    }
    .actions-only > div:first-child {
      display: none;
    }
    .actions-only .page-actions {
      width: 100%;
    }
  }
</style>
