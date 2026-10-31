<script
  module
  lang="ts"
>
  const updatedDateFormat = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const updatedTimeFormat = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
</script>

<script lang="ts">
  import type { IconName } from '@/components/icon-types';
  import Icon from '@/components/Icon.svelte';
  import {
    inheritanceAffinity,
    type SparkOrder
  } from '@/lib/inheritance/sparks/inheritance-factors';
  import type { UqlSparkHighlight } from '@/lib/inheritance/uql/uql-spark-highlight';
  import type { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
  import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
  import type {
    InheritanceRecord,
    InheritanceSearchFilters
  } from '@/lib/inheritance/search/inheritance-search';
  import { findCharacterEntry, type GameDataEntry } from '@/lib/game-data/display-records';
  import {
    loadOptimalRaceRecommendations,
    type OptimalRaceRecommendation
  } from '@/lib/game-data/racing/races';
  import InheritanceCharacterPanel from './card/InheritanceCharacterPanel.svelte';
  import InheritanceRecordHeader from './card/InheritanceRecordHeader.svelte';
  import InheritanceSparkArrays from './card/InheritanceSparkArrays.svelte';
  import OptimalRacesDialog from './OptimalRacesDialog.svelte';
  import RaceResultsDialog from './RaceResultsDialog.svelte';

  interface Props {
    record: InheritanceRecord;
    activeFilters?: InheritanceSearchFilters;
    uqlHighlight?: UqlSparkHighlight;
    reportText?: string;
    reportIcon?: IconName;
    reportTooltip?: string;
    targetId?: number;
    affinityEngine?: VeteranAffinityEngine;
    raceGroups?: ReadonlyMap<number, number>;
    partner?: VeteranRecord;
    sparkPerRun?: boolean;
    showOccurrences?: boolean;
    showP2Sparks?: boolean;
    collapsedWhiteSections?: number[];
    characters: GameDataEntry[];
    supports: GameDataEntry[];
    defaultFocus?: 'all' | 'main' | 'left' | 'right';
    splitSparks?: boolean;
    sparkPortraits?: boolean;
    sparkOrder?: SparkOrder;
    hiddenSparkFactorIds?: number[];
    bookmarked?: boolean;
    actionBusy?: boolean;
    partnerWinSaddles?: number[];
    oncopy?: (record: InheritanceRecord) => void | Promise<void>;
    onbookmark?: (record: InheritanceRecord) => void | Promise<void>;
    onreport?: (record: InheritanceRecord) => void | Promise<void>;
    onshare?: (record: InheritanceRecord) => void | Promise<void>;
    onplanner?: (record: InheritanceRecord) => void;
    onvisible?: (record: InheritanceRecord) => void;
  }

  let {
    record,
    activeFilters,
    uqlHighlight,
    reportText = 'Outdated',
    reportIcon = 'warning',
    reportTooltip = 'Report this trainer as unavailable',
    targetId,
    affinityEngine,
    raceGroups = new Map(),
    partner,
    sparkPerRun = $bindable(false),
    showOccurrences = $bindable(false),
    showP2Sparks = $bindable(false),
    collapsedWhiteSections = $bindable([]),
    characters,
    supports,
    defaultFocus = 'all',
    splitSparks = false,
    sparkPortraits = false,
    sparkOrder = 'main',
    hiddenSparkFactorIds = [],
    bookmarked = false,
    actionBusy = false,
    partnerWinSaddles = [],
    oncopy,
    onbookmark,
    onreport,
    onshare,
    onplanner,
    onvisible
  }: Props = $props();

  let cardElement: HTMLElement;

  let raceResultsOpen = $state(false);
  let optimalRacesOpen = $state(false);
  let optimalRecommendations = $state.raw<OptimalRaceRecommendation[]>([]);
  let optimalError = $state('');
  let optimalRetry = $state(0);
  let selectedParent = $state<'all' | 'main' | 'left' | 'right' | undefined>();

  const main = $derived(findCharacterEntry(characters, record.mainParentId));
  const left = $derived(findCharacterEntry(characters, record.leftParentId));
  const right = $derived(findCharacterEntry(characters, record.rightParentId));
  const support = $derived(supports.find((entry) => Number(entry.id) === record.supportCardId));

  $effect(() => {
    void optimalRetry;
    optimalError = '';
    const p1 = record.mainWinSaddles.join(',');
    const p2 = partnerWinSaddles.join(',');
    if (!p1 || !p2) {
      optimalRecommendations = [];
      return;
    }

    optimalRecommendations = [];
    let current = true;
    void loadOptimalRaceRecommendations(record.mainWinSaddles, partnerWinSaddles)
      .then((value) => {
        if (current) optimalRecommendations = value;
      })
      .catch((error: unknown) => {
        if (current)
          optimalError =
            error instanceof Error ? error.message : 'Optimal races could not be loaded.';
      });

    return () => {
      current = false;
    };
  });

  const affinity = $derived(
    inheritanceAffinity(record, targetId, partner, affinityEngine, raceGroups, partnerWinSaddles)
  );

  const updatedDate = $derived(new Date(record.lastUpdated ?? ''));
  const updatedLabel = $derived(
    Number.isNaN(updatedDate.getTime())
      ? ''
      : `${updatedDateFormat.format(updatedDate)} at ${updatedTimeFormat.format(updatedDate)}`
  );

  const activeFocus = $derived(
    selectedParent === 'all'
      ? undefined
      : (selectedParent ?? (defaultFocus === 'all' ? undefined : defaultFocus))
  );

  function selectParent(parent: 'main' | 'left' | 'right'): void {
    selectedParent = activeFocus === parent ? 'all' : parent;
  }

  async function copyTrainer(): Promise<void> {
    await oncopy?.(record);
  }

  $effect(() => {
    if (!cardElement) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const visibleRecord = record;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        onvisible?.(visibleRecord);
        observer.disconnect();
      },
      { rootMargin: '160px 0px', threshold: 0.2 }
    );

    observer.observe(cardElement);
    return () => observer.disconnect();
  });
