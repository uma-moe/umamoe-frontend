<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { DetailedSimulation } from '../../detailed-simulation';

  let {
    simulation,
    onretry
  }: {
    simulation: Exclude<DetailedSimulation, { status: 'ready' }>;
    onretry?: () => void;
  } = $props();

  const loading = $derived(simulation.status === 'queued' || simulation.status === 'running');
</script>

<div
  class="fallback simulation-notice"
  class:loading
  class:failed={simulation.status === 'failed'}
  role={loading ? 'status' : undefined}
>
  <span class="notice-icon">
    {#if loading}
      <Spinner
        size={18}
        label="Running the detailed simulation"
      />
    {:else}
      <Icon
        name={simulation.status === 'failed' ? 'warning' : 'info'}
        size={18}
      />
    {/if}
  </span>
  <div class="notice-text">
    {#if simulation.status === 'running'}
      <strong>Running the detailed simulation…</strong>
      <p>
        HP, spurt and wit-check results appear when it finishes. Showing recorded skill activations
        and blocking events until then.
      </p>
    {:else if simulation.status === 'queued'}
      <strong>Detailed simulation queued</strong>
      <p>
        This race is next after the one in progress. Showing recorded skill activations and blocking
        events until then.
      </p>
    {:else if simulation.status === 'failed'}
      <strong>Detailed simulation failed</strong>
      <p>
        {simulation.reason} Showing recorded skill activations and blocking events.
      </p>
    {:else}
      <strong>No detailed simulation</strong>
      <p>
        {simulation.reason} Showing recorded skill activations and blocking events.
      </p>
    {/if}
  </div>
  {#if simulation.status === 'failed' && onretry}
    <Button
      variant="secondary"
      size="sm"
      icon="refresh"
      onclick={onretry}
    >
      Retry simulation
    </Button>
  {/if}
</div>

<style>
  .simulation-notice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    margin: 0;
    padding: 12px 14px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }
  .notice-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    color: var(--accent-primary);
  }
  .failed {
    border-color: color-mix(in srgb, var(--accent-warning) 35%, var(--border-subtle));
  }
  .failed .notice-icon {
    color: var(--accent-warning);
  }
  .notice-text {
    display: grid;
    flex: 1;
    gap: 3px;
    min-width: 0;
  }
  strong {
    font-size: 13px;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 11px;
    line-height: 1.5;
  }
  .simulation-notice > :global(.ui-button) {
    flex: none;
    align-self: center;
  }
  @media (max-width: 520px) {
    .simulation-notice {
      flex-wrap: wrap;
    }
    .simulation-notice > :global(.ui-button) {
      margin-left: 32px;
    }
  }
</style>
