<script lang="ts">
  import type { Snippet } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import { popoverPosition } from '@/lib/popover-position';

  interface Props {
    id: string;
    label: string;
    anchor: HTMLButtonElement;
    anchorPosition: { x: number; y: number };
    persistent: boolean;
    onpointerenter: () => void;
    onpointerleave: () => void;
    onclose: () => void;
    children: Snippet;
    headerActions?: Snippet;
  }

  let {
    id,
    label,
    anchor,
    anchorPosition,
    persistent,
    onpointerenter,
    onpointerleave,
    onclose,
    children,
    headerActions
  }: Props = $props();
  let panel = $state<HTMLDivElement>();
  const mobile = new MediaQuery('(max-width: 767px)');
  let left = $state(0);
  let top = $state(0);

  function positionPanel() {
    if (!panel?.matches(':popover-open')) return;

    const icon = anchor.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const right = icon.right + 12;
    const fitsRight = right + box.width <= innerWidth - 8;
    const desiredLeft = fitsRight ? right : icon.left - box.width - 12;
    const position = popoverPosition(
      panel,
      Math.max(8, Math.min(desiredLeft, innerWidth - box.width - 8)),
      Math.max(8, Math.min(icon.top - 12, innerHeight - box.height - 8))
    );

    left = position.left;
    top = position.top;
  }

  function close() {
    if (panel?.matches(':popover-open')) panel.hidePopover();
    anchor.focus({ preventScroll: true });
    onclose();
  }

  function escape(event: KeyboardEvent) {
    if (mobile.current || event.key !== 'Escape' || event.defaultPrevented) return;

    event.preventDefault();
    close();
  }

  $effect(() => {
    void anchor;
    void anchorPosition;
    positionPanel();
  });

  $effect(() => {
    if (mobile.current || !panel) return;

    if (!panel.matches(':popover-open')) panel.showPopover();
    positionPanel();
    if (persistent) panel.querySelector('button')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(positionPanel);
    observer.observe(panel);
    observer.observe(anchor);
    return () => observer.disconnect();
  });
</script>

<svelte:window
  onresize={positionPanel}
  onscroll={positionPanel}
  onkeydown={escape}
/>
{#if mobile.current}
  <Dialog
    {id}
    open
    title={label}
    compact
    {headerActions}
    maxWidth="600px"
    maxHeight="calc(100dvh - 16px)"
    mobileInset="16px"
    contentPadding="0"
    mobileContentPadding="0"
    onclose={close}
  >
    {@render children()}
  </Dialog>
{:else}
  <div
    bind:this={panel}
    {id}
    class="skill-dialog"
    popover="auto"
    role="dialog"
    tabindex="-1"
    aria-label={label}
    style:left={`${left}px`}
    style:top={`${top}px`}
    {onpointerenter}
    {onpointerleave}
    ontoggle={(event) => {
      if (event.newState === 'closed') onclose();
    }}
  >
    <div class="dialog-bar">
      <span>Skill details</span>
      <div class="dialog-actions">
        {@render headerActions?.()}
        <IconButton
          icon="close"
          size="sm"
          label="Close skill details"
          onclick={close}
        />
      </div>
    </div>
    {@render children()}
  </div>
{/if}

<style>
  .skill-dialog {
    position: fixed;
    inset: auto;
    box-sizing: border-box;
    width: min(440px, calc(100vw - 16px));
    max-height: min(760px, calc(100dvh - 16px));
    overflow-y: auto;
    overscroll-behavior: contain;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-primary);
    border-radius: 10px;
    background: var(--component-bg);
    color: var(--text-primary);
    box-shadow: 0 12px 28px rgb(0 0 0 / 0.42);
  }

  .dialog-bar {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px 2px 10px;
    border-bottom: 1px solid var(--border-primary);
    background: var(--component-bg);
    color: var(--text-muted);
    font-size: 0.7rem;
  }
  .dialog-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }
</style>
