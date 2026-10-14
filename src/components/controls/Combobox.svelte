<script lang="ts">
  import type { Snippet } from 'svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { popoverPosition } from '@/lib/popover-position';
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  export interface ComboboxOption {
    value: string;
    label: string;
    keywords?: string;
    image?: string;
    disabled?: boolean;
  }

  interface Props {
    id: string;
    label: string;
    options: ComboboxOption[];
    value?: string;
    placeholder?: string;
    help?: string;
    disabled?: boolean;
    hideLabel?: boolean;
    maxResults?: number;
    minQueryLength?: number;
    popupAnchor?: HTMLElement;
    query?: string;
    filter?: boolean;
    action?: boolean;
    batchSize?: number;
    emptyText?: string;
    clearLabel?: string;
    emptyValue?: string;
    prefixIcon?: IconName;
    optionContent?: Snippet<[ComboboxOption]>;
    onchange?: (value: string) => void;
  }

  let {
    id,
    label,
    options,
    value = $bindable(''),
    query = $bindable(''),
    placeholder = 'Search…',
    help,
    disabled = false,
    hideLabel = false,
    maxResults = Infinity,
    minQueryLength = 0,
    popupAnchor,
    filter = true,
    action = false,
    batchSize = 40,
    emptyText = 'No matching options',
    clearLabel = 'Clear search',
    emptyValue,
    prefixIcon,
    optionContent,
    onchange
  }: Props = $props();

  let root: HTMLDivElement;
  let input: HTMLInputElement;

  let panel = $state<HTMLDivElement>();
  let open = $state(false);
  let editing = $state(false);
  let activeIndex = $state(0);

  const selected = $derived(options.find((option) => option.value === value));
  const expanded = $derived(open && query.trim().length >= minQueryLength);
  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!filter || !needle || (!editing && selected?.label === query))
      return options.slice(0, maxResults);
    return options
      .filter((option) =>
        `${option.label} ${option.keywords ?? ''}`.toLocaleLowerCase().includes(needle)
      )
      .slice(0, maxResults);
  });
  const visible = $derived(filtered.slice(virtualRange.start, virtualRange.end));

  $effect(() => {
    if (!expanded || !popupAnchor || !panel) return;
    const anchor = popupAnchor,
      popup = panel;
    void visible.length;
    if (!popup.matches(':popover-open')) popup.showPopover();
    const limit =
      parseFloat(getComputedStyle(popup).getPropertyValue('--combobox-max-height')) || 220;
    const position = () => {
      const rect = anchor.getBoundingClientRect(),
        viewport = window.visualViewport;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? innerHeight),
        top = viewport?.offsetTop ?? 0;
      const below = bottom - rect.bottom - 8,
        above = rect.top - top - 8;
      const up = below < Math.min(limit, popup.scrollHeight) && above > below;
      const height = Math.max(0, Math.min(limit, up ? above : below)),
        width = Math.min(rect.width, innerWidth - 16);
      const { left, top: popupTop } = popoverPosition(
        popup,
        Math.max(8, Math.min(rect.left, innerWidth - width - 8)),
        up ? rect.top - Math.min(height, popup.scrollHeight) - 2 : rect.bottom + 2
      );
      Object.assign(popup.style, {
        width: `${width}px`,
        maxHeight: `${height}px`,
        left: `${left}px`,
        top: `${popupTop}px`
      });
    };
    position();
    const resize = new ResizeObserver(position);
    resize.observe(anchor);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  });

  $effect(() => {
    if (!editing && !action) query = selected?.label ?? '';
  });

  $effect(() => {
    if (expanded && (!filtered[activeIndex] || filtered[activeIndex]?.disabled))
      activeIndex = filtered.findIndex((option) => !option.disabled);
  });

  function close() {
    if (editing && !query.trim() && emptyValue !== undefined && value !== emptyValue) {
      value = emptyValue;
      onchange?.(emptyValue);
    }
    open = false;
    editing = false;
    if (!action) query = selected?.label ?? '';
  }

  function choose(option: ComboboxOption) {
    if (option.disabled) return;
    value = action ? '' : option.value;
    query = action ? '' : option.label;
    onchange?.(option.value);
    input.focus();
    editing = false;
    open = false;
  }

  function move(direction: 1 | -1) {
    if (!filtered.length) return;
    let next = activeIndex;
    for (let count = 0; count < filtered.length; count += 1) {
      next = (next + direction + filtered.length) % filtered.length;
      const candidate = filtered[next];
      if (candidate && !candidate.disabled) break;
    }
    activeIndex = next;
  }

  function show() {
    if (!editing && value === emptyValue) {
      query = '';
      editing = true;
    }
    activeIndex = filtered.findIndex((option) => option.value === value && !option.disabled);
    if (activeIndex < 0) activeIndex = filtered.findIndex((option) => !option.disabled);
    open = true;
  }

  function handleInput() {
    editing = true;
    activeIndex = -1;
    open = true;
  }

  function clear() {
    query = '';
    handleInput();
    input.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) open = true;
      else move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (
      event.key === 'Enter' &&
      (expanded || (action && query.trim().length >= minQueryLength))
    ) {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) choose(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  }

  function handleWindowClick(event: MouseEvent) {
    if (!event.composedPath().includes(popupAnchor ?? root)) {
      close();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} />
<div
  class="field"
  bind:this={root}
  onfocusout={(event) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !(popupAnchor ?? root).contains(event.relatedTarget)
    )
      close();
  }}
