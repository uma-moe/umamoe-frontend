<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import type { ReplayBounds } from '@/lib/race/replay/race-replay';
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
    tools,
    guide
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
    /** The chart view: its controls at the end of a desktop row, or a menu beside the speed. */
    tools?: Snippet;
    /** The guide to reading the timeline, ending the clock's line when the chart view is a menu. */
    guide?: Snippet;
  } = $props();

  const trackState = $derived([
    phase,
    ...(currentSegment ? [currentSegment] : []),
    ...(slope ? [slopeLabel(slope)] : [])
  ]);

  const leaderLabel = $derived(
    Math.round(Math.min(leader, bounds.distanceMax)).toLocaleString() +
      ' / ' +
      Math.round(bounds.distanceMax).toLocaleString() +
      ' m'
  );

  /** formatRaceTime reads 0 as a missing time; the clock starts at zero. */
  const clockLabel = (value: number) => (value > 0 ? formatRaceTime(value, 2) : '0:00.00');

  const remainingLabel = $derived(
    Math.round(Math.max(0, bounds.distanceMax - leader)).toLocaleString() + ' m left'
  );
</script>

<!-- Playback (transport and speed), the chart view, and where the replay is (clock and race state). -->
<div
  class="playback-controls"
  class:minimal
  role="toolbar"
  aria-label="Playback and telemetry controls"
>
  <div class="transport">
    <Button
      size="sm"
      icon={playing ? 'pause' : 'play'}
      ariaLabel={playing ? 'Pause' : 'Play'}
      onclick={onplay}
      {disabled}
    >
      <span class="button-text">{playing ? 'Pause' : 'Play'}</span>
    </Button>
    {#if !minimal}
      <div
        class="steps"
        role="group"
        aria-label="Seek"
      >
        <Button
          variant="secondary"
          size="sm"
          icon="skip-back"
          ariaLabel="Restart"
          onclick={() => onseek(bounds.startTime)}
        >
          <span class="button-text optional-text">Restart</span>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          ariaLabel="Back 1 second"
          onclick={() => onseek(time - 1)}
        >
          −1s
        </Button>
        <Button
          variant="secondary"
          size="sm"
          ariaLabel="Forward 1 second"
          onclick={() => onseek(time + 1)}
        >
          +1s
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon="flag"
          ariaLabel="Jump to finish"
          title="Jump to finish"
          onclick={() => onseek(endTime)}
        >
          <span class="button-text optional-text">Finish</span>
        </Button>
      </div>
    {/if}
  </div>
  <span class="speed-select">
    <SelectField
      id="playback-speed"
      label="Playback speed"
      hideLabel
      options={['0.5', '1', '2', '4', '8'].map((value) => ({ value, label: value + '×' }))}
      bind:value={speed}
    />
  </span>
  <div class="position">
    <span class="playback-clock">
      <strong>{clockLabel(time)}</strong>
      <span class="clock-total">
        / {formatRaceTime(bounds.endTime, 2)}
      </span>
    </span>
    <p
      class="playback-state"
      title={trackState.join(', ') + ', leader ' + leaderLabel}
    >
      <strong class="race-phase">{phase}</strong>
      {#each trackState.slice(1) as part}
        <span>{part}</span>
      {/each}
      <span class="remaining">{remainingLabel}</span>
    </p>
  </div>
  {#if tools}
    <div class="playback-tools">{@render tools()}</div>
  {/if}
  {#if guide}
    <div class="playback-guide">{@render guide()}</div>
  {/if}
</div>

<style>
  @import './replay-playback-controls.css';
</style>
