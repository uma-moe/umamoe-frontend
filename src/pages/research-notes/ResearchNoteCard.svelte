<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Card from '@/components/cards/Card.svelte';
  import { publishedDate, topicDisplay, type ResearchNote } from './research-catalog';

  interface Props {
    note: ResearchNote;
    href: string;
    /** A short status shown before the topic, such as "Latest" or "Older note". */
    label?: string;
  }

  let { note, href, label }: Props = $props();

  const topic = $derived(topicDisplay(note));
  const titleId = $derived('note-' + note.id + '-title');
  const summaryId = $derived('note-' + note.id + '-summary');
</script>

<a
  class="note-link"
  {href}
  aria-labelledby={titleId}
  aria-describedby={summaryId}
>
  <Card interactive>
    <div class="note-card">
      <div class="note-meta">
        {#if label}
          <Badge tone="accent">{label}</Badge>
        {/if}
        {#if topic.name}
          <Badge tone={topic.tone}>{topic.name}</Badge>
        {/if}
        <time datetime={note.date}>{publishedDate(note.date)}</time>
      </div>
      <h3 id={titleId}>{note.title}</h3>
      <p id={summaryId}>{note.description}</p>
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
  time {
    margin-left: auto;
    color: var(--text-muted);
    font-size: var(--font-xs);
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
</style>
