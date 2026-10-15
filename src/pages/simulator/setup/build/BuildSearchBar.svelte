<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import type { OptimizeResult } from '../../simulator-repository';
  import { bestSummary } from './build-run';

  /** Narrow screens: the search button and its answer stay in reach while the form scrolls. */
  interface Props {
    blocked: string;
    busy: boolean;
    error: string;
    result?: OptimizeResult;
    current: boolean;
    onsend: () => void;
    onshow: () => void;
  }

  let { blocked, busy, error, result, current, onsend, onshow }: Props = $props();

  const summary = $derived(
    busy
      ? 'Searching builds…'
      : error
        ? 'Couldn’t search'
        : !result
          ? 'Not searched yet'
          : !current
            ? 'Setup changed'
            : result.report.finalists[0]
              ? bestSummary(result.report.finalists[0], result.objective === 'field_place')
              : 'No build came back'
  );
</script>

<div class="search-bar">
  <button
    type="button"
    class="summary"
    onclick={onshow}
  >
    {blocked || summary}
    <small>See result</small>
  </button>
  <Button
    icon="tune"
    loading={busy}
    disabled={!!blocked}
    onclick={onsend}
  >
    Find the best build
  </Button>
</div>

<style>
  .search-bar {
    display: none;
  }
  /* Narrow: the search button floats at the bottom of the screen while the form and result scroll past. */
  @media (max-width: 1180px) {
    .search-bar {
      position: sticky;
      bottom: 12px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 14px;
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
    }
    .summary {
      display: grid;
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      font-weight: 650;
      text-align: left;
      cursor: pointer;
    }
    .summary small {
      font-size: 11px;
      font-weight: 400;
      color: var(--text-secondary);
    }
    .search-bar :global(.ui-button) {
      min-height: 44px;
    }
  }
</style>
