<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { HpSpread, HpVerdict } from '../../reports/outcomes/hp/hp-needed';

  /** The answer stays in reach while the form scrolls: until the result itself is in sight. */
  interface Props {
    hasCourse: boolean;
    hasRun: boolean;
    spread?: HpSpread;
    verdict?: HpVerdict;
    error: string;
    busy: boolean;
    pending: boolean;
    canRun: boolean;
    onshow: () => void;
  }

  let { hasCourse, hasRun, spread, verdict, error, busy, pending, canRun, onshow }: Props =
    $props();

  // The answer in one line, for the bar that keeps it in reach while the form scrolls.
  const summary = $derived.by(() => {
    if (!hasCourse) {
      return 'Pick a track and course first';
    }

    if (error && !busy) {
      return 'Couldn’t calculate';
    }

    if (!hasRun) {
      if (busy) {
        return 'Calculating…';
      }

      return 'Does her HP last a full last spurt?';
    }

    return (
      verdict!.title +
      (spread?.needed
        ? ' · needs ≈ ' + Math.round(spread.needed.p50).toLocaleString() + ' stamina'
        : '')
    );
  });
</script>

<div
  class="calc-bar {error && !busy ? 'bad' : (verdict?.tone ?? '')}"
  role="status"
>
  <span class="summary">
    {#if verdict && !error}<Icon
        name={verdict.tone === 'good' ? 'check' : 'warning'}
        size={16}
      />{/if}
    {summary}
    {#if pending && hasRun}<small>Updating…</small>{/if}
  </span>
  <Button
    icon={hasRun ? undefined : 'battery'}
    variant={hasRun ? 'secondary' : 'primary'}
    loading={busy && !hasRun}
    disabled={!canRun}
    onclick={onshow}
  >
    {hasRun ? 'See result' : 'Calculate HP'}
  </Button>
</div>

<style>
  .calc-bar {
    display: none;
  }
  /* Narrower: the answer floating at the bottom while the result is out of sight. */
  @media all {
    .calc-bar {
      position: sticky;
      bottom: 12px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 8px 14px;
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
    }
  }
  .summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 6px;
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .good .summary :global(svg) {
    color: var(--accent-success);
  }
  .warn .summary :global(svg) {
    color: var(--accent-warning);
  }
  .bad .summary {
    color: var(--accent-error);
  }
  .summary small {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .calc-bar :global(.ui-button) {
    flex: none;
    min-height: 40px;
  }
  @media (max-width: 767px) {
    .calc-bar :global(.ui-button) {
      min-height: 44px;
    }
  }
</style>
