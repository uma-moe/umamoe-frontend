<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy } from 'svelte';
  import { privacyUiOpen } from '@/services/ads/privacy-ui';
  import DialogPanel from './DialogPanel.svelte';
  import type { IconName } from './icon-types';
  interface Props { id?: string; open?: boolean; title: string; description?: string; icon?: IconName; image?: string; children: Snippet; headerIdentity?: Snippet<[string | undefined, string | undefined]>; headerActions?: Snippet; eyebrow?: Snippet; actions?: Snippet; mobileActionsStack?: boolean; maxWidth?: string; maxHeight?: string; mobileMaxHeight?: string; mobileInset?: string; height?: string; stretchContent?: boolean; contentPadding?: string; mobileContentPadding?: string; onclose?: () => void; }
  const instanceId = $props.id();
  let { id = instanceId, open = $bindable(false), title, description, icon, image, children, headerIdentity, headerActions, eyebrow, actions, mobileActionsStack = false, maxWidth = '540px', maxHeight = '80dvh', mobileMaxHeight, mobileInset = '8px', height, stretchContent = true, contentPadding, mobileContentPadding, onclose }: Props = $props();
  let element: HTMLDialogElement;
  let returnFocus: HTMLElement | undefined;
  let backdropPointerDown = false;
  let mounted = $state(false);
  function restoreFocus() {
    if (element?.open || $privacyUiOpen) return;
    // Wait for native close processing before retrying a focus lost by WebKit.
    // Do not take focus from a new control or a subsequently opened dialog.
    if (returnFocus?.isConnected && (document.activeElement === document.body || element?.contains(document.activeElement))) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = undefined;
  }
  function closeElement() {
    if (!element?.open) return;
    element.close();
    if (!$privacyUiOpen && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function close() { closeElement(); open = false; onclose?.(); }
  onDestroy(() => { closeElement(); restoreFocus(); });
  $effect(() => {
    if (!element?.isConnected) return;
    if (open && !$privacyUiOpen && !element.open) {
      mounted = true;
      returnFocus ??= document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      element.showModal();
    }
    if ((!open || $privacyUiOpen) && element.open) closeElement();
  });
</script>

<dialog style:--dialog-max-width={maxWidth} style:--dialog-max-height={maxHeight} style:--dialog-mobile-max-height={mobileMaxHeight ?? maxHeight} style:--dialog-mobile-inset={mobileInset} style:--dialog-height={height ?? 'fit-content'} style:--dialog-content-padding={contentPadding} style:--dialog-mobile-content-padding={mobileContentPadding}
  bind:this={element}
  class:mobile-actions-stack={mobileActionsStack}
  class:fixed-height={Boolean(height) && stretchContent}
  aria-labelledby="{id}-title"
  aria-describedby={description ? `${id}-description` : undefined}
  onclose={restoreFocus}
  oncancel={(event) => { event.preventDefault(); close(); }}
  onpointerdown={(event) => { backdropPointerDown = event.target === event.currentTarget; }}
  onpointercancel={() => backdropPointerDown = false}
  onclick={(event) => { if (backdropPointerDown && event.target === event.currentTarget) close(); backdropPointerDown = false; }}
>
  {#if open || mounted}<DialogPanel {title} {description} {icon} {image} titleId={`${id}-title`} descriptionId={description ? `${id}-description` : undefined} {headerIdentity} {headerActions} {eyebrow} {actions} onclose={close}>{@render children()}</DialogPanel>{/if}
</dialog>
<style>
  /* Native top-layer dialogs stretch between their insets with height:auto. */
  dialog { --dialog-height-limit:var(--dialog-max-height); width:min(90%,var(--dialog-max-width)); max-width:calc(100% - 8px); height:var(--dialog-height,fit-content); max-height:var(--dialog-height-limit); inset:0; margin:auto; padding:0; overflow:visible; border:0; background:transparent; color:var(--color-text); }
  dialog > :global(.dialog-panel) { max-height:var(--dialog-height-limit); }
  dialog.fixed-height > :global(.dialog-panel) { height:100%; }
  dialog::backdrop { background:rgb(0 0 0 / .68); }
  @media (max-width: 767px) {
    dialog { --dialog-height-limit:var(--dialog-mobile-max-height,var(--dialog-max-height)); width:calc(100% - var(--dialog-mobile-inset)); }
    dialog.mobile-actions-stack > :global(.dialog-panel > footer) { align-items:stretch; flex-direction:column; }
    dialog.mobile-actions-stack > :global(.dialog-panel > footer .ui-button) { width:100%; }
  }
</style>
