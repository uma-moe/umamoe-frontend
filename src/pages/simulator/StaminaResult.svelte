<script lang="ts">
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import { hpCalculation } from './hp-calculation';
  import type { StaminaResult } from './simulator-repository';
  let { result, raw = '', forced = false, busy = false }: { result?: StaminaResult; raw?: string; forced?: boolean; busy?: boolean } = $props();
  let detailsOpen = $state(false);
  const summary = $derived(result ? hpCalculation(result, forced) : undefined);
  const hp = (value: number | null | undefined) => value == null ? '—' : Math.round(value).toLocaleString();
  const decisions: Record<number,string> = {1:'Full, spare HP',2:'Full',4:'Below minimum',8:'Reduced'};
  const checks = $derived((result?.spurt_calculation_times ?? []).map((time,index) => ({
    id:index,time,distance:result?.spurt_calculation_distances[index] ?? '—',
    available:result?.check_hp[index] ?? '—',needed:result?.full_spurt_need_hp[index] ?? '—',
    decision:forced ? 'Forced full spurt' : decisions[result?.spurt_calculation_results[index] ?? 0] ?? '—'
  })));
  const measurements = $derived(result ? [
    {id:'max',metric:'Maximum HP',value:result.max_hp},
    {id:'remaining',metric:'HP at finish',value:result.remaining_hp},
    {id:'deficit',metric:'Observed HP deficit',value:result.hp_deficit},
    {id:'minimum',metric:'Lowest HP',value:result.minimum_hp},
    {id:'consumed',metric:'HP consumed',value:result.consumed_hp},
    {id:'recovered',metric:'HP recovered',value:result.recovered_hp},
    {id:'debuff',metric:'HP lost to debuffs',value:result.debuff_hp_loss},
    {id:'wasted',metric:'Recovery above maximum HP',value:result.wasted_recovery_hp}
  ] : []);
