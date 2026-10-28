<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import { router } from '@/routes/router';
  import ResearchLibrary from './library/ResearchLibrary.svelte';
  import ResearchReader from './reader/ResearchReader.svelte';
  import {
    findNote,
    libraryQueryString,
    readLibraryQuery,
    withLibraryQuery
  } from './research-catalog';

  // The library filters survive opening a note, so "Back to research" returns to the same list.
  const query = $state(readLibraryQuery(new URLSearchParams(location.search)));

  const noteId = $derived((router.route.params as Record<string, string>).noteId);
  const selected = $derived(noteId ? findNote(noteId) : undefined);
  const queryString = $derived(libraryQueryString(query));

  $effect(() => {
    if (!noteId)
      history.replaceState(history.state, '', withLibraryQuery('/research', queryString));
  });
</script>

<svelte:head>
  <title>{selected?.title ?? 'Research'} · uma.moe</title>
  <meta
    name="description"
    content={selected?.description ??
      'Research by Aya on racing, inheritance, training, and game mechanics.'}
  />
</svelte:head>
{#if selected}
  <ResearchReader
    note={selected}
    {queryString}
  />
{:else if noteId}
  <AppPage
    routeId="research"
    title="Research"
    width="wide"
  >
    <div class="missing-note">
      <EmptyState
        icon="book"
        title="Research note not found"
        description="Choose a note from the research library."
      />
      <Button href="/research">Browse research</Button>
    </div>
  </AppPage>
{:else}
  <ResearchLibrary
    bind:search={query.search}
    bind:topic={query.topic}
    bind:sort={query.sort}
    {queryString}
  />
{/if}

<style>
  .missing-note {
    display: grid;
    justify-items: center;
    gap: 12px;
  }
</style>
