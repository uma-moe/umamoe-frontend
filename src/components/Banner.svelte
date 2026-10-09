<script lang="ts">
  import type { Snippet } from 'svelte';
  import { DISCORD_SUPPORT_URL } from '@/services/site-links';
  import Icon from './Icon.svelte';
  interface Props { title: string; tone?: 'info' | 'success' | 'warning' | 'danger'; children?: Snippet; dismissible?: boolean; reportable?: boolean; ondismiss?: () => void; }
  let { title, tone = 'info', children, dismissible = false, reportable = true, ondismiss }: Props = $props();
  let visible = $state(true);
</script>

{#if visible}
  <aside class="banner banner--{tone}" aria-live={tone === 'danger' ? 'assertive' : 'polite'}>
    <Icon name={tone === 'success' ? 'check' : tone === 'warning' || tone === 'danger' ? 'warning' : 'info'} size={19} />
    <div class="banner-content" data-nosnippet={tone === 'danger' || tone === 'warning' ? '' : undefined}>
      <strong>{title}</strong>
      {#if children}<div>{@render children()}</div>{/if}
      {#if tone === 'danger' && reportable}
        <a class="report-link" href={DISCORD_SUPPORT_URL} target="_blank" rel="noopener noreferrer">
          <Icon name="discord" size={15}/><span>Report on Discord</span>
        </a>
      {/if}
    </div>
    {#if dismissible}<button type="button" aria-label="Dismiss" onclick={() => { visible = false; ondismiss?.(); }}><Icon name="close" size={17}/></button>{/if}
  </aside>
{/if}

<style>
  .banner { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid color-mix(in srgb, currentColor 30%, transparent); border-radius: var(--radius-md); background: color-mix(in srgb, currentColor 12%, var(--surface-1)); color: var(--color-accent); }
  .banner--success { color: var(--color-secondary); }
  .banner--warning { color: var(--color-warning); }
  .banner--danger { color: var(--color-danger); }
  strong { display: block; font-size: var(--font-sm); }
  div :global(p) { margin: var(--space-1) 0 0; color: inherit; font-size: var(--font-sm); }
  .report-link { min-height: 32px; width: max-content; display: inline-flex; align-items: center; gap: 6px; margin-top: var(--space-2); padding: 0 10px; border: 1px solid color-mix(in srgb, currentColor 42%, transparent); border-radius: var(--radius-sm); color: inherit; font-size: var(--font-xs); font-weight: 700; text-decoration: none; }
  .report-link:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
  button { width: 32px; height: 32px; display: grid; place-items: center; margin: -5px; padding: 0; border: 0; border-radius: var(--radius-sm); background: transparent; color: currentColor; cursor: pointer; }
  button:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
  @media (max-width: 767px) { .report-link { min-height: var(--touch-target); } button { width: var(--touch-target); height: var(--touch-target); } }
</style>
