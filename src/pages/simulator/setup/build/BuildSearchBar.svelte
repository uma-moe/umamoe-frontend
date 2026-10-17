<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import type { OptimizeResult } from '../../simulator-repository';
  import { bestSummary } from './build-run';

  /**
   * The search's run bar, as on Race sim: what a search would plan with or what the last one found, then its buttons.
   * It sticks to the bottom of the screen while the form scrolls.
   */
  interface Props {
    blocked: string;
    busy: boolean;
    error: string;
    result?: OptimizeResult;
    current: boolean;
    /** What a search would plan with, such as the skills on offer and her SP. */
    setup: string;
    onsend: () => void;
    onshow: () => void;
  }

  let { blocked, busy, error, result, current, setup, onsend, onshow }: Props = $props();

  const summary = $derived.by(() => {
    if (busy) {
      return 'Searching builds…';
    }

    if (error) {
      return 'Couldn’t search';
    }

    if (!result) {
      return 'Not planned yet';
    }

    if (!current) {
      return 'Setup changed';
    }

    if (result.report.finalists[0]) {
      return bestSummary(result.report.finalists[0], result.objective === 'field_place');
    }

    return 'No build came back';
  });

  const showsResult = $derived(Boolean(result) && current && !busy);
</script>

<section
  class="search-bar"
  aria-label="Plan skills"
>
  <p
    class="summary"
    role="status"
  >
    {#if blocked && !busy}
      <span class="blocked">{blocked}</span>
    {:else}
      <strong>{summary}</strong>
      {#if !showsResult}<span>{setup}</span>{/if}
    {/if}
  </p>
  {#if result}<Button
      variant="ghost"
      size="sm"
      icon="chart"
      onclick={onshow}
    >
      See result
    </Button>{/if}
  <Button
    size="sm"
    icon="tune"
    loading={busy}
    disabled={Boolean(blocked)}
    onclick={onsend}
  >
    Plan skills
  </Button>
</section>

<style>
  .search-bar {
    position: sticky;
    bottom: 12px;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 16px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
  }
  .summary {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    min-width: 0;
    margin: 0;
    font-size: 13px;
  }
  .summary span {
    color: var(--text-secondary);
  }
  .summary .blocked {
    color: var(--accent-warning);
  }
  .search-bar :global(.ui-button) {
    height: 40px;
    min-height: 40px;
    font-size: 13px;
    border-radius: var(--radius-sm);
  }
  /* A phone: the summary on its own line, the buttons sharing the row under it. */
  @media (max-width: 767px) {
    .search-bar {
      flex-wrap: wrap;
      padding: 8px;
    }
    .summary {
      flex-basis: 100%;
      padding: 2px 6px 4px;
    }
    .search-bar > :global(.ui-button) {
      flex: 1;
      height: 44px;
      min-height: 44px;
      padding-inline: 8px;
      font-size: 12px;
    }
  }
</style>
