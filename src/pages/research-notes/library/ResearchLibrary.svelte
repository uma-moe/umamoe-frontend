<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Tabs, { type TabItem } from '@/components/navigation/Tabs.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import ResearchNoteCard from '../ResearchNoteCard.svelte';
  import {
    allTopics,
    countNotes,
    filterNotes,
    publishedDate,
    researchNotes,
    researchTopics,
    topicAppearance,
    withLibraryQuery,
    type ResearchNote,
    type ResearchSort
  } from '../research-catalog';

  interface Props {
    search: string;
    topic: string;
    sort: ResearchSort;
    queryString: string;
  }

  let {
    search = $bindable(),
    topic = $bindable(),
    sort = $bindable(),
    queryString
  }: Props = $props();

  const topicTabs: TabItem[] = [
    { id: allTopics, label: allTopics, icon: 'book', badge: String(countNotes(allTopics)) },
    ...researchTopics.map((name) => ({
      id: name,
      label: name,
      icon: topicAppearance[name].icon,
      badge: String(countNotes(name))
    }))
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'title', label: 'Title A–Z' }
  ];

  const latestNote = researchNotes[0];
  const libraryMetadata = latestNote
    ? countLabel(researchNotes.length) + ', updated ' + publishedDate(latestNote.date)
    : undefined;

  const notes = $derived(filterNotes({ search, topic, sort }));
  const resultsHeading = $derived(headingForResults());

  function headingForResults(): string {
    if (search.trim()) return 'Search results';
    if (topic !== allTopics) return topic;
    return 'All notes';
  }

  function countLabel(count: number): string {
    return count === 1 ? '1 note' : count + ' notes';
  }

  function noteHref(note: ResearchNote): string {
    return withLibraryQuery('/research/' + note.id, queryString);
  }

  function resetFilters() {
    search = '';
    topic = allTopics;
  }
</script>

<AppPage
  routeId="research"
  title="Research"
  description="Game mechanics, experiments, and findings by Aya."
  metadata={libraryMetadata}
  width="wide"
>
  <div class="library-toolbar">
    <TextField
      id="research-search"
      label="Search research"
      hideLabel
      type="search"
      prefixIcon="search"
      placeholder="Search notes…"
      bind:value={search}
    /><SelectField
      id="research-sort"
      label="Sort notes"
      hideLabel
      bind:value={sort}
      options={sortOptions}
    />
  </div>
  <Tabs
    compact
    items={topicTabs}
    bind:value={topic}
    label="Research topics"
    variant="pills"
    controls="research-notes"
  />
  <div
    id="research-notes"
    class="library-results"
    role="tabpanel"
    aria-labelledby="research-results-title"
  >
    <div class="results-heading">
      <h2 id="research-results-title">{resultsHeading}</h2>
      <span>{notes.length} of {countLabel(researchNotes.length)}</span>
    </div>
    {#if notes.length}
      <ol class="note-grid">
        {#each notes as note (note.id)}
          <li class:featured={note.pinned || note === latestNote}>
            <ResearchNoteCard
              {note}
              href={noteHref(note)}
              featured={note.pinned || note === latestNote}
            />
          </li>
        {/each}
      </ol>
    {:else}
      <div class="no-results">
        <EmptyState
          icon="search"
          title="No matching research"
          description="Try another topic or search term."
        />
        <Button
          variant="secondary"
          onclick={resetFilters}
        >
          Reset filters
        </Button>
      </div>
    {/if}
  </div>
</AppPage>

<style>
  .library-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 11rem;
    gap: var(--space-3);
    min-width: 0;
  }
  .library-results {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }
  .results-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .results-heading h2 {
    margin: 0;
    font-size: 18px;
  }
  .results-heading > span {
    color: var(--text-secondary);
    font-size: var(--font-xs);
    font-variant-numeric: tabular-nums;
  }
  .note-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .note-grid > li {
    display: flex;
    min-width: 0;
  }
  .note-grid > li.featured {
    grid-column: 1 / -1;
  }
  .no-results {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    padding-block: var(--space-8);
  }
  @media (max-width: 767px) {
    .library-toolbar {
      grid-template-columns: minmax(0, 1fr) 8.75rem;
      gap: var(--space-2);
    }
    .note-grid {
      gap: var(--space-2);
    }
  }
</style>
