<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import { isCropAspect } from './clip-crop';
  import { codecLabel } from './clip-format';
  import type { ReplayClip } from './replay-clip.svelte';
  import ReplayClipSettings from './ReplayClipSettings.svelte';

  let { clip }: { clip: ReplayClip } = $props();

  const aspects = [
    { value: 'free', label: 'Free' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '1:1', label: '1:1' }
  ];

  const frameSize = $derived(`${clip.frame.width} × ${clip.frame.height}`);
  const settingsSummary = $derived(
    `${clip.speed}× · ${clip.fps} fps · ${frameSize} · ${codecLabel(clip.codec)}`
  );

  /** formatRaceTime reads 0 as a missing time; a clip can start at zero. */
  const clock = (value: number) => (value > 0 ? formatRaceTime(value, 1) : '0:00.0');
</script>

{#snippet settingsTrigger()}
  <span
    class="settings-trigger"
    title={settingsSummary}
  >
    <Icon
      name="tune"
      size={15}
    />
  </span>
{/snippet}

<div
  class="clip-tools"
  role="group"
  aria-label="Clip"
>
  {#if clip.status.kind === 'recording'}
    <span
      class="clip-progress"
      role="status"
    >
      <progress
        max={clip.status.total}
        value={clip.status.done}
        aria-hidden="true"
      ></progress>
      <span>Frame {clip.status.done} / {clip.status.total}</span>
    </span>
    <Button
      variant="secondary"
      size="sm"
      onclick={clip.cancel}
    >
      Cancel
    </Button>
  {:else if clip.cropping}
    <SegmentedControl
      compact
      label="Crop aspect"
      options={aspects}
      value={clip.aspect}
      onchange={(value) => {
        if (isCropAspect(value)) clip.chooseAspect(value);
      }}
    />
    <span class="clip-readout">{frameSize}</span>
    <Button
      variant="secondary"
      size="sm"
      disabled={!clip.cropped}
      onclick={clip.resetCrop}
    >
      Reset
    </Button>
    <Button
      size="sm"
      onclick={clip.endCrop}
    >
      Done
    </Button>
  {:else}
    {#if clip.status.kind === 'failed'}
      <span
        class="clip-error"
        role="alert"
        title={clip.status.message}
      >
        <Icon
          name="warning"
          size={15}
        />
        <span>{clip.status.message}</span>
      </span>
    {/if}
    <span class="clip-readout clip-length">{clip.videoSeconds.toFixed(1)} s</span>
    <span class="clip-points">
      <Button
        variant="secondary"
        size="sm"
        ariaLabel={'In point ' + clock(clip.start) + ', set to the playhead'}
        title="Set the in point at the playhead (I)"
        onclick={() => clip.mark('start')}
      >
        <span class="point-label">In</span>
        {clock(clip.start)}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        ariaLabel={'Out point ' + clock(clip.end) + ', set to the playhead'}
        title="Set the out point at the playhead (O)"
        onclick={() => clip.mark('end')}
      >
        <span class="point-label">Out</span>
        {clock(clip.end)}
      </Button>
    </span>
    <Button
      variant="secondary"
      size="sm"
      icon="crop"
      ariaLabel={clip.cropped ? 'Crop, ' + frameSize : 'Crop'}
      title="Crop the video to a window of the replay"
      onclick={clip.startCrop}
    >
      <span class="tool-label">Crop</span>
    </Button>
    <InspectPopover
      label="Clip export settings"
      align="end"
      trigger={settingsTrigger}
    >
      <ReplayClipSettings {clip} />
    </InspectPopover>
    <Button
      size="sm"
      icon="download"
      ariaLabel="Export clip"
      title="Export the clip as a video"
      onclick={clip.export}
    >
      <span class="tool-label">Export</span>
    </Button>
  {/if}
  <Button
    variant="secondary"
    size="sm"
    icon="close"
    ariaLabel="Close clip editor"
    title="Close clip editor"
    onclick={clip.close}
  />
</div>

<style>
  @import './replay-clip-tools.css';
</style>
