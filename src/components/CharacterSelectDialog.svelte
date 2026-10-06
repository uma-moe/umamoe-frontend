<script lang="ts">
  import Button from './Button.svelte';
  import CharacterPicker, { type CharacterPickerSort } from './CharacterPicker.svelte';
  import CharacterSortMenu from './CharacterSortMenu.svelte';
  import Dialog from './Dialog.svelte';
  import type { CharacterPickerOption } from './picker-types';

  interface Props {
    id?: string;
    open?: boolean;
    label?: string;
    options: CharacterPickerOption[];
    loading?: boolean;
    error?: string;
    onretry?: () => void;
    selected?: string[];
    existing?: string[];
    mode?: 'target' | 'include' | 'exclude';
    multiple?: boolean;
    sort?: CharacterPickerSort;
    onselect: (values: string[]) => void;
  }
  let { id, open = $bindable(false), label, options, loading = false, error = '', onretry, selected = $bindable([]), existing = [], mode = 'target', multiple = false, sort = $bindable('default'), onselect }: Props = $props();
  const title = $derived(multiple ? mode === 'include' ? 'Include Characters' : mode === 'exclude' ? 'Exclude Characters' : 'Select Characters' : 'Select Character');
  function select(values: string[]) { selected = values; if (!multiple) onselect(values); }
</script>

<div class="character-dialog character-dialog--{mode}">
  {#snippet confirmActions()}<Button icon="check" disabled={!selected.length} onclick={() => onselect(selected)}>Add {selected.length} Character{selected.length === 1 ? '' : 's'}</Button>{/snippet}
  <Dialog mobileFill {id} bind:open {title} icon={mode === 'include' ? 'add' : mode === 'exclude' ? 'minus' : 'user'} maxWidth="600px" mobileMaxHeight="calc(100dvh - 48px)" mobileInset="16px" contentPadding="12px" mobileContentPadding="8px" actions={multiple ? confirmActions : undefined}>
    {#snippet headerActions()}
      {#if multiple && selected.length}<span class="selected-count">{selected.length} selected</span>{/if}
      <CharacterSortMenu bind:value={sort} hasAffinity={options.some(option => option.affinity !== undefined)}/>
    {/snippet}
    {#if open}<CharacterPicker label={label ?? title} {options} {loading} {error} {onretry} {selected} {existing} {mode} {multiple} bind:sort showSort={false} showSelectionCount={false} onselect={select}/>{/if}
  </Dialog>
</div>

<style>
  .character-dialog { --dialog-content-font:var(--font-sans); --selection-rgb:var(--accent-primary-rgb); --selection-button:var(--accent-primary); }
  .character-dialog--include { --selection-rgb:var(--accent-success-rgb); --selection-button:var(--accent-success); }
  .character-dialog--exclude { --selection-rgb:var(--accent-error-rgb); --selection-button:var(--accent-error); }
  .character-dialog :global(.header-icon) { color:rgb(var(--selection-rgb)); }
  .character-dialog :global(.dialog-panel > footer) { --color-accent:var(--selection-button); }
  .selected-count { color:var(--text-secondary); font-size:12px; white-space:nowrap; }
  @media(max-width:600px) { .selected-count { font-size:10px; } }
  @media (max-width: 767px) { .character-dialog :global(.dialog-panel>header .icon-button),.character-dialog :global(.dialog-panel>header .trigger) { min-width:44px;min-height:44px; } }
</style>
