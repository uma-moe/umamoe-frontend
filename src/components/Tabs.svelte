<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icon-types';
  export interface TabItem { id: string; label: string; badge?: string; icon?: IconName; description?: string; href?: string; scrollToTop?: boolean; onintent?: () => void; }
  interface Props { items: TabItem[]; value?: string; label?: string; variant?: 'segmented' | 'underline' | 'pills'; id?: string; controls?: string; onchange?: (value: string) => void; }
  const generatedId = $props.id();
  let { items, value = $bindable(''), label = 'Sections', variant = 'segmented', id = generatedId, controls, onchange }: Props = $props();
  let root=$state<HTMLElement>();
  $effect(()=>{
    value;items;
    if(!root)return;
    const active=root.querySelector<HTMLElement>('[aria-selected="true"],[aria-current="page"]');
    if(!active)return;
    const left=active.getBoundingClientRect().left-root.getBoundingClientRect().left+root.scrollLeft;
    const right=left+active.offsetWidth;
    if(left<root.scrollLeft)root.scrollLeft=left;
    else if(right>root.scrollLeft+root.clientWidth)root.scrollLeft=right-root.clientWidth;
  });
  const navigation = $derived(items.some(item => item.href));
  function select(id: string) { value = id; onchange?.(id); }
  function navigate(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length
      : event.key === 'ArrowLeft' ? (index - 1 + items.length) % items.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    select(items[next]!.id);
    const button = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
</script>
{#snippet content(item: TabItem)}
  {#if item.icon}<Icon name={item.icon} size={18}/>{/if}
  {#if item.description !== undefined}<span class="tab-copy"><strong>{item.label}</strong><small id={id + '-' + item.id + '-description'}>{item.description}</small></span>{:else}<span class="tab-label">{item.label}</span>{/if}
  {#if item.badge}<small>{item.badge}</small>{/if}
{/snippet}
<svelte:element bind:this={root} this={navigation ? 'nav' : 'div'} {id} class="tabs" class:navigation={navigation || variant === 'pills'} class:underline={variant === 'underline'} class:detailed={items.some(item => item.description !== undefined)} role={navigation ? undefined : 'tablist'} aria-label={label}>
  {#each items as item, index}
    {#if item.href}
      <a class="tab" class:active={value === item.id} href={item.href} data-scroll-to-top={item.scrollToTop === false ? 'false' : undefined} aria-current={value === item.id ? 'page' : undefined} onpointerenter={item.onintent} onfocus={item.onintent}>{@render content(item)}</a>
    {:else}
      <button class="tab" id={id + '-' + item.id} type="button" role="tab" aria-controls={controls} aria-label={item.description !== undefined ? item.label : undefined} aria-describedby={item.description !== undefined ? id + '-' + item.id + '-description' : undefined} tabindex={value === item.id || (!items.some((tab) => tab.id === value) && index === 0) ? 0 : -1} onkeydown={(event) => navigate(event, index)} aria-selected={value === item.id} class:active={value === item.id} onclick={() => select(item.id)}>{@render content(item)}</button>
    {/if}
  {/each}
</svelte:element>
<style>
  .tabs { display: flex; gap: 2px; max-width: 100%; padding: 3px; overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2); scrollbar-width: none; }
  .tab { min-width: max-content; min-height: 38px; display:inline-flex; align-items:center; justify-content:center; gap:6px; padding: 0 var(--space-3); flex: 1 1 0; border: 0; border-radius: calc(var(--radius-md) - 3px); background: transparent; color: var(--color-text-muted); cursor: pointer; font-size: var(--font-sm); font-weight: 700; text-decoration:none; }
  .tab:hover { color: var(--color-text); } .tab.active { background: var(--color-surface-1); color: var(--color-accent); box-shadow: var(--shadow-sm); }
  .underline { padding:0; border:0; border-bottom:1px solid var(--border-primary); border-radius:0; background:transparent; }.underline .tab { min-height:var(--touch-target); border-radius:0; border-bottom:2px solid transparent; font-weight:600; }.underline .tab.active { background:transparent; border-bottom-color:var(--color-accent); box-shadow:none; }
  small { margin-left: 6px; color: var(--color-text-subtle); }
  .navigation{gap:4px;padding:4px;align-items:stretch;border-color:var(--tab-bar-border);border-radius:10px;background:var(--tab-bar-bg)}
  .navigation .tab{flex:0 0 auto;min-width:92px;min-height:34px;gap:6px;padding:0 16px;border:1px solid transparent;border-radius:8px;font-size:.875rem;font-weight:500;color:var(--tab-btn-color);box-shadow:none;white-space:nowrap}
  .navigation .tab:hover,.navigation .tab:focus-visible{color:var(--text-primary);background:var(--tab-btn-hover-bg)}
  .navigation .tab.active{color:var(--accent-primary);background:rgb(var(--accent-primary-rgb)/.12);border-color:rgb(var(--accent-primary-rgb)/.3)}
  .navigation small{display:inline-grid;place-items:center;min-width:18px;height:18px;margin-left:7px;padding:0 4px;border:1px solid var(--border-primary);border-radius:9px;background:var(--surface-3);color:var(--text-primary);font-size:10px;font-weight:700;line-height:16px;font-variant-numeric:tabular-nums}
  .navigation .active small{color:var(--accent-primary);background:rgb(var(--accent-primary-rgb)/.12);border-color:rgb(var(--accent-primary-rgb)/.32)}
  .detailed{overflow:hidden}.detailed .tab{min-width:0;min-height:46px;justify-content:flex-start;gap:9px;padding:8px 12px;text-align:left}.tab-copy{display:grid;gap:2px;min-width:0}.tab-copy strong{font-size:12px}.tab-copy small{overflow:hidden;margin:0;font-size:10px;font-weight:400;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:760px){.detailed .tab{min-height:var(--touch-target);justify-content:center;padding:0 5px;gap:5px}.tab-copy small{display:none}.tab-copy strong{font-size:11px}}
  @media(max-width:767px){.tab,.navigation .tab,.detailed .tab{min-height:30px}.navigation .tab{min-width:0;padding-inline:10px;font-size:12px}.tab :global(svg){width:16px;height:16px}}
</style>
