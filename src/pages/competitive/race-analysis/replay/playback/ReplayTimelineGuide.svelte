<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import ReplayTelemetryGuide from './ReplayTelemetryGuide.svelte';

  let { ensemble }: { ensemble: boolean } = $props();
</script>

<span class="timeline-guide">
  <InspectPopover
    label="How to read the replay timeline"
    align="end"
  >
    {#snippet trigger()}
      <InfoIcon />
    {/snippet}
    <ReplayTelemetryGuide {ensemble} />
    <h3>Course and skill timeline</h3>
    <p>
      The telemetry graph, course lanes and skill icons use the same replay time axis. Course
      boundaries mark when the race leader reaches each section. Elevation is relative to the start.
    </p>
    <p>
      Select a course section or race phase to jump to its start. Drag the blue handle to scrub, or
      focus it and use the arrow keys.
    </p>
    <p>
      The skills below belong to the selected runner. Select an activation to replay it. Skill icons
      show activation times and highlight while active. Numbered icons group nearby activations.
      Open Skill activity details for names, exact durations and activation rolls.
    </p>
  </InspectPopover>
</span>

<style>
  .timeline-guide {
    display: inline-flex;
  }
  .timeline-guide :global(.trigger) {
    display: grid;
    place-items: center;
    min-width: 32px;
    min-height: 32px;
  }
  p {
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  h3 {
    font-size: 14px;
    margin-top: 0;
  }
</style>