</script>

<article
  class="inheritance-card"
  bind:this={cardElement}
  class:modified={record.isStale}
>
  <InheritanceRecordHeader
    {record}
    {affinity}
    {reportText}
    {reportIcon}
    {reportTooltip}
    {bookmarked}
    {actionBusy}
    hasOptimalRaces={optimalRecommendations.length > 0}
    {optimalError}
    oncopy={copyTrainer}
    {onplanner}
    {onshare}
    {onreport}
    {onbookmark}
    onraceresults={() => (raceResultsOpen = true)}
    onoptimalraces={() => (optimalRacesOpen = true)}
    onretryoptimal={() => optimalRetry++}
  />

  <div class="inheritance-body">
    <InheritanceCharacterPanel
      {record}
      {main}
      {left}
      {right}
      {support}
      {activeFocus}
      {affinity}
      {targetId}
      onselect={selectParent}
    />

    <InheritanceSparkArrays
      {record}
      {affinity}
      {activeFocus}
      {activeFilters}
      {uqlHighlight}
      {targetId}
      {affinityEngine}
      {partner}
      {characters}
      {main}
      {left}
      {right}
      {splitSparks}
      {sparkPortraits}
      {sparkOrder}
      {hiddenSparkFactorIds}
      bind:sparkPerRun
      bind:showOccurrences
      bind:showP2Sparks
      bind:collapsedWhiteSections
    />
  </div>

  <footer class="record-footer">
    <div class="borrow-stats">
      <span
        title="Borrow views"
        aria-label={`${record.borrowViews.toLocaleString()} borrow views`}
      >
        <Icon
          name="eye"
          size={13}
        />
        <b>{record.borrowViews.toLocaleString()}</b>
      </span>
      <span
        class="copy-stat"
        title="Trainer ID copies"
        aria-label={`${record.borrowCopies.toLocaleString()} Trainer ID copies`}
      >
        <Icon
          name="copy"
          size={13}
        />
        <b>{record.borrowCopies.toLocaleString()}</b>
      </span>
    </div>
    <div class="footer-meta">
      <span
        class="verified"
        title="Verified record"
      >
        <Icon
          name="check"
          size={13}
        />Verified
      </span>
      {#if updatedLabel}
        <time datetime={record.lastUpdated}>{updatedLabel}</time>
      {/if}
    </div>
  </footer>
</article>

<RaceResultsDialog
  bind:open={raceResultsOpen}
  charId={record.mainParentId}
  charName={main?.title ?? `Character ${record.mainParentId}`}
  charImage={main?.image}
  winSaddleIds={record.mainWinSaddles}
  runRaceIds={record.raceResults}
/>
<OptimalRacesDialog
  bind:open={optimalRacesOpen}
  recommendations={optimalRecommendations}
/>

<style>
  @import './inheritance-result-card.css';
</style>
