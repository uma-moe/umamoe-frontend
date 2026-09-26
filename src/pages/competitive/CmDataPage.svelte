<script lang="ts">
  import PageFrame from '@/layouts/PageFrame.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Button from '@/components/Button.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import CmStrategy from './CmStrategy.svelte';
  import CmUma from './CmUma.svelte';
  import CmArchetypes from './CmArchetypes.svelte';
  import CmSkills from './CmSkills.svelte';
  import LobbyBuilder from './LobbyBuilder.svelte';
  import type { Summary,Snapshot,Performer,Requirement,Build } from './hakuraku-types';
  import { cmGet,loadCmSummary,styleColors,accessibleColors,number,type Manifest } from './cm-data';
  import { queryText } from './hakuraku-query';
  const params=new URLSearchParams(location.search);
  const allowed=['introduction','strategy','character','archetypes','skills','lobby'];
  const legacyView=params.get('view'),legacyTab=legacyView==='umas'?'character':legacyView==='skills'?'skills':legacyView==='teams'?'archetypes':legacyView==='lobby'?'lobby':'strategy';
  let tab=$state(params.get('tab')==='explore'?legacyTab:allowed.includes(params.get('tab')??'')?params.get('tab')!:'introduction');
  let snapshotId=$state(params.get('snapshot')??''),snapshots=$state<Snapshot[]>([]),data=$state<Summary>(),error=$state(''),manifestError=$state(''),attempt=$state(0),colorblind=$state(false),query=$state(params.get('q')??'');
  let scope=$state(params.get('style')??'all'),selectedUma=$state(''),umaView=$state(legacyView==='umas'?'field':'overview');
  let lobby=$state<Performer[]>([]);
  let visited=$state<string[]>([]);
  $effect(()=>{if(!visited.includes(tab))visited=[...visited,tab];});
  let draft=$state<{mood:string;seed:string;gates:Record<string,string>;edits:Record<string,Build>}>({mood:'5',seed:'',gates:{},edits:{}});
  const snapshot=$derived(snapshots.find(s=>s.snapshotId===snapshotId));
  $effect(()=>{if(snapshot&&!snapshot.skillAnalysis&&tab==='skills')tab='strategy';});
  const colors=$derived(colorblind?accessibleColors:styleColors);
  const tabs=$derived([{id:'introduction',label:'Introduction'},{id:'strategy',label:'Strategy Analysis'},{id:'character',label:'Uma Analysis'},...(snapshot?.skillAnalysis?[{id:'skills',label:'Skill Analysis'}]:[]),{id:'archetypes',label:'Archetype Analysis'},{id:'lobby',label:'Lobby Builder'+(lobby.length?' ('+lobby.length+'/3)':'')}]);
  $effect(()=>{
    attempt;manifestError='';const controller=new AbortController();
    cmGet<Manifest>('/manifest',controller.signal).then(value=>{if(!controller.signal.aborted){if(!Array.isArray(value.snapshots)||!value.snapshots.length)throw new Error('No published snapshots are available.');snapshots=value.snapshots;if(!value.snapshots.some(s=>s.snapshotId===snapshotId))snapshotId=value.snapshots[0]!.snapshotId;}}).catch(e=>{if(!controller.signal.aborted)manifestError=e.message;});
    return()=>controller.abort();
  });
  $effect(()=>{
    const id=snapshot?.snapshotId;attempt;data=undefined;error='';lobby=[];visited=[];draft={mood:'5',seed:'',gates:{},edits:{}};
    if(!id)return;const controller=new AbortController();
    loadCmSummary(id,controller.signal).then(value=>{if(!controller.signal.aborted)data=value;}).catch(e=>{if(!controller.signal.aborted)error=e.message;});
    return()=>controller.abort();
  });
  $effect(()=>{const url=new URL(location.href);url.searchParams.set('tab',tab);url.searchParams.delete('step');url.searchParams.delete('view');if(snapshotId)url.searchParams.set('snapshot',snapshotId);if(query)url.searchParams.set('q',query);else url.searchParams.delete('q');if(tab!=='archetypes')url.searchParams.delete('team');history.replaceState(history.state,'',url);});
  function findTeams(slots:Requirement[]){if(data){query=queryText(slots,data.cards);tab='archetypes';}}
  function removeTeam(team:Performer){lobby=lobby.filter(t=>t.id!==team.id);draft.gates=Object.fromEntries(Object.entries(draft.gates).filter(([key])=>!key.startsWith(team.id+':')));draft.edits=Object.fromEntries(Object.entries(draft.edits).filter(([key])=>!key.startsWith(team.id+':')));}
  function toggleTeam(team:Performer){if(lobby.some(t=>t.id===team.id))removeTeam(team);else if(lobby.length<3)lobby=[...lobby,team];}
