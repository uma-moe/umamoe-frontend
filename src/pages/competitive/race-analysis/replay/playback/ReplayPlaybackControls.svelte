<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import type { ReplayBounds } from '@/lib/race/replay/race-replay';

  let {
    bounds,
    time,
    speed = $bindable('1'),
    playing,
    disabled,
    frameIndex,
    frameCount,
    minimal,
    clipping = false,
    onplay,
    onseek,
    onstepframe,
    tools
  }: {
    bounds: ReplayBounds;
    time: number;
    speed?: string;
    playing: boolean;
    disabled: boolean;
    frameIndex: number;
    frameCount: number;
    minimal: boolean;
    /** A clip is being cut: its tools fill the chart tools' place in the row. */
    clipping?: boolean;
    onplay: () => void;
    onseek: (time: number) => void;
    onstepframe: (direction: 1 | -1) => void;
    /** The chart view: its controls at the end of a desktop row, or a menu beside the speed. */
    tools?: Snippet;
  } = $props();

  /** formatRaceTime reads 0 as a missing time; the clock starts at zero. */
  const clockLabel = (value: number) => (value > 0 ? formatRaceTime(value, 2) : '0:00.00');

  const lastFrame = $derived(Math.max(0, frameCount - 1));
</script>

<!-- Transport and speed, where the replay is, then the chart view. -->
<div
  class="playback-controls replay-toolbar"
  class:clipping
  role="toolbar"
  aria-label="Playback and telemetry controls"
>
  <div
    class="transport"
    role="group"
    aria-label="Playback"
  >
    {#if !minimal}
      <span class="restart">
        <Button
          variant="secondary"
          size="sm"
          icon="restart"
          ariaLabel="Restart"
          title="Restart"
          onclick={() => onseek(bounds.startTime)}
          {disabled}
        />
      </span>
    {/if}
    <span class="play">
      <Button
        size="sm"
        icon={playing ? 'pause' : 'play'}
        ariaLabel={playing ? 'Pause' : 'Play'}
        title={(playing ? 'Pause' : clipping ? 'Play to the out point' : 'Play') + ' (Space)'}
        onclick={onplay}
        {disabled}
      />
    </span>
    {#if !minimal}
      <div
        class="frame-stepper"
        role="group"
        aria-label="Frame"
      >
        <Button
          variant="secondary"
          size="sm"
          icon="frame-back"
          ariaLabel="Previous frame"
          title="Previous frame (,)"
          onclick={() => onstepframe(-1)}
          {disabled}
        />
        <output
          aria-live="off"
          style:--frame-digits={String(lastFrame).length}
        >
          {frameIndex}
          <span class="frame-last">/ {lastFrame}</span>
        </output>
        <Button
          variant="secondary"
          size="sm"
          icon="frame-forward"
          ariaLabel="Next frame"
          title="Next frame (.)"
          onclick={() => onstepframe(1)}
          {disabled}
        />
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
  <p class="clock">
    <strong>{clockLabel(time)}</strong>
    <span class="clock-total">/ {formatRaceTime(bounds.endTime, 2)}</span>
  </p>
  {#if tools}
    <div class="playback-tools">{@render tools()}</div>
  {/if}
</div>

<style>
  @import '../replay-toolbar.css';
  @import './replay-playback-controls.css';
</style>
