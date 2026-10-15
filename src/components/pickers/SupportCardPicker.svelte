<script lang="ts">
  import Icon from '../Icon.svelte';
  import Dialog from '../overlays/Dialog.svelte';
  import Artwork from '../game/Artwork.svelte';
  import SelectField, { type SelectOption } from '../controls/SelectField.svelte';
  import Banner from '../feedback/Banner.svelte';
  import Button from '../controls/Button.svelte';
  import Spinner from '../feedback/Spinner.svelte';
  import { matchesSupportSearch } from '@/lib/game-data/support-cards/support-card-details';
  import type { SupportCardPickerOption } from './picker-types';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';

  interface Props {
    id?: string;
    label?: string;
    options: SupportCardPickerOption[];
    selectedOption?: SupportCardPickerOption;
    value?: string;
    maxVisible?: number;
    compact?: boolean;
    loading?: boolean;
    error?: string;
    cached?: boolean;
    onclear?: () => void;
    onopen?: () => void;
    onretry?: () => void;
    onselect?: (id: string) => void;
  }

  let {
    id = 'support-card-picker',
    label = 'Select support card',
    options,
    selectedOption,
    value = $bindable(''),
    maxVisible = 8,
    compact = false,
    loading = false,
    error = '',
    cached = false,
    onclear,
    onopen,
    onretry,
    onselect
  }: Props = $props();

  let query = $state('');
  let type = $state('All');
  let rarity = $state('All');
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let open = $state(false);

  const types: SelectOption[] = ['All', 'Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Friend'].map(
    (value) => {
      if (value === 'All') return { value, label: 'All types' };

      if (value === 'Friend') return { value, label: value, icon: 'user' };

      return {
        value,
        label: value === 'Wit' ? 'Wisdom' : value,
        image: `/assets/images/icon/stats/${value.toLowerCase()}.webp`
      };
    }
  );

  const rarities = ['All', 'R', 'SR', 'SSR'].map((value) => ({
    value,
    label: value === 'All' ? 'All rarities' : value,
    ...(value === 'All' ? {} : { image: `/game-assets/support-rarity/${value.toLowerCase()}.png` })
  }));

  const filtered = $derived(
    options.filter((option) => {
      return (
        matchesSupportSearch(
          option.searchText ?? `${option.id} ${option.title} ${option.character ?? ''}`,
          query
        ) &&
        (type === 'All' || option.type === type) &&
        (rarity === 'All' || option.rarity === rarity)
      );
    })
  );

  const selected = $derived(
    options.find((option) => option.id === value) ??
      (selectedOption?.id === value ? selectedOption : undefined)
  );

  function select(id: string) {
    value = id;
    onselect?.(id);
    if (compact) open = false;
  }

  function show() {
    query = '';
    type = 'All';
    rarity = 'All';
    open = true;
    onopen?.();
  }
</script>

