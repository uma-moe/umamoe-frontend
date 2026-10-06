<script lang="ts">
  import type { Snippet } from 'svelte';
  import TraineeInput from '../TraineeInput.svelte';
  import { simulatorSession } from '../simulator-session.svelte';

  interface Props {
    /** Mode-specific additions, e.g. the race sim's per-runner skills. */
    extras?: Snippet;
  }

  let { extras }: Props = $props();
</script>

<div class="trainee-panel">
  <TraineeInput bind:trainee={simulatorSession.trainee} />
  {@render extras?.()}
</div>

<style>
  .trainee-panel { min-width: 0; display: flex; flex-direction: column; gap: var(--space-4); }
</style>