</script>
<div class="hp-result" aria-busy={busy}>
  <header><strong class:empty={result && !result.survived} class:pending={!result}>{result ? result.survived ? 'Completed without exhaustion' : 'HP exhausted' : busy ? 'Calculating HP…' : 'HP at finish'}</strong><Button size="sm" variant="secondary" disabled={!result} onclick={() => detailsOpen = true}>Calculation details</Button></header>
  <div class="hp-bar">{#if result && summary}<progress aria-label="HP remaining at finish" max={result.max_hp || 1} value={result.remaining_hp}></progress><span>{hp(result.remaining_hp)} / {hp(result.max_hp)} HP ({summary.remainingPercent.toFixed(1)}%)</span>{:else}<div class="hp-placeholder" aria-hidden="true"></div><span>— / — HP</span>{/if}</div>
  <dl>
    <div><dt>Last spurt</dt><dd class:warning={result && !forced && !result.full_spurt}>{summary?.spurt ?? '—'}</dd></div>
    <div><dt>First spurt check</dt><dd class:warning={summary?.balance != null && summary.balance < 0}>{summary?.feasibility ?? '—'}{#if summary?.balance != null}{' '}({hp(Math.abs(summary.balance))} HP {summary.balance >= 0 ? 'spare' : 'short'}){/if}</dd></div>
    <div><dt>Finish time</dt><dd>{result ? result.finish_time_seconds.toFixed(3)+' s' : '—'}</dd></div>
    <div><dt>Spurt starts</dt><dd>{result?.last_spurt_start_distance_m == null ? '—' : hp(result.last_spurt_start_distance_m)+' m'}</dd></div>
    <div><dt>First exhaustion</dt><dd class:empty={!!result?.exhausted_at}>{result?.exhausted_at ? hp(result.exhausted_at.distance_m)+' m, '+result.exhausted_at.time_seconds.toFixed(2)+' s' : result ? 'None' : '—'}</dd></div>
    <div><dt>HP consumed</dt><dd>{result ? hp(result.consumed_hp)+' HP' : '—'}</dd></div>
    <div><dt>Recovery applied</dt><dd class:recovery={!!result?.recovered_hp}>{result ? '+'+hp(result.recovered_hp)+' HP' : '—'}</dd></div>
    <div><dt>Debuffs applied</dt><dd class:empty={!!result?.debuff_hp_loss}>{result ? '−'+hp(result.debuff_hp_loss)+' HP' : '—'}</dd></div>
  </dl>
  {#if !result}<p role="status">{busy ? 'Checking the selected build on this course…' : 'Calculate HP to see the remaining balance, exhaustion and spurt feasibility.'}</p>{:else if forced}<p>Maximum spurt was forced. Its decision code does not prove there was enough HP to sustain it.</p>{/if}
</div>
<Dialog bind:open={detailsOpen} title="HP calculation details" maxWidth="1000px" maxHeight="90dvh">
  {#if result}
  <DataTable caption="HP measurements" plain compact rows={measurements} columns={[{key:'metric',label:'Measurement'},{key:'value',label:'HP',numeric:true}]}>
    {#snippet cell(row,column)}{column.key === 'value' ? hp(Number(row.value)) : row.metric}{/snippet}
  </DataTable>
  <p>Observed deficit follows the simulated HP balance below zero. It is not an estimate of extra stamina required for a different spurt plan.</p>
  <h3>Spurt checks</h3>
  <DataTable caption="HP feasibility at spurt checks" plain compact rows={checks} columns={[
    {key:'time',label:'Time (s)',numeric:true},{key:'distance',label:'Distance (m)',numeric:true},
    {key:'available',label:'Available HP',numeric:true},{key:'needed',label:'Full spurt needs',numeric:true},{key:'decision',label:'Decision'}
  ]}>
    {#snippet cell(row,column)}{#if column.key === 'time'}{Number(row.time).toFixed(3)}{:else if ['distance','available','needed'].includes(column.key)}{typeof row[column.key] === 'number' ? hp(Number(row[column.key])) : '—'}{:else}{row[column.key]}{/if}{/snippet}
  </DataTable>
  <p>The check considers HP at that moment. Future scheduled recovery and state changes are not forecast in this requirement.</p>
  <details><summary>Raw simulator response</summary><pre>{raw}</pre></details>
  <p>Model {result.model}, seed {result.seed}, course {result.course_id}</p>
  {/if}
  {#snippet actions()}<Button variant="secondary" onclick={() => detailsOpen = false}>Close</Button>{/snippet}
</Dialog>
<style>
  .hp-result{min-width:0}header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}header strong{font-size:14px;color:var(--color-success)}
  header strong.pending{color:var(--text-primary)}.hp-placeholder{height:10px;flex:1;min-width:80px;background:var(--surface-3);border-radius:5px}
  .hp-bar{display:flex;gap:12px;align-items:center;margin:12px 0;font-size:12px;font-variant-numeric:tabular-nums}progress{height:10px;flex:1;min-width:80px;accent-color:var(--accent-primary)}
  dl{margin:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}dl>div{display:flex;gap:12px;align-items:baseline;justify-content:space-between;padding:7px 0;border-top:1px solid var(--border-subtle)}
  dt{font-size:11px;color:var(--text-secondary);flex:none}dd{font-size:12px;margin:0;text-align:right;font-variant-numeric:tabular-nums}.empty,header strong.empty{color:var(--color-danger)}.warning{color:var(--color-warning)}.recovery{color:var(--color-success)}
  h3{font-size:13px;margin:16px 0 8px}p{font-size:11px;line-height:1.6;color:var(--text-secondary)}details{font-size:12px}summary{cursor:pointer;color:var(--accent-primary)}pre{font-size:10px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
  @media(max-width:700px){dl{grid-template-columns:1fr}.hp-bar{flex-wrap:wrap}.hp-bar span{white-space:nowrap}}
</style>
