<script lang="ts">
  import { formatRaceTime } from '@/lib/race/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuildDetails from '@/pages/competitive/runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '@/pages/competitive/runners/RunnerBuildGroup.svelte';
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
    maxWidth="980px"
    maxHeight="92dvh"
    contentPadding="12px"
    mobileContentPadding="8px"
  >
    {#if runner}
      <RunnerBuildGroup single>
        <article class="race-build-card">
          <RunnerBuildDetails
            {runner}
            {skillNames}
            color={replay.teamColor(runner)}
            raceContext={{
              surface: course?.surface,
              distance: course?.distance ?? replay.capture.raceDistance
            }}
          >
            {#snippet metrics()}
              {#if runner.result}
                <section class="entry-metadata">
                  <h3>Race entry</h3>
                  <dl>
                    {#each [{ label: 'Game finish time', value: formatRaceTime(runner.result.finishTime) }, { label: 'Time behind previous', value: runner.result.finishDiffTime.toFixed(3) + ' s' }, { label: 'Guts / wit rank', value: runner.result.gutsOrder + ' / ' + runner.result.wizOrder }, { label: 'Result reason code', value: runner.result.defeatReason }, { label: 'Popularity', value: replay.diagnostic?.popularity ?? runner.raw.popularity ?? '—' }, { label: 'Mood', value: ['', 'Awful', 'Bad', 'Normal', 'Good', 'Great'][Number(runner.raw.motivation)] ?? '—' }] as fact}
                      <div>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    {/each}
                  </dl>
                </section>
              {/if}
            {/snippet}
          </RunnerBuildDetails>
        </article>
      </RunnerBuildGroup>
    {/if}
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        onclick={() => (open = false)}
      >
        Close
      </Button>
    {/snippet}
  </Dialog>
</div>

<style>
  @import './replay-build-dialog.css';
</style>
