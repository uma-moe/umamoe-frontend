<script
  module
  lang="ts"
>
  const chanceFormat = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
</script>

<script lang="ts">
  import SparkItem, { type SparkTone } from '@/components/sparks/SparkItem.svelte';
  import {
    inheritanceFactors,
    inheritanceFactorMatched,
    type FactorOwner,
    type InheritanceFactor,
    type SparkOrder,
    type inheritanceAffinity
  } from '@/lib/inheritance/sparks/inheritance-factors';
  import { sparkMetrics } from '@/lib/inheritance/sparks/spark-probability';
  import type { UqlSparkHighlight } from '@/lib/inheritance/uql/uql-spark-highlight';
  import type { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
  import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
  import type {
    InheritanceRecord,
    InheritanceSearchFilters
  } from '@/lib/inheritance/search/inheritance-search';
  import { findCharacterEntry, type GameDataEntry } from '@/lib/game-data/display-records';

  interface Props {
    record: InheritanceRecord;
    affinity: ReturnType<typeof inheritanceAffinity>;
    activeFocus?: FactorOwner;
    activeFilters?: InheritanceSearchFilters;
    uqlHighlight?: UqlSparkHighlight;
    targetId?: number;
    affinityEngine?: VeteranAffinityEngine;
    partner?: VeteranRecord;
    characters: GameDataEntry[];
    main?: GameDataEntry;
    left?: GameDataEntry;
    right?: GameDataEntry;
    splitSparks: boolean;
    sparkPortraits: boolean;
    sparkOrder: SparkOrder;
    hiddenSparkFactorIds: number[];
    sparkPerRun: boolean;
    showOccurrences: boolean;
    showP2Sparks: boolean;
    collapsedWhiteSections: number[];
  }

  let {
    record,
    affinity,
    activeFocus,
    activeFilters,
    uqlHighlight,
    targetId,
    affinityEngine,
    partner,
    characters,
    main,
    left,
    right,
    splitSparks,
    sparkPortraits,
    sparkOrder,
    hiddenSparkFactorIds,
    sparkPerRun = $bindable(),
    showOccurrences = $bindable(),
    showP2Sparks = $bindable(),
    collapsedWhiteSections = $bindable()
  }: Props = $props();

  let expandedHidden = $state<number[]>([]);

  const hasP2Sparks = $derived(
    Boolean(
      partner?.factors.length ||
      partner?.parents.some(
        (parent) => (parent.positionId === 10 || parent.positionId === 20) && parent.factors.length
      )
    )
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
</script>

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

{#snippet factorChip(factor: InheritanceFactor, groupTone: SparkTone)}
  {@const source = factor.sources[0]}
  {@const matched = inheritanceFactorMatched(factor, activeFilters, uqlHighlight)}
  {@const portrait =
    source?.side === 'p2'
      ? findCharacterEntry(
          characters,
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

<style>
  @import './spark-source-colors.css';
  @import './inheritance-spark-arrays.css';
</style>
