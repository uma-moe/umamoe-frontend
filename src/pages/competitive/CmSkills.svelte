<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snapshot } from './hakuraku-types';
  import { cmGet,snapshotPath,pct,number,styleNames,styleOrder } from './cm-data';
  import { skillStyles,type SkillOverview } from './cm-exploration';
  import { loadSkillCatalog,resolveEncodedSkill,type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import Icon from '@/components/Icon.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import CmSkillLanes from './CmSkillLanes.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  let {snapshot,style=$bindable('all')}:{snapshot:Snapshot;style?:string}=$props();
  let overview=$state<SkillOverview>(),error=$state(''),attempt=$state(0),search=$state(''),selected=$state<number[]>([]),expandedSkill=$state<number>(),comparison=$state<HTMLElement>();
  let catalog=$state.raw(new Map<number,SkillCatalogEntry>());
  const name=(id:number)=>resolveEncodedSkill(catalog,id).skill?.name??'Skill '+id;
  onMount(()=>{void loadSkillCatalog().then(c=>catalog=c).catch(()=>{});});
  $effect(()=>{
    const id=snapshot.snapshotId;attempt;overview=undefined;error='';selected=[];expandedSkill=undefined;
    const controller=new AbortController();
    cmGet<SkillOverview>(snapshotPath(id,'skills/overview'),controller.signal,id).then(v=>{if(!controller.signal.aborted)overview=v;}).catch(e=>{if(!controller.signal.aborted)error=e.message;});
    return()=>controller.abort();
  });
  const skills=$derived.by(()=>{
    const grouped=new Map<number,{id:number;players:number;owned:number;active:number;procs:number;wins:number}>();
    for(const [id,key,owners,owned,active,procs,,wins] of overview?.rows??[]){
      if(style!=='all'&&Number(style)!==skillStyles[key])continue;
      const row=grouped.get(id)??{id,players:style==='all'?overview?.allPlayerCounts[id]??0:0,owned:0,active:0,procs:0,wins:0};
      if(style!=='all')row.players+=owners;row.owned+=owned;row.active+=active;row.procs+=procs;row.wins+=wins;grouped.set(id,row);
    }
    return [...grouped.values()].sort((a,b)=>b.players-a.players).map(r=>({...r,name:name(r.id),activation:r.active/Math.max(1,r.owned),winrate:r.wins/Math.max(1,r.active)}));
  });
  const rows=$derived(skills.filter(r=>(r.name+' '+r.id).toLowerCase().includes(search.trim().toLowerCase())));
  function inspect(id:number){expandedSkill=expandedSkill===id?undefined:id;}
  function toggle(id:number){selected=selected.includes(id)?selected.filter(value=>value!==id):[...selected,id];}
  const comparisonOptions=$derived(skills.filter(row=>!selected.includes(row.id)).map(row=>({value:String(row.id),label:row.name+' [Id '+row.id+']'})));
</script>
{#if error}<p role="alert">{error} <Button size="sm" onclick={()=>attempt++}>Retry</Button></p>{:else if !overview}<p role="status">Loading skill data…</p>{:else}
  <div class="toolbar"><TextField id="cm-skill-search" type="search" label="Search skills" bind:value={search} placeholder="Skill name or ID" prefixIcon="search"/><SelectField id="cm-skill-style" label="Running style" bind:value={style} options={[{value:'all',label:'All styles'},...styleOrder.filter(id=>id!==6).map(id=>({value:String(id),label:styleNames[id]!}))]}/><p>{number(overview.players)} players · {number(overview.races)} simulated races</p></div>
  <section class="skill-list"><header><div><h2>Skill performance <span>{rows.length} skills</span></h2><p>Click a row for activation distances. Use Compare to add skills below.</p></div>{#if selected.length}<Button variant="secondary" size="sm" onclick={()=>comparison?.scrollIntoView({block:'nearest',behavior:'instant'})}>Compare selected ({selected.length}) ↓</Button>{/if}</header>
    <DataTable plain compact caption="CM Skill Analysis" maxHeight={580} sortKey="players" sortDirection="descending" expandedRow={expandedSkill} onrowclick={row=>inspect(Number(row.id))} emptyMessage="No skills match these filters." columns={[{key:'name',label:'Skill'},{key:'players',label:'Players',numeric:true},{key:'owned',label:'Learned entries',numeric:true},{key:'active',label:'Activated entries',numeric:true},{key:'activation',label:'Activation%',numeric:true},{key:'procs',label:'Procs',numeric:true},{key:'winrate',label:'Win% when active',numeric:true},{key:'timing',label:'Compare',sortable:false}]} {rows}>
      {#snippet cell(row,column)}
        {#if column.key==='name'}<button class="skill-select" class:active={expandedSkill===Number(row.id)} aria-label={'Inspect '+row.name} aria-expanded={expandedSkill===Number(row.id)} aria-controls={expandedSkill===Number(row.id)?'cm-skill-detail':undefined} onclick={()=>inspect(Number(row.id))}><span class="chevron" class:open={expandedSkill===Number(row.id)}><Icon name="chevron" size={16}/></span><span class="skill-label"><RaceSkill id={Number(row.id)}/><small>[Id {row.id}]</small></span></button>
        {:else if column.key==='timing'}<Button variant={selected.includes(Number(row.id))?'primary':'secondary'} size="sm" ariaLabel={(selected.includes(Number(row.id))?'Remove ':'Add ')+row.name+(selected.includes(Number(row.id))?' from comparison':' to comparison')} ariaPressed={selected.includes(Number(row.id))} onclick={()=>toggle(Number(row.id))}>{selected.includes(Number(row.id))?'Remove':'Compare'}</Button>
        {:else if column.key==='activation'||column.key==='winrate'}{pct(Number(row[column.key]))}{:else}{number(Number(row[column.key]))}{/if}
      {/snippet}
      {#snippet rowDetail(row)}<section id="cm-skill-detail" class="skill-detail" aria-label={row.name+' activation details'}><CmSkillLanes overview={overview!} {style} selected={[Number(row.id)]} removable={false}/></section>{/snippet}
    </DataTable>
    {#if !rows.length}<Button variant="secondary" size="sm" onclick={()=>{search='';style='all';}}>Reset skill filters</Button>{/if}
    <p class="caption">Entries count simulated runner appearances. Win rate when active describes association, not the skill’s isolated effect. Debuffers are included under their running strategy.</p>
  </section>
  <section class="comparison" bind:this={comparison} aria-label="Skill comparison"><header><div><h2>Compare activation distances <span>{selected.length} skill{selected.length===1?'':'s'} · {number(overview.courseDistance)} m</span></h2><p>Compare when skills fire on the same course, with a shared distance cursor.</p></div>{#if selected.length}<Button variant="ghost" size="sm" onclick={()=>selected=[]}>Clear comparison</Button>{/if}</header>
    <div class="comparison-add"><Combobox id="cm-comparison-add" label="Add a skill to comparison" placeholder="Search by skill name or ID…" prefixIcon="search" action options={comparisonOptions} onchange={value=>{const id=Number(value);if(!selected.includes(id))selected=[...selected,id];}} emptyText="No more matching skills in this running style."/></div>
    {#if selected.length}<CmSkillLanes {overview} {style} bind:selected/>{:else}<p class="comparison-empty">Use <strong>Compare</strong> in the list or search above to add skills here. Opening a skill’s details keeps your comparison intact.</p>{/if}
  </section>
{/if}
<style>
.toolbar{display:flex;gap:14px;flex-wrap:wrap;align-items:end;margin-bottom:16px}.toolbar>:global(.field){flex:1;max-width:290px;min-width:170px}.toolbar p{margin-left:auto}.skill-list,.comparison{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:18px 20px}.comparison{margin-top:18px;scroll-margin-top:80px}
header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px}h2{font-size:16px;letter-spacing:-.02em;margin:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:12px}h2>span{font-size:11px;font-weight:400;color:var(--text-secondary)}p{font-size:11px;color:var(--text-secondary);line-height:1.6;margin:6px 0 0}.caption{font-size:10px;margin-top:10px}
.skill-select{display:flex;align-items:center;gap:8px;min-height:36px;width:100%;border:0;background:transparent;padding:2px 0;text-align:left;cursor:pointer;color:var(--text-secondary)}.skill-select.active,.skill-select:hover{color:var(--accent-primary)}.skill-label{display:flex;align-items:center;gap:8px;min-width:0}.skill-label small{flex:none;font-size:10px;font-weight:400;line-height:1.2;color:var(--text-secondary);font-variant-numeric:tabular-nums}.comparison-add{max-width:420px;margin:14px 0 18px}.chevron{display:flex;flex:none;transform:rotate(-90deg)}.chevron.open{transform:none}
.skill-list :global(tr:not(.detail-row)>td:first-child),.skill-list :global(th:first-child){position:sticky;left:0;background:var(--surface-1);z-index:1}.skill-list :global(th:first-child){z-index:3}.skill-list :global(tr.interactive:hover>td:first-child),.skill-list :global(tr.interactive:focus-within>td:first-child){background:var(--surface-2)}.skill-list :global(td){font-size:11px}.skill-list :global(th){font-size:10px;background:var(--surface-1)}.skill-list :global(.skill-chip){max-width:230px}.skill-list :global(.sort){gap:5px}.skill-list :global(th:last-child),.skill-list :global(tr:not(.detail-row)>td:last-child){width:1%;text-align:right;padding-right:0}.skill-detail{padding:14px 18px;background:var(--color-accent-soft);border-block:1px solid var(--border-subtle)}.comparison-empty{padding:6px 0;font-size:12px}
@media(max-width:600px){.skill-list,.comparison{padding:14px 12px}.toolbar p{margin:0;width:100%}.toolbar>:global(.field){max-width:none}.skill-list :global(.skill-chip){max-width:170px}.skill-detail{padding:12px}.skill-list :global(.bounded){max-height:520px!important}.comparison{scroll-margin-top:60px}}
</style>
