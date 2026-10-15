<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Icon from '@/components/Icon.svelte';
  import { router } from '@/routes/router';
  import manifest from '../../../public/hakuraku/notes/manifest.json';
  import { researchBlocks } from './research-markdown';
  import 'katex/dist/katex.min.css';

  const topics: Record<string, string> = {
    affinity: 'Inheritance',
    events: 'Race mechanics',
    sparks: 'Inheritance',
    'shop-refresh': 'Training',
    spark_generation: 'Inheritance',
    'spot-struggle': 'Race mechanics',
    dueling: 'Race mechanics',
    'plus-sparks': 'Inheritance',
    'light-hello': 'Training',
    'new-age-umamusume-data': 'Data & analysis'
  };

  const categories = [
    'All research',
    'Race mechanics',
    'Inheritance',
    'Training',
    'Data & analysis'
  ];

  const params = new URLSearchParams(location.search);

  let sort = $state(params.get('sort') ?? 'newest');

  const topicTabs = categories.map((name) => ({
    id: name,
    label: name,
    badge: String(
      name === 'All research'
        ? manifest.length
        : manifest.filter((n) => topics[n.id] === name).length
    )
  }));

  const ordered = [...manifest].sort((a, b) => b.date.localeCompare(a.date));

  let search = $state(params.get('q') ?? ''),
    topic = $state(
      categories.includes(params.get('topic') ?? '') ? params.get('topic')! : 'All research'
    ),
    error = $state(''),
    loading = $state(false),
    attempt = $state(0),
    blocks = $state<{ title?: string; html: string }[]>([]),
    outline = $state<{ id: string; title: string; level: number }[]>([]),
    active = $state(''),
    readingTime = $state(0),
    progress = $state(0);

  let article = $state<HTMLElement>();

  const noteId = $derived((router.route.params as Record<string, string>).noteId);
  const selected = $derived(manifest.find((n) => n.id === noteId));
  const notes = $derived(
    ordered
      .filter(
        (n) =>
          (topic === 'All research' || topics[n.id] === topic) &&
          (n.title + ' ' + n.description + ' ' + topics[n.id])
            .toLowerCase()
            .includes(search.trim().toLowerCase())
      )
      .sort((a, b) =>
        sort === 'title'
          ? a.title.localeCompare(b.title)
          : sort === 'oldest'
            ? a.date.localeCompare(b.date)
            : b.date.localeCompare(a.date)
      )
  );

  const libraryQuery = $derived(
    new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(topic !== 'All research' ? { topic } : {}),
      ...(sort !== 'newest' ? { sort } : {})
    }).toString()
  );

  const libraryHref = $derived('/research' + (libraryQuery ? '?' + libraryQuery : ''));

  $effect(() => {
    if (!noteId) history.replaceState(history.state, '', libraryHref);
  });

  const adjacent = $derived(selected ? ordered.indexOf(selected) : -1);
  const newer = $derived(ordered[adjacent - 1]),
    older = $derived(ordered[adjacent + 1]);

  const tools = $derived(
    selected?.id === 'new-age-umamusume-data'
      ? [
          { href: '/competitive/cm-data', label: 'CM Data' },
          { href: '/competitive/race-analysis', label: 'Race Analysis' }
        ]
      : selected && topics[selected.id] === 'Race mechanics'
        ? [{ href: '/competitive/race-analysis', label: 'Race Analysis' }]
        : selected && topics[selected.id] === 'Inheritance'
          ? [{ href: '/tools/lineage-planner', label: 'Lineage Planner' }]
          : []
  );

  const related = $derived(
    ordered
      .filter((n) => selected && n.id !== selected.id && topics[n.id] === topics[selected.id])
      .slice(0, 3)
  );

  const published = (date: string) =>
    new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

  $effect(() => {
    const entry = selected;
    attempt;
    blocks = [];
    outline = [];
    error = '';
    loading = false;
    progress = 0;
    active = '';
    readingTime = 0;
    if (!entry) return;
    const controller = new AbortController();
    loading = true;
    fetch('/hakuraku/notes/' + entry.filename, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Note unavailable (' + response.status + ')');
        const text = await response.text();
        if (controller.signal.aborted) return;
        readingTime = Math.max(1, Math.ceil(text.split(/\s+/).length / 220));
        const headings: typeof outline = [];
        let index = 0;
        blocks = researchBlocks(text).map((block) => {
          const document = new DOMParser().parseFromString(block.html, 'text/html');
          document.querySelector('h1')?.remove();
          if (!block.title)
            for (const heading of document.querySelectorAll('h2,h3')) {
              const id = 'section-' + index++;
              heading.id = id;
              headings.push({
                id,
                title: heading.textContent ?? '',
                level: Number(heading.tagName[1])
              });
            }

          return { ...block, html: document.body.innerHTML };
        });

        outline = headings;
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          error = reason instanceof Error ? reason.message : 'Could not load note.';
      })
      .finally(() => {
        if (!controller.signal.aborted) loading = false;
      });

    return () => controller.abort();
  });

  $effect(() => {
    blocks;
    let observer: IntersectionObserver | undefined,
      cancelled = false;

    void tick().then(() => {
      if (cancelled || !article) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) active = entry.target.id;
        },
        { rootMargin: '-80px 0px -60% 0px' }
      );

      article.querySelectorAll('h2[id],h3[id]').forEach((h) => observer!.observe(h));
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  });

  function updateProgress() {
    if (article) {
      const rect = article.getBoundingClientRect();
      progress = Math.max(
        0,
        Math.min(100, (-rect.top / Math.max(1, rect.height - window.innerHeight)) * 100)
      );
    }
  }
