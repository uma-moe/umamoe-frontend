<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { HpSpread, HpVerdict } from '../../reports/outcomes/hp/hp-needed';
  import RunBar from '../../shell/RunBar.svelte';

  /**
   * The HP calculator's run bar: Calculate HP until she has been calculated once, then the answer, which follows every
   * change from there, with a button to the result.
   */
  interface Props {
    hasCourse: boolean;
    hasRun: boolean;
    spread?: HpSpread;
    verdict?: HpVerdict;
    error: string;
    busy: boolean;
    pending: boolean;
    canRun: boolean;
    oncalculate: () => void;
    onshow: () => void;
  }

  let {
    hasCourse,
    hasRun,
    spread,
    verdict,
    error,
    busy,
    pending,
    canRun,
    oncalculate,
    onshow
  }: Props = $props();

  const failed = $derived(Boolean(error) && !busy);
  const tone = $derived(failed ? 'bad' : verdict?.tone);

  // The answer in one line, or what a first calculation does.
  const status = $derived.by(() => {
    if (failed) return 'Couldn’t calculate';
    if (!hasRun) return busy ? 'Calculating…' : 'Not calculated yet';

    return verdict?.title ?? 'Calculated';
  });

  const detail = $derived.by(() => {
    if (failed || !hasRun) return 'Races her 100 times on this course';
    if (pending) return 'Updating…';
    if (!spread?.needed) return '';

    return 'needs ≈ ' + Math.round(spread.needed.p50).toLocaleString('en-US') + ' stamina';
  });
</script>

<RunBar
  label="Calculate HP"
  {tone}
  busy={busy || pending}
>
  {#snippet summary()}
    {#if !hasCourse}
      <span class="blocked">Pick a track and course first.</span>
    {:else}
      {#if verdict && !failed}
        <Icon
          name={verdict.tone === 'good' ? 'check' : 'warning'}
          size={16}
        />
      {/if}
      <strong>{status}</strong>
      {#if detail}<span>{detail}</span>{/if}
    {/if}
  {/snippet}
  {#if hasRun}
    <Button
      variant="ghost"
      size="sm"
      icon="chart"
      onclick={onshow}
    >
      See result
    </Button>
  {:else}
    <Button
      size="sm"
      icon="battery"
      disabled={busy || !canRun}
      onclick={oncalculate}
    >
      Calculate HP
    </Button>
  {/if}
</RunBar>
