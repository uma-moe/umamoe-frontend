<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';

  let {
    hasTrack,
    following,
    laneDetail = $bindable(true),
    zoomOutDisabled,
    zoomInDisabled,
    onfollow,
    onfullcourse,
    onzoom,
    toolbarStart,
    toolbarEnd
  }: {
    hasTrack: boolean;
    following: boolean;
    laneDetail?: boolean;
    zoomOutDisabled: boolean;
    zoomInDisabled: boolean;
    onfollow: () => void;
    onfullcourse: () => void;
    onzoom: (factor: number) => void;
    toolbarStart?: Snippet;
    toolbarEnd?: Snippet;
  } = $props();
</script>

<div
  class="map-toolbar"
  role="toolbar"
  aria-label="Race replay controls"
>
  {@render toolbarStart?.()}
  <div
    class="map-controls"
    role="group"
    aria-label="Course camera controls"
  >
    <ToggleButton
      icon="grid"
      label="Lanes ×2"
      ariaLabel="Expand lane spacing"
      pressed={laneDetail}
      onclick={() => (laneDetail = !laneDetail)}
    />
    <SegmentedControl
      compact
      label="Course camera"
      options={[
        { value: 'follow', label: 'Follow window', disabled: !hasTrack },
        { value: 'full', label: 'Full course', disabled: !hasTrack }
      ]}
      value={following ? 'follow' : 'full'}
      onchange={(value) => (value === 'follow' ? onfollow() : onfullcourse())}
    />
    <div
      class="map-zoom"
      role="group"
      aria-label="Course zoom"
    >
      <Button
        variant="secondary"
        size="sm"
        icon="minus"
        ariaLabel="Zoom course out"
        disabled={!hasTrack || zoomOutDisabled}
        onclick={() => onzoom(1 / 1.3)}
      />
      <Button
        variant="secondary"
        size="sm"
        icon="add"
        ariaLabel="Zoom course in"
        disabled={!hasTrack || zoomInDisabled}
        onclick={() => onzoom(1.3)}
      />
    </div>
  </div>
  {@render toolbarEnd?.()}
</div>

<style>
  .map-toolbar {
    grid-column: 1/-1;
    grid-row: 1;
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
    flex-wrap: wrap;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .map-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    min-width: 0;
    flex-wrap: wrap;
  }
  .map-zoom {
    display: flex;
    gap: 4px;
  }
  .map-zoom :global(.ui-button) {
    min-width: 32px;
    padding-inline: 8px;
    min-height: 32px;
  }
  @media (max-width: 950px) {
    .map-toolbar {
      grid-row: auto;
      order: 0;
      gap: 8px;
      align-items: start;
    }
    .map-controls {
      margin-left: 0;
    }
  }
  @media (max-width: 700px) {
    .map-toolbar {
      gap: 6px;
    }
    /* Camera controls and the replay actions share rows instead of nesting. */
    .map-controls {
      display: contents;
    }
    .map-zoom :global(.ui-button) {
      min-width: 36px;
      min-height: 36px;
    }
  }
</style>
