<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import type { raceChoices } from './race-session';

  let {
    count,
    busy,
    progress,
    demo,
    loading,
    choices,
    selected,
    fileName,
    onselect,
    onremove
  }: {
    count: number;
    busy: boolean;
    progress: string;
    demo: boolean;
    loading: boolean;
    choices: ReturnType<typeof raceChoices>;
    selected: string;
    fileName: string;
    onselect: (value: string) => void;
    onremove: () => void;
  } = $props();

  const isSession = $derived(count > 1);
</script>

<div class="race-source">
  {#if busy && isSession}
    <span role="status">
      <Badge tone="accent">Resimulating {progress}…</Badge>
    </span>
  {/if}
  {#if demo}
    <Badge>Demo data</Badge>
  {/if}
  {#if isSession}
    <SelectField
      id="selected-race"
      label="Race"
      hideLabel
      options={choices}
      value={selected}
      onchange={onselect}
    />
  {:else}
    <span
      class="file-name"
      title={fileName}
    >
      {fileName}
    </span>
  {/if}
  <Button
    variant="secondary"
    size="sm"
    icon="trash"
    ariaLabel="Remove race"
    title="Remove race"
    disabled={loading}
    onclick={onremove}
  >
    <span class="remove-label">Remove</span>
  </Button>
</div>

<style>
  .race-source {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .race-source :global(.badge) {
    flex: none;
    min-height: 20px;
    white-space: nowrap;
  }
  .race-source :global(.field) {
    width: 260px;
    min-width: 0;
  }
  .race-source :global(.ui-button) {
    flex: none;
  }
  .file-name {
    min-width: 0;
    max-width: 240px;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* A phone keeps the remove action as its icon and leaves the file name to the race picker. */
  @media (max-width: 767px) {
    .race-source :global(.field) {
      width: auto;
      flex: 1;
    }
    .file-name,
    .remove-label {
      display: none;
    }
  }
</style>
