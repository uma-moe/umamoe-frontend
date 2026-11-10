<script lang="ts">
  import IconButton from '@/components/controls/IconButton.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { QueuedScreenshot } from './screenshot-queue.svelte';

  let {
    screenshots,
    accept,
    onadd,
    onremove
  }: {
    screenshots: QueuedScreenshot[];
    accept: string;
    onadd: (files: File[]) => void;
    onremove: (id: number) => void;
  } = $props();

  /** Each screenshot and the add tile share a row equally, up to this many to a row. */
  const MAX_COLUMNS = 4;

  let fileInput = $state<HTMLInputElement>();
  let dragging = $state(false);

  const columns = $derived(Math.min(screenshots.length + 1, MAX_COLUMNS));

  function receive(list: FileList | null | undefined) {
    const files = [...(list ?? [])];
    if (files.length) onadd(files);
  }
</script>

<ul
  class="shots"
  class:dragging
  style:--columns={columns}
  aria-label="Screenshots"
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={(event) => {
    event.preventDefault();
    dragging = false;
    receive(event.dataTransfer?.files);
  }}
>
  {#each screenshots as screenshot, index (screenshot.id)}
    <li class="shot">
      <img
        src={screenshot.url}
        alt="Screenshot {index + 1}"
      />
      {#if screenshot.state.status === 'waiting' || screenshot.state.status === 'reading'}
        <span class="shot-status">
          <Spinner
            size={22}
            label="Reading screenshot {index + 1}"
          />
        </span>
      {:else if screenshot.state.status === 'failed'}
        <span
          class="shot-status failed"
          title={screenshot.state.error}
        >
          <Icon
            name="warning"
            size={18}
          />
          Not read
        </span>
      {/if}
      <span class="shot-remove">
        <IconButton
          icon="close"
          size="sm"
          label="Remove screenshot {index + 1}"
          onclick={() => onremove(screenshot.id)}
        />
      </span>
    </li>
  {/each}
  <li>
    <button
      class="shot-add"
      type="button"
      onclick={() => fileInput?.click()}
    >
      <Icon
        name="add"
        size={20}
      />
      Add screenshot
      <small>or paste one</small>
    </button>
  </li>
</ul>
<input
  bind:this={fileInput}
  class="sr-only"
  type="file"
  {accept}
  multiple
  tabindex="-1"
  aria-hidden="true"
  onchange={(event) => {
    receive(event.currentTarget.files);
    event.currentTarget.value = '';
  }}
/>

<style>
  @import './screenshot-strip.css';
</style>