>
  <label
    for={id}
    class:sr-only={hideLabel}
  >
    {label}
  </label>
  <div class="control-wrap">
    {#if selected?.image}
      <img
        class="selected-image"
        src={selected.image}
        alt=""
        width="22"
        height="22"
      />
    {/if}
    {#if prefixIcon && !selected?.image}
      <span
        class="prefix-icon"
        aria-hidden="true"
      >
        <Icon
          name={prefixIcon}
          size={18}
        />
      </span>
    {/if}
    <input
      bind:this={input}
      {id}
      {placeholder}
      {disabled}
      bind:value={query}
      type={action ? 'search' : 'text'}
      class:with-image={Boolean(selected?.image || prefixIcon)}
      class:with-clear={action && Boolean(query)}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={expanded}
      aria-controls="{id}-options"
      aria-activedescendant={expanded && activeIndex >= 0
        ? `${id}-option-${activeIndex}`
        : undefined}
      autocomplete="off"
      oninput={handleInput}
      onclick={show}
      onfocus={() => {
        show();
        if (!action) input.select();
      }}
      onkeydown={handleKeydown}
    />
    {#if action && query}
      <button
        class="clear-query"
        type="button"
        aria-label={clearLabel}
        onclick={clear}
      >
        <Icon
          name="close"
          size={16}
        />
      </button>
    {/if}
    {#if expanded}
      <div
        bind:this={panel}
        popover={popupAnchor ? 'manual' : undefined}
        id="{id}-options"
        class="combo-panel"
        role="listbox"
        tabindex="-1"
        aria-label="{label} suggestions"
      >
        <div
          use:virtualScroll={{
            items: filtered,
            key: (option) => option.value,
            root: 'closest',
            estimate: 44,
            navigateTo: activeIndex,
            onrange: (range) => (virtualRange = range)
          }}
        >
          {#each visible as option, localIndex (option.value)}
            {@const index = virtualRange.start + localIndex}
            <button
              data-virtual-index={index}
              aria-posinset={index + 1}
              aria-setsize={filtered.length}
              id="{id}-option-{index}"
              type="button"
              role="option"
              tabindex="-1"
              aria-selected={action ? index === activeIndex : option.value === value}
              class:active={index === activeIndex}
              class:selected={option.value === value}
              disabled={option.disabled}
              onpointermove={(event) => {
                if (event.pointerType === 'mouse' && (event.movementX || event.movementY))
                  activeIndex = index;
              }}
              onmousedown={(event) => event.preventDefault()}
              onclick={() => choose(option)}
            >
              {#if optionContent}
                {@render optionContent(option)}
              {:else}
                {#if option.image}
                  <img
                    src={option.image}
                    alt=""
                    width="28"
                    height="28"
                    loading="lazy"
                  />
                {/if}
                <span>{option.label}</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if !filtered.length}
          <div
            class="empty"
            role="status"
          >
            {emptyText}
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#if help}
    <small>{help}</small>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .control-wrap {
    position: relative;
    min-width: 0;
  }
  label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }
  .selected-image {
    position: absolute;
    z-index: 1;
    top: 50%;
    left: 9px;
    width: 22px;
    height: 22px;
    transform: translateY(-50%);
    object-fit: contain;
    pointer-events: none;
  }
  .prefix-icon {
    position: absolute;
    top: 50%;
    left: 10px;
    display: flex;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }
  .clear-query {
    position: absolute;
    right: 0;
    top: 0;
    width: 44px;
    height: 100%;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .clear-query:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -3px;
  }
  input {
    width: 100%;
    height: var(--control-height);
    padding: 0 10px;
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    font-size: var(--font-md);
    transition:
      border-color var(--duration-fast),
      background-color var(--duration-fast);
  }
  input.with-image {
    padding-left: 38px;
  }
  input.with-clear {
    padding-right: 44px;
  }
  input[type='search']::-webkit-search-cancel-button {
    display: none;
  }
  input::placeholder {
    color: var(--factor-field-placeholder);
  }
  input:hover:not(:disabled) {
    border-color: var(--border-secondary);
  }
  input:focus {
    border-color: var(--factor-field-focus-border);
    outline: 0;
    background: var(--factor-field-focus-bg);
    box-shadow: var(--focus-ring);
  }
  input:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .combo-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: var(--z-overlay);
    width: 100%;
    max-height: 220px;
    overflow-y: auto;
    padding: 0;
    border: 1px solid var(--factor-panel-border);
    border-radius: 8px;
    background: var(--factor-panel-bg);
    box-shadow: var(--shadow-dropdown);
  }
  .combo-panel button {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border: 0;
    border-bottom: 1px solid var(--factor-option-separator);
    border-radius: 0;
    background: transparent;
    color: var(--factor-option-text);
    cursor: pointer;
    font-size: var(--font-sm);
    text-align: left;
  }
  .combo-panel[popover] {
    position: fixed;
    inset: auto;
    margin: 0;
  }
  .combo-panel button:last-of-type {
    border-bottom: 0;
  }
  .combo-panel img {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    margin-right: 8px;
    border-radius: 0;
    object-fit: contain;
    object-position: center;
  }
  .combo-panel button:hover:not(:disabled),
  .combo-panel button.active {
    background: var(--factor-option-hover);
  }
  .combo-panel button.selected {
    background: var(--factor-option-selected-bg);
    color: var(--factor-option-selected-text);
  }
  .combo-panel button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .empty {
    min-height: 36px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    color: var(--color-text-subtle);
    font-size: var(--font-sm);
  }
  small {
    color: var(--color-text-subtle);
    font-size: var(--font-xs);
  }
  @media (max-width: 767px) {
    .combo-panel button,
    .empty {
      min-height: var(--touch-target);
    }
  }
</style>
