<script lang="ts">
  import Icon from './Icon.svelte';
  import { router } from '@/routes/router';
  import type { NavigationItem, NavigationVariant } from './navigation-types';

  interface Props {
    items: NavigationItem[];
    label?: string;
    variant?: NavigationVariant;
    onnavigate?: () => void;
  }

  let { items, label = 'Primary navigation', variant = 'rail', onnavigate }: Props = $props();
  let navigationElement: HTMLElement;
  const navigationId = $props.id();
  let openItems = $state<Record<string, boolean>>({});
  let currentSection: string | undefined;
  let navigationWidth = $state<number>();

  function measureNavigation(node: HTMLElement) {
    const observer = new ResizeObserver(([entry]) => { if (entry) navigationWidth = entry.contentRect.width; });
    observer.observe(node);
    return { destroy() { observer.disconnect(); } };
  }

  function isFlyout() { return variant === 'rail' && (navigationWidth ?? 0) < 100; }

  $effect(() => {
    if (variant === 'rail' && navigationWidth === undefined) return;
    const section = items.find(item => item.expanded)?.id;
    if (section === currentSection) return;
    currentSection = section;
    openItems = section && !isFlyout() ? { [section]: true } : {};
  });

  function toggle(item: NavigationItem) {
    openItems = openItems[item.id] ? {} : { [item.id]: true };
  }

  function handleNavigate() {
    if (variant === 'sheet' || isFlyout()) openItems = {};
    onnavigate?.();
  }

  function preloadTouch(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[data-preload]');
    if (link) void router.preload(link.pathname as Parameters<typeof router.preload>[0]).catch(() => {});
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !Object.values(openItems).some(Boolean)) return;
    openItems = {};
    (event.target as HTMLElement).closest('.navigation-item')?.querySelector<HTMLButtonElement>('.navigation-disclosure')?.focus();
  }

  function handleOutsidePointer(event: PointerEvent) {
    if (!isFlyout() || !Object.values(openItems).some(Boolean)) return;
    if (!event.composedPath().includes(navigationElement)) openItems = {};
  }
</script>

<svelte:window onpointerdown={handleOutsidePointer}/>

