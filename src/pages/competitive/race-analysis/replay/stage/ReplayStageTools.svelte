<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';

  let {
    fullscreen,
    onsettings,
    onfullscreen
  }: {
    fullscreen: boolean;
    onsettings: () => void;
    onfullscreen: () => void;
  } = $props();
</script>

<div
  class="stage-tools"
  role="group"
  aria-label="Replay actions"
>
  <Button
    variant="secondary"
    size="sm"
    icon="tune"
    ariaLabel="Display options"
    onclick={onsettings}
  >
    <span class="tool-label">Display options</span>
  </Button>
  <span class="replay-guide">
    <InspectPopover
      label="Replay guide"
      align="end"
    >
      {#snippet trigger()}
        <span class="guide-trigger">
          <span class="tool-label">Guide</span>
        </span>
      {/snippet}
      <div class="course-legend">
        <strong>Reading the replay</strong>
        <small>
          Drag to pan. Ctrl / ⌘ + scroll to zoom. Follow window keeps the racing pack in view. Lanes
          ×2 expands lane spacing. Portraits and dots share the current race position number; gold
          marks the leader.
        </small>
        <small>
          Select a runner to follow their speed, HP and skills. Use the timeline to jump to any
          moment. Select or hover a runner to see crowded labels.
        </small>
        {#each [{ label: 'Straight', color: '#64918c' }, { label: 'Final straight', color: '#419168' }, { label: 'Corner', color: '#7b7ea8' }, { label: 'Final corner', color: '#bb9148' }] as item}
          <span>
            <i style:background={item.color}></i>
            {item.label}
          </span>
        {/each}
      </div>
    </InspectPopover>
  </span>
  <Button
    variant="secondary"
    size="sm"
    icon="expand"
    ariaLabel={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    onclick={onfullscreen}
  >
    <span class="tool-label">{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
  </Button>
</div>

<style>
  @import './replay-stage-tools.css';
</style>
