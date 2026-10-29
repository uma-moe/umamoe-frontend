<script lang="ts">
  import Spinner from '@/components/feedback/Spinner.svelte';
</script>

<div
  class="timeline-loading"
  aria-busy="true"
>
  <div class="loading-caption">
    <Spinner
      label="Loading Timeline data"
      size={22}
    />
    <span>Loading timeline…</span>
  </div>
  <div
    class="loading-preview"
    aria-hidden="true"
  >
    {#each [0, 1, 2] as lane}
      <div class="loading-lane">
        <div class="skeleton-date"></div>
        <div class="skeleton-card">
          <div class="skeleton-media"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .timeline-loading {
    min-height: 320px;
    padding: 24px var(--page-gutter-current);
    overflow: hidden;
  }
  .loading-caption {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
    color: var(--text-secondary);
    font-size: 13px;
  }
  .loading-preview {
    display: grid;
    grid-template-columns: repeat(3, minmax(240px, 285px));
    gap: 16px;
  }
  .loading-lane {
    display: grid;
    gap: 18px;
  }
  .skeleton-date,
  .skeleton-line {
    background: var(--border-primary);
  }
  .skeleton-media {
    background: var(--surface-2);
  }
  .skeleton-date {
    height: 16px;
    width: 45%;
    margin: auto;
    border-radius: 4px;
  }
  .skeleton-card {
    height: 167px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--surface-1);
  }
  .skeleton-media {
    height: 56px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .skeleton-line {
    height: 12px;
    width: 75%;
    margin: 16px 10px;
    border-radius: 3px;
  }
  .skeleton-line.short {
    width: 48%;
  }
  :global(.mobile) .loading-preview {
    grid-template-columns: minmax(0, 1fr);
  }
  :global(.mobile) .loading-lane {
    gap: 10px;
  }
  :global(.mobile) .skeleton-date {
    margin-left: 0;
  }
</style>
