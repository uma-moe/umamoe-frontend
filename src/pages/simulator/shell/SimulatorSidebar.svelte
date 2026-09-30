<script lang="ts">
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import {
    openSimulatorPanel,
    setSimulatorSidebarCollapsed,
    simulatorLayout
  } from '../simulator-layout.svelte';
  import type { SimulatorPanel } from './types';

  interface Props {
    panels: Array<SimulatorPanel>;
    /** Phones get the bottom sheet; wider viewports get the rail or the panel. */
    mobile: boolean;
    /** Id shared with the shell's Setup button, so it can point at the sheet. */
    sheetId: string;
  }

  let { panels, mobile, sheetId }: Props = $props();

  // A panel this mode does not offer falls back to the first one without
  // forgetting the choice, so returning to the mode restores the old panel.
  const shown = $derived(panels.find((panel) => panel.id === simulatorLayout.panel) ?? panels[0]);

  // The sheet mirrors the shared flag: the shell opens it, Dialog reports closing it.
  let sheetOpen = $state(false);
  $effect(() => {
    sheetOpen = mobile && !simulatorLayout.collapsed;
  });

  function moveTabFocus(event: KeyboardEvent, index: number): void {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : event.key === 'Home' ? -index
      : event.key === 'End' ? panels.length - 1 - index
      : 0;
    if (step === 0 || panels.length === 0) return;
    event.preventDefault();
    const target = (index + step + panels.length) % panels.length;
    const next = panels[target];
    if (!next) return;
    openSimulatorPanel(next.id);
    // Selection follows real focus, so the strip stays usable by keyboard.
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]
      ?.focus({ preventScroll: true });
  }
</script>

{#snippet tabStrip(prefix: string)}
  <div class="tabs" role="tablist" aria-label="Simulator setup">
    {#each panels as panel, index (panel.id)}
      <button
        type="button"
        role="tab"
        id="{prefix}-{panel.id}"
        aria-selected={panel.id === shown?.id}
        aria-controls="{prefix}-content"
        tabindex={panel.id === shown?.id ? 0 : -1}
        class:active={panel.id === shown?.id}
        onclick={() => openSimulatorPanel(panel.id)}
        onkeydown={(event) => moveTabFocus(event, index)}
      >
        <Icon name={panel.icon} size={18} />
        <span>{panel.shortLabel}</span>
        {#if panel.badge}<span class="dot" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  </div>
{/snippet}

{#if mobile}
  <Dialog
    id={sheetId}
    bind:open={sheetOpen}
    title="Race setup"
    icon="tune"
    mobileFill
    maxHeight="92dvh"
    onclose={() => setSimulatorSidebarCollapsed(true)}
  >
    {@render tabStrip('sim-sheet')}
    {#if shown}
      <div id="sim-sheet-content" role="tabpanel" aria-labelledby="sim-sheet-{shown.id}">
        {@render shown.content()}
      </div>
    {/if}
    <div class="sheet-actions">
      <Button variant="secondary" onclick={() => setSimulatorSidebarCollapsed(true)}>Done</Button>
    </div>
  </Dialog>
{:else if simulatorLayout.collapsed}
  <!-- Desktop collapses to a rail rather than to nothing, so the panels stay reachable. -->
  <aside class="rail" aria-label="Race setup">
    <button
      type="button"
      class="rail-button rail-toggle"
      aria-label="Expand setup sidebar"
      aria-expanded="false"
      onclick={() => openSimulatorPanel(shown?.id ?? 'trainee')}
    >
      <Icon name="menu" size={18} />
    </button>

    {#each panels as panel (panel.id)}
      <button
        type="button"
        class="rail-button"
        class:active={panel.id === shown?.id}
        aria-label={panel.label}
        title={panel.label}
        onclick={() => openSimulatorPanel(panel.id)}
      >
        <Icon name={panel.icon} size={18} />
        {#if panel.badge}<span class="dot" aria-hidden="true"></span>{/if}
      </button>
    {/each}
  </aside>
{:else}
  <aside class="pane" aria-label="Race setup">
    <div class="pane-head">
      {@render tabStrip('sim-pane')}
      <button
        type="button"
        class="rail-button"
        aria-label="Collapse setup sidebar"
        onclick={() => setSimulatorSidebarCollapsed(true)}
      >
        <Icon name="close" size={18} />
      </button>
    </div>

    {#if shown}
      <div
        class="pane-body"
        id="sim-pane-content"
        role="tabpanel"
        aria-labelledby="sim-pane-{shown.id}"
      >
        {@render shown.content()}
      </div>
    {/if}
  </aside>
{/if}

<style>
  .rail,
  .pane {
    position: sticky;
    top: var(--space-4);
    flex: none;
    align-self: flex-start;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
  }

  .pane {
    display: flex;
    flex-direction: column;
    width: clamp(280px, 30vw, 380px);
    max-height: calc(100dvh - var(--utility-height) - var(--space-8));
    overflow: hidden;
  }

  .rail-button {
    position: relative;
    display: grid;
    place-items: center;
    width: var(--touch-target);
    height: var(--touch-target);
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
  }
  .rail-button:hover { background: var(--color-surface-3); color: var(--color-text); }
  .rail-button.active { background: var(--color-accent-soft); color: var(--color-accent); }
  .rail-toggle { color: var(--color-text); }

  /* Enough room for the tabs, then the panel scrolls on its own. */
  .pane-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    border-bottom: 1px solid var(--color-border);
  }
  .pane-head .rail-button { width: 34px; height: 34px; }

  .tabs { display: flex; gap: var(--space-1); min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tabs button {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1 1 auto;
    min-width: max-content;
    min-height: 34px;
    padding: 0 var(--space-3);
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    font-size: var(--font-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  .tabs button:hover { color: var(--color-text); background: var(--color-surface-3); }
  .tabs button.active { color: var(--color-accent); background: var(--color-accent-soft); }

  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent);
  }

  .pane-body {
    min-height: 0;
    padding: var(--space-4);
    overflow-y: auto;
  }

  .sheet-actions { margin-top: var(--space-4); }
</style>
