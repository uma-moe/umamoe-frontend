<script lang="ts">
  import { tick } from 'svelte';
  import Badge from '@/components/Badge.svelte';
  import Card from '@/components/cards/Card.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import ResearchNoteCard from '../ResearchNoteCard.svelte';
  import { researchBlocks } from '../research-markdown';
  import {
    publishedDate,
    researchNotes,
    topicDisplay,
    topicOf,
    withLibraryQuery,
    type ResearchNote
  } from '../research-catalog';
  import 'katex/dist/katex.min.css';

  interface Props {
    note: ResearchNote;
    queryString: string;
  }

  interface OutlineEntry {
    id: string;
    title: string;
    level: number;
  }

  let { note, queryString }: Props = $props();

  let error = $state(''),
    loading = $state(false),
    attempt = $state(0),
    blocks = $state<{ title?: string; html: string }[]>([]),
    outline = $state<OutlineEntry[]>([]),
    active = $state(''),
    readingTime = $state(0),
    progress = $state(0);

  let article = $state<HTMLElement>();

  const topic = $derived(topicDisplay(note));
  const libraryHref = $derived(withLibraryQuery('/research', queryString));
  const position = $derived(researchNotes.indexOf(note));
  const newer = $derived(researchNotes[position - 1]);
  const older = $derived(researchNotes[position + 1]);
  const sameTopic = $derived(
    researchNotes.filter(
      (other) => other.id !== note.id && topic.name && topicOf(other) === topic.name
    )
  );

  // The newer and older notes already have their own links, so related picks skip them.
  const related = $derived(
    sameTopic.filter((other) => other !== newer && other !== older).slice(0, 2)
  );
  const tools = $derived(toolsFor(note));
  const sectionCount = $derived(outline.filter((item) => item.level === 2).length);

  function noteHref(target: ResearchNote): string {
    return withLibraryQuery('/research/' + target.id, queryString);
  }

  function toolsFor(current: ResearchNote): { href: string; label: string }[] {
    if (current.id === 'new-age-umamusume-data')
      return [
        { href: '/competitive/cm-data', label: 'CM Data' },
        { href: '/competitive/race-analysis', label: 'Race Analysis' }
      ];

    if (topicOf(current) === 'Race mechanics')
      return [{ href: '/competitive/race-analysis', label: 'Race Analysis' }];

    if (topicOf(current) === 'Inheritance')
      return [{ href: '/tools/lineage-planner', label: 'Lineage Planner' }];

    return [];
  }

  /** Numbers top-level headings for the outline; collapsible detail blocks stay out of it. */
  function prepareBlocks(markdown: string): { blocks: typeof blocks; outline: OutlineEntry[] } {
    const headings: OutlineEntry[] = [];
    let index = 0;

    const prepared = researchBlocks(markdown).map((block) => {
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

    return { blocks: prepared, outline: headings };
  }

  function updateProgress() {
    if (!article) return;

    const rect = article.getBoundingClientRect();
    const scrollable = Math.max(1, rect.height - window.innerHeight);
    progress = Math.max(0, Math.min(100, (-rect.top / scrollable) * 100));
  }

  $effect(() => {
    const entry = note;
    attempt;
    blocks = [];
    outline = [];
    error = '';
    progress = 0;
    active = '';
    readingTime = 0;
    loading = true;

    const controller = new AbortController();
    fetch('/hakuraku/notes/' + entry.filename, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Note unavailable (' + response.status + ')');
        const text = await response.text();
        if (controller.signal.aborted) return;

        const prepared = prepareBlocks(text);
        readingTime = Math.max(1, Math.ceil(text.split(/\s+/).length / 220));
        blocks = prepared.blocks;
        outline = prepared.outline;
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

      const headingObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) active = entry.target.id;
        },
        { rootMargin: '-80px 0px -60% 0px' }
      );

      article
        .querySelectorAll('h2[id],h3[id]')
        .forEach((heading) => headingObserver.observe(heading));
      observer = headingObserver;
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  });
</script>

<svelte:window onscroll={updateProgress} />
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
<div class="research-reader">
  <AppPage
    routeId="research"
    title={note.title}
    description={note.description}
    width="wide"
  >
    {#snippet actions()}
      <Button
        href={libraryHref}
        variant="secondary"
        icon="arrow-left"
      >
        Back to research
      </Button>
    {/snippet}
    <div class="article-byline">
      {#if topic.name}
        <Badge tone={topic.tone}>{topic.name}</Badge>
      {/if}
      <span>
        <Icon
          name="user"
          size={14}
        />
        By
        <strong>Aya</strong>
      </span>
      <span>
        <Icon
          name="calendar"
          size={14}
        />
        <time datetime={note.date}>{publishedDate(note.date)}</time>
      </span>
      <span>
        <Icon
          name="hourglass"
          size={14}
        />
        {readingTime || '…'} min read
      </span>
    </div>
    {#if outline.length}
      <div class="mobile-contents">
        <Card padding="sm">
          <Disclosure
            compact
            title="In this note"
            id="mobile-note-outline"
          >
            {@render contents()}
          </Disclosure>
        </Card>
      </div>
    {/if}
    <div class="reader">
      <div class="reader-main">
        <Card padding="lg">
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
            <p class="publication-note">
              Published {publishedDate(note.date)} by Aya. Findings reflect the evidence available at
              publication.
            </p>
          {/if}
        </Card>
        {#if !loading && !error}
          <section
            class="keep-reading"
            aria-labelledby="keep-reading-title"
          >
            <div class="section-heading">
              <h2 id="keep-reading-title">Keep reading</h2>
              <Button
                href={libraryHref}
                variant="ghost"
                size="sm"
              >
                All {researchNotes.length} notes →
              </Button>
            </div>
            <ol class="more-notes">
              {#if newer}
                <li>
                  <ResearchNoteCard
                    note={newer}
                    href={noteHref(newer)}
                    label="Newer note"
                  />
                </li>
              {/if}
              {#if older}
                <li>
                  <ResearchNoteCard
                    note={older}
                    href={noteHref(older)}
                    label="Older note"
                  />
                </li>
              {/if}
              {#each related as relatedNote (relatedNote.id)}
                <li>
                  <ResearchNoteCard
                    note={relatedNote}
                    href={noteHref(relatedNote)}
                  />
                </li>
              {/each}
            </ol>
          </section>
        {/if}
      </div>
      <aside class="reading-sidebar">
        {#if outline.length}
          <Card>
            <div class="sidebar-section">
              <div class="outline-heading">
                <h2>In this note</h2>
                <span>{sectionCount} sections · {Math.round(progress)}% read</span>
              </div>
              <div
                class="reading-progress"
                role="progressbar"
                aria-label="Reading progress"
                aria-valuenow={Math.round(progress)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style:width={progress + '%'}></span>
              </div>
              {@render contents()}
            </div>
          </Card>
        {/if}
        {#if tools.length}
          <Card>
            <div class="sidebar-section">
              <h2>Explore in uma.moe</h2>
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
          </Card>
        {/if}
      </aside>
    </div>
  </AppPage>
</div>

<style>
  @import './research-reader.css';
</style>
