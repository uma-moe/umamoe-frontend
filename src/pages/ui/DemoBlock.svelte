<script lang="ts">
  import type { Snippet } from 'svelte';
  import { previews } from './component-previews';

  let { id, children }: { id: string; children: Snippet } = $props();

  const entry = $derived(previews.find((item) => item.id === id)!);
</script>

<section
  {id}
  class="preview"
  aria-labelledby={`${id}-title`}
>
  <header>
    <div>
      <h2 id={`${id}-title`}>{entry.title}</h2>
      <div class="sources">
        {#each entry.components as path}
          <code title={`src/${path}`}>
            {path.split('/').at(-1)}
          </code>
        {/each}
      </div>
    </div>
    <a
      href={entry.route}
      target="_blank"
      rel="noopener"
    >
      In app ↗
    </a>
  </header>
  <div class="canvas">{@render children()}</div>
</section>

<style>
  .preview {
    min-width: 0;
    padding-block: 24px;
    scroll-margin-top: 20px;
  }
  .preview:global(+ .preview) {
    border-top: 1px solid var(--border-primary);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 16px;
    margin-bottom: 20px;
  }
  header > div {
    min-width: 0;
  }
  h2 {
    margin: 0 0 7px;
    font-size: 16px;
  }
  header > a {
    flex: none;
    font-size: 12px;
    text-decoration: none;
    color: var(--accent-primary);
    padding-block: 3px;
  }
  .sources {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  code {
    font-size: 10px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  .canvas {
    min-width: 0;
  }
  :global(.preview-row) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  :global(.preview-stack) {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  :global(.preview-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: 20px;
    align-items: start;
  }
  :global(.preview-narrow) {
    max-width: 540px;
    min-width: 0;
  }
  @media (max-width: 600px) {
    header {
      gap: 10px;
    }
    h2 {
      font-size: 14px;
    }
    .preview {
      padding-block: 20px;
    }
  }
</style>
