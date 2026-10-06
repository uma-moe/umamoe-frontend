<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import Button from '@/components/Button.svelte';
  import { openSimulatorPanel, simulatorLayout } from '../simulator-layout.svelte';
  import { ensureSimulatorCatalog } from '../simulator-session.svelte';
  import SimulatorSidebar from './SimulatorSidebar.svelte';
  import TraineePanel from './TraineePanel.svelte';
  import AccessPanel from './AccessPanel.svelte';
  import type { SimulatorMode, SimulatorPanel } from './types';

  interface Props {
    mode: SimulatorMode;
    /** Panels this mode adds to the sidebar. Trainee and Access are always there. */
    panels?: Array<SimulatorPanel>;
    /** Mode-specific blocks under the trainee editor; the race sim puts skills here. */
    traineeExtras?: Snippet;
    children: Snippet;
  }

  let { mode, panels = [], traineeExtras, children }: Props = $props();

  const sheetId = $props.id();

  const MODES: ReadonlyArray<{ mode: SimulatorMode; label: string; href: string }> = [
    { mode: 'stamina', label: 'Stamina', href: '/simulator' },
    { mode: 'race', label: 'Race sim', href: '/simulator/race' },
    { mode: 'build', label: 'Build search', href: '/simulator/build' }
  ];

  // The narrow-viewport boundary. It has to stay in step with the `min-width:
  // 768px` rules that lay out the race bar, since those are the same decision
  // expressed in CSS.
  const MOBILE_QUERY = '(max-width: 767px)';

  /**
   * Whether the viewport is narrow enough for the bottom sheet.
   *
   * Guarded because jsdom does not implement `matchMedia`, and a missing one
   * should not take the page down with it. Wide is the safer default there.
   */
  function prefersNarrowViewport(): boolean {
    try {
      return matchMedia(MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  }

  // Read at init rather than in onMount so a phone never paints the desktop rail first.
  let mobile = $state(prefersNarrowViewport());

  onMount(() => {
    // The shell is the shared frame, so it is also where the catalog is fetched.
    void ensureSimulatorCatalog();

    try {
      const query = matchMedia(MOBILE_QUERY);
      const apply = () => { mobile = query.matches; };
      query.addEventListener('change', apply);
      return () => query.removeEventListener('change', apply);
    } catch {
      // Without matchMedia the initial guess stands and the shell still works.
      return;
    }
  });
</script>

<div class="simulator-shell">
  <!-- Trainee and Access are the same on every surface, so the shell owns them
       and each mode only contributes the panels it adds. -->
  {#snippet traineePanel()}<TraineePanel extras={traineeExtras} />{/snippet}
  {#snippet accessPanel()}<AccessPanel />{/snippet}

  <SimulatorSidebar
    panels={[
      { id: 'trainee', label: 'Trainee', shortLabel: 'Trainee', icon: 'users', content: traineePanel },
      ...panels,
      { id: 'access', label: 'API access', shortLabel: 'Access', icon: 'lock-open', content: accessPanel }
    ]}
    {mobile}
    {sheetId}
  />

  <div class="workspace">
    <div class="workspace-head">
      <nav class="modes" aria-label="Simulator mode">
        {#each MODES as item (item.mode)}
          <a
            class="mode"
            class:active={item.mode === mode}
            href={item.href}
            aria-current={item.mode === mode ? 'page' : undefined}
          >{item.label}</a>
        {/each}
      </nav>

      {#if mobile}
        <Button
          variant="secondary"
          size="sm"
          icon="tune"
          ariaExpanded={!simulatorLayout.collapsed}
          ariaControls={sheetId}
          onclick={() => openSimulatorPanel(simulatorLayout.panel)}
        >Setup</Button>
      {/if}
    </div>

    {@render children()}
  </div>
</div>

<style>
  .simulator-shell { display: flex; gap: var(--space-4); align-items: flex-start; min-width: 0; }

  .workspace {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: var(--space-4);
    min-width: 0;
  }

  .workspace-head { display: flex; align-items: center; gap: var(--space-3); }

  .modes { display: flex; align-items: center; gap: var(--space-1); min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .modes::-webkit-scrollbar { display: none; }
  .mode {
    position: relative;
    flex: none;
    padding: var(--space-2) var(--space-3);
    color: var(--color-text-muted);
    font-size: var(--font-sm);
    font-weight: 600;
    text-decoration: none;
  }
  .mode:hover { color: var(--color-text); }
  .mode.active { color: var(--color-text); }
  .mode.active::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: 2px;
    background: var(--color-accent);
  }
</style>
