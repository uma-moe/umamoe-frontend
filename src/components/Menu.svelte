<script lang="ts">
  import type { Snippet } from 'svelte';
  import { popoverPosition } from '@/lib/popover-position';
  import Icon from './Icon.svelte';
  import type { IconName } from './icon-types';
  export interface MenuItem { id: string; label: string; href?: string; icon?: IconName; danger?: boolean; disabled?: boolean; checked?: boolean; separator?: boolean; }
  interface Props { label: string; ariaLabel?: string; menuLabel?: string; icon?: IconName; iconOnly?: boolean; trigger?: Snippet; header?: Snippet; items: MenuItem[]; onselect?: (id: string) => void; }
  let { label, ariaLabel, menuLabel, icon, iconOnly = false, trigger, header, items, onselect }: Props = $props();
  const id = $props.id();
  let control: HTMLButtonElement, panel: HTMLDivElement;
  let open = $state(false), left = $state(0), top = $state(0);
  function position() {
    if (!open) return;
    const anchor = control.getBoundingClientRect();
    panel.style.minWidth = Math.min(Math.max(200, anchor.width), innerWidth - 16) + 'px';
    const box = panel.getBoundingClientRect();
    const position = popoverPosition(panel,
      Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)),
      Math.max(8, anchor.bottom + box.height + 8 <= innerHeight ? anchor.bottom + 6 : anchor.top - box.height - 6));
    left = position.left;
    top = position.top;
  }
  function buttons() { return [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')]; }
  function focusItem(last = false) { const enabled = buttons(); (last ? enabled.at(-1) : enabled.find(button => button.getAttribute('aria-checked') === 'true') ?? enabled[0])?.focus({ preventScroll:true }); }
  function close() { if (panel.matches(':popover-open')) panel.hidePopover(); control.focus({ preventScroll: true }); }
  function select(id: string) { close(); onselect?.(id); }
  function toggle(event: ToggleEvent) {
    open = event.newState === 'open';
    if (open) { position(); if (!panel.contains(document.activeElement)) focusItem(); }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { close(); return; }
    const enabled = buttons(), index = enabled.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : event.key === 'ArrowDown' ? (index + 1) % enabled.length : event.key === 'ArrowUp' ? (index - 1 + enabled.length) % enabled.length : -1;
    if (next >= 0) { event.preventDefault(); enabled[next]?.focus(); }
  }
</script>

<svelte:window onresize={position} onscroll={position}/>
<div class="menu">
  <button bind:this={control} type="button" class="trigger" class:icon-only={iconOnly} aria-label={ariaLabel ?? label} title={iconOnly ? label : undefined} aria-haspopup="menu" aria-expanded={open} aria-controls={id} popovertarget={id} onkeydown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); panel.showPopover(); focusItem(event.key === 'ArrowUp'); } }}>
    {#if trigger}{@render trigger()}{:else}{#if icon}<Icon name={icon} size={17}/>{/if}{#if !iconOnly}<span>{label}</span><Icon name="chevron" size={15}/>{/if}{/if}
  </button>
  <div bind:this={panel} {id} class="menu-panel" popover="auto" role="menu" tabindex="-1" aria-label={menuLabel ?? ariaLabel ?? label} style:left="{left}px" style:top="{top}px" ontoggle={toggle} onkeydown={keydown}>
    {#if header}<div class="menu-heading" role="presentation">{@render header()}</div>{/if}
    {#each items as item}
      {#if item.separator}<hr/>{/if}
      {#snippet content()}{#if item.icon}<Icon name={item.icon} size={17}/>{/if}<span>{item.label}</span>{/snippet}
      {#if item.href && !item.disabled}
        <a class="menu-item" href={item.href} role="menuitem" onclick={() => select(item.id)}>{@render content()}</a>
      {:else}
        <button type="button" class="menu-item" role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked} class:active={item.checked} class:danger={item.danger} disabled={item.disabled} onclick={() => select(item.id)}>{@render content()}</button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .menu { min-width: 0; width: var(--menu-width, fit-content); }
  .trigger { width:100%; height: var(--control-height); display: flex; align-items: center; gap: var(--space-2); padding: 0 10px; border: 1px solid var(--factor-field-border); border-radius: var(--radius-sm); background: var(--factor-field-bg); color: var(--factor-field-text); cursor: pointer; font-size: var(--font-sm); font-weight: 600; }
  .trigger>span{min-width:0;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.trigger.icon-only{width:var(--control-height);padding:0;justify-content:center}
  .trigger[aria-expanded=true]{border-color:var(--factor-field-focus-border)}
  .menu-panel { position:fixed; inset:auto; box-sizing:border-box; width:max-content; min-width:min(200px,calc(100vw - 16px)); max-width:calc(100vw - 16px); max-height:calc(100dvh - 16px); overflow:auto; margin:0; padding:4px; border:1px solid var(--factor-panel-border); border-radius:var(--radius-md); background:var(--factor-panel-bg); color:var(--color-text); box-shadow:var(--shadow-dropdown); }
  .menu-panel:is(:popover-open, :global(.\:popover-open)){display:grid;gap:2px}
  .menu-heading { padding:8px 12px 12px; margin-bottom:2px; border-bottom:1px solid var(--border-subtle); }
  .menu-item { min-height:36px; display:flex; align-items:center; gap:var(--space-2); padding:4px 12px; border:0; border-radius:var(--radius-sm); background:transparent; color:var(--factor-option-text); cursor:pointer; font-size:var(--font-sm); text-align:left; text-decoration:none; }
  .menu-item>span{overflow-wrap:anywhere}.menu-item:hover:not(:disabled),.menu-item:focus-visible{background:var(--factor-option-hover)}
  .menu-panel button.active{color:var(--accent-primary);background:var(--factor-option-hover)}hr{width:100%;margin:2px 0;border:0;border-top:1px solid var(--border-subtle)}
  button.danger { color: var(--color-danger); }
  button:disabled { opacity: .4; cursor: not-allowed; }
  @media (max-width: 768px) { .menu-item,.trigger { min-height:var(--touch-target); }.trigger.icon-only{min-width:var(--touch-target)} }
</style>
