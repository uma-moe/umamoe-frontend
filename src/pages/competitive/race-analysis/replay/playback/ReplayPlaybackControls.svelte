<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { formatRaceTime } from '@/lib/race/race-display';
  import type { ReplayBounds } from '@/lib/race/race-replay';
  import { slopeLabel } from '../replay-timeline';

  let {
    bounds,
    endTime,
    time,
    speed = $bindable('1'),
    playing,
    disabled,
    phase,
    currentSegment,
    slope,
    leader,
    minimal,
    onplay,
    onseek,
    actions
  }: {
    bounds: ReplayBounds;
    /** End of the displayed timeline, which may stop at the selected runner's finish. */
    endTime: number;
    time: number;
    speed?: string;
    playing: boolean;
    disabled: boolean;
    phase: string;
    currentSegment?: string;
    slope: number;
    leader: number;
    minimal: boolean;
    onplay: () => void;
    onseek: (time: number) => void;
    actions?: Snippet;
  } = $props();
</script>

<div
  class="playback-controls"
  role="toolbar"
  aria-label="Playback and telemetry controls"
>
  <Button
    size="sm"
    onclick={onplay}
    {disabled}
  >
    {playing ? 'Pause' : 'Play'}
  </Button>
  {#if !minimal}
    <Button
      variant="secondary"
      size="sm"
      onclick={() => onseek(bounds.startTime)}
    >
      Restart
    </Button>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => onseek(time - 1)}
    >
      −1s
    </Button>
    <Button
      variant="secondary"
      size="sm"
      onclick={() => onseek(time + 1)}
    >
      +1s
    </Button>
  {/if}
  <div class="playback-state">
    <span>
      <strong class="race-phase">{phase}</strong>
      {#if currentSegment}
        <span>{currentSegment}</span>
      {/if}{#if slope}
        <span>
          {slopeLabel(slope)}
        </span>
      {/if}
    </span>
    <span>
      Leader {Math.round(Math.min(leader, bounds.distanceMax)).toLocaleString()} / {Math.round(
        bounds.distanceMax
      ).toLocaleString()} m
      <span class="remaining">
        {Math.round(Math.max(0, bounds.distanceMax - leader)).toLocaleString()} m remaining
      </span>
    </span>
  </div>
  {#if actions}
    <div class="playback-actions">{@render actions()}</div>
  {/if}
  <span class="playback-clock">
    <strong>{formatRaceTime(time, 2)}</strong>
    <span class="clock-total">
      / {formatRaceTime(bounds.endTime, 2)}
    </span>
  </span>
  {#if !minimal}
    <Button
      variant="secondary"
      size="sm"
      ariaLabel="Finish"
      onclick={() => onseek(endTime)}
    >
      Finish ▦
    </Button>
  {/if}
  <SelectField
    id="playback-speed"
    label="Playback speed"
    hideLabel
    options={['0.5', '1', '2', '4', '8'].map((value) => ({ value, label: value + '×' }))}
    bind:value={speed}
  />
  <InspectPopover
    label="How to read the replay timeline"
    align="end"
  >
    {#snippet trigger()}
      <span class="timeline-help">
        <Icon
          name="info"
          size={16}
        />
      </span>
    {/snippet}
    <h3>Course and skill timeline</h3>
    <p>
      The telemetry graph, course lanes and skill icons use the same replay time axis. Course
      boundaries mark when the race leader reaches each section; elevation is relative to the start.
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
</div>

<style>
  @import './replay-playback-controls.css';
</style>
