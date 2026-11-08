<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Menu, { type MenuItem } from '@/components/navigation/Menu.svelte';

  let {
    randomGates,
    rerunning,
    estimating,
    estimateReady,
    rerunShown,
    ongates,
    onestimate,
    onrerun,
    onopen,
    onrecorded
  }: {
    randomGates: boolean;
    rerunning: boolean;
    estimating: boolean;
    /** Win rates of this race are on screen, so the simulator opens with them. */
    estimateReady: boolean;
    rerunShown: boolean;
    ongates: () => void;
    onestimate: () => void;
    onrerun: () => void;
    onopen: () => void;
    onrecorded: () => void;
  } = $props();

  const items: MenuItem[] = $derived([
    {
      id: 'gates',
      label: 'Randomize gates',
      description: randomGates
        ? 'New gates for each simulated race.'
        : 'Keep the original gate assignments.',
      toggle: true,
      checked: randomGates
    },
    {
      id: 'estimate',
      label: 'Estimate win rate',
      description: 'Run 100 fresh seeds and get win rates.',
      disabled: estimating,
      separator: true
    },
    {
      id: 'rerun',
      label: 'Rerun on different seed',
      description: 'Run this race on a different seed.',
      disabled: rerunning
    },
    {
      id: 'simulator',
      label: estimateReady ? 'Open win rates in race simulator' : 'Open field in race simulator',
      icon: 'external',
      separator: true
    },
    ...(rerunShown
      ? [
          {
            id: 'recorded',
            label: 'Return to original race',
            description: 'Restore the recorded result and seed.',
            separator: true
          }
        ]
      : [])
  ]);

  const actions: Record<string, () => void> = $derived({
    gates: ongates,
    estimate: onestimate,
    rerun: onrerun,
    simulator: onopen,
    recorded: onrecorded
  });
</script>

<div class="simulation-menu">
  <Menu
    label="Simulate"
    {items}
    onselect={(id) => actions[id]?.()}
  >
    {#snippet trigger()}
      {#if rerunning || estimating}
        <Spinner
          size={14}
          label="Simulating"
        />
      {:else}
        <Icon
          name="dice"
          size={14}
        />
      {/if}
      <span>Simulate</span>
      <Icon
        name="chevron"
        size={14}
      />
    {/snippet}
  </Menu>
</div>

<style>
  .simulation-menu {
    width: 100%;
  }
  .simulation-menu :global(.menu) {
    --menu-width: 100%;
  }
  /* The height of the section tab group it follows. */
  .simulation-menu :global(.menu .trigger) {
    height: 34px;
    min-height: 34px;
    justify-content: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
  }
</style>
