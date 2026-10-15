<script lang="ts">
  import { onMount } from 'svelte';
  import { searchParams } from 'sv-router';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import { afterPagePaint } from '@/routes/after-page-paint';
  import { withPageRequest } from '@/services/http/page-request';
  import {
    filterOptions,
    TIMELINE_PREFERENCES_KEY,
    type FilterType,
    type TimelineStatus
  } from './timeline-controls';
  import type TimelineContent from './TimelineContent.svelte';
  import TimelineDateDialog from './controls/TimelineDateDialog.svelte';
  import TimelineFilterPanel from './controls/TimelineFilterPanel.svelte';
  import TimelineToolbar from './controls/TimelineToolbar.svelte';

  const tab = $derived(
    searchParams.toURLSearchParams().get('tab') === 'carat-planner' ? 'carat-planner' : 'timeline'
  );

  let content = $state<TimelineContent>();
  let view = $state<'horizontal' | 'vertical'>('horizontal');
  let compactGaps = $state(true);
  let search = $state('');
  let visibleTypes = $state<FilterType[]>(filterOptions.map((option) => option.type));
  let status = $state<TimelineStatus>({
    filtered: 0,
    total: 0,
    searchPosition: '',
    plannerEventCount: 0,
    loading: true,
    rewardsLoading: false
  });
  let mobile = $state(
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1149px)').matches
  );
  let filtersOpen = $state(false);
  let dateOpen = $state(false);

  let filterPanel = $state<HTMLElement>();

  let filterTrigger: HTMLElement | undefined;

  let footerVisible = $state(false);
  let initialized = $state(false);

  const activeFilterCount = $derived(filterOptions.length - visibleTypes.length);

  const page = withPageRequest(() =>
    Promise.all([import('./TimelineContent.svelte'), afterPagePaint()]).then(([module]) => module)
  );

  function setFilters(open: boolean) {
    if (open)
      filterTrigger =
        document.querySelector<HTMLElement>('[data-timeline-control="filters"] button') ??
        undefined;
    filtersOpen = open;
    if (!open) {
      if (filterPanel?.matches(':popover-open')) filterPanel.hidePopover();
      requestAnimationFrame(() => {
        if (!filtersOpen && filterTrigger?.isConnected && !document.querySelector('dialog[open]'))
          filterTrigger.focus({ preventScroll: true });
      });
    }
  }

  function changeView(next: string) {
    void content?.changeView(next);
    view = next as typeof view;
    filtersOpen = false;
  }

  function changeSpacing() {
    if (content) void content.changeSpacing();
    else compactGaps = !compactGaps;
  }

  function scrollToToday() {
    content?.scrollToToday();
  }

  function openDate(event: MouseEvent) {
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    dateOpen = true;
  }

  function jumpSearch(offset: number) {
    content?.jumpSearch(offset);
  }

  function preloadPlanner() {
    void import('@/pages/carat-planner/CaratPlanner.svelte').catch(() => {});
    void import('@/pages/carat-planner/planner-resource-repository')
      .then(({ plannerResourceRepository }) => plannerResourceRepository.prefetchManifest())
      .catch(() => {});
  }

  onMount(() => {
    const responsive = matchMedia('(max-width: 1149px)');
    const resize = () => {
      mobile = responsive.matches;
      filtersOpen = false;
    };
    resize();
    responsive.addEventListener('change', resize);
    const footerObserver = new IntersectionObserver((entries) => {
      footerVisible = entries.some((entry) => entry.isIntersecting);
    });
    const footer = document.querySelector('.site-footer');
    if (footer) footerObserver.observe(footer);
    const prepareTour = () => {
      filtersOpen = true;
      scrollToToday();
    };
    addEventListener('umamoe:prepare-timeline-tour', prepareTour);
    try {
      const stored = JSON.parse(localStorage.getItem(TIMELINE_PREFERENCES_KEY) ?? '{}') as {
        direction?: string;
        spacing?: string;
      };
      if (stored.direction === 'horizontal' || stored.direction === 'vertical')
        view = stored.direction;
      if (stored.spacing === 'calendar' || stored.spacing === 'compact')
        compactGaps = stored.spacing === 'compact';
    } catch {}
    initialized = true;
    return () => {
      responsive.removeEventListener('change', resize);
      footerObserver.disconnect();
      removeEventListener('umamoe:prepare-timeline-tour', prepareTour);
    };
  });

  $effect(() => {
    if (!initialized) return;
    try {
      localStorage.setItem(
        TIMELINE_PREFERENCES_KEY,
        JSON.stringify({ direction: view, spacing: compactGaps ? 'compact' : 'calendar' })
      );
    } catch {}
  });

  $effect(() => {
    tab;
    filtersOpen = false;
    window.dispatchEvent(new CustomEvent('umamoe:tour-page-changed'));
  });
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && filtersOpen && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      setFilters(false);
    }
  }}
