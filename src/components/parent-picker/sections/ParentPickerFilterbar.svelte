<script lang="ts">
  import type { ParentPickerState } from '@/lib/veterans/parents/parent-picker';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import TextField from '@/components/controls/TextField.svelte';

  interface Props {
    id: string;
    pickerState: ParentPickerState;
    targetId?: number;
    count: number;
    editing: boolean;
    manualLocked: boolean;
    onupload: () => void;
    onadd: () => void;
  }

  let {
    id,
    pickerState = $bindable(),
    targetId,
    count,
    editing,
    manualLocked,
    onupload,
    onadd
  }: Props = $props();

  const sortOptions = $derived([
    { value: 'total', label: 'Total' },
    ...(targetId ? [{ value: 'affinity', label: 'Affinity' }] : []),
    { value: 'creation_time', label: 'Newest first' },
    { value: 'blue', label: 'Blue ★' },
    { value: 'pink', label: 'Pink ★' },
    { value: 'green', label: 'Green ★' },
    { value: 'name', label: 'Name' }
  ]);
</script>

<div class="filterbar">
  <div class="parent-search">
    <TextField
      id={id + '-search'}
      label="Search parents"
      hideLabel
      placeholder={pickerState.tab === 'bookmarks' || pickerState.tab === 'saved'
        ? 'Search Uma or username…'
        : 'Search veterans…'}
      prefixIcon="search"
      bind:value={pickerState.query}
    />{#if pickerState.query}
      <IconButton
        icon="close"
        label="Clear parent search"
        onclick={() => (pickerState.query = '')}
      />
    {/if}
  </div>
  <span
    class="result-count"
    role="status"
  >
    {count}
    {count === 1 ? 'result' : 'results'}
  </span>
  <div class="parent-sort">
    <SelectFieldSlim
      id={id + '-sort'}
      label="Sort parents"
      hideLabel
      options={sortOptions}
      bind:value={pickerState.sort}
    />
  </div>
  <div class="parent-actions">
    {#if pickerState.tab === 'veterans'}
      <IconButton
        icon="upload"
        label="Upload veteran JSON"
        onclick={onupload}
      />
    {/if}
    {#if pickerState.tab === 'manual' && !editing}
      <Button
        icon="add"
        size="sm"
        variant="secondary"
        disabled={manualLocked}
        onclick={onadd}
      >
        Add
      </Button>
    {/if}
  </div>
</div>

<style>
  @import './parent-picker-filterbar.css';
</style>
