<script
  module
  lang="ts"
>
  const chanceFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
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
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import SparkItem, { type SparkTone } from '@/components/sparks/SparkItem.svelte';
  import {
    inheritanceAffinity,
    inheritanceFactors,
    inheritanceFactorMatched,
    type InheritanceFactor,
    type SparkOrder
  } from '@/lib/inheritance/inheritance-factors';
  import { sparkMetrics } from '@/lib/inheritance/spark-probability';
  import type { UqlSparkHighlight } from '@/lib/inheritance/uql-spark-highlight';
  import { scenarios } from '@/lib/catalog/scenario-catalog';
  import { supportCardImagePath } from '@/lib/catalog/support-card-catalog';
  import type { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
  import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
  import type {
    InheritanceRecord,
    InheritanceSearchFilters
  } from '@/lib/inheritance/inheritance-search';
  import type { CatalogEntry } from '../catalog-repository';
  import {
    loadOptimalRaceRecommendations,
    type OptimalRaceRecommendation
  } from '@/lib/catalog/race-catalog';
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
    characters: CatalogEntry[];
    supports: CatalogEntry[];
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

  function character(id: number): CatalogEntry | undefined {
    const exact = characters.find((entry) => Number(entry.id) === id);
    if (exact) return exact;
    return characters.find(
      (entry) =>
        Math.floor(Number(entry.id) / 100) === id ||
        Math.floor(Number(entry.id) / 100) === Math.floor(id / 100)
    );
  }

  const main = $derived(character(record.mainParentId));
  const left = $derived(character(record.leftParentId));
  const right = $derived(character(record.rightParentId));
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
  const hasP2Sparks = $derived(
    Boolean(
      partner?.factors.length ||
      partner?.parents.some(
        (parent) => (parent.positionId === 10 || parent.positionId === 20) && parent.factors.length
      )
    )
  );
  const scenario = $derived(scenarios.find((scenario) => scenario.id === record.scenarioId));
  const updatedDate = $derived(new Date(record.lastUpdated ?? ''));
  const updatedLabel = $derived(
    Number.isNaN(updatedDate.getTime())
      ? ''
      : `${updatedDateFormat.format(updatedDate)} at ${updatedTimeFormat.format(updatedDate)}`
  );

  function chance(factor: InheritanceFactor): string | undefined {
    if (!factor.sources.length || (targetId && !affinityEngine?.ready)) return undefined;
    const metrics = sparkMetrics(
      factor.sources.map((source) => ({
        spark: { type: factor.type, level: source.level },
        affinity: affinity.source(source)
      })),
      sparkPerRun
    );
    return `${chanceFormat.format(metrics.guaranteed ? metrics.expected : metrics.chance)}${metrics.guaranteed ? 'x' : '%'}`;
  }

  let expandedHidden = $state<number[]>([]);

  const activeFocus = $derived(
    selectedParent === 'all'
      ? undefined
      : (selectedParent ?? (defaultFocus === 'all' ? undefined : defaultFocus))
  );
  const displayFactors = $derived(
    inheritanceFactors(
      record,
      splitSparks,
      activeFocus,
      showP2Sparks ? partner : undefined,
      sparkOrder
    )
  );

  const groups = [
    { type: 0, tone: 'blue', label: '' },
    { type: 1, tone: 'pink', label: '' },
    { type: 5, tone: 'green', label: '' },
    { type: 4, tone: 'white', label: 'Scenario whites' },
    { type: 3, tone: 'white', label: 'Normal whites' },
    { type: 2, tone: 'white', label: 'Race whites' }
  ] as const;

  function groupFactors(type: number): InheritanceFactor[] {
    return displayFactors.filter((factor) => factor.group === type);
  }

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
  <header class="record-header">
    <div class="record-toolbar">
      <button
        class="trainer-copy"
        type="button"
        onclick={copyTrainer}
        title={`Copy trainer ID ${record.accountId}`}
      >
        <strong>{record.trainerName || 'Unknown Trainer'}</strong>
        <span>
          <Icon
            name="copy"
            size={13}
          />{record.accountId.replace(/(\d{3})(?=\d)/g, '$1 ') || 'N/A'}
        </span>
      </button>
      {#if record.followerCount === 1000}
        <span class="record-alert">
          <Icon
            name="warning"
            size={13}
          />Max
        </span>
      {/if}
      {#if record.isStale}
        <span class="record-alert modified-label">
          <Icon
            name="refresh"
            size={13}
          />Modified
        </span>
      {/if}
      <div
        class="record-actions"
        aria-label="Record actions"
      >
        <button
          class="plan-action"
          type="button"
          aria-label="Plan"
          onclick={() => onplanner?.(record)}
          title="Open in Lineage Planner"
        >
          <Icon
            name="lineage"
            size={15}
          />
          <span>Plan</span>
        </button>
        <button
          class="share-action"
          type="button"
          aria-label="Share"
          onclick={() => onshare?.(record)}
          disabled={!record.accountId}
          title="Copy share link"
        >
          <Icon
            name="external"
            size={15}
          />
          <span>Share</span>
        </button>
        {#if record.raceResults.length}
          <button
            class="race-action"
            type="button"
            aria-label="Races"
            onclick={() => (raceResultsOpen = true)}
            title="View race results for main parent"
          >
            <Icon
              name="trophy"
              size={15}
            />
            <span>Races</span>
          </button>
        {/if}
        {#if optimalRecommendations.length}
          <button
            class="race-action"
            type="button"
            aria-label="Optimal Races"
            onclick={() => (optimalRacesOpen = true)}
            title="G1 races that overlap P1/P2 and maximize future affinity"
          >
            <Icon
              name="calendar"
              size={15}
            />
            <span class="action-desktop">Optimal Races</span>
            <span class="action-mobile">Best</span>
          </button>
        {/if}
        {#if optimalError}
          <button
            class="race-action"
            type="button"
            onclick={() => optimalRetry++}
            title={optimalError}
            aria-label="Retry optimal races"
          >
            <Icon
              name="refresh"
              size={15}
            />
            <span>Retry optimal races</span>
          </button>
        {/if}
        <button
          class="report-action"
          type="button"
          aria-label="Report trainer"
          onclick={() => onreport?.(record)}
          disabled={actionBusy || !record.accountId}
          title={reportTooltip}
        >
          <Icon
            name={reportIcon}
            size={15}
          />
          <span class="action-desktop">{reportText}</span>
          <span class="action-mobile">Report</span>
        </button>
        {#if onbookmark}
          <button
            class="save-action"
            type="button"
            aria-label={bookmarked ? 'Saved' : 'Save'}
            class:active={bookmarked}
            onclick={() => onbookmark?.(record)}
            disabled={actionBusy}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark this record'}
          >
            <Icon
              name="star"
              size={15}
            />
            <span>{bookmarked ? 'Saved' : 'Save'}</span>
          </button>
        {/if}
      </div>
    </div>
    <div
      class="record-stats"
      aria-label="Inheritance summary"
    >
      <div class="summary-metrics">
        {#if affinity.total !== null}
          <InspectPopover label="Total affinity breakdown">
            {#snippet trigger()}
              <span class="stat affinity">
                <strong>{affinity.total?.toLocaleString()}</strong>
                <span>Affinity</span>
              </span>
            {/snippet}
            <div class="affinity-breakdown">
              <strong>Total affinity: {affinity.total}</strong>
              {#if affinity.base !== null}
                <span>
                  Base: {affinity.base} + Race: {affinity.race}
                </span>
              {:else}
                <span>Stored record score; local affinity data is not available yet.</span>
              {/if}{#if affinity.crossRace}
                <span>
                  Includes P1–P2 races: {affinity.crossRace}
                </span>
              {/if}
            </div>
          </InspectPopover>
        {/if}
        {#if affinity.crossRace}
          <div
            class="stat cross-race"
            title="Race affinity from G1 wins shared by P1 and P2; counted once in the total"
          >
            <strong>{affinity.crossRace.toLocaleString()}</strong>
            <span>P1–P2 Race</span>
          </div>
        {/if}
        {#if record.winCount !== undefined}
          <div class="stat wins">
            <strong>{record.winCount.toLocaleString()}</strong>
            <span>G1 Wins</span>
          </div>
        {/if}
        {#if record.whiteCount !== undefined}
          <div class="stat whites">
            <strong>{record.whiteCount.toLocaleString()}</strong>
            <span>White Skills</span>
          </div>
        {/if}
      </div>
      {#if scenario || record.rarity || record.rankScore}
        <div class="summary-meta">
          {#if scenario}
            <div class="scenario-mark">
              <svg
                viewBox={scenario.viewBox}
                role="img"
                aria-label={scenario.label}
              >
                <title>{scenario.label}</title>
                <image
                  href={scenario.image}
                  width={scenario.width}
                  height={scenario.height}
                />
              </svg>
            </div>
          {/if}
          {#if record.rarity || record.rankScore}
            <div class="rank-score">
              {#if record.rarity}
                <RankBadge
                  rarity={record.rarity}
                  size="md"
                />
              {/if}{#if record.rankScore}
                <div class="stat score">
                  <strong>{record.rankScore.toLocaleString()}</strong>
                  <span>Score</span>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <div class="inheritance-body">
    <div class="character-panel">
      <div
        class="lineage-frame"
        aria-label="Veteran lineage"
      >
        <div
          class="lineage-person lineage-main"
          data-owner="main"
        >
          <button
            class="lineage-node"
            class:selected={activeFocus === 'main'}
            type="button"
            aria-pressed={activeFocus === 'main'}
            onclick={() => selectParent('main')}
            title="Focus primary parent sparks; click again to clear"
          >
            <Artwork
              src={main?.image}
              alt={main?.title ?? `Character ${record.mainParentId}`}
              shape="circle"
              size="lg"
            />
          </button>
          {@render affinityBadge('main', 'Main parent')}
          <span class="lineage-role">Main</span>
        </div>
        <svg
          class="lineage-bracket"
          viewBox="0 0 100 24"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M50 0 L50 9 M15 9 L85 9 M15 9 L15 24 M85 9 L85 24"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div class="grandparents">
          <div
            class="lineage-person lineage-grandparent"
            data-owner="left"
          >
            <button
              class="lineage-node"
              class:selected={activeFocus === 'left'}
              type="button"
              aria-pressed={activeFocus === 'left'}
              onclick={() => selectParent('left')}
              title="Focus Legacy 1 sparks; click again to clear"
            >
              <Artwork
                src={left?.image}
                alt={left?.title ?? `Character ${record.leftParentId}`}
                shape="circle"
                size="md"
              />
            </button>
            {@render affinityBadge('left', 'Legacy 1')}
            <span class="lineage-role">Legacy 1</span>
          </div>
          <div
            class="lineage-person lineage-grandparent"
            data-owner="right"
          >
            <button
              class="lineage-node"
              class:selected={activeFocus === 'right'}
              type="button"
              aria-pressed={activeFocus === 'right'}
              onclick={() => selectParent('right')}
              title="Focus Legacy 2 sparks; click again to clear"
            >
              <Artwork
                src={right?.image}
                alt={right?.title ?? `Character ${record.rightParentId}`}
                shape="circle"
                size="md"
              />
            </button>
            {@render affinityBadge('right', 'Legacy 2')}
            <span class="lineage-role">Legacy 2</span>
          </div>
        </div>
      </div>
      {#if record.supportCardId}
        <div class="support-card-section">
          <Artwork
            src={supportCardImagePath(String(record.supportCardId))}
            fallbackSrc={support?.image}
            alt={support?.title ?? `Support card ${record.supportCardId}`}
            kind="card"
            size="md"
          />
          {#if record.supportLimitBreak !== undefined}
            <span class="limit-break">
              <LimitBreak value={record.supportLimitBreak} />
            </span>
          {/if}
          <span class="support-role">Support</span>
        </div>
      {/if}
    </div>

    <section
      class="spark-arrays"
      aria-label="Main Veteran factors"
    >
      {#if affinity.total !== null}
        <div class="spark-modes">
          <button
            type="button"
            class="count-mode"
            aria-pressed={sparkPerRun}
            title={sparkPerRun ? 'Two inheritance rolls per run' : 'One inheritance roll'}
            onclick={() => (sparkPerRun = !sparkPerRun)}
          >
            {sparkPerRun ? 'Per Run' : 'Per Inh.'}
          </button>
          {#if !splitSparks && !activeFocus}
            <button
              type="button"
              class="count-mode"
              aria-pressed={showOccurrences}
              onclick={() => (showOccurrences = !showOccurrences)}
            >
              {showOccurrences ? '× Occurrences' : '★ Stars'}
            </button>
            {#if hasP2Sparks}
              <button
                type="button"
                class="count-mode"
                aria-pressed={showP2Sparks}
                onclick={() => (showP2Sparks = !showP2Sparks)}
              >
                P2 Sparks {showP2Sparks ? 'ON' : 'OFF'}
              </button>
            {/if}
          {/if}
        </div>
      {/if}
      {#each groups as group}
        {@const values = groupFactors(group.type)}
        {@const hiddenCount = values.filter((factor) =>
          hiddenSparkFactorIds.includes(factor.id)
        ).length}
        {#if values.length}
          <div class="spark-row">
            <span
              class="spark-type-indicator {group.tone}"
              aria-hidden="true"
            ></span>
            <div class="spark-section">
              {#if group.label}
                <details
                  open={!collapsedWhiteSections.includes(group.type)}
                  class="white-section"
                >
                  <summary
                    onclick={(event) => {
                      event.preventDefault();
                      collapsedWhiteSections = collapsedWhiteSections.includes(group.type)
                        ? collapsedWhiteSections.filter((type) => type !== group.type)
                        : [...collapsedWhiteSections, group.type];
                    }}
                  >
                    {group.label}
                  </summary>
                  <div class="spark-list">
                    {#each values.filter((factor) => !hiddenSparkFactorIds.includes(factor.id) || expandedHidden.includes(group.type)) as factor, index (`${factor.id}:${index}`)}
                      {@render factorChip(factor, group.tone)}
                    {/each}
                    {#if hiddenCount}
                      <button
                        class="hidden-summary"
                        type="button"
                        aria-expanded={expandedHidden.includes(group.type)}
                        onclick={() =>
                          (expandedHidden = expandedHidden.includes(group.type)
                            ? expandedHidden.filter((type) => type !== group.type)
                            : [...expandedHidden, group.type])}
                      >
                        {expandedHidden.includes(group.type) ? '−' : '+'}
                        {hiddenCount} hidden
                      </button>
                    {/if}
                  </div>
                </details>
              {:else}
                <div class="spark-list">
                  {#each values.filter((factor) => !hiddenSparkFactorIds.includes(factor.id)) as factor, index (`${factor.id}:${index}`)}
                    {@render factorChip(factor, group.tone)}
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </section>
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
        <span aria-hidden="true">·</span>
        <time datetime={record.lastUpdated}>{updatedLabel}</time>
      {/if}
    </div>
  </footer>
</article>

{#snippet factorChip(factor: InheritanceFactor, groupTone: SparkTone)}
  {@const source = factor.sources[0]}
  {@const matched = inheritanceFactorMatched(factor, activeFilters, uqlHighlight)}
  {@const portrait =
    source?.side === 'p2'
      ? character(
          source.owner === 'main'
            ? (partner?.cardId ?? 0)
            : (partner?.parents.find(
                (parent) => parent.positionId === (source.owner === 'left' ? 10 : 20)
              )?.cardId ?? 0)
        )
      : factor.owner === 'main'
        ? main
        : factor.owner === 'left'
          ? left
          : right}
  {@const p2Stars = factor.sources
    .filter((source) => source.side === 'p2')
    .reduce((total, source) => total + source.level, 0)}
  <span
    class="factor-source"
    title={splitSparks
      ? `${portrait?.title ?? (factor.owner === 'main' ? 'Main parent' : factor.owner === 'left' ? 'Legacy 1' : 'Legacy 2')}${source?.side === 'p2' ? ' (your legacy)' : ''}`
      : undefined}
    data-owner={factor.owner}
    data-side={factor.sources.length && factor.sources.every((source) => source.side === 'p2')
      ? 'p2'
      : 'p1'}
    class:matched-filter={matched}
    class:hidden-factor={hiddenSparkFactorIds.includes(factor.id)}
  >
    <SparkItem
      {matched}
      highlightMain={splitSparks}
      portrait={splitSparks && sparkPortraits && portrait?.image
        ? { image: portrait.image, title: portrait.title }
        : undefined}
      name={factor.name}
      level={showOccurrences && !splitSparks && !activeFocus && factor.copies
        ? factor.copies
        : factor.level}
      countMode={showOccurrences && !splitSparks && !activeFocus && factor.copies > 0
        ? 'occurrences'
        : 'stars'}
      tone={groupTone}
      chance={chance(factor)}
      mainStars={!splitSparks && !activeFocus ? factor.mainStars : 0}
      p2Stars={!splitSparks && !activeFocus ? p2Stars : 0}
      source={factor.sources.length && factor.sources.every((source) => source.side === 'p2')
        ? 'p2'
        : factor.owner === 'main' || factor.mainStars > 0
          ? 'main'
          : undefined}
    />
  </span>
{/snippet}

{#snippet affinityBadge(owner: 'main' | 'left' | 'right', label: string)}
  {@const detail = affinity.detail(owner)}
  {#if detail}
    <InspectPopover label="{label} affinity breakdown">
      {#snippet trigger()}
        <span
          class="source-affinity"
          class:breeding={!targetId}
          data-owner={owner}
        >
          <Icon
            name="heart"
            size={12}
          />{detail.total}
        </span>
      {/snippet}
      <div class="affinity-breakdown">
        <strong>{label}: {detail.total}</strong>
        <span>
          Base: {detail.base}{detail.cross ? ` + P1–P2: ${detail.cross}` : ''} + Race: {detail.race}
        </span>
      </div>
    </InspectPopover>
  {/if}
{/snippet}

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
