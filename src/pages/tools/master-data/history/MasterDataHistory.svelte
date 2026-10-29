<script lang="ts">
  import { onMount } from 'svelte';
  import Badge from '@/components/Badge.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    loadMasterDiff,
    loadMasterReleases,
    type MasterDiff,
    type MasterRelease
  } from '@/services/resources/master-history';
  import DiffCounts from './DiffCounts.svelte';
  import MasterDataDiff from './MasterDataDiff.svelte';

  interface Props {
    /** Short hash of the release whose diff is open; empty when none is. */
    release: string;
    /** The table a shared link points at inside that diff. */
    table: string;
  }

  type ReleasesState =
    | { status: 'loading' }
    | { status: 'loaded'; releases: MasterRelease[] }
    | { status: 'failed'; error: string };

  type DiffState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'loaded'; diff: MasterDiff }
    | { status: 'failed'; error: string };

  let { release = $bindable(), table = $bindable() }: Props = $props();

  let releasesState = $state.raw<ReleasesState>({ status: 'loading' });
  let diffState = $state.raw<DiffState>({ status: 'idle' });
  let missingRelease = $state('');
  let releasesRequest: AbortController | undefined;
  let diffRequest: AbortController | undefined;

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });

  const newestFirst = $derived(
    releasesState.status === 'loaded' ? releasesState.releases.toReversed() : []
  );

  function releaseDate(date: string): string {
    const day = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(day.getTime()) ? date : dateFormat.format(day);
  }

  function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async function loadReleases() {
    releasesRequest?.abort();
    const request = new AbortController();
    releasesRequest = request;
    releasesState = { status: 'loading' };

    try {
      const releases = await loadMasterReleases(request.signal);
      if (request.signal.aborted) return;

      releasesState = { status: 'loaded', releases };
      openLinkedRelease(releases);
    } catch (error) {
      if (!request.signal.aborted) releasesState = { status: 'failed', error: messageOf(error) };
    }
  }

  /** A shared link opens its diff once the history confirms the release has one. */
  function openLinkedRelease(releases: MasterRelease[]) {
    if (!release) return;

    const linked = releases.find((candidate) => candidate.shortHash === release);
    if (linked?.summary) {
      void loadDiff(release);
      return;
    }

    missingRelease = release;
    release = '';
    table = '';
  }

  async function loadDiff(shortHash: string) {
    diffRequest?.abort();
    const request = new AbortController();
    diffRequest = request;
    diffState = { status: 'loading' };

    try {
      const diff = await loadMasterDiff(shortHash, request.signal);
      if (!request.signal.aborted) diffState = { status: 'loaded', diff };
    } catch (error) {
      if (!request.signal.aborted) diffState = { status: 'failed', error: messageOf(error) };
    }
  }

  function toggleRelease(shortHash: string) {
    table = '';
    if (release === shortHash) {
      diffRequest?.abort();
      release = '';
      diffState = { status: 'idle' };
      return;
    }

    release = shortHash;
    void loadDiff(shortHash);
  }

  onMount(() => {
    void loadReleases();

    return () => {
      releasesRequest?.abort();
      diffRequest?.abort();
    };
  });
</script>

<section
  class="history"
  aria-labelledby="master-history-heading"
  aria-busy={releasesState.status === 'loading'}
>
  <header class="history-heading">
    <h2 id="master-history-heading">Version history</h2>
    <p>Every release of the game’s master database, with the rows it added, removed and changed.</p>
  </header>

  {#if missingRelease}
    <Banner
      title="That release has no diff"
      tone="warning"
      dismissible
      ondismiss={() => (missingRelease = '')}
    >
      <p>
        Release <code>{missingRelease}</code>
        is not in the history, or there is no earlier release to compare it with.
      </p>
    </Banner>
  {/if}

  {#if releasesState.status === 'loading'}
    <Spinner
      label="Loading the version history…"
      showLabel
    />
  {:else if releasesState.status === 'failed'}
    <Banner
      title="The version history could not be loaded"
      tone="danger"
    >
      <p>{releasesState.error}</p>
      <Button
        size="sm"
        variant="secondary"
        icon="refresh"
        onclick={loadReleases}
      >
        Try again
      </Button>
    </Banner>
  {:else if !newestFirst.length}
    <EmptyState
      icon="calendar"
      title="No releases yet"
      description="The history begins with the next master database the game publishes."
    />
  {:else}
    <ol class="releases">
      {#each newestFirst as entry (entry.hash)}
        {@const open = entry.shortHash === release}
        <li
          class="release"
          class:open
        >
          <div class="release-heading">
            <code
              class="hash"
              title={entry.hash}
            >
              {entry.shortHash}
            </code>
            <time datetime={entry.date}>{releaseDate(entry.date)}</time>
            {#if entry.summary}
              <DiffCounts
                added={entry.summary.added}
                removed={entry.summary.removed}
                modified={entry.summary.modified}
              />
              <span class="tables">
                {entry.summary.tablesChanged.toLocaleString()}
                {entry.summary.tablesChanged === 1 ? 'table' : 'tables'}
              </span>
              <span class="toggle">
                <Button
                  size="sm"
                  variant={open ? 'secondary' : 'ghost'}
                  ariaExpanded={open}
                  ariaControls={open ? `release-${entry.shortHash}` : undefined}
                  onclick={() => toggleRelease(entry.shortHash)}
                >
                  {open ? 'Hide diff' : 'View diff'}
                </Button>
              </span>
            {:else if entry.previousHash === null}
              <Badge tone="accent">Initial version</Badge>
            {:else}
              <span class="tables">No diff recorded</span>
            {/if}
          </div>
          {#if open}
            <div
              id="release-{entry.shortHash}"
              class="release-diff"
            >
              {#if diffState.status === 'loading'}
                <Spinner
                  label="Loading the diff…"
                  showLabel
                />
              {:else if diffState.status === 'failed'}
                <Banner
                  title="The diff could not be loaded"
                  tone="danger"
                >
                  <p>{diffState.error}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="refresh"
                    onclick={() => loadDiff(entry.shortHash)}
                  >
                    Try again
                  </Button>
                </Banner>
              {:else if diffState.status === 'loaded'}
                <MasterDataDiff
                  diff={diffState.diff}
                  release={entry.shortHash}
                  bind:table
                />
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  @import './master-data-history.css';
</style>