<nav bind:this={navigationElement} use:measureNavigation class="navigation-tree" class:sheet={variant === 'sheet'} aria-label={label} onpointerdown={preloadTouch}>
  {#each items as item (item.id)}
    <div class="navigation-item" class:has-children={Boolean(item.children?.length)} class:open={openItems[item.id]} class:current={item.current}>
      <div class="navigation-parent">
        {#if item.children?.length}
          <button
            class="navigation-link navigation-disclosure"
            class:has-badge={Boolean(item.badge)}
            type="button"
            aria-label={`${openItems[item.id] ? 'Collapse' : 'Open'} ${item.label} subsections`}
            aria-describedby={item.badge ? `${navigationId}-badge-${item.id}` : undefined}
            aria-expanded={openItems[item.id] ?? false}
            aria-controls={`${navigationId}-subsections-${item.id}`}
            title={`${item.label} subsections${item.badge ? ` — ${item.badge}` : ''}`}
            onkeydown={handleKeydown}
            onclick={() => toggle(item)}>
            <Icon name={item.icon} size={19}/>
            <span class="navigation-label">{item.label}{#if item.badge}<small class="navigation-badge section-badge" id={`${navigationId}-badge-${item.id}`} aria-hidden="true">{item.badge}</small>{/if}</span>
            <span class="disclosure-chevron"><Icon name="chevron" size={15}/></span>
          </button>
        {:else}
          <a class="navigation-link" class:has-badge={Boolean(item.badge)} href={item.href} data-preload="hover" title={`${item.label}${item.badge ? ` — ${item.badge}` : ''}`} aria-label={item.label} aria-describedby={item.badge ? `${navigationId}-badge-${item.id}` : undefined} aria-current={item.current ? 'page' : undefined} onclick={handleNavigate} onkeydown={handleKeydown}>
            <Icon name={item.icon} size={19}/><span class="navigation-label">{item.label}</span>
            {#if item.badge}<small class="navigation-badge" id={`${navigationId}-badge-${item.id}`} aria-hidden="true">{item.badge}</small>{/if}
          </a>
        {/if}
      </div>

      {#if item.children?.length && openItems[item.id]}
        <div class="navigation-subsections" id={`${navigationId}-subsections-${item.id}`}>
          <a class="subsection-parent" href={item.href} data-preload="hover" aria-label={item.label} aria-current={item.current && !item.children.some(child => child.current) ? 'page' : undefined} onclick={handleNavigate} onkeydown={handleKeydown}><span>{item.label}</span><small>Open section</small></a>
          {#each item.children as child (child.id)}
            <a href={child.href} data-preload="hover" aria-label={child.label} aria-describedby={child.badge ? `${navigationId}-badge-${item.id}-${child.id}` : undefined} aria-current={child.current ? 'page' : undefined} onclick={handleNavigate} onkeydown={handleKeydown}>
              <span>{child.label}</span>
              {#if child.badge}<small class="navigation-badge" id={`${navigationId}-badge-${item.id}-${child.id}`} aria-hidden="true">{child.badge}</small>{/if}
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .navigation-tree { display: grid; gap: 2px; }
  .navigation-item { position: relative; min-width: 0; }
  .navigation-parent { display: grid; grid-template-columns: minmax(0, 1fr); align-items: center; }
  .navigation-link, .navigation-disclosure, .navigation-subsections a { color: var(--color-text-subtle); text-decoration: none; }
  .navigation-link { min-width: 0; min-height: 38px; display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 0 var(--space-2); border-radius: var(--radius-sm); font-size: var(--font-sm); }
  .navigation-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .navigation-link small { color: var(--color-text-subtle); font-size: var(--font-xs); }
  .section-badge { margin-left:8px; }
  .navigation-link:hover, .navigation-link:focus-visible, .navigation-disclosure:hover, .navigation-disclosure:focus-visible { background: var(--surface-2); color: var(--color-text); }
  .navigation-link[aria-current='page'], .current > .navigation-parent .navigation-link, .current > .navigation-parent .navigation-disclosure { color: var(--accent-primary); }
  .open > .navigation-parent { border-radius: var(--radius-sm); }
  .navigation-disclosure { width:100%; border:0; background:transparent; cursor:pointer; text-align:left; }
  .disclosure-chevron { display: grid; transition: transform 140ms ease; transform: rotate(-90deg); }
  .open > .navigation-parent .disclosure-chevron { transform: rotate(0); }
  .navigation-subsections { display:grid; gap:1px; margin:0 0 2px 18px; padding:0 0 0 14px; border-left:1px solid var(--border-subtle); }
  .navigation-subsections a { min-height:28px; display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:6px; padding:3px 8px; border-radius:var(--radius-sm); font-size:12px; line-height:1.25; }
  .navigation-subsections a:hover, .navigation-subsections a:focus-visible { background: var(--surface-2); color: var(--color-text); }
  .navigation-subsections a[aria-current='page'] { color:var(--accent-primary); background:rgb(var(--accent-primary-rgb)/.1); font-weight:600; }
  .navigation-subsections small { color: var(--color-text-subtle); }
  .navigation-tree .navigation-badge { display:inline-block; padding:2px 5px; border-radius:var(--radius-sm); background:var(--color-accent-soft); color:var(--color-accent); font-size:9px; font-weight:700; line-height:1.4; white-space:nowrap; }
  .subsection-parent { font-weight:600; }.subsection-parent small { font-size:9px;font-weight:400; }

  @container app-viewport (min-width: 768px) and (max-width: 1799px) {
    .navigation-tree:not(.sheet) .navigation-parent { display: block; }
    .navigation-tree:not(.sheet) .navigation-link { min-height: var(--touch-target); display: grid; grid-template-columns: 1fr; place-items: center; padding: 0; }
    .navigation-tree:not(.sheet) .navigation-label,
    .navigation-tree:not(.sheet) .navigation-link small { display: none; }
    .navigation-tree:not(.sheet) .navigation-link.has-badge { position:relative; }
    .navigation-tree:not(.sheet) .navigation-link.has-badge::after { content:''; position:absolute; top:6px; right:5px; width:6px; height:6px; border-radius:50%; background:var(--color-accent); }
    .navigation-tree:not(.sheet) .navigation-disclosure { position: relative; width: 100%; grid-template-columns: 1fr 12px; column-gap:0; padding: 0 4px 0 10px; }
    .navigation-tree:not(.sheet) .disclosure-chevron { transform: rotate(-90deg); }
    .navigation-tree:not(.sheet) .open > .navigation-parent .disclosure-chevron { transform: rotate(-90deg); }
    .navigation-tree:not(.sheet) .open > .navigation-parent { border-radius: var(--radius-sm); }
    .navigation-tree:not(.sheet) .navigation-subsections { position: absolute; z-index: var(--z-overlay); top: -1px; left: calc(100% + 9px); width: 204px; margin: 0; padding: 4px 6px 6px; border: 1px solid var(--border-primary); border-left-color: var(--border-subtle); border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--bg-secondary); box-shadow: var(--shadow-md); }
    .navigation-tree:not(.sheet) .navigation-subsections a { min-height: 34px; grid-template-columns: minmax(0, 1fr) auto; padding-inline: 10px; font-size: var(--font-xs); }
    .navigation-tree:not(.sheet) .subsection-parent { display: grid !important; min-height: 38px; border-bottom: 1px solid var(--border-subtle); border-radius: 0; color: var(--color-text); font-weight: 750; }
    .navigation-tree:not(.sheet) .subsection-parent small { font-size: 9px; font-weight: 500; }
  }

  .sheet { gap:2px; }
  .sheet .navigation-link, .sheet .navigation-subsections a { min-height:40px; font-size:var(--font-sm); }

  :global(html[data-motion='reduced']) .disclosure-chevron { transition: none; }
  @media (prefers-reduced-motion: reduce) { .disclosure-chevron { transition: none; } }
</style>
