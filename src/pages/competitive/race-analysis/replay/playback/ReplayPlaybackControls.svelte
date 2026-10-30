<script lang="ts">
  import InfoBadge from '@/components/feedback/InfoBadge.svelte';
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import type { ReplayBounds } from '@/lib/race/replay/race-replay';
  import { slopeLabel } from '../replay-timeline';
  import ReplayTelemetryGuide from './ReplayTelemetryGuide.svelte';

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

<div
  class="playback-controls"
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
    {/if}
  </div>
  <p
    class="playback-state"
    title={trackState.join(' · ') + ' · Leader ' + leaderLabel}
  >
    <strong class="race-phase">{phase}</strong>
    {#each trackState.slice(1) as part}
      <span>{part}</span>
    {/each}
    <span class="remaining">{remainingLabel}</span>
  </p>
  {#if actions}
    <div class="playback-actions">{@render actions()}</div>
  {/if}
  <span class="playback-clock">
    <strong>{clockLabel(time)}</strong>
    <span class="clock-total">
      / {formatRaceTime(bounds.endTime, 2)}
    </span>
  </span>
  <div class="playback-tools">
    {#if !minimal}
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
    {/if}
    <span class="speed-select">
      <SelectField
        id="playback-speed"
        label="Playback speed"
        hideLabel
        options={['0.5', '1', '2', '4', '8'].map((value) => ({ value, label: value + '×' }))}
        bind:value={speed}
      />
    </span>
    <InspectPopover
      label="How to read the replay timeline"
      align="end"
    >
      {#snippet trigger()}
        <InfoBadge />
      {/snippet}
      <ReplayTelemetryGuide ensemble={minimal} />
      <h3>Course and skill timeline</h3>
      <p>
        The telemetry graph, course lanes and skill icons use the same replay time axis. Course
        boundaries mark when the race leader reaches each section; elevation is relative to the
        start.
      </p>
      <p>
        Select a course section or race phase to jump to its start. Drag the blue handle to scrub,
        or focus it and use the arrow keys.
      </p>
      <p>
        The skills below belong to the selected runner. Select an activation to replay it. Skill
        icons show activation times and highlight while active. Numbered icons group nearby
        activations. Open Skill activity details for names, exact durations and activation rolls.
      </p>
    </InspectPopover>
  </div>
</div>

<style>
  @import './replay-playback-controls.css';
</style>
