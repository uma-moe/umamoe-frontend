<script lang="ts">
  import type { Snippet } from 'svelte';
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type {
    InheritanceRecord,
    InheritanceSearchResult
  } from '@/lib/inheritance/search/inheritance-search';
  import { inheritanceFactors } from '@/lib/inheritance/sparks/inheritance-factors';
  import { scenarios } from '@/lib/game-data/scenarios';
  import { DISCORD_SUPPORT_URL } from '@/services/site/site-links';
  import { findCharacterEntry, type GameDataEntry } from '@/lib/game-data/display-records';

  interface Props {
    inheritance: InheritanceSearchResult;
    loading: boolean;
    error: string;
    appending: boolean;
    page: number;
    listMode: 'infinite' | 'paginated';
    canLoadMore: boolean;
    characters: GameDataEntry[];
    supports: GameDataEntry[];
    sortingNotice: boolean;
    pendingSearch: boolean;
    uqlDataError: string;
    failedLegacy?: string;
    legacyError: string;
    affinityError: string;
    toolbar: Snippet;
    card: Snippet<[InheritanceRecord]>;
    affinityFailure: Snippet;
    onloadmore: () => void;
    onretry: () => void;
    onretrylegacy: (value: string) => void;
    onaddtrainer: () => void;
  }

  let {
    inheritance,
    loading,
    error,
    appending,
    page = $bindable(),
    listMode,
    canLoadMore,
    characters,
    supports,
    sortingNotice,
    pendingSearch,
    uqlDataError,
    failedLegacy,
    legacyError,
    affinityError,
    toolbar,
    card,
    affinityFailure,
    onloadmore,
    onretry,
    onretrylegacy,
    onaddtrainer
  }: Props = $props();

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  function findRecordText(record: InheritanceRecord): string {
    const names = [record.mainParentId, record.leftParentId, record.rightParentId].map(
      (id) => findCharacterEntry(characters, id)?.title
    );

    return [
      record.trainerName || 'Unknown Trainer',
      record.accountId,
      record.accountId.replace(/(\d{3})(?=\d)/g, '$1 '),
      ...names,
      supports.find((entry) => Number(entry.id) === record.supportCardId)?.title,
      scenarios.find((scenario) => scenario.id === record.scenarioId)?.label,
      record.rankScore,
      record.rankScore.toLocaleString(),
      ...inheritanceFactors(record).map((factor) => factor.name)
    ].join(' ');
  }
</script>

<section class="inheritance-results">
  {@render toolbar()}
  {#if sortingNotice}
    <div class="sorting-notice">
      <Icon
        name="info"
        size={15}
      />
      <span>
        Results are sorted by preferred white priority groups first (P0, then P1…), then by the
        selected sort.
      </span>
    </div>
  {/if}
  {#if pendingSearch}
    <div class="pending">
      <Spinner size={24} />
      <span>Filters changed. Results will refresh when you return to Database.</span>
    </div>
  {/if}
  {#if uqlDataError}
    <Banner
      title="UQL unavailable"
      tone="danger"
    >
      <p>{uqlDataError}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => window.location.reload()}
      >
        Reload UQL
      </Button>
    </Banner>
  {/if}
  {#if failedLegacy}
    <Banner
      title="Legacy unavailable"
      tone="danger"
    >
      <p>{legacyError}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => {
          if (failedLegacy) onretrylegacy(failedLegacy);
        }}
      >
        Retry legacy
      </Button>
    </Banner>
  {/if}
  {#if affinityError && !error}
    {@render affinityFailure()}
  {/if}
  {#if loading && !appending}
    <Spinner
      centered
      minHeight="260px"
      label="Searching inheritance records…"
    />
  {:else if error && !appending}
    <div
      class="result-error"
      role="alert"
    >
      <EmptyState
        icon="warning"
        title="Inheritance search unavailable"
        description={error}
      >
        {#snippet actions()}
          <div class="error-actions">
            <Button
              variant="secondary"
              size="sm"
              onclick={onretry}
            >
              Retry
            </Button><Button
              href={DISCORD_SUPPORT_URL}
              target="_blank"
              variant="secondary"
              size="sm"
              icon="discord"
            >
              Report on Discord
            </Button>
          </div>
        {/snippet}
      </EmptyState>
    </div>
  {:else if inheritance.records.length}
    <ContentAd
      routeId="database"
      top
    />
    <div
      class="inheritance-list"
      use:virtualScroll={{
        items: inheritance.records,
        searchText: findRecordText,
        key: (record) => record.id,
        estimate: 640,
        onrange: (range) => (virtualRange = range),
        onend: canLoadMore ? onloadmore : undefined
      }}
    >
      {#each inheritance.records.slice(virtualRange.start, virtualRange.end) as record, localIndex (record.id)}
        {@const index = virtualRange.start + localIndex}
        <div data-virtual-index={index}>
          {@render card(
            record
          )}{#if index % 6 === 5 && index < inheritance.records.length - 1 && index < 42}
            <ContentAd
              routeId="database"
              index={2 + Math.floor(index / 6)}
            />
          {/if}
        </div>
      {/each}
    </div>
    {#if listMode === 'paginated' && inheritance.totalPages > 1}
      <Pagination
        bind:page
        pages={inheritance.totalPages}
        total={inheritance.total}
        pageSize={inheritance.pageSize}
        jump
        onchange={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      />
    {/if}
  {:else}
    <EmptyState
      icon="search"
      title="No records found"
      description="Try adjusting your search criteria or submit your Trainer ID to help the community."
    >
      {#snippet actions()}
        <Button
          variant="secondary"
          size="sm"
          icon="add"
          onclick={onaddtrainer}
        >
          Add Trainer ID
        </Button>
      {/snippet}
    </EmptyState>
  {/if}
  {#if appending && loading}
    <Spinner
      centered
      minHeight="96px"
      label="Loading more records…"
    />
  {:else if appending && error}
    <Banner
      title="More records could not be loaded"
      tone="danger"
    >
      <p>{error}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={onretry}
      >
        Retry loading more
      </Button>
    </Banner>
  {/if}
</section>

<style>
  @import './database-results.css';

  .inheritance-results {
    min-width: 0;
    display: grid;
    gap: var(--space-3);
  }
  .pending {
    min-height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    color: var(--color-text-muted);
  }
  .result-error {
    min-width: 0;
  }
  .result-error :global(.empty) {
    border-color: rgb(var(--accent-error-rgb) / 0.35);
    background: rgb(var(--accent-error-rgb) / 0.06);
  }
  .result-error :global(.icon) {
    color: var(--accent-error);
  }
  .result-error :global(p) {
    color: var(--text-secondary);
  }
  .error-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .sorting-notice {
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 9px;
    border-left: 3px solid var(--accent-primary);
    background: rgb(var(--accent-primary-rgb) / 0.08);
    color: var(--text-secondary);
    font-size: 10px;
  }
  .sorting-notice :global(svg) {
    color: var(--accent-primary);
  }
</style>
