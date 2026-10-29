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
</script>

<div class="race-source">
  <div class="session-status">
    <strong>
      {count}
      {count === 1 ? 'race' : 'races'} loaded
    </strong>
    {#if busy}
      <span role="status">
        Resimulating {progress}…
      </span>
    {/if}{#if demo}
      <Badge>Demo data</Badge>
    {/if}
  </div>
  <div class="race-selection">
    {#if count > 1}
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
    {/if}<Button
      variant="secondary"
      size="sm"
      icon="trash"
      disabled={loading}
      onclick={onremove}
    >
      Remove race
    </Button>
  </div>
</div>

<style>
  .session-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .race-source {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .session-status {
    font-size: 10px;
    flex: none;
    justify-content: flex-end;
    color: var(--text-secondary);
  }
  .race-selection {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .race-selection :global(.field) {
    width: 300px;
    min-width: 0;
  }
  .race-selection :global(.ui-button) {
    flex: none;
    font-size: 11px;
    min-height: 32px;
  }
  .file-name {
    min-width: 0;
    max-width: 580px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
    font-size: 11px;
  }
  @media (min-width: 951px) {
    .race-source {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .race-selection {
      flex: 1;
    }
    .file-name {
      flex: 1;
    }
  }
  @media (max-width: 767px) {
    .race-source {
      width: 100%;
    }
    .session-status {
      font-size: 10px;
      justify-content: flex-start;
    }
    .race-selection {
      flex-basis: 100%;
      justify-content: space-between;
    }
    .race-selection :global(.field) {
      width: auto;
      flex: 1;
    }
    .file-name {
      flex: 1;
    }
  }
</style>
