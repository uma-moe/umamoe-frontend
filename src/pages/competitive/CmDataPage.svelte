<script lang="ts">
  import Spinner from '@/components/Spinner.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import type { TabItem } from '@/components/Tabs.svelte';
  import CmOverview from './CmOverview.svelte';
  import CmStrategy from './CmStrategy.svelte';
  import CmUma from './CmUma.svelte';
  import CmArchetypes from './CmArchetypes.svelte';
  import CmSkills from './CmSkills.svelte';
  import LobbyBuilder from './LobbyBuilder.svelte';
  import type { Summary,Snapshot,Performer,Requirement,Build,TeamDetail } from './hakuraku-types';
  import { cmGet,snapshotPath,loadCmSummary,styleColors,accessibleColors,number,type Manifest } from './cm-data';
  import { queryText } from './hakuraku-query';
  const params=new URLSearchParams(location.search);
  const allowed=['introduction','strategy','character','archetypes','skills','lobby'];
  const legacyView=params.get('view'),legacyTab=legacyView==='umas'?'character':legacyView==='skills'?'skills':legacyView==='teams'?'archetypes':legacyView==='lobby'?'lobby':'strategy';
  let tab=$state(params.get('tab')==='explore'?legacyTab:allowed.includes(params.get('tab')??'')?params.get('tab')!:'introduction');
  let snapshotId=$state(params.get('snapshot')??''),snapshots=$state<Snapshot[]>([]),data=$state<Summary>(),error=$state(''),manifestError=$state(''),attempt=$state(0),colorblind=$state(false),query=$state(params.get('q')??'');
  let scope=$state(params.get('style')??'all'),selectedUma=$state(''),umaView=$state(legacyView==='umas'?'field':'overview');
  let lobby=$state<Performer[]>([]);
  let pendingTeams=$state<string[]>([]);
  let teamDraft=$state<{key:string;build:Build}[]>([]),pendingRunners=$state<string[]>([]),teamError=$state('');
  let customTeamId=0;
  let visited=$state<string[]>([]);
  $effect(()=>{if(!visited.includes(tab))visited=[...visited,tab];});
  let draft=$state<{mood:string;seed:string;gates:Record<string,string>;edits:Record<string,Build>}>({mood:'5',seed:'',gates:{},edits:{}});
  const snapshot=$derived(snapshots.find(s=>s.snapshotId===snapshotId));
  $effect(()=>{if(snapshot&&!snapshot.skillAnalysis&&tab==='skills')tab='strategy';});
  const colors=$derived(colorblind?accessibleColors:styleColors);
  const tabs:TabItem[]=$derived([{id:'introduction',label:'Introduction',icon:'info'},{id:'strategy',label:'Strategy Analysis',icon:'chart'},{id:'character',label:'Uma Analysis',icon:'users'},...(snapshot?.skillAnalysis?[{id:'skills',label:'Skill Analysis',icon:'star' as const}]:[]),{id:'archetypes',label:'Archetype Analysis',icon:'grid'},{id:'lobby',label:'Lobby Builder',icon:'race',badge:lobby.length?lobby.length+'/3':undefined}]);
  $effect(()=>{
    attempt;manifestError='';const controller=new AbortController();
    cmGet<Manifest>('/manifest',controller.signal).then(value=>{if(!controller.signal.aborted){if(!Array.isArray(value.snapshots)||!value.snapshots.length)throw new Error('No published snapshots are available.');snapshots=value.snapshots;if(!value.snapshots.some(s=>s.snapshotId===snapshotId))snapshotId=value.snapshots[0]!.snapshotId;}}).catch(e=>{if(!controller.signal.aborted)manifestError=e.message;});
    return()=>controller.abort();
  });
  $effect(()=>{
    const id=snapshot?.snapshotId;attempt;data=undefined;error='';lobby=[];pendingTeams=[];teamDraft=[];pendingRunners=[];teamError='';visited=[];draft={mood:'5',seed:'',gates:{},edits:{}};
    if(!id)return;const controller=new AbortController();
    loadCmSummary(id,controller.signal).then(value=>{if(!controller.signal.aborted)data=value;}).catch(e=>{if(!controller.signal.aborted)error=e.message;});
    return()=>controller.abort();
  });
  $effect(()=>{const url=new URL(location.href);url.searchParams.set('tab',tab);url.searchParams.delete('step');url.searchParams.delete('view');if(snapshotId)url.searchParams.set('snapshot',snapshotId);if(scope!=='all')url.searchParams.set('style',scope);else url.searchParams.delete('style');if(query)url.searchParams.set('q',query);else url.searchParams.delete('q');if(tab!=='archetypes')url.searchParams.delete('team');history.replaceState(history.state,'',url);});
  function findTeams(slots:Requirement[]){if(data){query=queryText(slots,data.cards);tab='archetypes';}}
  function removeTeam(team:Performer){lobby=lobby.filter(t=>t.id!==team.id);draft.gates=Object.fromEntries(Object.entries(draft.gates).filter(([key])=>!key.startsWith(team.id+':')));draft.edits=Object.fromEntries(Object.entries(draft.edits).filter(([key])=>!key.startsWith(team.id+':')));}
  function moveRunner(sourceId:string,sourceIndex:number,targetId:string,targetIndex:number){
    const source=lobby.find(team=>team.id===sourceId),target=lobby.find(team=>team.id===targetId);
    if(!source||!target||source===target||!source.members[sourceIndex]||!target.members[targetIndex])return;
    const nextSourceId=source.custom?source.id:'custom:'+ ++customTeamId,nextTargetId=target.custom?target.id:'custom:'+ ++customTeamId;
    const sourceKey=source.id+':'+sourceIndex,targetKey=target.id+':'+targetIndex;
    const movedKey=(key:string)=>key===sourceKey?nextTargetId+':'+targetIndex:key===targetKey?nextSourceId+':'+sourceIndex:key.startsWith(source.id+':')?nextSourceId+key.slice(source.id.length):key.startsWith(target.id+':')?nextTargetId+key.slice(target.id.length):key;
    lobby=lobby.map(team=>{
      if(team!==source&&team!==target)return team;
      const members=team.members.map((member,index)=>team===source&&index===sourceIndex?target.members[targetIndex]!:team===target&&index===targetIndex?source.members[sourceIndex]!:member);
      return {...team,id:team===source?nextSourceId:nextTargetId,members,custom:true,wins:0,n:0,ci:[0,0],memberWins:members.map(()=>0)};
    });
    draft.gates=Object.fromEntries(Object.entries(draft.gates).map(([key,value])=>[movedKey(key),value]));
    draft.edits=Object.fromEntries(Object.entries(draft.edits).map(([key,value])=>[movedKey(key),value]));
  }
  async function toggleTeam(team:Performer){
    if(lobby.some(t=>t.id===team.id)){removeTeam(team);return;}
    if(!data||lobby.length+pendingTeams.length>=3||pendingTeams.includes(team.id))return;
    const snapshot=data.snapshotId;pendingTeams=[...pendingTeams,team.id];teamError='';
    try{
      const detail=await cmGet<TeamDetail>(snapshotPath(snapshot,'teams/'+encodeURIComponent(team.id)),new AbortController().signal,snapshot);
      if(data?.snapshotId===snapshot&&pendingTeams.includes(team.id)&&lobby.length<3)lobby=[...lobby,detail.team];
    }catch(error){if(data?.snapshotId===snapshot)teamError=error instanceof Error?error.message:'Could not load the captured team.';}
    finally{if(data?.snapshotId===snapshot)pendingTeams=pendingTeams.filter(id=>id!==team.id);}
  }
  async function toggleRunner(team:Performer,index:number){
    const key=team.id+':'+index;
    if(teamDraft.some(r=>r.key===key)){teamDraft=teamDraft.filter(r=>r.key!==key);return;}
    if(teamDraft.length+pendingRunners.length>=3||pendingRunners.includes(key)||!data)return;
    const snapshot=data.snapshotId;pendingRunners=[...pendingRunners,key];teamError='';
    try{
      const detail=await cmGet<TeamDetail>(snapshotPath(snapshot,'teams/'+encodeURIComponent(team.id)),new AbortController().signal,snapshot);
      const build=detail.team.members[index];
      if(!build)throw new Error('This captured runner is unavailable.');
      if(data?.snapshotId===snapshot&&pendingRunners.includes(key))teamDraft=[...teamDraft,{key,build}];
    }catch(error){if(data?.snapshotId===snapshot)teamError=error instanceof Error?error.message:'Could not load the captured build.';}
    finally{if(data?.snapshotId===snapshot)pendingRunners=pendingRunners.filter(r=>r!==key);}
  }
  function addCustomTeam(){
    if(teamDraft.length!==3||lobby.length+pendingTeams.length>=3||pendingRunners.length)return;
    lobby=[...lobby,{id:'custom:'+ ++customTeamId,owner:{id:'custom',names:['Custom team']},members:teamDraft.map(r=>r.build),wins:0,n:0,ci:[0,0],memberWins:[0,0,0],custom:true}];
    teamDraft=[];tab='lobby';
  }
