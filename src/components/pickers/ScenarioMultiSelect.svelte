<script lang="ts">
  import Icon from '../Icon.svelte';
  import { scenarios as options } from '@/lib/catalog/scenario-catalog';

  interface Props {
    id: string;
    label: string;
    value?: number[];
    onchange?: (value: number[]) => void;
  }

  let { id, label, value = $bindable([]), onchange }: Props = $props();

  let root: HTMLDivElement;

  let open = $state(false);

  const selected = $derived(options.filter((option) => value.includes(option.id)));
  const summary = $derived(
    selected.length === 0
      ? 'Any scenario'
      : selected.length === 1
        ? (selected[0]?.label ?? 'Any scenario')
        : `${selected.length} scenarios`
  );

  function toggle(id: number): void {
    value = value.includes(id)
      ? value.filter((item) => item !== id)
      : [...value, id].sort((a, b) => a - b);
    onchange?.(value);
  }

  function handleWindowClick(event: MouseEvent): void {
    if (open && event.target instanceof Node && !root.contains(event.target)) open = false;
  }
</script>

<svelte:window onclick={handleWindowClick} />
<div
  class="field"
  bind:this={root}
>
  <label
    class="field-label"
    for={id}
  >
    {label}
  </label>
  <div class="control-wrap">
    <button
      {id}
      class="control"
      class:open
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${id}-options`}
      onclick={() => (open = !open)}
    >
      <span class="selected-copy">
        {#if selected.length === 1}
          <img
            src={selected[0]?.image}
            alt=""
          />
        {/if}
        <span>{summary}</span>
      </span>
      <Icon
        name="chevron"
        size={16}
      />
    </button>
    {#if open}
      <div
        id={`${id}-options`}
        class="panel"
        role="listbox"
        aria-label={label}
        aria-multiselectable="true"
      >
        {#each options as option}
          <button
            type="button"
            role="option"
            aria-selected={value.includes(option.id)}
            class:selected={value.includes(option.id)}
            onclick={() => toggle(option.id)}
          >
            <span class="check">
              {#if value.includes(option.id)}
                <Icon
                  name="check"
                  size={13}
                />
              {/if}
            </span>
            <img
              src={option.image}
              alt=""
              loading="lazy"
            />
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field > label {
    color: var(--color-text);
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.2;
  }
  .control-wrap {
    position: relative;
    min-width: 0;
  }
  .control {
    width: 100%;
    height: var(--control-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--factor-field-border);
    border-radius: 8px;
    background: var(--factor-field-bg);
    color: var(--factor-field-text);
    cursor: pointer;
    font: inherit;
    font-size: 14px;
    text-align: left;
  }
  .control:hover,
  .control.open {
    border-color: var(--factor-field-focus-border);
    background: var(--factor-field-focus-bg);
  }
  .control:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  .control > :global(svg) {
    flex: 0 0 auto;
    color: var(--factor-field-arrow);
    transition: transform var(--duration-fast);
  }
  .control.open > :global(svg) {
    transform: rotate(180deg);
  }
  .selected-copy {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .selected-copy img {
    width: 34px;
    height: 25px;
    flex: 0 0 auto;
    object-fit: contain;
  }
  .selected-copy span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .panel {
    position: absolute;
    z-index: var(--z-overlay);
    top: calc(100% + 4px);
    left: 0;
    width: max(100%, 270px);
    max-height: 300px;
    overflow: auto;
    border: 1px solid var(--factor-panel-border);
    border-radius: 8px;
    background: var(--factor-panel-bg);
    box-shadow: var(--shadow-dropdown);
  }
  .panel button {
    width: 100%;
    min-height: 42px;
    display: grid;
    grid-template-columns: 18px 44px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border: 0;
    border-bottom: 1px solid var(--factor-option-separator);
    border-radius: 0;
    background: transparent;
    color: var(--factor-option-text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }
  .panel button:last-child {
    border-bottom: 0;
  }
  .panel button:hover {
    background: var(--factor-option-hover);
  }
  .panel button.selected {
    background: var(--factor-option-selected-bg);
    color: var(--factor-option-selected-text);
  }
  .panel button img {
    width: 44px;
    height: 30px;
    object-fit: contain;
  }
  .check {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-secondary);
    border-radius: 3px;
  }
  .selected .check {
    border-color: var(--accent-primary);
    background: var(--accent-primary);
    color: #07121d;
  }
  @media (max-width: 600px) {
    .panel {
      right: 0;
      width: 100%;
      max-height: 46dvh;
    }
    .panel button {
      min-height: var(--touch-target);
    }
  }
</style>
