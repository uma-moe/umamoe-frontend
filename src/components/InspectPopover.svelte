<script lang="ts">
  import type { Snippet } from 'svelte';
  import { popoverPosition } from '@/lib/popover-position';
  import Icon from './Icon.svelte';
  interface Props { label: string; trigger: Snippet; children: Snippet; align?: 'start' | 'end'; placement?: 'below' | 'over'; openOnHover?: boolean; onopenchange?: (open: boolean) => void; }
  let { label, trigger, children, align = 'start', placement = 'below', openOnHover = false, onopenchange }: Props = $props();
  const id = $props.id();
  let control: HTMLButtonElement;
  let panel: HTMLDivElement;
  let open = $state(false);
  let mounted = $state(false);
  let hoverOpened = false;
  let left = $state(0);
  let top = $state(0);
  function positionPanel() {
    if (!open) return;
    const anchor = control.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const position = popoverPosition(panel,
      Math.max(8, Math.min(align === 'end' ? anchor.right - box.width : anchor.left, innerWidth - box.width - 8)),
      Math.max(8, Math.min(placement === 'over' ? anchor.top - 4 : anchor.bottom + box.height + 8 <= innerHeight ? anchor.bottom + 7 : anchor.top - box.height - 7, innerHeight - box.height - 8)));
    left = position.left;
    top = position.top;
  }
  $effect(positionPanel);
  function close() { if (panel.matches(':popover-open')) panel.hidePopover(); control.focus(); }
  function hover(show: boolean) {
    if (!openOnHover || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (show && !panel.matches(':popover-open')) { hoverOpened = true; panel.showPopover(); }
    else if (!show && panel.matches(':popover-open') && !panel.contains(document.activeElement) && document.activeElement !== control) panel.hidePopover();
  }
  function activate(event: MouseEvent) {
    // The first click pins a hover preview instead of immediately toggling it closed.
    if (hoverOpened && panel.matches(':popover-open')) { event.preventDefault(); hoverOpened = false; control.focus(); }
  }
  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !panel.matches(':popover-open') || event.defaultPrevented) return;
    event.preventDefault();
    close();
  }
</script>

<svelte:window onresize={positionPanel} onscroll={positionPanel} onkeydown={escape}/>
<div class="inspect" class:open role="group" aria-label={label} onpointerenter={() => hover(true)} onpointerleave={() => hover(false)}>
  <button bind:this={control} type="button" class="trigger" aria-label={label} aria-expanded={open} aria-haspopup="dialog" popovertarget={id} onclick={activate}>{@render trigger()}</button>
  <div bind:this={panel} {id} popover="auto" class="popover" role="dialog" aria-label={label} style:left="{left}px" style:top="{top}px" onbeforetoggle={(event) => { if (event.newState === 'open') mounted = true; }} ontoggle={(event) => { open = event.newState === 'open'; if (!open) hoverOpened = false; onopenchange?.(open); }}>{#if mounted}<button type="button" class="close" aria-label={`Close ${label}`} onclick={close}><Icon name="close" size={14}/></button>{@render children()}{/if}</div>
</div>

<style>
  .inspect { position: relative; display: inline-flex; }.trigger { min-width: 0; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; font: inherit; text-align: inherit; }.trigger:focus-visible { border-radius: var(--radius-sm); outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .popover { position: fixed; inset: auto; box-sizing: border-box; width: min(var(--inspect-popover-width, 310px), calc(100vw - 16px)); max-height: calc(100dvh - 16px); overflow-y: auto; margin: 0; padding: var(--inspect-popover-padding, 12px 42px 12px 12px); border: 1px solid var(--factor-panel-border); border-radius: var(--radius-md); background: var(--factor-panel-bg); color: var(--color-text); box-shadow: var(--shadow-dropdown); }
  .close { position: absolute; top: 5px; right: 5px; width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-subtle); cursor: pointer; }.close:hover { background: var(--factor-option-hover); color: var(--color-text); }
  @media (max-width: 767px) { .trigger { min-width: var(--touch-target); min-height: var(--touch-target); }.close { width: var(--touch-target); height: var(--touch-target); top: 0; right: 0; }.popover { padding: var(--inspect-popover-padding, 12px 48px 12px 12px); } }
</style>