</script>
<svelte:head><title>CM Data · uma.moe</title><meta name="description" content="Hakuraku Champions Meeting datasets, strategy and Uma analysis, captured teams, and lobby building in uma.moe."/></svelte:head>
<AppPage routeId="cm-data" title="CM Data" description="Champions Meeting statistics · Hakuraku × uma.moe" width="wide">
  {#snippet actions()}{#if snapshot}<Button variant="secondary" size="sm" icon="veterans" href={'/simulator/race?team-search=1&cm-snapshot='+encodeURIComponent(snapshotId)}>Find my best team</Button><div class="dataset-picker"><SelectField id="cm-snapshot" label="Dataset" options={snapshots.map(s=>({value:s.snapshotId,label:s.label}))} bind:value={snapshotId}/></div>{/if}{/snippet}
<div class="cm-workspace">
  {#if snapshot}<section class="dataset" aria-label="Dataset summary">
    <div class="course"><Icon name="race" size={22}/><div><h2>{snapshot.meta.course}</h2><p>{snapshot.meta.conditions}</p></div></div>
    <dl class="dataset-stats"><div><dt>Simulated races</dt><dd>{number(snapshot.meta.populationRaces)}</dd></div><div><dt>Evaluated teams</dt><dd>{number(snapshot.meta.evaluatedTeams)}</dd></div><div><dt>Players</dt><dd>{number(snapshot.meta.populationOwners)}</dd></div></dl>
  </section>{/if}
  {#if manifestError||error}<div class="message" role="alert"><p>{manifestError||error}</p><Button variant="secondary" onclick={()=>attempt++}>Retry data</Button></div>{/if}
  {#if !snapshots.length&&!manifestError}<Spinner size={48} centered minHeight="clamp(320px, 60dvh, 700px)" label="Loading Hakuraku datasets…"/>{/if}
  {#if data&&snapshot}
    <div class="navigation"><Tabs compact items={tabs} bind:value={tab} label="Champions Meeting views" controls="cm-panel" variant="pills"/><details class="display-settings"><summary><Icon name="tune" size={15}/> Display</summary><div><Checkbox id="cm-palette" label="Colorblind palette" bind:checked={colorblind}/><p>Changes running-style colours throughout the analysis.</p></div></details></div>
    <div id="cm-panel" class="stack" role="tabpanel" aria-label={tabs.find(t=>t.id===tab)?.label}>
      {#if tab==='introduction'}
      <CmOverview {data} {colors} onstyle={value=>{scope=value;tab='strategy';}} onuma={key=>{selectedUma=key;umaView='overview';tab='character';}} onteams={findTeams} onview={value=>tab=value}/>
      <section class="introduction">
        <div class="intro-heading"><h2>Understand the meeting</h2><p>Published simulations of captured Champions Meeting teams. Choose an analysis to explore the field, then follow a composition or Uma to its captured builds.</p></div>
        <div class="reading-guide"><section><h3>Reading the results</h3><p>These are simulated results, not the original race outcomes. Player appearances are weighted equally. Neutral win rates are <strong>11.1% per Uma</strong> and <strong>33.3% per team</strong>.</p><p>Associated team win rate includes wins by an Uma’s teammates. Player counts can overlap; use the minimum-player filters and confidence intervals to judge sample size.</p><a href="/research/new-age-umamusume-data">Read the dataset methodology →</a></section>
        <section><h3>Explore the builds behind the numbers</h3><p>Choose a style representative or team composition to find matching captured teams. Add captured teams or combine individual Uma into your own team, then prepare a nine-runner room in Lobby Builder.</p><p>Open a captured build, team or lobby in the simulator to review its setup and run races.</p><Button variant="secondary" size="sm" onclick={()=>tab='archetypes'}>Browse captured teams →</Button></section></div>
      </section>{/if}
      {#if visited.includes('strategy')}<div hidden={tab!=='strategy'}><CmStrategy {data} {colors} scope={scope} onstyle={value=>scope=value} onteams={findTeams}/></div>{/if}
      {#if visited.includes('character')}<div hidden={tab!=='character'}><CmUma {data} {colors} {colorblind} bind:selected={selectedUma} bind:view={umaView} onteams={findTeams}/></div>{/if}
      {#if visited.includes('skills')&&snapshot.skillAnalysis}<div hidden={tab!=='skills'}><CmSkills {snapshot}/></div>{/if}
      {#if visited.includes('archetypes')}<div hidden={tab!=='archetypes'}><CmArchetypes {data} {colors} {snapshot} bind:query {lobby} {teamDraft} {pendingTeams} {pendingRunners} {teamError} onrunner={toggleRunner} onbuildteam={addCustomTeam} onremoverunner={key=>teamDraft=teamDraft.filter(r=>r.key!==key)} onclearteam={()=>teamDraft=[]} ontoggle={toggleTeam} onlobby={()=>tab='lobby'}/></div>{/if}
      {#if visited.includes('lobby')}<div hidden={tab!=='lobby'}><LobbyBuilder {data} {colors} {snapshot} teams={lobby} bind:draft onmove={moveRunner} onbrowse={()=>tab='archetypes'} onremove={removeTeam} onclear={()=>{lobby=[];pendingTeams=[];draft.gates={};draft.edits={};}}/></div>{/if}
    </div>
    <footer class="data-footer"><span>Teams seen {snapshot.meta.capturedThrough?'through '+snapshot.meta.capturedThrough:snapshot.meta.window} · Equally weighted player appearances</span></footer>
  {:else if snapshot&&!error}<Spinner size={48} centered minHeight="clamp(320px, 60dvh, 700px)" label="Loading snapshot…"/>{/if}
</div>
</AppPage>
<style>
.cm-workspace{--cm-tint:var(--color-accent-soft);--control-height:32px;min-width:0;color:var(--color-text)}.cm-workspace :global(.select-control){font-size:12px}.dataset-picker{width:330px;max-width:100%}
.dataset{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:14px 18px;background:var(--surface-1);border-radius:var(--radius-md);margin-bottom:12px}.course{display:flex;gap:12px;align-items:center;min-width:0}.course>:global(svg){color:var(--accent-primary);flex:none}.course h2{font-size:14px;margin:0 0 4px;line-height:1.4}.course p{font-size:11px;margin:0;color:var(--text-secondary)}.dataset-stats{display:flex;gap:24px;margin:0;flex:none}.dataset-stats>div{padding-left:24px;border-left:1px solid var(--border-subtle)}.dataset-stats dt{font-size:10px;color:var(--text-secondary)}.dataset-stats dd{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.03em;margin:4px 0 0}
.navigation{display:flex;align-items:center;gap:12px;justify-content:space-between;margin-bottom:14px;min-width:0}.navigation>:global(.tabs){min-width:0}.display-settings{position:relative;flex:none;font-size:11px}.display-settings summary{display:flex;gap:6px;align-items:center;cursor:pointer;list-style:none;padding:10px;color:var(--text-secondary)}.display-settings summary::-webkit-details-marker{display:none}.display-settings>div{position:absolute;right:0;top:100%;width:240px;padding:16px;background:var(--surface-2);border-radius:var(--radius-md);box-shadow:var(--shadow-lg);z-index:10}.display-settings p{font-size:11px;color:var(--text-secondary);line-height:1.6;margin:10px 0 0}
.stack{min-width:0}.stack :global(.chart-frame.surface:not(.compact)){padding:16px;gap:12px}.stack :global(.surface h3){font-size:15px}.stack :global(.surface:not(.compact) figcaption){padding-bottom:10px;gap:10px}.stack :global(.surface p){font-size:11px;margin-top:4px}.introduction{margin-top:18px;padding:18px 0 0;border-top:1px solid var(--border-subtle)}.intro-heading{max-width:900px}.introduction h2{font-size:20px;margin:0 0 8px}.introduction h3{font-size:15px;margin:0 0 12px}.introduction p{font-size:13px;line-height:1.75;color:var(--text-secondary)}.introduction a{font-size:12px}.reading-guide{display:grid;grid-template-columns:1fr 1fr;gap:36px;padding:20px 0}
.data-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:16px;margin-top:24px;border-top:1px solid var(--border-subtle);font-size:10px;color:var(--text-secondary)}
@media(max-width:1100px){.dataset-stats{gap:14px}.dataset-stats>div{padding-left:14px}.dataset-stats dd{font-size:17px}.navigation{align-items:start}.navigation>:global(.tabs){flex:1}.navigation :global(.tab){min-width:0;padding-inline:10px}}
@media(max-width:767px){.cm-workspace{padding-inline:12px}.dataset{align-items:start;flex-direction:column;gap:14px;padding:14px}.dataset-stats{width:100%;justify-content:space-between;gap:8px}.dataset-stats>div{padding-left:12px}.dataset-stats>div:first-child{border:0;padding:0}.dataset-stats dd{font-size:17px}.navigation{gap:4px}.display-settings summary{font-size:0;padding:10px 6px}.reading-guide{grid-template-columns:1fr}.reading-guide{gap:24px}.dataset-picker{width:min(100%,350px)}}
</style>
