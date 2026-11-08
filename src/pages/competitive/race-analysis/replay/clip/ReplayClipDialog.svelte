<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import DialogStatus from '@/pages/simulator/shell/DialogStatus.svelte';
  import type { ReplayClip } from './replay-clip.svelte';

  let { clip }: { clip: ReplayClip } = $props();

  const result = $derived(clip.status.kind === 'ready' ? clip.status : undefined);

  function download() {
    if (!result) return;

    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.fileName;
    link.click();
  }
</script>

<Dialog
  open={result !== undefined}
  title="Clip ready"
  icon="video"
  maxWidth="720px"
  onclose={clip.discard}
>
  {#if result}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      class="clip-preview"
      src={result.url}
      controls
      autoplay
      muted
      loop
      playsinline
    ></video>
  {/if}
  {#snippet actions()}
    {#if result}
      <DialogStatus>
        <strong>{result.fileName}</strong>
        <span>{result.megabytes.toFixed(1)} MB</span>
      </DialogStatus>
    {/if}
    <Button
      icon="download"
      onclick={download}
    >
      Download
    </Button>
  {/snippet}
</Dialog>

<style>
  .clip-preview {
    display: block;
    width: 100%;
    max-height: 60dvh;
    border-radius: var(--radius-md);
    background: #000;
  }
</style>
