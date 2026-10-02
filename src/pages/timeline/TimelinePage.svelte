<script lang="ts">
  import { onMount } from 'svelte';
  import { searchParams } from 'sv-router';
  import AppPage from '@/layouts/AppPage.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import ToggleButton from '@/components/ToggleButton.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import TextField from '@/components/TextField.svelte';
  import { afterPagePaint } from '@/routes/after-page-paint';
  import { withPageRequest } from '@/services/http/page-request';
  import { filterOptions, filterIcons, TIMELINE_PREFERENCES_KEY, type FilterType, type TimelineStatus } from './timeline-controls';
  import type TimelineContent from './TimelineContent.svelte';

  const tab = $derived(searchParams.toURLSearchParams().get('tab') === 'carat-planner' ? 'carat-planner' : 'timeline');
  let content = $state<TimelineContent>();
  let view = $state<'horizontal' | 'vertical'>('horizontal');
  let compactGaps = $state(true);
  let search = $state('');
  let visibleTypes = $state<FilterType[]>(filterOptions.map(option => option.type));
  let status = $state<TimelineStatus>({ filtered: 0, total: 0, searchPosition: '', plannerEventCount: 0, loading: true, rewardsLoading: false });
  let mobile = $state(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 1149px)').matches);
  let filtersOpen = $state(false);
  let filterPanel = $state<HTMLElement>();
  let filterTrigger: HTMLElement | undefined;
  let footerVisible = $state(false);
  let initialized = $state(false);
  const activeFilterCount = $derived(filterOptions.length - visibleTypes.length);
  const page = withPageRequest(() => Promise.all([import('./TimelineContent.svelte'), afterPagePaint()]).then(([module]) => module));

  function setFilters(open: boolean) {
    if (open) filterTrigger = document.querySelector<HTMLElement>('[data-timeline-control="filters"] button') ?? undefined;
    filtersOpen = open;
    if (!open) {
      if (filterPanel?.matches(':popover-open')) filterPanel.hidePopover();
      requestAnimationFrame(() => { if (!filtersOpen && filterTrigger?.isConnected && !document.querySelector('dialog[open]')) filterTrigger.focus({ preventScroll: true }); });
    }
  }
  function changeView(next: string) { void content?.changeView(next); view = next as typeof view; filtersOpen = false; }
  function changeSpacing() { if (content) void content.changeSpacing(); else compactGaps = !compactGaps; }
  function toggleType(type: FilterType) { visibleTypes = visibleTypes.includes(type) ? visibleTypes.filter(item => item !== type) : [...visibleTypes, type]; }
  function scrollToToday() { content?.scrollToToday(); }
  function jumpSearch(offset: number) { content?.jumpSearch(offset); }
  function preloadPlanner() {
    void import('@/pages/carat-planner/CaratPlanner.svelte').catch(() => {});
    void import('@/pages/carat-planner/planner-resource-repository').then(({ plannerResourceRepository }) => plannerResourceRepository.prefetchManifest()).catch(() => {});
  }
  onMount(() => {
    const responsive = matchMedia('(max-width: 1149px)');
    const resize = () => { mobile = responsive.matches; filtersOpen = false; };
    resize(); responsive.addEventListener('change', resize);
    const footerObserver = new IntersectionObserver(entries => { footerVisible = entries.some(entry => entry.isIntersecting); });
    const footer = document.querySelector('.site-footer');
    if (footer) footerObserver.observe(footer);
    const prepareTour = () => { filtersOpen = true; scrollToToday(); };
    addEventListener('umamoe:prepare-timeline-tour', prepareTour);
    try {
      const stored = JSON.parse(localStorage.getItem(TIMELINE_PREFERENCES_KEY) ?? '{}') as { direction?: string; spacing?: string };
      if (stored.direction === 'horizontal' || stored.direction === 'vertical') view = stored.direction;
      if (stored.spacing === 'calendar' || stored.spacing === 'compact') compactGaps = stored.spacing === 'compact';
    } catch {}
    initialized = true;
    return () => { responsive.removeEventListener('change', resize); footerObserver.disconnect(); removeEventListener('umamoe:prepare-timeline-tour', prepareTour); };
  });
  $effect(() => {
    if (!initialized) return;
    try { localStorage.setItem(TIMELINE_PREFERENCES_KEY, JSON.stringify({ direction: view, spacing: compactGaps ? 'compact' : 'calendar' })); } catch {}
  });
  $effect(() => { tab; filtersOpen = false; window.dispatchEvent(new CustomEvent('umamoe:tour-page-changed')); });
  $effect(() => {
    if (!filterPanel) return;
    if (filtersOpen && !filterPanel.matches(':popover-open')) filterPanel.showPopover();
    if (filtersOpen && !mobile) {
      const trigger = document.querySelector('[data-timeline-control="filters"]')?.getBoundingClientRect();
      if (trigger) { filterPanel.style.top = Math.min(trigger.bottom + 4, innerHeight - 100) + 'px'; filterPanel.style.right = Math.max(8, innerWidth - trigger.right) + 'px'; }
    } else { filterPanel.style.removeProperty('top'); filterPanel.style.removeProperty('right'); }
    if (!filtersOpen && filterPanel.matches(':popover-open')) filterPanel.hidePopover();
  });
