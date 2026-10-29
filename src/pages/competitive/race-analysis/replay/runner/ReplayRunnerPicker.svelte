<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuild from '@/pages/competitive/runners/RunnerBuild.svelte';
  import type { Course } from '../replay-course';
  import type { ReplayState } from '../replay-state.svelte';

  let {
    replay,
    course,
    skillNames,
    open = $bindable(false),
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    course?: Course;
    skillNames: Map<number, string>;
    open?: boolean;
    selected?: string;
  } = $props();
</script>

<Dialog
  bind:open
  title="Choose runner"
  maxWidth="1040px"
  contentPadding="12px"
  mobileContentPadding="8px"
>
  <div class="runner-choices">
    {#each replay.capture.runners as choice}
      <button
        class="runner-choice"
        class:chosen={choice.index === replay.runner?.index}
        style:--runner-color={replay.teamColor(choice)}
        aria-label={'Gate ' + (choice.index + 1) + ' · ' + choice.name}
        aria-pressed={choice.index === replay.runner?.index}
        onclick={() => {
          selected = String(choice.index);
          open = false;
        }}
      >
        <span class="choice-gate">
          Gate {choice.index + 1}{#if choice.index === replay.runner?.index}
            <Icon
              name="check"
              size={14}
            />
          {/if}
        </span>
        <RunnerBuild
          runner={choice}
          {skillNames}
          compact
          raceContext={{
            surface: course?.surface,
            distance: course?.distance ?? replay.capture.raceDistance
          }}
        />
      </button>
    {/each}
  </div>
</Dialog>

<style>
  @import './replay-runner-picker.css';
</style>
