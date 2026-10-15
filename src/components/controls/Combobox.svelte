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
  @import './combobox.css';
</style>
