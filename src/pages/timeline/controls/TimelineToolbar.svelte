<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import type { TimelineStatus } from '../timeline-controls';

  interface Props {
    mobile: boolean;
    search: string;
    status: TimelineStatus;
    view: 'horizontal' | 'vertical';
    compactGaps: boolean;
    filtersOpen: boolean;
    activeFilterCount: number;
    footerVisible: boolean;
    onviewchange: (next: string) => void;
    onspacingchange: () => void;
    ontoday: () => void;
    ondate: (event: MouseEvent) => void;
    onfilterstoggle: () => void;
    onsearchjump: (offset: number) => void;
  }

  let {
    mobile,
    search = $bindable(),
    status,
    view,
    compactGaps,
    filtersOpen,
    activeFilterCount,
    footerVisible,
    onviewchange,
    onspacingchange,
    ontoday,
    ondate,
    onfilterstoggle,
    onsearchjump
  }: Props = $props();
</script>

{#if !mobile}
  <div class="toolbar-shell">
    <section class="toolbar">
      <div
        class="search"
        data-timeline-control="search"
      >
        <TextField
          id="timeline-search"
          label="Search timeline pickups or banner types"
          hideLabel
          prefixIcon="search"
          type="search"
          placeholder="Search pickups or banner types…"
          bind:value={search}
        />{#if search.trim()}
          <span>{status.searchPosition}</span>
        {/if}
      </div>
      {#if search.trim()}
        <div class="search-navigation">
          <IconButton
            icon="arrow-left"
            label="Previous search result"
            disabled={!status.filtered}
            onclick={() => onsearchjump(-1)}
          /><IconButton
            icon="arrow-right"
            label="Next search result"
            disabled={!status.filtered}
            onclick={() => onsearchjump(1)}
          />
        </div>
      {/if}
      <span class="timeline-count">{status.filtered} / {status.total}</span>
      <div class="view">
        <SegmentedControl
          label="Timeline direction"
          options={[
            { value: 'horizontal', label: 'Horizontal' },
            { value: 'vertical', label: 'Vertical' }
          ]}
          value={view}
          onchange={onviewchange}
        />
        <div data-timeline-control="spacing">
          <ToggleButton
            icon="timeline"
            label="Compact gaps"
            pressed={compactGaps}
            disabled={view === 'vertical'}
            onclick={onspacingchange}
          />
        </div>
        <div data-timeline-control="today">
          <Button
            variant="secondary"
            icon="calendar"
            onclick={ontoday}
          >
            Today
          </Button>
        </div>
        <Button
          variant="secondary"
          icon="calendar"
          disabled={status.loading || !status.filtered}
          onclick={ondate}
        >
          Go to date
        </Button>
        <div data-timeline-control="filters">
          <Button
            variant="secondary"
            icon="filter"
            ariaExpanded={filtersOpen}
            onclick={onfilterstoggle}
          >
            Filters{#if activeFilterCount}
              ({activeFilterCount})
            {/if}
          </Button>
        </div>
      </div>
    </section>
  </div>
{:else}
  <nav
    class="mobile-bottom-toolbar"
    class:is-footer-visible={footerVisible &&
      !status.loading &&
      !filtersOpen &&
      !search.trim() &&
      !activeFilterCount}
    inert={footerVisible && !status.loading && !filtersOpen && !search.trim() && !activeFilterCount}
    aria-label="Timeline actions"
  >
    <div data-timeline-control="today">
      <Button
        variant="secondary"
        icon="calendar"
        onclick={ontoday}
      >
        Today
      </Button>
    </div>
    <Button
      variant="secondary"
      disabled={status.loading || !status.filtered}
      onclick={ondate}
    >
      Go to date
    </Button>
    <div data-timeline-control="filters">
      <Button
        variant="secondary"
        ariaExpanded={filtersOpen}
        onclick={onfilterstoggle}
      >
        Search &amp; filters{#if activeFilterCount}
          ({activeFilterCount})
        {/if}
      </Button>
    </div>
  </nav>
{/if}

<style>
  @import './timeline-search.css';
  @import './timeline-toolbar.css';
</style>
