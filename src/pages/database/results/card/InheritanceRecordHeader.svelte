<script lang="ts">
  import type { IconName } from '@/components/icon-types';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import type { inheritanceAffinity } from '@/lib/inheritance/sparks/inheritance-factors';
  import type { InheritanceRecord } from '@/lib/inheritance/search/inheritance-search';
  import { scenarios } from '@/lib/game-data/scenarios';

  interface Props {
    record: InheritanceRecord;
    affinity: ReturnType<typeof inheritanceAffinity>;
    reportText: string;
    reportIcon: IconName;
    reportTooltip: string;
    bookmarked: boolean;
    actionBusy: boolean;
    hasOptimalRaces: boolean;
    optimalError: string;
    oncopy: () => void;
    onplanner?: (record: InheritanceRecord) => void;
    onshare?: (record: InheritanceRecord) => void | Promise<void>;
    onreport?: (record: InheritanceRecord) => void | Promise<void>;
    onbookmark?: (record: InheritanceRecord) => void | Promise<void>;
    onraceresults: () => void;
    onoptimalraces: () => void;
    onretryoptimal: () => void;
  }

  let {
    record,
    affinity,
    reportText,
    reportIcon,
    reportTooltip,
    bookmarked,
    actionBusy,
    hasOptimalRaces,
    optimalError,
    oncopy,
    onplanner,
    onshare,
    onreport,
    onbookmark,
    onraceresults,
    onoptimalraces,
    onretryoptimal
  }: Props = $props();

  const scenario = $derived(scenarios.find((scenario) => scenario.id === record.scenarioId));
</script>

<header class="record-header">
  <div class="record-toolbar">
    <button
      class="trainer-copy"
      type="button"
      onclick={oncopy}
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
          onclick={onraceresults}
          title="View race results for main parent"
        >
          <Icon
            name="trophy"
            size={15}
          />
          <span>Races</span>
        </button>
      {/if}
      {#if hasOptimalRaces}
        <button
          class="race-action"
          type="button"
          aria-label="Optimal Races"
          onclick={onoptimalraces}
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
          onclick={onretryoptimal}
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

<style>
  @import './affinity-breakdown.css';
  @import './inheritance-record-header.css';
</style>
