<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { filterIcons, filterOptions, type FilterType } from '../timeline-controls';

  interface Props {
    open: boolean;
    mobile: boolean;
    search: string;
    visibleTypes: FilterType[];
    element?: HTMLElement;
    onclose: () => void;
  }

  let {
    open,
    mobile,
    search = $bindable(),
    visibleTypes = $bindable(),
    element = $bindable(),
    onclose
  }: Props = $props();

  function toggleType(type: FilterType) {
    visibleTypes = visibleTypes.includes(type)
      ? visibleTypes.filter((item) => item !== type)
      : [...visibleTypes, type];
  }

  $effect(() => {
    if (!element) return;
    if (open && !element.matches(':popover-open')) element.showPopover();
    if (open && !mobile) {
      const trigger = document
        .querySelector('[data-timeline-control="filters"]')
        ?.getBoundingClientRect();

      if (trigger) {
        element.style.top = Math.min(trigger.bottom + 4, innerHeight - 100) + 'px';
        element.style.right = Math.max(8, innerWidth - trigger.right) + 'px';
      }
    } else {
      element.style.removeProperty('top');
      element.style.removeProperty('right');
    }

    if (!open && element.matches(':popover-open')) element.hidePopover();
  });
</script>

{#if mobile && open}
  <button
    type="button"
    class="filter-backdrop"
    aria-label="Close timeline filters"
    onclick={onclose}
  ></button>
{/if}
<aside
  bind:this={element}
  popover="manual"
  class="filter-popover"
  class:mobile-filter-sheet={mobile}
  aria-label={mobile ? 'Search & filters' : 'Visible event types'}
>
  <header>
    <strong>{mobile ? 'Search & filters' : 'Visible event types'}</strong>
    <div>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => {
          visibleTypes = visibleTypes.length ? [] : filterOptions.map((option) => option.type);
        }}
      >
        {visibleTypes.length ? 'Unselect all' : 'Select all'}
      </Button><IconButton
        icon="close"
        label="Close filters"
        onclick={onclose}
      />
    </div>
  </header>
  {#if mobile}
    <div
      class="search"
      data-timeline-control="search"
    >
      <TextField
        id="timeline-mobile-search"
        label="Search timeline pickups or banner types"
        hideLabel
        prefixIcon="search"
        type="search"
        placeholder="Search pickups or banner types…"
        bind:value={search}
      />
    </div>
  {/if}
  <div class="filter-options">
    {#each filterOptions as option, index}
      <div
        class="filter-option"
        style:--color-accent={option.color}
      >
        <Checkbox
          id={`timeline-filter-${option.type}`}
          label={option.label}
          icon={mobile ? undefined : filterIcons[index]}
          checked={visibleTypes.includes(option.type)}
          onchange={() => toggleType(option.type)}
        />
      </div>
    {/each}
  </div>
</aside>

<style>
  @import './timeline-search.css';
  @import './timeline-filter-panel.css';
</style>
