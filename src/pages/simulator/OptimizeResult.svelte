<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Banner from '@/components/Banner.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import type { OptimizeEstimate, OptimizeResult } from './simulator-repository';

  interface Props {
    result: OptimizeResult;
    raw: string;
    /** Purchase names from the request, indexed the way the server echoes indices. */
    purchaseNames: Array<string>;
  }

  let { result, raw, purchaseNames }: Props = $props();

  /** `build.stats` order: speed, stamina, power, guts, wisdom. */
  const STAT_LABELS = ['Speed', 'Stamina', 'Power', 'Guts', 'Wisdom'] as const;

  const MODE_LABELS: Record<string, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };

  const finalists = $derived(result.report.finalists);
  const samples = $derived(result.runs_per_variation_per_scenario);

  /** Server indices point into the request's purchases array; blanks get a numbered label. */
  function purchaseLabel(index: number): string {
    const name = purchaseNames[index];
    if (name !== undefined && name.trim() !== '') return name;
    return `Purchase ${index + 1}`;
  }

  function statLabel(stats: Array<number>, index: number): string {
    const value = stats[index];
    return value === undefined ? '—' : String(value);
  }

  function format(estimate: OptimizeEstimate): string {
    return `${estimate.mean.toFixed(3)} ± ${estimate.standard_error.toFixed(3)}`;
  }
</script>

<div class="optimize">
  <Banner title="A coarse filter, not a proven optimum" tone="warning" reportable={false}>
    Each build is only sampled {samples} times per scenario, so two close builds can trade places on
    luck alone. This finds the best combination the search actually tested.
  </Banner>

  <dl class="stats">
    <div><dt>Mode</dt><dd>{MODE_LABELS[result.mode] ?? result.mode}</dd></div>
    <div><dt>Candidates</dt><dd>{result.report.candidates_evaluated.toLocaleString()}</dd></div>
    <div><dt>Fully evaluated</dt><dd>{result.report.fully_evaluated_candidates.toLocaleString()}</dd></div>
    <div><dt>Simulations</dt><dd>{result.report.simulations.toLocaleString()}</dd></div>
    <div><dt>Search</dt><dd>{result.report.exhaustive ? 'Exhaustive' : 'Heuristic'}</dd></div>
  </dl>

  {#if finalists.length === 0}
    <p class="hint">No finalists came back for this budget and purchase list.</p>
  {:else}
    <ol class="finalists">
      {#each finalists as finalist, index (index)}
        <li class="finalist">
          <header>
            <h3>#{index + 1}</h3>
            <Badge tone={index === 0 ? 'accent' : 'neutral'}>{finalist.sp_cost.toLocaleString()} SP</Badge>
          </header>

          {#if finalist.build.purchases.length === 0}
            <p class="hint">No purchases in this build.</p>
          {:else}
            <ul class="purchases">
              {#each finalist.build.purchases as purchaseIndex (purchaseIndex)}
                <li>{purchaseLabel(purchaseIndex)}</li>
              {/each}
            </ul>
          {/if}

          <dl class="metrics">
            <div>
              <dt>Search fitness</dt>
              <dd>{format(finalist.search.fitness)}<small>{finalist.search.fitness.samples} samples</small></dd>
            </div>
            {#if finalist.validation}
              <div>
                <dt>Validation fitness</dt>
                <dd>{format(finalist.validation.fitness)}<small>{finalist.validation.fitness.samples} samples</small></dd>
              </div>
            {:else}
              <div><dt>Validation</dt><dd>Not run</dd></div>
            {/if}
          </dl>

          <dl class="stats">
            {#each STAT_LABELS as label, statIndex (label)}
              <div><dt>{label}</dt><dd>{statLabel(finalist.build.stats, statIndex)}</dd></div>
            {/each}
          </dl>
        </li>
      {/each}
    </ol>
  {/if}

  <Disclosure
    id="optimize-seeds"
    title="Seeds"
    description="What the server sampled for search and validation"
    icon="sort"
    compact
  >
    <p class="hint">Search: {result.report.search_seeds.join(', ') || '—'}</p>
    <p class="hint">Validation: {result.report.validation_seeds.join(', ') || '—'}</p>
  </Disclosure>

  <Disclosure
    id="optimize-raw"
    title="Raw response"
    description="Exactly what the simulator returned"
    icon="tools"
  >
    <pre>{raw}</pre>
  </Disclosure>

  <p class="model">
    {result.report.backend} · schema {result.schema_version} · report schema {result.report.schema_version}
  </p>
</div>

<style>
  .optimize { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: var(--space-2); margin: 0; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .stats dt { color: var(--color-text-muted); font-size: var(--font-xs); }
  .stats dd { margin: 0; font-size: var(--font-md); font-weight: 700; font-variant-numeric: tabular-nums; }
  .finalists { display: flex; flex-direction: column; gap: var(--space-3); margin: 0; padding: 0; list-style: none; }
  .finalist { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2); }
  .finalist header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .finalist h3 { margin: 0; font-size: var(--font-md); }
  .purchases { display: flex; flex-wrap: wrap; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
  .purchases li { padding: 2px var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-size: var(--font-sm); }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--space-2); margin: 0; }
  .metrics div { display: flex; flex-direction: column; gap: 2px; }
  .metrics dt { color: var(--color-text-muted); font-size: var(--font-xs); }
  .metrics dd { display: flex; flex-direction: column; margin: 0; font-size: var(--font-sm); font-variant-numeric: tabular-nums; }
  .metrics small, .hint { color: var(--color-text-muted); font-size: var(--font-xs); }
  .hint { margin: 0; }
  pre { max-height: 360px; margin: 0; padding: var(--space-3); overflow: auto; border-radius: var(--radius-md); background: var(--factor-field-bg); color: var(--color-text); font-size: var(--font-xs); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .model { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); word-break: break-all; }
</style>
