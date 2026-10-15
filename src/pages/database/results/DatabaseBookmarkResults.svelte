<script lang="ts">
  import type { Snippet } from 'svelte';
  import ContentAd from '@/layouts/ads/ContentAd.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Icon from '@/components/Icon.svelte';
  import Pagination from '@/components/navigation/Pagination.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
  import { authUser } from '@/services/auth/auth-state';
  import type { DatabaseBookmarks } from './database-bookmarks.svelte';

  interface Props {
    bookmarks: DatabaseBookmarks;
    filteredBookmarks: InheritanceRecord[];
    pageSize: number;
    affinityError: string;
    card: Snippet<[InheritanceRecord]>;
    affinityFailure: Snippet;
  }

  let { bookmarks, filteredBookmarks, pageSize, affinityError, card, affinityFailure }: Props =
    $props();

  const bookmarkPages = $derived(Math.max(1, Math.ceil(filteredBookmarks.length / pageSize)));
  const visibleBookmarks = $derived(
    filteredBookmarks.slice((bookmarks.page - 1) * pageSize, bookmarks.page * pageSize)
  );
</script>

<section class="bookmark-results">
  {#if !$authUser}
    <div class="bookmarks-empty">
      <Icon
        name="veterans"
        size={54}
      />
      <h2>Sign in to use bookmarks</h2>
      <p>Please sign in to bookmark and save records.</p>
      <Button
        href="/login"
        variant="primary"
      >
        Sign in
      </Button>
    </div>
  {:else if bookmarks.loading}
    <div class="loading">
      <Spinner size={30} />
      <span>Loading bookmarks…</span>
    </div>
  {:else if bookmarks.error}
    <Banner
      title="Bookmarks unavailable"
      tone="danger"
    >
      <p>{bookmarks.error}</p>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => void bookmarks.load()}
      >
        Retry
      </Button>
    </Banner>
  {:else if bookmarks.records.length}
    <header class="bookmark-toolbar">
      <div>
        <h2>Bookmarks</h2>
        <p>
          {filteredBookmarks.length.toLocaleString()} bookmarked records{#if filteredBookmarks.length !== bookmarks.records.length}
            <span>(filtered from {bookmarks.records.length})</span>
          {/if}
        </p>
      </div>
      <div class="bookmark-filters">
        <SegmentedControl
          label="Bookmark status filter"
          value={bookmarks.filter}
          options={[
            { value: 'all', label: `All (${bookmarks.records.length})` },
            {
              value: 'unchanged',
              label: `Unchanged (${bookmarks.records.length - bookmarks.modifiedCount})`
            },
            { value: 'modified', label: `Modified (${bookmarks.modifiedCount})` }
          ]}
          onchange={(value) => {
            bookmarks.filter = value as typeof bookmarks.filter;
            bookmarks.page = 1;
          }}
        />
      </div>
      <div class="bookmark-actions">
        {#if bookmarks.modifiedCount}
          <Button
            variant="secondary"
            size="sm"
            onclick={() => void bookmarks.removeModified()}
          >
            Remove modified ({bookmarks.modifiedCount})
          </Button>
        {/if}<Button
          variant="danger"
          size="sm"
          onclick={() => void bookmarks.clearAll()}
        >
          {bookmarks.clearArmed ? 'Confirm clear all' : 'Clear all'}
        </Button>
      </div>
    </header>
    {#if affinityError}
      {@render affinityFailure()}
    {/if}
    <ContentAd
      routeId="database"
      top
    />
    <div class="inheritance-list">
      {#each visibleBookmarks as record (record.id)}
        {@render card(record)}
      {/each}
    </div>
    {#if bookmarkPages > 1}
      <Pagination
        bind:page={bookmarks.page}
        pages={bookmarkPages}
        total={filteredBookmarks.length}
        {pageSize}
        jump
      />
    {/if}
  {:else}
    <EmptyState
      icon="veterans"
      title="No bookmarks yet"
      description="Save records from the Database tab and they will appear here."
    />
  {/if}
</section>

<style>
  @import './database-results.css';
  @import './database-bookmark-results.css';
</style>
