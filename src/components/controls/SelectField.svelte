<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';

  export interface SelectOption {
    value: string;
    label: string;
    image?: string;
    icon?: IconName;
    description?: string;
    disabled?: boolean;
  }

  interface Props {
    id: string;
    label: string;
    options: SelectOption[];
    value?: string;
    name?: string;
    help?: string;
    disabled?: boolean;
    hideLabel?: boolean;
    imageOnly?: boolean;
    prefixIcon?: IconName;
    onchange?: (value: string) => void;
  }

  let {
    id,
    label,
    options,
    value = $bindable(''),
    name,
    help,
    disabled = false,
    hideLabel = false,
    imageOnly = false,
    prefixIcon,
    onchange
  }: Props = $props();

  let root: HTMLDivElement;
  let control: HTMLButtonElement;

  let panel = $state<HTMLDivElement>();
  let opensAbove = $state(false);
  let panelHeight = $state(220);
  let open = $state(false);
  let activeIndex = $state(0);

  const selected = $derived(options.find((option) => option.value === value));

  function available(index: number) {
    const option = options[index];
    return Boolean(option && !option.disabled);
  }

  function nextIndex(start: number, direction: 1 | -1) {
    if (!options.length) return -1;
    let index = start;
    for (let count = 0; count < options.length; count += 1) {
      index = (index + direction + options.length) % options.length;
      if (available(index)) return index;
    }

    return start;
  }

  function show() {
    if (disabled) return;
    // Safari does not focus pointer-clicked buttons; the combobox owns listbox keys.
    control.focus({ preventScroll: true });
    activeIndex = options.findIndex((option) => option.value === value);
    if (!available(activeIndex)) activeIndex = options.findIndex((_, index) => available(index));
    open = true;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    value = option.value;
    onchange?.(value);
    open = false;
    control.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else activeIndex = nextIndex(activeIndex, event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      activeIndex = options.findIndex((_, index) => available(index));
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      activeIndex = options.findLastIndex((_, index) => available(index));
    } else if ((event.key === 'Enter' || event.key === ' ') && open) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      open = false;
    }
  }

  function handleWindowClick(event: MouseEvent) {
    if (open && event.target instanceof Node && !root.contains(event.target)) open = false;
  }

  $effect(() => {
    if (!open || !panel) return;
    const anchor = control.getBoundingClientRect();
    let top = 8,
      bottom = innerHeight - 8;

    // Respect scroll containers, including the body above a dialog's footer.
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) continue;
      const bounds = parent.getBoundingClientRect();
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }

    const below = bottom - anchor.bottom - 4,
      above = anchor.top - top - 4;

    const flip = below < Math.min(220, panel.scrollHeight) && above > below;
    const height = Math.max(44, Math.min(220, flip ? above : below));
    opensAbove = flip;
    panelHeight = height;
    const active = panel.querySelectorAll<HTMLElement>('[role="option"]')[activeIndex];
    if (active)
      panel.scrollTop = Math.max(0, active.offsetTop - height / 2 + active.offsetHeight / 2);
  });
</script>

<svelte:window onclick={handleWindowClick} />
<div
  class="field"
  bind:this={root}
  onfocusout={(event) => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) open = false;
  }}
