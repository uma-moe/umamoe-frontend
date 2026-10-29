<script lang="ts">
  import type { Snippet } from 'svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import {
    parentAffinityDetails,
    type ManualParent,
    type ParentPickerState,
    type SelectableParent
  } from '@/lib/veterans/parents/parent-picker';
  import { authUser } from '@/services/auth/auth-state';
  import ParentPickerRow from '../ParentPickerRow.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import type { ParentPickerSources } from '../parent-picker-sources.svelte';

  interface Props {
    sources: ParentPickerSources;
    pickerState: ParentPickerState;
    targetId?: number;
    current: SelectableParent[];
    filtered: SelectableParent[];
    affinities: Map<string, ReturnType<typeof parentAffinityDetails>>;
    loading?: boolean;
    error?: string;
    combined: boolean;
    editing: boolean;
    dropZone: Snippet;
    onchoose: (parent: SelectableParent) => void;
    onedit: (entry: ManualParent | undefined) => void;
    onclear: () => void;
    virtualRange: VirtualRange;
  }

  let {
    sources,
    pickerState,
    targetId,
    current,
    filtered,
    affinities,
    loading,
    error,
    combined,
    editing,
    dropZone,
    onchoose,
    onedit,
    onclear,
    virtualRange = $bindable()
  }: Props = $props();
</script>

{#if pickerState.tab === 'saved' && sources.partnerPhase}
  <div
    class="empty"
    role="status"
  >
    <Spinner size={48} />
    <h3>
      {sources.partnerPhase === 'queued'
        ? 'Request queued…'
        : sources.partnerPhase === 'pending'
          ? 'Waiting for a worker to pick up the task…'
          : 'Worker is retrieving inheritance data…'}
    </h3>
    <p>This usually takes a few seconds.</p>
  </div>
{:else if pickerState.tab === 'saved' && sources.lookupError}
  <div
    class="empty lookup-error"
    role="alert"
  >
    <Icon
      name="warning"
      size={48}
    />
    <h3>{sources.lookupTimedOut ? 'No response - timed out' : 'Fetch failed'}</h3>
    <p>{sources.lookupError}</p>
  </div>
{:else if loading}
  <Spinner
    centered
    minHeight="200px"
    label={pickerState.tab === 'saved'
      ? 'Loading saved partners…'
      : `Loading ${pickerState.tab === 'veterans' ? 'Veterans' : 'bookmarks'}…`}
  />
{:else if error}
  <Banner
    title="Parents could not be loaded"
    tone="danger"
  >
    <p>{error}</p>
    <Button
      variant="secondary"
      onclick={() => sources.retry(pickerState.tab, pickerState.accountId)}
    >
      Retry
    </Button>
  </Banner>
{:else if pickerState.tab === 'veterans' && !filtered.length && (pickerState.query || pickerState.factors.length)}
  <div class="empty">
    <Icon
      name="users"
      size={48}
    />
    <h3>No veterans match your filters</h3>
    <Button
      variant="secondary"
      onclick={onclear}
    >
      Clear filters
    </Button>
  </div>
{:else if pickerState.tab === 'bookmarks' && !$authUser}
  <div class="empty">
    <Icon
      name="book"
      size={48}
    />
    <h3>Sign in to use bookmarks</h3>
    <p>
      Bookmark veterans from the Inheritance Database to find them here quickly. Sign in using the
      button in the top navigation bar.
    </p>
  </div>
{:else}
  {#if pickerState.tab === 'saved' && sources.lookupResult}
    <h3 class="partner-heading">
      <Icon
        name="search"
        size={16}
      />Lookup result
    </h3>
    <ParentPickerRow
      parent={sources.lookupResult}
      characters={sources.characters}
      affinity={parentAffinityDetails(
        sources.lookupResult,
        targetId,
        sources.engine,
        sources.groups
      )}
      {combined}
      filters={pickerState.factors}
      onselect={() => sources.lookupResult && onchoose(sources.lookupResult)}
    />
  {/if}
  {#if pickerState.tab === 'saved' && sources.partners.length}
    <h3 class="partner-heading">
      <Icon
        name="save"
        size={16}
      />Saved partners
    </h3>
  {/if}
  <div
    class="parent-list"
    role="list"
    aria-label="Available parents"
    use:virtualScroll={{
      items: filtered,
      key: (parent) => parent.pickerId,
      root: 'closest',
      estimate: 180,
      onrange: (range) => (virtualRange = range)
    }}
  >
    {#each filtered.slice(virtualRange.start, virtualRange.end) as parent, index (parent.pickerId)}
      <div
        role="listitem"
        data-virtual-index={virtualRange.start + index}
        aria-posinset={virtualRange.start + index + 1}
        aria-setsize={filtered.length}
      >
        <ParentPickerRow
          {parent}
          characters={sources.characters}
          affinity={affinities.get(parent.pickerId)}
          {combined}
          filters={pickerState.factors}
          onselect={() => onchoose(parent)}
          onedit={parent.share_source === 'manual'
            ? () => onedit(sources.manuals.find((entry) => entry.id === parent.share_local_id))
            : undefined}
          ondelete={parent.share_source === 'manual' ||
          (parent.share_source === 'partner' && !!$authUser)
            ? () => sources.deleteParent(parent)
            : undefined}
        />
      </div>
    {/each}
  </div>
  {#if !filtered.length && !editing && !(pickerState.tab === 'saved' && sources.lookupResult && !sources.partners.length)}
    <div
      class="empty"
      class:empty-upload={pickerState.tab === 'veterans' && !current.length}
    >
      {#if current.length}
        <Icon
          name="search"
          size={48}
        />
        <h3>No results</h3>
        <Button
          variant="secondary"
          onclick={onclear}
        >
          Clear filters
        </Button>
      {:else if pickerState.tab === 'veterans'}
        {@render dropZone()}
      {:else if pickerState.tab === 'bookmarks'}
        <Icon
          name="book"
          size={48}
        />
        <h3>No bookmarks yet</h3>
        <p>
          Bookmark characters from the Inheritance Database and they will appear here for quick
          access.
        </p>
      {:else if pickerState.tab === 'manual'}
        <h3>No saved entries</h3>
        <p>Create manual entries to use characters without a linked game account.</p>
      {:else}
        <Icon
          name="users"
          size={48}
        />
        <h3>{$authUser ? 'No saved partners yet' : 'No lookup result yet'}</h3>
        <p>Enter a Trainer ID above to fetch someone's inheritance data.</p>
      {/if}
    </div>
  {/if}
{/if}

<style>
  @import './parent-picker-results.css';
</style>