</script>

<svelte:window onkeydown={(event) => { if (event.key === 'Escape' && filtersOpen && !document.querySelector('dialog[open]')) { event.preventDefault(); setFilters(false); } }}/>
<svelte:head><title>{tab === 'carat-planner' ? 'Carat Planner' : 'Timeline'} · uma.moe</title><meta name="description" content="Current and predicted Uma Musume content releases, banners, races, and events."/></svelte:head>
<AppPage routeId="timeline" title={tab === 'carat-planner' ? 'Carat Planner' : 'Timeline'} description={tab === 'carat-planner' ? 'Plan Carats, tickets, sparks, and banner targets.' : 'Global content releases, pickups, and events.'} metadata={tab === 'timeline' && status.total ? status.filtered + ' / ' + status.total + ' events' : undefined} tone="brand" width="wide" flush fullBleed={tab === 'timeline'} adsEnabled={tab !== 'timeline'} fill={!mobile && tab === 'timeline'} mobileHeading="actions-only">
  {#snippet actions()}<div class="timeline-tabs">{#if tab === 'timeline' && status.rewardsLoading && !status.loading}<Spinner label="Loading event rewards" size={18}/>{/if}<Tabs label="Timeline tools" items={[{ id: 'timeline', label: 'Timeline', href: '/timeline?tab=timeline', scrollToTop: false }, { id: 'carat-planner', label: 'Carat Planner', href: '/timeline?tab=carat-planner', scrollToTop: false, onintent: preloadPlanner, badge: status.plannerEventCount ? String(status.plannerEventCount) : undefined }]} value={tab}/></div>{/snippet}
  {#if tab === 'timeline'}
    {#if !mobile}
      <div class="toolbar-shell"><section class="toolbar">
        <div class="search" data-timeline-control="search"><TextField id="timeline-search" label="Search timeline pickups or banner types" hideLabel prefixIcon="search" type="search" placeholder="Search pickups or banner types…" bind:value={search} />{#if search.trim()}<span>{status.searchPosition}</span>{/if}</div>
        {#if search.trim()}<div class="search-navigation"><IconButton icon="arrow-left" label="Previous search result" disabled={!status.filtered} onclick={() => jumpSearch(-1)}/><IconButton icon="arrow-right" label="Next search result" disabled={!status.filtered} onclick={() => jumpSearch(1)}/></div>{/if}
        <span class="timeline-count">{status.filtered} / {status.total}</span>
        <div class="view">
          <SegmentedControl label="Timeline direction" options={[{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]} value={view} onchange={changeView}/>
          <div data-timeline-control="spacing"><ToggleButton icon="timeline" label="Compact gaps" pressed={compactGaps} disabled={view === 'vertical'} onclick={changeSpacing}/></div>
          <div data-timeline-control="today"><Button variant="secondary" icon="calendar" onclick={scrollToToday}>Today</Button></div>
          <div data-timeline-control="filters"><Button variant="secondary" icon="filter" ariaExpanded={filtersOpen} onclick={() => setFilters(!filtersOpen)}>Filters{#if activeFilterCount} ({activeFilterCount}){/if}</Button></div>
        </div>
      </section></div>
    {:else}
      <nav class="mobile-bottom-toolbar" class:is-footer-visible={footerVisible && !status.loading && !filtersOpen && !search.trim() && !activeFilterCount} inert={footerVisible && !status.loading && !filtersOpen && !search.trim() && !activeFilterCount} aria-label="Timeline actions">
        <div data-timeline-control="today"><Button variant="secondary" icon="calendar" onclick={scrollToToday}>Today</Button></div>
        <div data-timeline-control="filters"><Button variant="secondary" icon="search" ariaExpanded={filtersOpen} onclick={() => setFilters(!filtersOpen)}>Search &amp; filters{#if activeFilterCount} ({activeFilterCount}){/if}</Button></div>
      </nav>
    {/if}
    {#if mobile && filtersOpen}<button type="button" class="filter-backdrop" aria-label="Close timeline filters" onclick={() => setFilters(false)}></button>{/if}
    <aside bind:this={filterPanel} popover="manual" class="filter-popover" class:mobile-filter-sheet={mobile} aria-label={mobile ? 'Search & filters' : 'Visible event types'}>
      <header><strong>{mobile ? 'Search & filters' : 'Visible event types'}</strong><div><Button variant="secondary" size="sm" onclick={() => { visibleTypes = visibleTypes.length ? [] : filterOptions.map(option => option.type); }}>{visibleTypes.length ? 'Unselect all' : 'Select all'}</Button><IconButton icon="close" label="Close filters" onclick={() => setFilters(false)}/></div></header>
      {#if mobile}<div class="search" data-timeline-control="search"><TextField id="timeline-mobile-search" label="Search timeline pickups or banner types" hideLabel prefixIcon="search" type="search" placeholder="Search pickups or banner types…" bind:value={search} /></div>{/if}
      <div class="filter-options">{#each filterOptions as option, index}<div class="filter-option" style:--color-accent={option.color}><Checkbox id={`timeline-filter-${option.type}`} label={option.label} icon={mobile ? undefined : filterIcons[index]} checked={visibleTypes.includes(option.type)} onchange={() => toggleType(option.type)}/></div>{/each}</div>
    </aside>

  {/if}
  {#await page}
    <div class="pending-content" aria-busy="true" aria-label="Timeline content"></div>
  {:then module}
    <module.default bind:this={content} {tab} {mobile} bind:view bind:compactGaps {search} {visibleTypes} bind:status/>
  {:catch}
    <Banner title="Timeline could not be loaded" tone="danger"><Button variant="secondary" onclick={() => location.reload()}>Reload page</Button></Banner>
  {/await}
</AppPage>

<style>

  .timeline-tabs{display:flex;align-items:center;gap:8px;justify-content:flex-end}.timeline-tabs :global(.tabs){min-width:226px}
  @media(max-width:1280px){.timeline-tabs :global(.tab){min-width:82px;padding-inline:9px}}
  @media (min-width:1700px){.toolbar-shell .toolbar{padding-right:184px}}
  .toolbar-shell{border-block:1px solid var(--border-primary)}.toolbar{--control-height:44px;display:flex;align-items:center;gap:12px;min-width:0;width:min(100%,var(--page-content-wide));margin-inline:auto;padding:10px var(--page-gutter-current)}
  .search{min-width:0;display:flex;flex:1;align-items:center;gap:6px;position:relative}.search :global(.field){flex:1}.search>span{position:absolute;right:9px;color:var(--text-muted);font-size:11px;white-space:nowrap;pointer-events:none}.search:has(>span) :global(input){padding-right:85px}.search-navigation{display:flex;gap:4px}.timeline-count{margin-right:auto;color:var(--text-muted);font-size:11px;white-space:nowrap}
  .view{display:flex;align-items:center;gap:10px;flex:none}.view [data-timeline-control="spacing"]{padding-inline:4px}.view :global(.ui-button){white-space:nowrap}
  .filter-popover{position:fixed;z-index:100;inset:210px 16px auto auto;margin:0;width:min(400px,calc(100vw - 24px));padding:10px;border:1px solid var(--border-primary);border-radius:var(--radius-md);background:var(--surface-overlay);color:var(--text-primary);box-shadow:0 10px 28px rgb(0 0 0/.22);max-height:calc(100dvh - 230px);overflow:auto}.filter-popover header{display:flex;align-items:center;justify-content:space-between;gap:4px;min-height:38px;color:var(--text-secondary);font-size:12px}.filter-popover header>div{display:flex;align-items:center;gap:4px}.filter-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 12px}.filter-option{min-width:0}.filter-option :global(.checkbox){min-height:32px;grid-template-columns:18px minmax(0,1fr);gap:7px}.filter-option :global(.box){width:18px;height:18px}.filter-option :global(strong){font-size:11px}.filter-option :global(strong.with-icon){gap:5px}.filter-option :global(.copy svg){color:var(--color-accent)}
  .mobile-bottom-toolbar{position:fixed;z-index:75;inset:auto 0 0;height:var(--timeline-toolbar-height);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:6px 8px calc(6px + env(safe-area-inset-bottom));background:var(--surface-overlay);border-top:1px solid var(--border-primary)}.mobile-bottom-toolbar :global(.ui-button){width:100%;min-height:44px}.filter-backdrop{position:fixed;z-index:78;inset:0;border:0;background:rgb(0 0 0/.42)}.mobile-filter-sheet{inset:auto 0 var(--timeline-toolbar-height);width:100%;max-height:min(66dvh,560px);border-radius:0;border-inline:0;padding:10px 12px 14px}.mobile-filter-sheet .search{margin:6px 0 10px}.mobile-filter-sheet .search :global(input){height:44px;font-size:12px}.mobile-filter-sheet .filter-options{gap:3px 10px}.mobile-filter-sheet .filter-options :global(.checkbox){min-height:44px}
  @media(max-width:1280px){.timeline-count{display:none}.toolbar{flex-wrap:wrap;gap:8px}.view{margin-left:auto;gap:8px}.search{flex-basis:240px}}
  .mobile-bottom-toolbar{transition:transform 140ms,visibility 140ms}.mobile-bottom-toolbar.is-footer-visible{visibility:hidden;pointer-events:none;transform:translateY(100%)}
  @media(prefers-reduced-motion:reduce){.mobile-bottom-toolbar{transition:none}}
  @media(max-width:768px){.timeline-tabs{width:100%;justify-content:stretch}.timeline-tabs :global(.tabs){width:100%}.timeline-tabs :global(.tab){min-width:0;flex:1}}

  .pending-content{min-height:320px;flex:1}
</style>
