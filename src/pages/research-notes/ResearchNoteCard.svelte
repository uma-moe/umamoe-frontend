<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Icon from '@/components/Icon.svelte';
  import Card from '@/components/cards/Card.svelte';
  import {
    publishedDate,
    researchNotes,
    topicDisplay,
    type ResearchNote
  } from './research-catalog';

  interface Props {
    note: ResearchNote;
    href: string;
    /** A short status shown before the topic, such as "Latest" or "Older note". */
    label?: string;
    featured?: boolean;
  }

  let { note, href, label, featured = false }: Props = $props();

  const topic = $derived(topicDisplay(note));
  const newest = $derived(note.id === researchNotes[0]?.id);
  const titleId = $derived('note-' + note.id + '-title');
  const summaryId = $derived('note-' + note.id + '-summary');
</script>

<a
  class="note-link"
  class:featured
  {href}
  aria-labelledby={titleId}
  aria-describedby={summaryId}
>
  <Card interactive>
    <div class="note-card">
      <div class="note-meta">
        {#if newest}
          <Badge tone="success">New</Badge>
        {/if}
        {#if label}
          <Badge tone="accent">{label}</Badge>
        {/if}
        {#if topic.name}
          <Badge tone={topic.tone}>{topic.name}</Badge>
        {/if}
        <span class="note-status">
          {#if note.pinned}
            <span class="pinned">
              <Icon
                name="pin"
                size={13}
              />
              Pinned
            </span>
          {/if}
          <time datetime={note.date}>{publishedDate(note.date)}</time>
        </span>
      </div>
      <h3 id={titleId}>{note.title}</h3>
      <p id={summaryId}>{note.description}</p>
      {#if featured}
        <!-- The whole card is the link; this only says where it goes. -->
        <span
          class="read-note"
          aria-hidden="true"
        >
          Read note
          <Icon
            name="arrow-right"
            size={15}
          />
        </span>
      {/if}
    </div>
  </Card>
</a>

<style>
  /* The shared card is a size container, so the link has to stretch it to the grid cell. */
  .note-link {
    flex: 1;
    display: flex;
    min-width: 0;
    color: var(--text-primary);
    text-decoration: none;
  }
  .note-link > :global(.card) {
    flex: 1;
    min-width: 0;
  }
  .note-link:focus-visible {
    border-radius: var(--radius-lg);
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .note-card {
    display: grid;
    align-content: start;
    gap: var(--space-2);
  }
  .note-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: 2px;
  }
  .note-status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    margin-left: auto;
    color: var(--text-muted);
    font-size: var(--font-xs);
  }
  .pinned {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    font-weight: 600;
  }
  time {
    font-variant-numeric: tabular-nums;
  }
  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.35;
  }
  p {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: var(--font-sm);
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* The lead note stands apart by scale and a reading cue, on the same surface as the rest. */
  .featured > :global(.card) {
    padding: clamp(var(--space-4), 2.6vw, var(--space-6));
  }
  .featured .note-card {
    gap: var(--space-3);
  }
  .featured h3 {
    max-width: 32ch;
    font-size: clamp(20px, 2.3vw, 27px);
    font-weight: 650;
    letter-spacing: -0.015em;
    line-height: 1.2;
    text-wrap: balance;
  }
  .featured p {
    max-width: 68ch;
    font-size: 15px;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
  .read-note {
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 6px;
    margin-top: var(--space-1);
    color: var(--accent-primary);
    font-size: var(--font-sm);
    font-weight: 600;
  }
  @media (prefers-reduced-motion: no-preference) {
    .read-note :global(svg) {
      transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .note-link:hover .read-note :global(svg),
    .note-link:focus-visible .read-note :global(svg) {
      transform: translateX(3px);
    }
  }
</style>