</script>

<svelte:window onscroll={updateProgress} />
<svelte:head>
  <title>{selected?.title ?? 'Research'} · uma.moe</title>
  <meta
    name="description"
    content={selected?.description ??
      'Research by Aya on racing, inheritance, training, and game mechanics.'}
  />
</svelte:head>
{#snippet contents()}
  <nav aria-label="Article outline">
    {#each outline as item}
      <a
        class:active={active === item.id}
        class:subsection={item.level === 3}
        aria-current={active === item.id ? 'location' : undefined}
        href={'#' + item.id}
      >
        {item.title}
      </a>
    {/each}
  </nav>
{/snippet}
<div
  class="research-page"
  class:reading={Boolean(selected)}
>
  <AppPage
    routeId="research"
    title={selected?.title ?? 'Research'}
    description={selected?.description ?? 'Game mechanics, experiments, and findings by Aya.'}
    eyebrow={selected ? topics[selected.id] : 'uma.moe Research'}
    width="wide"
  >
    {#if selected}
      <div class="article-meta">
        <Button
          href={libraryHref}
          variant="secondary"
          size="sm"
          icon="arrow-left"
        >
          Back to research
        </Button>
        <span class="article-author">By Aya</span>
        <time datetime={selected.date}>{published(selected.date)}</time>
        <span>{readingTime || '…'} min read</span>
      </div>
      {#if outline.length}
        <div class="mobile-contents">
          <Disclosure
            compact
            title="In this note"
            id="mobile-note-outline"
          >
            {@render contents()}
          </Disclosure>
        </div>
      {/if}
      <div class="reader">
        <div class="article-column">
          {#if loading}
            <Spinner
              size={48}
              centered
              label="Loading research note…"
            />
          {:else if error}
            <Banner
              title="Note could not be loaded"
              tone="danger"
              reportable={false}
            >
              {error}<Button
                variant="secondary"
                onclick={() => attempt++}
              >
                Retry
              </Button>
            </Banner>
          {:else}
            <article
              bind:this={article}
              class="markdown"
            >
              {#each blocks as block, index}
                {#if block.title}
                  <Disclosure
                    compact
                    id={'research-detail-' + index}
                    title={block.title}
                  >
                    <div>{@html block.html}</div>
                  </Disclosure>
                {:else}
                  <div>{@html block.html}</div>
                {/if}
              {/each}
            </article>
            <nav
              class="adjacent-notes"
              aria-label="More research notes"
            >
              {#if newer}
                <a href={'/research/' + newer.id + (libraryQuery ? '?' + libraryQuery : '')}>
                  <small>← Newer note</small>
                  <strong>{newer.title}</strong>
                </a>
              {/if}{#if older}
                <a
                  class="older-note"
                  href={'/research/' + older.id + (libraryQuery ? '?' + libraryQuery : '')}
                >
                  <small>Older note →</small>
                  <strong>{older.title}</strong>
                </a>
              {/if}
            </nav>
            <footer class="article-end">
              <p>
                Published {published(selected.date)} by Aya. Findings reflect the evidence available at
                publication.
              </p>
              <Button
                href={libraryHref}
                variant="secondary"
                size="sm"
                icon="arrow-left"
              >
                Back to all notes
              </Button>
            </footer>
            {#if related.length}
              <section class="related">
                <h2>Related research</h2>
                {#each related as note}
                  <a href={'/research/' + note.id + (libraryQuery ? '?' + libraryQuery : '')}>
                    <span>
                      {note.title}
                      <small>{note.description}</small>
                    </span>
                    <Icon
                      name="arrow-right"
                      size={16}
                    />
                  </a>
                {/each}
              </section>
            {/if}
          {/if}
        </div>
        <aside class="reading-sidebar">
          <div class="reading-sticky">
            {#if outline.length}
              <strong class="aside-title">In this note</strong>
              <div
                class="reading-progress"
                aria-label="Reading progress"
              >
                <span style:width={progress + '%'}></span>
              </div>
              {@render contents()}
            {/if}
            {#if tools.length}
              <div class="note-tools">
                <strong>Explore in uma.moe</strong>
                {#each tools as tool}
                  <Button
                    href={tool.href}
                    variant="secondary"
                    size="sm"
                    icon="arrow-right"
                  >
                    {tool.label}
                  </Button>
                {/each}
              </div>
            {/if}
            <div class="source-note">
              {#if related.length}
                <strong>
                  More in {topics[selected.id]}
                </strong>
              {/if}{#each ordered.filter((n) => n.id !== selected.id && topics[n.id] === topics[selected.id]) as note}
                <a href={'/research/' + note.id}>
                  {note.title}
                </a>
              {/each}
              <a href={libraryHref}>Browse all {manifest.length} notes →</a>
            </div>
          </div>
        </aside>
      </div>
    {:else if noteId}
      <EmptyState
        icon="book"
        title="Research note not found"
        description="Choose a note from the research library."
      /><Button href="/research">Browse research</Button>
    {:else}
      <section
        class="library"
        aria-label="Research library"
      >
        <div class="library-controls">
          <TextField
            id="research-search"
            label="Search research"
            type="search"
            prefixIcon="search"
            placeholder="Mechanic, topic, or note title…"
            bind:value={search}
          /><SelectField
            id="research-sort"
            label="Sort notes"
            bind:value={sort}
            options={[
              { value: 'newest', label: 'Newest first' },
              { value: 'oldest', label: 'Oldest first' },
              { value: 'title', label: 'Title A–Z' }
            ]}
          />
        </div>
        <Tabs
          items={topicTabs}
          bind:value={topic}
          label="Research topics"
          variant="underline"
          controls="research-notes"
        />
        <div class="list-summary">
          <span>{notes.length} of {manifest.length} notes</span>
          <span>Original findings & supporting evidence</span>
        </div>
        <div
          class="notes"
          id="research-notes"
        >
          {#each notes as note}
            <a
              class="note"
              href={'/research/' + note.id + (libraryQuery ? '?' + libraryQuery : '')}
            >
              <div class="note-date">
                <time datetime={note.date}>{published(note.date)}</time>
                <span>{topics[note.id]}</span>
              </div>
              <div class="note-copy">
                <h2>
                  {note.title}{#if note.id === ordered[0]?.id}
                    <span class="latest">Latest</span>
                  {/if}
                </h2>
                <p>{note.description}</p>
              </div>
              <Icon
                name="arrow-right"
                size={18}
              />
            </a>
          {:else}
            <EmptyState
              icon="search"
              title="No matching research"
              description="Try another topic or search term."
            /><Button
              variant="secondary"
              onclick={() => {
                search = '';
                topic = 'All research';
              }}
            >
              Reset filters
            </Button>
          {/each}
        </div>
      </section>
    {/if}
  </AppPage>
</div>

<style>
  @import './research-page.css';
</style>
