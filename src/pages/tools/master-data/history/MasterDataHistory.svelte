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
    loadPreliminaryResourceVersions,
    type MasterDiff,
    type MasterRelease,
    type PreliminaryResourceVersion
  } from '@/services/resources/master-history';
  import DiffCounts from './DiffCounts.svelte';
  import MasterDataDiff from './MasterDataDiff.svelte';

  interface Props {
    /** Short hash of the release whose diff is open; empty when none is. */
    release: string;
    /** The table a shared link points at inside that diff. */
    table: string;
    /** Opens the staged preliminary master.mdb in the Table browser tab. */
    onbrowsepreliminary?: () => void;
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

  let { release = $bindable(), table = $bindable(), onbrowsepreliminary }: Props = $props();

  let releasesState = $state.raw<ReleasesState>({ status: 'loading' });
  let preliminaryVersions = $state.raw<PreliminaryResourceVersion[]>([]);
  let diffState = $state.raw<DiffState>({ status: 'idle' });
  let missingRelease = $state('');
  let releasesRequest: AbortController | undefined;
  let diffRequest: AbortController | undefined;

  const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
  const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });

  const newestFirst = $derived(
    releasesState.status === 'loaded' ? releasesState.releases.toReversed() : []
  );

  const newestPreliminaryVersions = $derived(preliminaryVersions.toReversed());

  function releaseDate(date: string): string {
    const day = new Date(`${date}T00:00:00Z`);
    return Number.isNaN(day.getTime()) ? date : dateFormat.format(day);
  }

  function formatTimestamp(value?: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : dateTimeFormat.format(parsed);
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
      const [releases, observedPreliminary] = await Promise.all([
        loadMasterReleases(request.signal),
        loadPreliminaryResourceVersions(request.signal).catch(() => [])
      ]);
      if (request.signal.aborted) return;

      releasesState = { status: 'loaded', releases };
      preliminaryVersions = observedPreliminary;
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
          class:preliminary={entry.isPreliminary}
        >
          <div class="release-heading">
            <code
              class="hash"
              title={entry.hash}
            >
              {entry.shortHash}
            </code>
            {#if entry.isPreliminary}
              <Badge tone="warning">Preliminary</Badge>
            {/if}
            {#if entry.resourceVersion}
              <code class="resource-version">v{entry.resourceVersion}</code>
            {/if}
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
                {#if entry.isPreliminary && onbrowsepreliminary}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="database"
                    onclick={onbrowsepreliminary}
                  >
                    Browse DB
                  </Button>
                {/if}
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
              {#if entry.isPreliminary}
                <div class="preliminary-release-note">
                  <Banner
                    title="Unreleased CDN master upload"
                    tone="warning"
                  >
                    <p>
                      Diffed against the current live master. Cygames can still modify or replace
                      this upload before official release.
                      {#if entry.cdnLastModified}
                        CDN Last-Modified: {formatTimestamp(entry.cdnLastModified)}.
                      {/if}
                    </p>
                  </Banner>
                </div>
              {/if}
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

  {#if newestPreliminaryVersions.length}
    <section
      class="preliminary-versions"
      aria-labelledby="preliminary-versions-heading"
    >
      <header class="history-heading">
        <h3 id="preliminary-versions-heading">Preliminary CDN resource versions</h3>
        <p>Every unreleased Global CDN manifest detected ahead of the live app version.</p>
      </header>
      <ol class="releases">
        {#each newestPreliminaryVersions as item (item.resourceVersion)}
          <li class="release preliminary-log-item">
            <div class="release-heading">
              <code class="hash">v{item.resourceVersion}</code>
              {#if item.promotedAt}
                <Badge tone="success">Promoted</Badge>
              {:else}
                <Badge tone="warning">Unreleased</Badge>
              {/if}
              <span class="tables">
                Ahead of live <code>v{item.liveResourceVersion}</code>
              </span>
              <code
                class="resource-version"
                title={item.masterSha256}
              >
                {item.masterShortHash}
              </code>
              <span class="tables">
                {item.masterChangedFromLive ? 'Master updated' : 'Same master as live'}
              </span>
              <time datetime={item.cdnLastModified ?? item.detectedAt}>
                {formatTimestamp(item.cdnLastModified ?? item.detectedAt)}
              </time>
            </div>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</section>

<style>
  @import './master-data-history.css';
</style>
