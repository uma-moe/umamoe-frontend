<script lang="ts">
  import type { Snippet } from 'svelte';
  import AptitudeGrid from './AptitudeGrid.svelte';
  import AffinityStat from './AffinityStat.svelte';
  import Artwork from './Artwork.svelte';
  import RankBadge from './RankBadge.svelte';
  import SparkItem from '../sparks/SparkItem.svelte';
  import SparkRow from '../sparks/SparkRow.svelte';
  import StatStrip from './StatStrip.svelte';
  import type { VeteranUiRecord } from './veteran-ui-types';

  interface Props {
    veteran: VeteranUiRecord;
    compact?: boolean;
    showStats?: boolean;
    combined?: boolean;
    children?: Snippet;
  }

  let { veteran, compact = false, showStats = true, combined = false, children }: Props = $props();

  const displayedSparks = $derived(
    combined ? (veteran.combinedSparks ?? veteran.sparks) : veteran.sparks
  );
</script>

<div class="veteran-summary-container">
  <article
    class="veteran-summary"
    class:compact
    class:combined-layout={combined && !showStats}
    class:split-layout={compact && !combined && !showStats}
    aria-label={`${veteran.name} Veteran summary`}
  >
    <header
      class="summary-head"
      class:affinity-first={!showStats && Number.isFinite(veteran.affinity)}
    >
      {#if !showStats && Number.isFinite(veteran.affinity)}
        <div class="leading-affinity">
          <AffinityStat
            value={veteran.affinity}
            kind="total"
            compact
          />{#if veteran.raceAffinity !== undefined}
            <AffinityStat
              value={veteran.raceAffinity}
              kind="race"
              compact
            />
          {/if}
        </div>
      {/if}
      <Artwork
        src={veteran.image}
        alt={veteran.name}
        size={compact ? 'sm' : 'md'}
        shape="circle"
      />
      <div class="identity">
        <div class="name-row">
          <h3 title={veteran.name}>{veteran.name}</h3>
          {#if veteran.scenario}
            <span class="scenario">{veteran.scenario}</span>
          {/if}
        </div>
        {#if veteran.detail}
          <span class="detail">{veteran.detail}</span>
        {/if}
      </div>
      {#if veteran.rank || veteran.score !== undefined}
        <div class="rank-score">
          {#if veteran.rank}
            <RankBadge
              label={veteran.rank}
              size="sm"
            />
          {/if}{#if veteran.score !== undefined}
            <span>
              {veteran.score.toLocaleString()}
            </span>
          {/if}
        </div>
      {/if}
    </header>

    {#if showStats && veteran.stats?.length}
      <StatStrip
        items={veteran.stats}
        {compact}
        presentation="icons"
      />
    {/if}
    {#if showStats && veteran.aptitudes?.length}
      <AptitudeGrid
        items={veteran.aptitudes}
        {compact}
        stretch
      />
    {/if}

    {#if displayedSparks.length || (showStats && Number.isFinite(veteran.affinity))}
      <section
        class="factor-section"
        class:with-summary={showStats}
        aria-label={combined ? 'Combined veteran sparks' : 'Veteran sparks'}
      >
        {#if showStats}
          <header class="factor-heading">
            <span>Inheritance</span>
            <div class="summary-affinity">
              {#if Number.isFinite(veteran.affinity)}
                <AffinityStat
                  value={veteran.affinity}
                  kind="total"
                />
              {/if}{#if veteran.raceAffinity !== undefined}
                <AffinityStat
                  value={veteran.raceAffinity}
                  kind="race"
                />
              {/if}
            </div>
          </header>
        {/if}
        <div
          class="factor-list"
          class:grouped={combined}
        >
          {#each displayedSparks as group}
            {#if combined}
              {#if group.items.length}
                <SparkRow
                  tone={group.tone}
                  items={group.items}
                  {compact}
                />
              {/if}
            {:else}
              {#each group.items as item (item.id)}
                <SparkItem
                  {...item}
                  tone={group.tone}
                  {compact}
                />
              {/each}
            {/if}
          {/each}
        </div>
      </section>
    {/if}

    {#if veteran.parents?.length}
      <div
        class="parent-rows"
        aria-label="Veteran parents"
      >
        {#each veteran.parents as parent (parent.id)}
          <section class="summary-parent">
            <div
              class="parent-id"
              class:affinity-first={!showStats}
            >
              <Artwork
                src={parent.image}
                alt={parent.name}
                size="xs"
                shape="circle"
              />
              <div class="parent-copy">
                <strong title={parent.name}>{parent.name}</strong>
                <span class="parent-position parent-position--{parent.position.toLowerCase()}">
                  {parent.position}
                </span>
              </div>
              {#if Number.isFinite(parent.affinity)}
                <AffinityStat
                  value={parent.affinity}
                  compact
                />
              {/if}
            </div>
            {#if !combined}
              <div class="parent-factors">
                {#each parent.sparks as group}
                  {#each group.items as item (item.id)}
                    <SparkItem
                      {...item}
                      tone={group.tone}
                      compact
                    />
                  {/each}
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
    {#if children}
      <div class="summary-extra">{@render children()}</div>
    {/if}
  </article>
</div>

<style>
  @import './veteran-summary.css';
</style>