{#snippet browser()}
  <div class="tools">
    <div class="search">
      <Icon
        name="search"
        size={18}
      />
      <input
        type="text"
        role="searchbox"
        aria-label="Search support cards"
        bind:value={query}
        placeholder="Search by character or card name..."
      />
      {#if query}
        <button
          type="button"
          aria-label="Clear support search"
          onclick={() => (query = '')}
        >
          <Icon
            name="close"
            size={16}
          />
        </button>
      {/if}
    </div>
    {#if loading}
      <div
        class="resource-status"
        role="status"
      >
        <Spinner size={16} />
        <span>
          {cached ? 'Using cached resources; refreshing...' : 'Still fetching resources...'}
        </span>
      </div>
    {/if}
    {#if error}
      <Banner
        tone="danger"
        title={cached ? 'Resource refresh failed' : 'Resource fetch failed'}
      >
        <p class="resource-error">{error}</p>
        {#if onretry}
          <Button
            variant="secondary"
            onclick={onretry}
          >
            Retry support data
          </Button>
        {/if}
      </Banner>
    {/if}
    <div class="quick-filters">
      <SelectField
        id={`${id}-type`}
        label="Type"
        hideLabel
        options={types}
        bind:value={type}
      /><SelectField
        id={`${id}-rarity`}
        label="Rarity"
        hideLabel
        options={rarities}
        bind:value={rarity}
      />
    </div>
  </div>
  <div
    class="cards"
    role="radiogroup"
    aria-label={label}
    use:virtualScroll={{
      items: filtered,
      key: (option) => option.id,
      root: 'closest',
      estimate: 140,
      onrange: (range) => (virtualRange = range)
    }}
  >
    {#each filtered.slice(virtualRange.start, virtualRange.end) as option, index (option.id)}
      <button
        data-virtual-index={virtualRange.start + index}
        type="button"
        role="radio"
        aria-checked={value === option.id}
        class:selected={value === option.id}
        disabled={option.disabled}
        onclick={() => select(option.id)}
      >
        <Artwork
          src={option.image}
          fallbackSrc="/assets/images/placeholder-card.webp"
          alt=""
          kind="card"
        />
        <span class="card-copy">
          <strong class="card-name">{option.character || option.title}</strong>
          {#if option.character && option.character.trim().toLowerCase() !== option.title
                .trim()
                .toLowerCase()}
            <span
              class="card-title"
              title={option.title}
            >
              {option.title.replace(/^\[|\]$/g, '')}
            </span>
          {/if}
          <span class="meta">
            <img
              src={`/game-assets/support-rarity/${option.rarity.toLowerCase()}.png`}
              alt={option.rarity}
              title={option.rarity}
              width="22"
              height="22"
            />
            {#if option.type === 'Friend'}
              <span
                role="img"
                aria-label="Friend support"
                title="Friend support"
              >
                <Icon
                  name="user"
                  size={18}
                />
              </span>
            {:else}
              <img
                src={`/assets/images/icon/stats/${option.type.toLowerCase()}.webp`}
                alt={`${option.type === 'Wit' ? 'Wisdom' : option.type} support`}
                title={`${option.type === 'Wit' ? 'Wisdom' : option.type} support`}
                width="18"
                height="18"
              />
            {/if}
            {#if value === option.id}
              <span
                class="selection-check"
                aria-label="Selected"
              >
                <Icon
                  name="check"
                  size={14}
                />
              </span>
            {/if}
          </span>
        </span>
      </button>
    {:else}
      {#if !loading && !error}
        <p class="empty">No support cards match these filters.</p>
      {/if}
    {/each}
  </div>
{/snippet}

<section
  class="support-picker"
  class:compact
  class:has-selection={Boolean(selected)}
  aria-label={label}
>
  {#if compact}
    <button
      class="compact-trigger"
      class:selected={Boolean(selected)}
      type="button"
      aria-label={selected ? `Change support card ${selected.title}` : label}
      onclick={show}
    >
      <span class="compact-visual">
        {#if selected?.image}
          <img
            src={selected.image}
            alt=""
          />
        {:else}
          <Icon
            name="search"
            size={22}
          />
        {/if}
      </span>
      {#if !selected}
        <span class="compact-copy">
          <strong>Select card</strong>
          <small>Borrow support</small>
        </span>
      {/if}
    </button>
    {#if selected}
      <div class="card-actions">
        <Button
          variant="secondary"
          size="sm"
          ariaLabel="Change support card"
          onclick={show}
        >
          Change
        </Button>{#if onclear}
          <Button
            variant="secondary"
            icon="trash"
            ariaLabel="Clear support"
            size="sm"
            onclick={onclear}
          />
        {/if}
      </div>
    {/if}
    <Dialog
      mobileFill
      id={`${id}-dialog`}
      title="Select Support Card"
      icon="cards"
      bind:open
      maxWidth="900px"
      mobileMaxHeight="calc(100dvh - 32px)"
      contentPadding="12px"
      mobileContentPadding="8px"
    >
      {#if open}
        <div class="dialog-browser">{@render browser()}</div>
      {/if}
    </Dialog>
  {:else}
    {@render browser()}
  {/if}
</section>

<style>
  @import './support-card-picker.css';
</style>
