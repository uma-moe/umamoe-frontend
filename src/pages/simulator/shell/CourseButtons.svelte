<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SimulatorCmPresets from '../courses/SimulatorCmPresets.svelte';
  import SimulatorCourseDetails from '../courses/SimulatorCourseDetails.svelte';
  import { simulatorSession } from '../simulator-session.svelte';

  /** CM presets, and the course breakdown when the page does not show it already: for a course section's header. */
  let { details = true }: { details?: boolean } = $props();

  let presetsOpen = $state(false),
    detailsOpen = $state(false);
</script>

<Button
  variant="secondary"
  size="sm"
  icon="calendar"
  onclick={() => (presetsOpen = true)}
>
  CM presets
</Button>
{#if details}<Button
    variant="secondary"
    size="sm"
    icon="chart"
    disabled={!simulatorSession.courseId}
    onclick={() => (detailsOpen = true)}
  >
    Course breakdown
  </Button>{/if}

<SimulatorCmPresets bind:open={presetsOpen} />
{#if details}<SimulatorCourseDetails bind:open={detailsOpen} />{/if}
