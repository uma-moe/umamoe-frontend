<script lang="ts">
  import { formatRaceTime, ordinalPlace } from '@/lib/race/replay/race-display';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuildDetails from '@/pages/competitive/runners/RunnerBuildDetails.svelte';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';

  let {
    replay,
    course,
    skillNames,
    open = $bindable(false)
  }: {
    replay: ReplayState;
    course?: Course;
    skillNames: Map<number, string>;
    open?: boolean;
  } = $props();

  const runner = $derived(replay.runner);
</script>

<div class="runner-build-dialog">
  <Dialog
    bind:open
    title="Runner build"
    maxWidth="600px"
    maxHeight="94dvh"
    mobileMaxHeight="94dvh"
    contentPadding="16px"
    mobileContentPadding="12px"
  >
    {#if runner}
      <RunnerBuildDetails
        {runner}
        {skillNames}
        framed
        inlineMetrics
        color={replay.teamColor(runner)}
        raceContext={{
          surface: course?.surface,
          distance: course?.distance ?? replay.capture.raceDistance
        }}
      >
        {#snippet metrics()}
          {#if runner.result}
            <dl class="runner-results">
              <div>
                <dt>finish</dt>
                <dd>{ordinalPlace(runner.result.finishOrder)}</dd>
              </div>
              <div>
                <dt>time</dt>
                <dd>{formatRaceTime(runner.result.finishTime)}</dd>
              </div>
            </dl>
          {/if}
        {/snippet}
      </RunnerBuildDetails>
    {/if}
  </Dialog>
</div>

<style>
  @import '../../../runners/runner-results.css';
  @import './replay-build-dialog.css';
</style>
