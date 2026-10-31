<script lang="ts">
  import AffinityStat from '../game/AffinityStat.svelte';
  import Banner from '../feedback/Banner.svelte';
  import Button from '../controls/Button.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import Artwork from '../game/Artwork.svelte';
  import CharacterSortMenu from './CharacterSortMenu.svelte';
  import Icon from '../Icon.svelte';
  import type { CharacterPickerOption } from './picker-types';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';

  type Mode = 'target' | 'include' | 'exclude';

  export type CharacterPickerSort = 'default' | 'name' | 'affinity';

  interface Props {
    label?: string;
    options: CharacterPickerOption[];
    loading?: boolean;
    error?: string;
    onretry?: () => void;
    selected?: string[];
    existing?: string[];
    mode?: Mode;
    multiple?: boolean;
    maxVisible?: number;
    sort?: CharacterPickerSort;
    showSort?: boolean;
    showSelectionCount?: boolean;
    searchPlaceholder?: string;
    onselect?: (selected: string[]) => void;
  }

  let {
    label = 'Select character',
    options,
    loading = false,
    error = '',
    onretry,
    selected = $bindable([]),
    existing = [],
    mode = 'target',
    multiple = false,
    maxVisible = 36,
    sort = $bindable<CharacterPickerSort>('default'),
    showSort = true,
    showSelectionCount = true,
    searchPlaceholder = 'Search by name...',
    onselect
  }: Props = $props();

  let query = $state('');

  const id = $props.id();

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = options.filter(
      (option) =>
        !needle ||
        `${option.name} ${option.subtitle ?? ''} ${option.id}`.toLocaleLowerCase().includes(needle)
    );

    if (sort === 'name') return matches.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'affinity') return matches.sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1));
    return matches;
  });

  const visible = $derived(filtered.slice(virtualRange.start, virtualRange.end));

  function toggle(id: string) {
    if (multiple)
      selected = selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
    else selected = [id];
    onselect?.(selected);
  }
</script>

<section
  class="picker picker--{mode}"
  aria-label={label}
>
  <div class="picker-tools">
    <div class="search">
      <Icon
        name="search"
        size={18}
      />
      <input
        type="text"
        role="searchbox"
        aria-label="Search characters"
        bind:value={query}
        placeholder={searchPlaceholder}
      />
      {#if query}
        <button
          type="button"
          class="clear-search"
          aria-label="Clear character search"
          onclick={() => {
            query = '';
          }}
        >
          <Icon
            name="close"
            size={16}
          />
        </button>
      {/if}
    </div>
    {#if showSort}
      <CharacterSortMenu
        bind:value={sort}
        hasAffinity={options.some((option) => option.affinity !== undefined)}
      />
    {/if}
    {#if multiple && showSelectionCount && selected.length}
      <span class="selection-count">
        {selected.length} selected
      </span>
    {/if}
  </div>
  {#if error}
    <Banner
      title="Character data unavailable"
      tone="danger"
    >
      <p>{error}</p>
      {#if onretry}
        <Button
          variant="secondary"
          onclick={onretry}
        >
          Retry character data
        </Button>
      {/if}
    </Banner>
  {/if}
  {#if loading}
    <Spinner
      centered
      minHeight="160px"
      label="Loading characters…"
    />
  {/if}
  <div
    class="character-grid"
    role={multiple ? 'group' : 'radiogroup'}
    aria-label={label}
    use:virtualScroll={{
      items: filtered,
      key: (option) => option.id,
      root: 'closest',
      estimate: 116,
      onrange: (range) => (virtualRange = range)
    }}
  >
    {#each visible as option, index (option.id)}
      {@const isSelected = selected.includes(option.id) || existing.includes(option.id)}
      <button
        data-virtual-index={virtualRange.start + index}
        type="button"
        class:selected={isSelected}
        aria-label={option.name}
        aria-describedby={`${id}-${option.id}-description`}
        aria-pressed={multiple ? isSelected : undefined}
        role={multiple ? undefined : 'radio'}
        aria-checked={multiple ? undefined : isSelected}
        disabled={option.disabled}
        onclick={() => toggle(option.id)}
      >
        <span
          class="sr-only"
          id={`${id}-${option.id}-description`}
        >
          Outfit {option.id}{option.affinity !== undefined ? `, affinity ${option.affinity}` : ''}
        </span>
        <span class="avatar">
          <Artwork
            src={option.image}
            alt={option.name}
            size="sm"
            shape="circle"
            loading="eager"
          />{#if multiple && isSelected}
            <span
              class="selected-mark"
              aria-hidden="true"
            >
              <Icon
                name={mode === 'exclude' ? 'close' : 'check'}
                size={24}
              />
            </span>
          {/if}
          {#if option.affinity !== undefined}
            <span
              class="affinity-badge"
              class:zero={option.affinity === 0}
            >
              <AffinityStat
                value={option.affinity}
                compact
              />
            </span>
          {/if}
        </span>
        <span class="copy">
          <strong>{option.name}</strong>
          {#if option.subtitle}
            <small>{option.subtitle}</small>
          {/if}
        </span>
      </button>
    {:else}
      {#if !loading && !error}
        <p class="empty">
          {query ? `No characters match “${query}”.` : 'No characters available.'}
        </p>
      {/if}
    {/each}
  </div>
</section>

<style>
  @import './character-picker.css';
</style>
