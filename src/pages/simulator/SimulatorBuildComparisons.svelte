<script lang="ts">
  import {onDestroy} from 'svelte';
  import Button from '@/components/Button.svelte';
  import SimulatorUmaEditor from './SimulatorUmaEditor.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';
  import {buildFieldRunners,type MonteCarloInput} from './race-sim-request';
  import {simulatorRepository,type MonteCarloResult} from './simulator-repository';
  import {compareOutcomes,reportNumber as n} from './simulation-report';
  import type {SimulatorUma} from './simulator-uma';
  let {input,result,umas,source}:{input:MonteCarloInput;result:MonteCarloResult;umas:SimulatorUma[];source:number}=$props();
  let alternatives=$state<{source:number;uma:SimulatorUma;outcome?:ReturnType<typeof compareOutcomes>}[]>([]),editing=$state<SimulatorUma>(),editingIndex=$state(-1),editingSource=0,open=$state(false),expanded=$state(false),busy=$state(false),error=$state('');
  let request:AbortController|undefined;
  onDestroy(()=>request?.abort());
  const rows=$derived(alternatives.filter(row=>row.source===source));
  function aptitudes(uma:SimulatorUma) {
    const grids=[['groundAptitudes',['Turf','Dirt']],['distanceAptitudes',['Sprint','Mile','Medium','Long']],['styleAptitudes',['Front runner','Pace chaser','Late surger','End closer']]] as const;
    return grids.flatMap(([key,names])=>uma.trainee[key].flatMap((grade,i)=>grade===umas[source]!.trainee[key][i]?[]:[names[i]+': '+umas[source]!.trainee[key][i]+' → '+grade])).join(' · ');
  }
  function add(){editingSource=source;editing=structuredClone($state.snapshot(umas[source]!));editing.name+=' · alternative '+(rows.length+1);editingIndex=-1;open=true;expanded=true;}
  function save(uma:SimulatorUma){if(editingIndex<0)alternatives=[...alternatives,{source:editingSource,uma}];else alternatives=alternatives.map((row,i)=>i===editingIndex?{...row,uma,outcome:undefined}:row);}
  async function run(){
    if(!rows.length||busy)return;
    busy=true;error='';const snapshot=source,variants=[...rows];request?.abort();request=new AbortController();
    try {
      const response=await simulatorRepository.comparison({body:{input,seeds:result.seeds,source_input_index:snapshot,alternatives:variants.map(({uma})=>({name:uma.name,runner:buildFieldRunners(umas.map((u,i)=>i===snapshot?uma:u))[snapshot]}))},signal:request.signal});
      const measured=response.result.alternatives.map(([,value])=>compareOutcomes(result,value,snapshot));
      alternatives=alternatives.map(row=>{const at=variants.indexOf(row);return at<0?row:{...row,outcome:measured[at]};});
    } catch(reason){if(!request.signal.aborted)error=reason instanceof Error?reason.message:'Could not compare builds.';}
    finally{busy=false;}
  }
</script>
<details class="build-comparisons" bind:open={expanded}>
  <summary>Compare alternative builds <span>optional · {umas[source]!.name}</span></summary>
<section aria-label="Alternative build comparisons">
  <header class="section-header"><div><h2>Alternative builds <small>optional</small></h2><p>Replace #{source+1} {umas[source]!.name}, keeping opponents, gates, conditions and seeds fixed.</p></div><div class="build-actions"><Button size="sm" variant="secondary" icon="add" disabled={rows.length>=3||busy} onclick={add}>Add alternative</Button>{#if rows.length}<Button size="sm" loading={busy} onclick={run}>Compare builds</Button>{/if}{#if busy}<Button size="sm" variant="ghost" onclick={()=>request?.abort()}>Cancel</Button>{/if}</div></header>
  {#if error}<p role="alert" class="report-note">{error}</p>{/if}
  {#if rows.length}<p class="report-note">Baseline + {rows.length} named alternatives</p>{#each alternatives as row,i}{#if row.source===source}<div class="build-row"><div><strong>{row.uma.name}</strong><p>{(['speed','stamina','power','guts','wisdom'] as const).filter(k=>row.uma.trainee[k]!==umas[source]!.trainee[k]).map(k=>k+' '+umas[source]!.trainee[k]+' → '+row.uma.trainee[k]).join(' · ')||'Same stats'} · {row.uma.skills.length} skills ({row.uma.skills.filter(s=>!umas[source]!.skills.some(old=>old.skillId===s.skillId&&old.level===s.level)).length} added/changed, {umas[source]!.skills.filter(s=>!row.uma.skills.some(next=>next.skillId===s.skillId)).length} removed)</p><details><summary>Build differences</summary><p>{aptitudes(row.uma)||'Same aptitudes'} · {umas[source]!.trainee.runningStyle} → {row.uma.trainee.runningStyle}</p><div class="changed-skills"><span>Added / changed:</span>{#each row.uma.skills.filter(s=>!umas[source]!.skills.some(old=>old.skillId===s.skillId&&old.level===s.level)) as skill}<span><RaceSkill id={skill.skillId}/> Lv {skill.level}</span>{/each}</div><div class="changed-skills"><span>Removed:</span>{#each umas[source]!.skills.filter(s=>!row.uma.skills.some(next=>next.skillId===s.skillId)) as skill}<RaceSkill id={skill.skillId}/>{/each}</div></details></div><div>{#if row.outcome}<strong>{n(row.outcome.mean,3)} s gained</strong><small>95% interval {row.outcome.interval?.map(v=>n(v,3)).join('–')??'Unavailable'} · {row.outcome.count} paired races</small><small>Wins {n(row.outcome.winChange,1)} pp · Full spurt {n(row.outcome.spurtChange,1)} pp</small>{:else}<span>Ready to compare</span>{/if}</div><div class="build-actions"><Button size="sm" variant="secondary" icon="edit" ariaLabel={'Edit '+row.uma.name} disabled={busy} onclick={()=>{editing=row.uma;editingIndex=i;editingSource=row.source;open=true;}}/><Button size="sm" variant="secondary" icon="trash" ariaLabel={'Remove '+row.uma.name} disabled={busy} onclick={()=>alternatives=alternatives.filter((_,at)=>at!==i)}/></div></div>{/if}{/each}<p class="report-note">These builds ran in separate versions of the field. Positive time gained means the alternative finished faster. Matched seeds control setup; native random draws may diverge after a build changes. Time intervals use paired sample standard errors.</p>{/if}
</section>
</details>
{#if editing}<SimulatorUmaEditor uma={editing} bind:open onsave={save}/>{/if}
<style>
  summary span{font-size:10px;color:var(--text-secondary);margin-left:8px}.build-comparisons>section{padding-top:12px}
  h2 small{font-size:10px;font-weight:400;color:var(--text-secondary);margin-left:6px}.build-actions{display:flex;gap:6px;flex-wrap:wrap}.build-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;gap:16px;align-items:center;border-bottom:1px solid var(--border-subtle);padding:14px 0;font-size:12px}.build-row>div{display:grid;gap:5px;min-width:0}.build-row p,.build-row small{margin:0;font-size:10px;line-height:1.7;color:var(--text-secondary)}.build-row>.build-actions{display:flex}
  .changed-skills{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:10px;margin-top:6px}.changed-skills>span{display:inline-flex;align-items:center;gap:4px}
  @media(max-width:650px){.build-row{grid-template-columns:1fr}.build-row>.build-actions{justify-content:flex-end}}
</style>
