<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icon-types';
  import { updatedNavigationHrefs } from '@/routes/route-manifest';
  interface Props { title: string; description: string; icon: IconName; href?: string; accent?: string; }
  let { title, description, icon, href, accent = 'primary' }: Props = $props();
  const updated = $derived(Boolean(href && updatedNavigationHrefs.has(href)));
</script>

<svelte:element this={href ? 'a' : 'div'} {href} class="quick-link" class:disabled={!href} class:updated-feature={updated} aria-disabled={href ? undefined : true} style:--feature-accent={`var(--${accent === 'pink' || accent === 'purple' ? 'color' : 'accent'}-${accent})`}>
  <Icon name={icon} size={32}/>
  <span class="link-content"><strong>{title}{#if updated}<small class="updated-badge">Updated</small>{/if}</strong><span>{description}</span></span>
  {#if !href}<small class="coming-soon-badge">Coming soon</small>{/if}
</svelte:element>

<style>
  .quick-link { position:relative; min-width:0; display:flex; align-items:center; gap:1rem; padding:1.5rem; border:1px solid var(--card-surface-border); border-radius:var(--radius-lg); background:var(--card-surface-bg); box-shadow:var(--card-surface-shadow); color:var(--text-primary); text-decoration:none; transition:transform .3s,box-shadow .3s; }
  .quick-link:not(.disabled):hover { transform:translateY(-2px); border-color:var(--border-secondary); box-shadow:var(--card-surface-hover-shadow); }
  .quick-link :global(svg) { flex:none; color:var(--feature-accent); }
  .link-content { min-width:0; flex:1; display:flex; flex-direction:column; text-align:left; }
  strong { margin-bottom:.25rem; font-size:1.125rem; font-weight:600; }
  .link-content>span { color:var(--text-secondary); font-size:.875rem; }
  .disabled { cursor:not-allowed; }.disabled .link-content,.disabled>:global(svg){opacity:.6}
  small { display:inline-block; padding:.15rem .4rem; border-radius:var(--radius-sm); color:#fff; font-size:.6rem; font-weight:700; line-height:1.5; letter-spacing:.5px; white-space:nowrap; text-transform:uppercase; }
  .coming-soon-badge { position:absolute; top:12px; right:12px; background:linear-gradient(45deg,#ff9800,#ffb74d); box-shadow:0 2px 8px rgb(255 152 0/.4); }
  .updated-badge { margin-left:.5rem; background:linear-gradient(45deg,#2196f3,#81c784); box-shadow:0 2px 8px rgb(33 150 243/.4); }
  :global([data-theme='light']) .coming-soon-badge { background:var(--accent-warning); }
  :global([data-theme='light']) .updated-badge { background:var(--accent-primary); }
  @media (prefers-reduced-motion:no-preference) {
    .updated-badge { animation:updated-badge 2s ease-in-out infinite; }
  }
  @keyframes updated-badge { 0%,100% { transform:scale(1); } 50% { transform:scale(1.05); } }
  @media (max-width:767px) { .quick-link { padding:10px; gap:10px; } .quick-link :global(svg) { width:24px; height:24px; } strong { font-size:13px; margin-bottom:2px; } .link-content>span { font-size:12px; } .coming-soon-badge { position:static; margin-left:auto; font-size:8px; } .updated-badge { font-size:8px; } }
</style>
