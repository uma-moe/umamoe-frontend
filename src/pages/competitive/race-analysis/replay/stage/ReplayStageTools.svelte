<script lang="ts">
  import Button from '@/components/controls/Button.svelte';

  let {
    fullscreen,
    clipping = false,
    onclip,
    onsettings,
    onfullscreen
  }: {
    fullscreen: boolean;
    /** The clip editor is open on the timeline. */
    clipping?: boolean;
    /** Absent where the replay cannot be recorded, such as a mean race. */
    onclip?: () => void;
    onsettings: () => void;
    onfullscreen: () => void;
  } = $props();
</script>

<div
  class="stage-tools replay-toolbar"
  role="group"
  aria-label="Replay actions"
>
  {#if onclip}
    <Button
      variant="secondary"
      size="sm"
      icon="video"
      ariaLabel="Create clip"
      ariaPressed={clipping}
      title="Cut a video clip of the replay"
      onclick={onclip}
    >
      <span class="tool-label">Clip</span>
    </Button>
  {/if}
  <Button
    variant="secondary"
    size="sm"
    icon="tune"
    ariaLabel="Display options"
    onclick={onsettings}
  >
    <span class="tool-label">Display</span>
  </Button>
  <Button
    variant="secondary"
    size="sm"
    icon="expand"
    ariaLabel={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    onclick={onfullscreen}
  />
</div>

<style>
  @import '../replay-toolbar.css';
  @import './replay-stage-tools.css';
</style>