</script>
<svelte:head><title>CM Data · uma.moe</title><meta name="description" content="Hakuraku Champions Meeting datasets, strategy and Uma analysis, captured teams, and lobby building in uma.moe."/></svelte:head>
<PageFrame routeId="cm-data" pageTitle="CM Data" labelledby="cm-data-title" width="wide">
<main class="cm-workspace">
  <header class="page-heading"><div><a class="back" href="/competitive"><Icon name="arrow-left" size={14}/> Competitive</a><h1 id="cm-data-title">CM Data <span>uma.moe × Hakuraku</span></h1></div>
    {#if snapshot}<SelectField id="cm-snapshot" label="Dataset" options={snapshots.map(s=>({value:s.snapshotId,label:s.label}))} bind:value={snapshotId}/>{/if}
  </header>
  {#if snapshot}<section class="dataset" aria-label="Dataset summary"><div><h2>{snapshot.meta.course}</h2><p>{snapshot.meta.conditions}</p><small>Teams seen {snapshot.meta.capturedThrough?'through '+snapshot.meta.capturedThrough:snapshot.meta.window} · Equally weighted player appearances</small></div><StatStrip presentation="inline" label="Dataset size" items={[{id:'races',label:'Simulated races',value:number(snapshot.meta.populationRaces)},{id:'teams',label:'Evaluated teams',value:number(snapshot.meta.evaluatedTeams)},{id:'players',label:'Players',value:number(snapshot.meta.populationOwners)}]}/></section>{/if}
  {#if manifestError||error}<div class="message" role="alert"><p>{manifestError||error}</p><Button variant="secondary" onclick={()=>attempt++}>Retry data</Button></div>{/if}
  {#if !snapshots.length&&!manifestError}<p role="status">Loading Hakuraku datasets…</p>{/if}
  {#if data&&snapshot}
    <div class="navigation"><Tabs items={tabs} bind:value={tab} label="Champions Meeting views" controls="cm-panel" variant="pills"/><Checkbox id="cm-palette" label="Colorblind palette" bind:checked={colorblind}/></div>
    <div id="cm-panel" class="stack">
      {#if tab==='introduction'}<section class="introduction"><h2>Champions Meeting analysis</h2><p>Explore Hakuraku’s published simulations of captured Champions Meeting teams. Start with running styles and room compositions, inspect individual Umas and skill activations, or find the builds behind the results.</p>
        <div class="intro-links">{#each tabs.filter(item=>item.id!=='introduction') as item}<Button variant="secondary" onclick={()=>tab=item.id}>{item.label} →</Button>{/each}</div>
        <h3>Reading the data</h3><p>These are simulated results, not the original race outcomes. Player appearances are weighted equally. The neutral baseline is 11.1% for an individual Uma and 33.3% for a team. An Uma’s associated team win rate includes wins by its teammates.</p><p>Player counts can overlap across Umas and styles. Confidence intervals and minimum player filters help distinguish broad patterns from small samples.</p><a href="/research/new-age-umamusume-data">How Hakuraku builds the dataset →</a>
        <h3>From statistics to captured builds</h3><p>Select a representative or a style composition to find matching teams. Add three captured teams to Lobby Builder to prepare a nine-runner room. Running a simulation and generating its replay require the simulation backend, which is not connected here.</p>
      </section>{/if}
      {#if visited.includes('strategy')}<div hidden={tab!=='strategy'}><CmStrategy {data} {colors} scope={scope} onstyle={value=>scope=value} onteams={findTeams}/></div>{/if}
      {#if visited.includes('character')}<div hidden={tab!=='character'}><CmUma {data} {colors} {colorblind} bind:selected={selectedUma} bind:view={umaView} onteams={findTeams}/></div>{/if}
      {#if visited.includes('skills')&&snapshot.skillAnalysis}<div hidden={tab!=='skills'}><CmSkills {snapshot}/></div>{/if}
      {#if visited.includes('archetypes')}<div hidden={tab!=='archetypes'}><CmArchetypes {data} bind:query {lobby} ontoggle={toggleTeam} onlobby={()=>tab='lobby'}/></div>{/if}
      {#if visited.includes('lobby')}<div hidden={tab!=='lobby'}><LobbyBuilder {data} teams={lobby} bind:draft onbrowse={()=>tab='archetypes'} onremove={removeTeam} onclear={()=>{lobby=[];draft.gates={};draft.edits={};}}/></div>{/if}
    </div>
    <footer class="data-footer"><span>Hakuraku published data · {number(data.meta.populationRaces)} simulated races · {number(data.meta.populationOwners)} players</span><div><a href="https://hakuraku.moe/simdata" target="_blank" rel="noreferrer">Original Hakuraku ↗</a><a href="/hakuraku/LICENSE" target="_blank" rel="noreferrer">MIT license ↗</a></div></footer>
  {:else if snapshot&&!error}<p role="status">Loading snapshot…</p>{/if}
</main>
</PageFrame>
<style>
.cm-workspace{--cm-tint:var(--color-accent-soft);padding:20px var(--page-gutter-current) 32px;min-width:0;color:var(--color-text)}
.page-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:20px}.back{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-secondary);text-decoration:none}h1{font-size:28px;letter-spacing:-.035em;margin:8px 0 0;line-height:1.2}h1 span{font-size:12px;font-weight:400;letter-spacing:0;color:var(--text-secondary);margin-left:12px}.page-heading>:global(.field){width:320px;max-width:100%}
.dataset{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 20px;background:var(--surface-1);border-radius:var(--radius-lg);margin-bottom:18px}.dataset h2{font-size:16px;margin:0 0 5px}.dataset p{font-size:12px;margin:0 0 6px;color:var(--text-secondary)}.dataset small{font-size:10px;color:var(--text-secondary)}.dataset>:global(.stats-container){flex:none;width:440px;max-width:100%}.dataset :global(.stats){min-width:0}.dataset :global(.stats>div){padding:0 20px}.dataset :global(dd){font-size:23px}
.navigation{display:flex;align-items:center;gap:16px;justify-content:space-between;margin-bottom:20px;min-width:0}.navigation>:global(.tabs){min-width:0}.navigation>:global(.checkbox){flex:none}.navigation :global(.checkbox strong){font-size:11px;font-weight:400}
.stack{min-width:0}.introduction{max-width:900px;background:var(--surface-1);padding:24px;border-radius:var(--radius-lg)}.introduction h2{font-size:20px;margin:0 0 12px}.introduction h3{font-size:15px;margin:24px 0 10px}.introduction p{font-size:13px;line-height:1.8;color:var(--text-secondary)}.introduction a{font-size:12px}.intro-links{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}
.data-footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-top:18px;margin-top:28px;border-top:1px solid var(--border-subtle);font-size:10px;color:var(--text-secondary)}.data-footer>div{display:flex;gap:18px}.data-footer a{color:inherit}
@media(max-width:1200px){.navigation{flex-wrap:wrap;gap:10px}.navigation>:global(.tabs){width:100%}.navigation>:global(.checkbox){margin-left:auto}}
@media(max-width:900px){.dataset{align-items:start;flex-direction:column;gap:18px}.dataset>:global(.stats-container){width:100%}.dataset :global(.stats>div:first-child){padding-left:0}}
@media(max-width:600px){.cm-workspace{padding:16px 12px 28px}.page-heading{flex-wrap:wrap;gap:16px}.page-heading>:global(.field){width:100%}h1{font-size:26px}h1 span{font-size:10px}.dataset{padding:14px}.dataset :global(.stats>div){padding:0 12px}.dataset :global(dd){font-size:20px}.introduction{padding:16px}.navigation{margin-bottom:16px}}
</style>