/>
<AppPage
  routeId="timeline"
  title={tab === 'carat-planner' ? 'Carat Planner' : 'Timeline'}
  description={tab === 'carat-planner'
    ? 'Plan Carats, tickets, sparks, and banner targets.'
    : 'Global content releases, pickups, and events.'}
  metadata={tab === 'timeline' && status.total
    ? status.filtered + ' / ' + status.total + ' events'
    : undefined}
  tone="brand"
  width="wide"
  flush
  fullBleed={tab === 'timeline'}
  adsEnabled={tab !== 'timeline'}
  fill={!mobile && tab === 'timeline'}
  mobileHeading="actions-only"
>
  {#snippet actions()}
    <div class="timeline-tabs">
      {#if tab === 'timeline' && status.rewardsLoading && !status.loading}
        <Spinner
          label="Loading event rewards"
          size={18}
        />
      {/if}<Tabs
        label="Timeline tools"
        items={[
          { id: 'timeline', label: 'Timeline', href: '/timeline?tab=timeline', scrollToTop: false },
          {
            id: 'carat-planner',
            label: 'Carat Planner',
            href: '/timeline?tab=carat-planner',
            scrollToTop: false,
            onintent: preloadPlanner,
            badge: status.plannerEventCount ? String(status.plannerEventCount) : undefined
          }
        ]}
        value={tab}
      />
    </div>
  {/snippet}
  {#if tab === 'timeline'}
    <TimelineToolbar
      {mobile}
      bind:search
      {status}
      {view}
      {compactGaps}
      {filtersOpen}
      {activeFilterCount}
      {footerVisible}
      onviewchange={changeView}
      onspacingchange={changeSpacing}
      ontoday={scrollToToday}
      ondate={openDate}
      onfilterstoggle={() => setFilters(!filtersOpen)}
      onsearchjump={jumpSearch}
    />
    <TimelineFilterPanel
      open={filtersOpen}
      {mobile}
      bind:search
      bind:visibleTypes
      bind:element={filterPanel}
      onclose={() => setFilters(false)}
    />
  {/if}
  {#await page}
    <div
      class="pending-content"
      aria-busy="true"
      aria-label="Timeline content"
    ></div>
  {:then module}
    <module.default
      bind:this={content}
      {tab}
      {mobile}
      bind:view
      bind:compactGaps
      {search}
      {visibleTypes}
      bind:status
    />
  {:catch}
    <Banner
      title="Timeline could not be loaded"
      tone="danger"
    >
      <Button
        variant="secondary"
        onclick={() => location.reload()}
      >
        Reload page
      </Button>
    </Banner>
  {/await}
</AppPage>
<TimelineDateDialog
  bind:open={dateOpen}
  onjump={(date) => content?.scrollToDate(date)}
/>

<style>
  .timeline-tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
  }
  .timeline-tabs :global(.tabs) {
    min-width: 226px;
  }
  @media (max-width: 1280px) {
    .timeline-tabs :global(.tab) {
      min-width: 82px;
      padding-inline: 9px;
    }
  }
  @media (max-width: 768px) {
    .timeline-tabs {
      width: 100%;
      justify-content: stretch;
    }
    .timeline-tabs :global(.tabs) {
      width: 100%;
    }
    .timeline-tabs :global(.tab) {
      min-width: 0;
      flex: 1;
    }
  }

  .pending-content {
    min-height: 320px;
    flex: 1;
  }
</style>
