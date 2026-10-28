<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import RunBar from '../../shell/RunBar.svelte';
  import type { TheorizedBuild } from '../../reports/outcomes/build/build-result';
  import type { OptimizeResult } from '../../simulator-repository';
  import { bestSummary } from './build-run';

  /** The Skill planner's run bar: what a search would plan with or what the last one found, then its buttons. */
  interface Props {
    blocked: string;
    busy: boolean;
    error: string;
    result?: OptimizeResult;
    /** The build the theory puts first. */
    pick?: TheorizedBuild;
    current: boolean;
    /** What a search would plan with, such as the skills on offer and her SP. */
    setup: string;
    onsend: () => void;
    onshow: () => void;
  }

  let { blocked, busy, error, result, pick, current, setup, onsend, onshow }: Props = $props();

  const status = $derived.by(() => {
    if (busy) {
      return 'Theorizing builds…';
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

    if (pick) {
      return bestSummary(pick);
    }

    return 'No build came back';
  });

  const showsResult = $derived(Boolean(result) && current && !busy);
</script>

<RunBar
  label="Plan skills"
  {busy}
>
  {#snippet summary()}
    {#if blocked && !busy}
      <span class="blocked">{blocked}</span>
    {:else}
      <strong>{status}</strong>
      {#if !showsResult}<span>{setup}</span>{/if}
    {/if}
  {/snippet}
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
    disabled={busy || Boolean(blocked)}
    onclick={onsend}
  >
    Plan skills
  </Button>
</RunBar>
