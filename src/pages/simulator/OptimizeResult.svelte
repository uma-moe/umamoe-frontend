<script lang="ts">
  import DataTable from '@/components/DataTable.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import type { OptimizeEstimate, OptimizeResult } from './simulator-repository';
  let { result, raw = '', purchaseNames = [], busy = false }: { result?: OptimizeResult; raw?: string; purchaseNames?: string[]; busy?: boolean } = $props();
  const labels = ['Speed','Stamina','Power','Guts','Wit'];
  const modes: Record<string,string> = {cm:'Champions Meeting',tt_sprint:'Team Trials Sprint',tt_mile:'Team Trials Mile',tt_medium:'Team Trials Medium',tt_long:'Team Trials Long',tt_dirt:'Team Trials Dirt'};
  const finalists = $derived(result?.report.finalists ?? []);
  const rows = $derived(finalists.map((build,index)=>({id:index,place:index+1,cost:build.sp_cost,search:build.search.fitness.mean,validation:build.validation?.fitness.mean ?? '—'})));
  const format = (value: OptimizeEstimate) => value.mean.toFixed(3)+' ± '+value.standard_error.toFixed(3);
  const purchaseLabel = (index: number) => purchaseNames[index]?.trim() || 'Purchase '+(index+1);
</script>
<div class="optimize" aria-busy={busy}>
  <dl class="stats">
    <div><dt>Mode</dt><dd>{result ? modes[result.mode] ?? result.mode : '—'}</dd></div>
    <div><dt>Candidates tested</dt><dd>{result?.report.candidates_evaluated.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Fully evaluated</dt><dd>{result?.report.fully_evaluated_candidates.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Simulations</dt><dd>{result?.report.simulations.toLocaleString() ?? '—'}</dd></div>
    <div><dt>Search</dt><dd>{result ? result.report.exhaustive ? 'Exhaustive' : 'Heuristic' : '—'}</dd></div>
  </dl>
  <h3>Ranked builds</h3>
  <DataTable caption="Ranked builds" plain compact {rows} emptyMessage={busy ? 'Searching purchase combinations…' : result ? 'No finalists came back for this budget and purchase list.' : 'Add purchases and set an SP budget in Search, then run the search.'} columns={[
    {key:'place',label:'Rank',numeric:true},{key:'build',label:'Build',sortable:false},{key:'cost',label:'SP',numeric:true},{key:'search',label:'Search score',numeric:true},{key:'validation',label:'Validation score',numeric:true}
  ]} columnHelp={{'Search score':'Estimated fitness on the search seeds. The ± value is the standard error of the estimate.','Validation score':'Fitness on separate validation seeds. Close scores can change order through RNG.'}}>
    {#snippet cell(row,column)}{@const build=finalists[Number(row.id)]!}
      {#if column.key==='build'}<div class="build"><span>{build.build.purchases.length ? build.build.purchases.map(purchaseLabel).join(', ') : 'No purchases'}</span><dl class="build-stats">{#each labels as label,index}<div><dt>{label}</dt><dd>{build.build.stats[index] ?? '—'}</dd></div>{/each}</dl></div>
      {:else if column.key==='search'}{format(build.search.fitness)}{' '}<small>({build.search.fitness.samples} samples)</small>
      {:else if column.key==='validation'}{build.validation ? format(build.validation.fitness) : 'Not run'}{#if build.validation}{' '}<small>({build.validation.fitness.samples} samples)</small>{/if}
      {:else}{row[column.key]}{/if}
    {/snippet}
  </DataTable>
  <p class="hint" role="status">{result ? 'Each candidate was sampled '+result.runs_per_variation_per_scenario+' times per scenario. Close scores can change order through RNG.' : busy ? 'Rankings and validation scores will appear when the search completes.' : 'Search and validation scores appear here after simulation.'}</p>
  {#if result}
    <Disclosure id="optimize-seeds" title="Sample seeds" icon="sort" compact><p class="hint">Search: {result.report.search_seeds.join(', ') || '—'}</p><p class="hint">Validation: {result.report.validation_seeds.join(', ') || '—'}</p></Disclosure>
    <Disclosure id="optimize-raw" title="Raw simulator response" icon="tools" compact><pre>{raw}</pre><p class="hint">{result.report.backend}, schema {result.schema_version}, report schema {result.report.schema_version}</p></Disclosure>
  {/if}
</div>
<style>
  .optimize{display:grid;gap:10px;min-width:0}.stats{display:flex;flex-wrap:wrap;gap:8px 24px;margin:0;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)}.stats div{display:flex;align-items:baseline;gap:8px}dt{font-size:11px;color:var(--text-secondary)}dd{margin:0;font-size:12px;font-variant-numeric:tabular-nums}h3{font-size:13px;margin:0}.build{min-width:200px;max-width:500px;white-space:normal;display:grid;gap:6px;font-size:12px;padding-block:4px}.build-stats{display:flex;gap:12px;flex-wrap:wrap;margin:0}.build-stats div{display:flex;gap:4px;align-items:baseline}.build-stats dt{font-size:9px}.build-stats dd{font-size:11px}.hint,small{font-size:10px;color:var(--text-secondary);line-height:1.5}.hint{margin:0}pre{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px}
</style>