>
  <label
    for={id}
    class:sr-only={hideLabel}
  >
    {label}
  </label>
  <div class="control-wrap">
    <button
      bind:this={control}
      type="button"
      {id}
      class="select-control"
      class:open
      class:image-only={imageOnly}
      {disabled}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls="{id}-options"
      aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
      onclick={() => (open ? (open = false) : show())}
      onkeydown={handleKeydown}
    >
      <span class="selected-copy">
        {#if prefixIcon}
          <Icon
            name={prefixIcon}
            size={16}
          />
        {/if}
        {#if selected?.image}
          <img
            src={selected.image}
            alt=""
          />
        {:else if selected?.icon}
          <Icon
            name={selected.icon}
            size={18}
          />
        {/if}
        <span
          class:sr-only={imageOnly && Boolean(selected?.image || selected?.icon)}
          class:rich-copy={Boolean(selected?.description)}
        >
          <span>{selected?.label ?? 'Select an option'}</span>
          {#if selected?.description}
            <small>{selected.description}</small>
          {/if}
        </span>
      </span>
      <Icon
        name="chevron"
        size={16}
      />
    </button>
    {#if open}
      <div
        bind:this={panel}
        id="{id}-options"
        class="select-panel"
        class:above={opensAbove}
        style:max-height="{panelHeight}px"
        role="listbox"
        tabindex="-1"
        aria-label={label}
      >
        {#each options as option, index}
          <button
            id="{id}-option-{index}"
            type="button"
            role="option"
            tabindex="-1"
            aria-selected={option.value === value}
            class:active={index === activeIndex}
            class:selected={option.value === value}
            class:image-only={imageOnly}
            disabled={option.disabled}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => choose(index)}
          >
            {#if option.image}
              <img
                src={option.image}
                alt=""
                loading="lazy"
              />
            {:else if option.icon}
              <Icon
                name={option.icon}
                size={18}
              />
            {/if}
            <span
              class:sr-only={imageOnly && Boolean(option.image || option.icon)}
              class:rich-copy={Boolean(option.description)}
            >
              <span>{option.label}</span>
              {#if option.description}
                <small>{option.description}</small>
              {/if}
            </span>
          </button>
        {:else}
          <div class="empty">No options available</div>
        {/each}
      </div>
    {/if}
  </div>
  {#if name}
    <input
      type="hidden"
      {name}
      {value}
    />
  {/if}
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
    height: 100%;
  }
  label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }
  .select-control {
    width: 100%;
    min-height: var(--control-height);
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0 10px;
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.2;
    text-align: left;
    transition:
      border-color var(--duration-fast),
      background-color var(--duration-fast);
  }
  .select-control:hover:not(:disabled) {
    border-color: var(--border-secondary);
  }
  .select-control:focus,
  .select-control.open {
    border-color: var(--factor-field-focus-border);
    outline: 0;
    background: var(--factor-field-focus-bg);
    box-shadow: var(--focus-ring);
  }
  .select-control :global(svg) {
    flex: 0 0 auto;
    color: var(--factor-field-arrow);
    transition: transform var(--duration-fast);
  }
  .selected-copy {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .selected-copy span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .selected-copy img {
    width: 32px;
    height: 24px;
    flex: 0 0 auto;
    object-fit: contain;
  }
  .select-control.image-only .selected-copy {
    flex: 1;
    justify-content: center;
  }
  .select-control.open > :global(svg) {
    transform: rotate(180deg);
  }
  .select-control:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .select-panel {
    position: absolute;
    top: calc(100% + 4px);
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
  .select-panel.above {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .select-panel button {
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
    font-family: inherit;
    font-size: 13px;
    line-height: 1.2;
    text-align: left;
  }
  .select-panel button:last-child {
    border-bottom: 0;
  }
  .select-panel button:has(.rich-copy) {
    min-height: 42px;
    gap: 6px;
    padding-block: 5px;
  }
  .select-panel button > :global(svg) {
    flex: 0 0 auto;
  }
  .rich-copy {
    display: grid;
    gap: 2px;
    line-height: 1.1;
  }
  .rich-copy > span {
    font-size: var(--select-label-size, 12px);
    font-weight: 650;
  }
  .rich-copy small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--select-description-size, 10px);
    color: var(--select-description-color, var(--accent-secondary));
  }
  .select-panel button img {
    width: 38px;
    height: 28px;
    flex: 0 0 auto;
    margin-right: 8px;
    object-fit: contain;
  }
  .select-panel button.image-only {
    justify-content: center;
  }
  .select-panel button.image-only img {
    width: auto;
    max-width: 100%;
    margin-right: 0;
  }
  .select-panel button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .select-panel button:hover:not(:disabled),
  .select-panel button.active {
    background: var(--factor-option-hover);
  }
  .select-panel button.selected {
    background: var(--factor-option-selected-bg);
    color: var(--factor-option-selected-text);
  }
  .select-panel button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
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
    .select-control {
      font-size: 12px;
    }
    .select-panel button,
    .select-panel button:has(.rich-copy),
    .empty {
      min-height: var(--touch-target);
    }
  }
</style>
