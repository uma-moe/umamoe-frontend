<script lang="ts">
  import { simulatorUmaFromCm } from '@/pages/simulator/simulator-uma';
  import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
  import { onMount } from 'svelte';
  import type { Summary,Performer,Build,TeamDetail,TeamSearchResponse,TeamDistributionResponse,TeamMatcher,Requirement,Snapshot } from './hakuraku-types';
  import { cmGet,snapshotPath,pct,number,buildRunner,styleOrder,styleNames } from './cm-data';
  import { parseQuery,queryText,SHORT_STYLE,hasRequirement } from './hakuraku-query';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import {virtualScroll,type VirtualRange} from '@/lib/virtual-scroll';
  import Dialog from '@/components/Dialog.svelte';
  import Disclosure from '@/components/Disclosure.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import RunnerBuildDetails from './RunnerBuildDetails.svelte';
  import RunnerBuildGroup from './RunnerBuildGroup.svelte';
  import RunnerTraining from './RunnerTraining.svelte';
  import RunnerLineupRow from './RunnerLineupRow.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import { portrait } from './analysis-view';
  import { theme } from '@/stores/theme';
  let {data,colors,snapshot,query=$bindable(''),lobby,teamDraft,pendingTeams,pendingRunners,teamError,onrunner,onbuildteam,onremoverunner,onclearteam,ontoggle,onlobby}:{data:Summary;snapshot?:Snapshot;colors:Record<number,string>;query?:string;lobby:Performer[];pendingTeams:string[];teamDraft:{key:string;build:Build}[];pendingRunners:string[];teamError:string;onrunner:(team:Performer,index:number)=>void;onbuildteam:()=>void;onremoverunner:(key:string)=>void;onclearteam:()=>void;ontoggle:(team:Performer)=>void;onlobby:()=>void}=$props();
  let simBusy=$state(false),simError=$state('');
  async function simulate(builds:Build[],replace=false){
    simBusy=true;simError='';
    try{await openSimulatorField(builds.map(build=>simulatorUmaFromCm(build,data,replace?1:0)),{replace,raceInstanceId:snapshot?.raceInstanceId,startTimeType:snapshot?.startTimeType});selected='';}
    catch(error){simError=(error as Error).message;}finally{simBusy=false;}
  }
  let mode=$state('all'),sort=$state('lower'),offset=$state(0),loading=$state(false),exhausted=$state(false),range=$state<VirtualRange>({start:0,end:0}),attempt=$state(0),result=$state<TeamSearchResponse>(),distribution=$state<TeamDistributionResponse>(),error=$state(''),distributionError=$state('');
  let filtersOpen=$state(true),showStats=$state(true),distributionExpanded=$state(false);
  let buildTeam=$state(false);
  const selectedRunners=$derived(new Set(teamDraft.map(r=>r.key)));
  let advancedOpen=$state(false),ruleTarget=$state('exclude'),ruleUma=$state(''),ruleStyle=$state('');
  let fieldGraphHeight=$state(144);
  let mobileTraining=$state(false);
  let selected=$state(''),detail=$state<TeamDetail>(),detailError=$state(''),copied=$state(false);
  const parsed=$derived.by(()=>{try{return {slots:parseQuery(query,data.cards),error:''};}catch(e){return {slots:[],error:(e as Error).message};}});
  onMount(()=>{
    const narrow=matchMedia('(max-width:1050px)');
    const mobile=matchMedia('(max-width:767px)');
    const adapt=()=>filtersOpen=!narrow.matches||Boolean(query);
    const adaptTraining=()=>mobileTraining=mobile.matches;
    adapt();narrow.addEventListener('change',adapt);
    adaptTraining();mobile.addEventListener('change',adaptTraining);
    return()=>{narrow.removeEventListener('change',adapt);mobile.removeEventListener('change',adaptTraining);};
  });
  $effect(()=>{if(query)filtersOpen=true;});
  const activeFilters=$derived(parsed.slots.filter(hasRequirement).length);
  const advancedCount=$derived(parsed.slots.reduce((count,slot)=>count+(slot.exclude?1:Math.max(0,(slot.anyOf?.length??1)-1)),0));
  const ruleMatcher=$derived(selectionMatcher(ruleUma,ruleStyle));
  const ruleOptions=$derived(parsed.slots[Number(ruleTarget)]?.anyOf??[parsed.slots[Number(ruleTarget)]??{}]);
  const ruleHasBase=$derived(ruleTarget==='exclude'||hasRequirement(parsed.slots[Number(ruleTarget)]??{}));
  const ruleRows=$derived([0,1,2].map(index=>({value:String(index),label:'Runner '+(index+1)+' · '+((parsed.slots[index]?.anyOf??[parsed.slots[index]??{}]).filter(hasRequirement).map(matcherLabel).join(' or ')||'Any runner')})));
  const ruleDuplicate=$derived(hasRequirement(ruleMatcher)&&(ruleTarget==='exclude'
    ?parsed.slots.some(slot=>slot.exclude&&sameMatcher(slot,ruleMatcher))
    :ruleOptions.some(option=>sameMatcher(option,ruleMatcher))));
  const lobbyIds=$derived(new Set(lobby.map(t=>t.id)));
  const population=$derived(parsed.slots.length===3&&parsed.slots.every(s=>s.style&&!s.card&&!s.chara&&!s.anyOf&&!s.exclude)?data.archetypes.find(r=>r.key===parsed.slots.map(s=>s.style).sort((a,b)=>a!-b!).join('-')):undefined);
  const total=$derived(mode==='unique'?result?.totalOwners??0:result?.totalTeams??0);
  $effect(()=>{data.snapshotId;query;mode;sort;offset=0;result=undefined;exhausted=false;});
  $effect(()=>{
    const id=data.snapshotId;const params=new URLSearchParams({slots:JSON.stringify(parsed.slots),players:mode,sort,limit:'30',offset:String(offset)});attempt;
    if(offset===0)result=undefined;error='';if(parsed.error)return;loading=true;
    const controller=new AbortController();
    cmGet<TeamSearchResponse>(snapshotPath(id,'teams?'+params),controller.signal,id).then(v=>{if(!controller.signal.aborted){result={...v,teams:offset===0?v.teams:[...(result?.teams??[]),...v.teams]};exhausted=v.teams.length<30;loading=false;}}).catch(e=>{if(!controller.signal.aborted){error=e.message;loading=false;}});
    return ()=>controller.abort();
  });
  $effect(()=>{
    const id=data.snapshotId;const params=new URLSearchParams({slots:JSON.stringify(parsed.slots),players:mode,sort});attempt;
    distribution=undefined;distributionError='';if(parsed.error)return;
    const controller=new AbortController();
    cmGet<TeamDistributionResponse>(snapshotPath(id,'team-distribution?'+params),controller.signal,id).then(v=>{if(!controller.signal.aborted)distribution=v;}).catch(e=>{if(!controller.signal.aborted)distributionError=e.message;});
    return ()=>controller.abort();
  });
  $effect(()=>{
    const id=data.snapshotId,team=selected;detail=undefined;detailError='';copied=false;if(!team)return;
    const controller=new AbortController();
    cmGet<TeamDetail>(snapshotPath(id,'teams/'+encodeURIComponent(team)),controller.signal,id).then(v=>{if(!controller.signal.aborted){detail=v;}}).catch(e=>{if(!controller.signal.aborted)detailError=e.message;});
    return ()=>controller.abort();
  });
  function more(){if(!loading&&!error&&!exhausted&&result&&result.teams.length<total){loading=true;offset+=30;}}
  function selectionMatcher(uma:string,style:string):TeamMatcher{
    return {...(uma.startsWith('chara:')?{chara:Number(uma.slice(6))}:uma?{card:Number(uma),chara:data.cards[Number(uma)]?.chara}:{}),...(style?{style:Number(style)}:{})};
  }
  function matcherValue(matcher:TeamMatcher){return matcher.card?String(matcher.card):matcher.chara?'chara:'+matcher.chara:'';}
  function matcherLabel(matcher:TeamMatcher):string{
    const card=matcher.card?data.cards[matcher.card]:Object.values(data.cards).find(card=>card.chara===matcher.chara);
    return [card?card.name+' · '+(matcher.card?card.outfit:'Any outfit'):'Any Uma',matcher.style?styleNames[matcher.style]:undefined].filter(Boolean).join(' · ');
  }
  function sameMatcher(a:TeamMatcher,b:TeamMatcher){return a.card===b.card&&a.chara===b.chara&&a.style===b.style;}
  function applySlots(slots:Requirement[]){query=slots.some(hasRequirement)?queryText(slots,data.cards):'';}
  function filterSlot(index:number,key:'card'|'style',value:string){
    const slots:Requirement[]=parsed.error?[{},{},{}]:parsed.slots.map(s=>({...s}));
    const slot=slots[index]??{},first=slot.anyOf?.[0]??slot;
    const matcher=key==='card'?selectionMatcher(value,String(first.style??'')):{...first,style:value?Number(value):undefined};
    const choices=[matcher,...(slot.anyOf?.slice(1)??[])].filter(hasRequirement);
    slots[index]=choices.length>1?{anyOf:choices}:choices[0]??{};
    applySlots(slots);
  }
  function addRule(){
    if(!hasRequirement(ruleMatcher)||ruleDuplicate||parsed.error)return;
    const slots=parsed.slots.map(slot=>({...slot}));
    if(ruleTarget==='exclude')slots.push({...ruleMatcher,exclude:true});
    else{
      const index=Number(ruleTarget),slot=slots[index]??{},choices=[...(slot.anyOf??(hasRequirement(slot)?[slot]:[])),ruleMatcher];
      slots[index]=choices.length>1?{anyOf:choices}:choices[0]!;
    }
    applySlots(slots);ruleUma='';ruleStyle='';
  }
  function removeRule(index:number,alternative?:number){
    const slots=parsed.slots.map(slot=>({...slot}));
    if(alternative===undefined)slots.splice(index,1);
    else{const choices=slots[index]!.anyOf!.filter((_,i)=>i!==alternative);slots[index]=choices.length>1?{anyOf:choices}:choices[0]??{};}
    applySlots(slots);
  }
  const chart=$derived({
    animationDuration:350,backgroundColor:'transparent',textStyle:{color:$theme==='dark'?'#aebdd0':'#526178'},grid:{top:38,right:12,bottom:42,left:46},tooltip:{trigger:'axis'},
    xAxis:{type:'value',min:0,max:100,interval:mobileTraining?20:10,name:'Lower estimate of team win rate',nameLocation:'middle',nameGap:30,axisLabel:{formatter:'{value}%',color:$theme==='dark'?'#aebdd0':'#526178'},splitLine:{show:false}},
    yAxis:{type:'value',minInterval:1,name:'Teams',axisLabel:{color:$theme==='dark'?'#aebdd0':'#526178'},splitLine:{lineStyle:{opacity:.12}}},
    series:[{name:'Teams',type:'bar',barCategoryGap:'12%',data:Array.from({length:33},(_,i)=>{const bin=distribution?.bins.find(b=>b.index===i);return {value:[(i+.5)*100/33,bin?.count??0],itemStyle:{color:(i+.5)/33>=Math.max(population?.team??1/3,1/3)?'#65c18c':'#4d6685',borderRadius:[2,2,0,0]}};}),markLine:{symbol:'none',label:{show:false},data:[{name:'Equal teams: one win in three',xAxis:100/3,lineStyle:{type:'dashed',color:'#9aa8ba'},label:{show:true,formatter:'Equal teams · 33.3%',position:'insideEndTop',rotate:0,color:$theme==='dark'?'#aebdd0':'#526178',fontSize:10}},...(population?[{name:'Owner-latest average',xAxis:population.team*100,lineStyle:{color:'#f2bf66',width:2}}]:[])]}}]
  });
  const inlineChart=$derived({...chart,grid:{top:22,right:8,bottom:32,left:38},xAxis:{...chart.xAxis,interval:20,name:'Lower win estimate',nameGap:22,nameTextStyle:{fontSize:10},axisLabel:{...chart.xAxis.axisLabel,fontSize:10}},yAxis:{...chart.yAxis,splitNumber:3,nameTextStyle:{fontSize:10},axisLabel:{...chart.yAxis.axisLabel,fontSize:10}}});
  const runnerChoices=$derived([{value:'',label:'Any Uma'},...Object.values(data.cards).filter((card,index,cards)=>cards.findIndex(other=>other.chara===card.chara)===index).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(character=>[
    {value:'chara:'+character.chara,label:character.name+' · Any outfit',image:portrait(Number(Object.keys(data.cards).find(id=>data.cards[Number(id)]?.chara===character.chara))),keywords:String(character.chara)},
    ...Object.entries(data.cards).filter(([,card])=>card.chara===character.chara).sort((a,b)=>a[1].outfit.localeCompare(b[1].outfit)).map(([id,card])=>({value:id,label:card.name+' · '+card.outfit,image:portrait(Number(id)),keywords:id}))
  ])]);
  const styleChoices=$derived([{value:'',label:'Any style'},...styleOrder.map(id=>({value:String(id),label:styleNames[id]!}))]);
  async function copyLink(){try{const url=new URL(location.href);url.searchParams.set('snapshot',data.snapshotId);url.searchParams.set('tab','archetypes');url.searchParams.set('team',selected);await navigator.clipboard.writeText(url.href);copied=true;}catch{detailError='Could not copy the team link.';}}
  $effect(()=>{const params=new URLSearchParams(location.search);if(params.get('team'))selected=params.get('team')!;});
</script>
{#snippet runnerToggle(team:Performer,index:number)}
  {@const key=team.id+':'+index}
  {@const name=data.cards[team.members[index]!.card]?.name??'Uma'}
  <button class="runner-toggle" class:chosen={selectedRunners.has(key)} aria-label={(selectedRunners.has(key)?'Remove ':'Add ')+name+(selectedRunners.has(key)?' from custom team':' to custom team')} aria-pressed={selectedRunners.has(key)} disabled={pendingRunners.includes(key)||!selectedRunners.has(key)&&teamDraft.length+pendingRunners.length>=3} onclick={()=>{buildTeam=true;onrunner(team,index);}}>{#if pendingRunners.includes(key)}<Spinner size={14} label="Loading build…"/>{:else}{#if selectedRunners.has(key)}<Icon name="close" size={16}/>{:else}<span aria-hidden="true">+</span>{/if}{/if}</button>
{/snippet}
<div class="archetype-workspace">
  <div class="browse-tools" aria-label="Team browsing tools">
    <section class="filter-panel">
      <div class="filter-heading">
        <button type="button" class="filter-toggle" aria-label="Lineup filters" aria-expanded={filtersOpen} aria-controls="cm-lineup-filters" onclick={()=>filtersOpen=!filtersOpen}><Icon name="tune" size={16}/><strong>Lineup filters</strong>{#if activeFilters}<span class="filter-count">{activeFilters} active</span>{/if}<span class="filter-chevron" class:open={filtersOpen}><Icon name="chevron" size={14}/></span></button>
        <span class="filter-note">Match runners in any order</span>
        <Button variant="ghost" size="sm" disabled={!query} onclick={()=>query=''}>Reset</Button>
      </div>
      <div id="cm-lineup-filters" hidden={!filtersOpen}>
        <div class="filter-columns" aria-hidden="true"><span></span><div><span>Runner / outfit</span><span>Running style</span></div></div>
        <div class="filters">
          {#each [0,1,2] as index}
            {@const first=parsed.slots[index]?.anyOf?.[0]??parsed.slots[index]??{}}
            <div class="filter-slot" role="group" aria-label={'Runner '+(index+1)+' filter'} class:active={hasRequirement(parsed.slots[index]??{})}>
              <span class="slot-number">Runner {index+1}</span>
              <div class="slot-controls">
                <Combobox id={'cm-filter-card-'+index} label={'Runner '+(index+1)+' Uma'} hideLabel placeholder="Any Uma" prefixIcon="search" emptyValue="" value={matcherValue(first)} options={runnerChoices} onchange={v=>filterSlot(index,'card',v)}/>
                <SelectField id={'cm-filter-style-'+index} label={'Teammate '+(index+1)+' style'} hideLabel value={String(first.style??'')} onchange={v=>filterSlot(index,'style',v)} options={styleChoices}/>
              </div>
            </div>
          {/each}
        </div>
        {#snippet matcherSummary(matcher:TeamMatcher)}
          {@const card=matcher.card?data.cards[matcher.card]:Object.values(data.cards).find(card=>card.chara===matcher.chara)}
          <span class="applied-choice" title={matcherLabel(matcher)}>
            {#if card}<img src={portrait(matcher.card??Number(Object.keys(data.cards).find(id=>data.cards[Number(id)]?.chara===matcher.chara)))} alt="" width="20" height="20"/><span><strong>{card.name}</strong><small>{' · '+(matcher.card?card.outfit:'Any outfit')}{#if matcher.style}<span style:color={colors[matcher.style]}>{' · '+styleNames[matcher.style]}</span>{/if}</small></span>
            {:else}<span><strong>{matcher.style?styleNames[matcher.style]:'Any Uma'}</strong>{#if matcher.style}<small> · Any Uma</small>{/if}</span>{/if}
          </span>
        {/snippet}
        {#snippet appliedRules()}
          {#each parsed.slots as slot,index}
            {#if slot.exclude}
              <li><span class="rule-kind">Exclude</span><span class="rule-matches">{#each slot.anyOf??[slot] as matcher,option}{#if option}<span class="rule-or">or</span>{/if}{@render matcherSummary(matcher)}{/each}</span><button type="button" aria-label={'Remove exclusion '+(slot.anyOf??[slot]).map(matcherLabel).join(' or ')} onclick={()=>removeRule(index)}><Icon name="close" size={14}/></button></li>
            {:else if slot.anyOf}
              {#each slot.anyOf.slice(1) as alternative,option}
                <li><span class="rule-kind">Runner {index+1} <small>or</small></span><span class="rule-matches">{@render matcherSummary(alternative)}</span><button type="button" aria-label={'Remove Runner '+(index+1)+' alternative '+matcherLabel(alternative)} onclick={()=>removeRule(index,option+1)}><Icon name="close" size={14}/></button></li>
              {/each}
            {/if}
          {/each}
        {/snippet}
        <section class="advanced-filters" aria-label="Advanced filters">
          <Disclosure compact id="cm-advanced-filter-editor" title="Advanced filters" description={advancedCount?advancedCount+' applied':undefined} bind:open={advancedOpen}>
            <div class="advanced-content">
              <div class="rule-mode"><SegmentedControl compact label="Filter type" value={ruleTarget==='exclude'?'exclude':'alternative'} onchange={value=>ruleTarget=value==='exclude'?'exclude':String(Math.max(0,parsed.slots.slice(0,3).findIndex(hasRequirement)))} options={[{value:'exclude',label:'Exclude runners'},{value:'alternative',label:'Add another choice'}]}/></div>
              {#if ruleTarget!=='exclude'}<div class="rule-runner"><SelectField id="cm-rule-target" label="Lineup row" bind:value={ruleTarget} options={ruleRows}/></div>{/if}
              <p class="rule-help">{ruleTarget==='exclude'?'Hide teams containing a runner that matches both fields.':!ruleHasBase?'Add this row’s first choice below, then add another to allow either.':'Match any choice in this row. The other rows still need separate runners.'}</p>
              <div class="rule-fields">
                <Combobox id="cm-rule-uma" label="Uma / outfit" placeholder="Any Uma" prefixIcon="search" emptyValue="" bind:value={ruleUma} options={runnerChoices}/>
                <SelectField id="cm-rule-style" label="Running style" bind:value={ruleStyle} options={styleChoices}/>
              </div>
              <div class="rule-footer">
                <p class="rule-preview" class:ready={hasRequirement(ruleMatcher)&&!ruleDuplicate}>{#if ruleDuplicate}This choice is already applied.{:else if !hasRequirement(ruleMatcher)}{ruleTarget==='exclude'?'Example: Any Uma + Debuffer hides teams with a debuffer.':'Choose an Uma, a style, or both.'}{:else if ruleTarget!=='exclude'}<strong>Runner {Number(ruleTarget)+1}:</strong> {ruleOptions.filter(hasRequirement).map(matcherLabel).join(' or ')}{#if ruleHasBase}<strong>{' or '}</strong>{/if}{matcherLabel(ruleMatcher)}{:else}<strong>Hide:</strong> {matcherLabel(ruleMatcher)}{/if}</p>
                <Button size="sm" disabled={!hasRequirement(ruleMatcher)||ruleDuplicate||Boolean(parsed.error)} onclick={addRule}>{ruleTarget==='exclude'?'Add exclusion':'Add option'}</Button>
              </div>
            </div>
          </Disclosure>
          {#if advancedCount}<ul class="applied-rules inline-rules" aria-label="Applied advanced filters">{@render appliedRules()}</ul>{/if}
        </section>
        {#if parsed.error}<p role="alert">{parsed.error}</p>{/if}
      </div>
    </section>
    <section class="field-panel">
      <ChartFrame plain compact maximize id="cm-team-distribution" title="Matching field" expandable bind:expanded={distributionExpanded} state={distributionError?'error':distribution?'ready':'loading'}>
        {#snippet actions()}{#if distributionError}<Button size="sm" variant="secondary" onclick={()=>attempt++}>Retry distribution</Button>{/if}{/snippet}
        {#if distribution}
          <div class="field-content" class:expanded={distributionExpanded}>
            <div class="field-graph" class:expanded={distributionExpanded} bind:clientHeight={fieldGraphHeight}><LazyEChartsSurface option={distributionExpanded?chart:inlineChart} label="Number of teams at each reliable win rate" height={fieldGraphHeight||144}/></div>
            <dl class="field-stats"><div><dt>{mode==='unique'?'Player-best teams':'Matching teams'}</dt><dd>{number(distribution.totalTeams)}</dd></div><div><dt>Typical team</dt><dd>{distribution.median===null?'—':pct(distribution.median)}</dd></div><div><dt>Top 10% from</dt><dd>{distribution.topDecile===null?'—':pct(distribution.topDecile)}</dd></div></dl>
          </div>
          {#if distributionExpanded&&population}<p class="field-help">Gold line: this style lineup’s average ({pct(population.team)}).</p>{/if}
          <p class="field-help">Win rates use the low end of each team’s estimate.</p>
      {/if}
      </ChartFrame>
    </section>
  </div>
  <section class="team-browser" aria-label="Captured teams">
    <div class="browser-controls">
      <header class="browser-heading"><div><h2>Captured teams</h2><p>{result?number(total)+' matching teams':'Finding teams…'}{activeFilters?' · '+activeFilters+' lineup filters':''}</p></div></header>
      <div class="browser-toolbar"><Checkbox id="cm-show-build-stats" label="Build stats" bind:checked={showStats}/><Checkbox id="cm-build-team" label="Build a team" bind:checked={buildTeam}/><SegmentedControl compact options={[{value:'all',label:'All teams'},{value:'unique',label:'Best per player'}]} bind:value={mode} label="Team representation"/><SelectField id="cm-team-sort" label="Rank teams by" hideLabel bind:value={sort} options={[{value:'lower',label:'Reliable win rate'},{value:'rate',label:'Win rate'}]}/><Button variant="secondary" size="sm" icon="race" onclick={onlobby}>Lobby {lobby.length}/3</Button></div>
    </div>
    <p class="ranking-help">{sort==='lower'?'Reliable ranking uses the lower end of the estimated win range.':'Ranked by simulated team win rate.'} Select a team to inspect its builds. Use + to choose individual Uma.</p>
    {#if buildTeam}
      <section class="custom-team" aria-label="Custom team selection"><header><div><strong>Build a team · {teamDraft.length}/3</strong><p>Choose individual Uma from any captured team.</p></div><Button size="sm" variant="ghost" disabled={!teamDraft.length||pendingRunners.length>0} onclick={onclearteam}>Clear selection</Button></header>
        <div class="custom-slots">{#each [0,1,2] as slot}{@const entry=teamDraft[slot]}{#if entry}<div><Artwork src={portrait(entry.build.card)} alt="" size="sm"/><span><strong>{data.cards[entry.build.card]?.name}</strong><small>{data.cards[entry.build.card]?.outfit} · {styleNames[entry.build.racingStyle]}</small></span><button class="runner-toggle chosen" aria-label={'Remove '+data.cards[entry.build.card]?.name+' from selection'} onclick={()=>onremoverunner(entry.key)}><Icon name="close" size={16}/></button></div>{:else}<div class="vacant"><span aria-hidden="true">+</span><span>Runner {slot+1}</span></div>{/if}{/each}</div>
        <footer><span>{teamError|| (lobby.length>=3?'Lobby full · Remove a team to add this one.':pendingRunners.length?'Loading captured build…':'Selected builds retain their stats, aptitudes and skills.')}</span><Button size="sm" disabled={teamDraft.length!==3||lobby.length+pendingTeams.length>=3||pendingRunners.length>0} onclick={onbuildteam}>Add custom team to lobby</Button></footer>
      </section>
    {/if}
    {#if simError}<p role="alert">{simError}</p>{/if}
    {#if teamError&&!buildTeam}<p role="alert">{teamError}</p>{/if}
    {#if !result&&!error}<div class="teams-loading"><Spinner size={48} centered label="Loading captured teams…"/></div>
    {:else if result&&!result.teams.length}<div class="empty"><Icon name="search" size={26}/><h3>No matching teams</h3><p>Try another Uma or style, or clear the lineup filters.</p><Button variant="secondary" size="sm" onclick={()=>query=''}>Clear filters</Button></div>
    {:else if result}
      <div class="team-grid" use:virtualScroll={{items:result.teams,key:t=>t.id,estimate:280,searchText:t=>t.members.map(m=>data.cards[m.card]?.name??m.card).join(' '),onrange:r=>range=r,onend:more}}>
        {#each result.teams.slice(range.start,range.end) as team,index (team.id)}
          <article data-virtual-index={range.start+index} class="team-row" class:in-lobby={lobbyIds.has(team.id)} aria-label={'Team '+(range.start+index+1)}>
            <button class="team-open" aria-label={'View team '+(range.start+index+1)+' details'} onclick={()=>selected=team.id}></button>
            <header class="team-heading"><div><span class="team-number">#{number(range.start+index+1)}</span><span class="lineup">{#each team.members as member,i}{#if i}<span class="slash">/</span>{/if}<span style:color={colors[member.style]} title={styleNames[member.style]}>{SHORT_STYLE[member.style]}</span>{/each}</span></div><div class="team-rate"><strong>{pct(team.wins/team.n)}</strong><span>team wins</span></div></header>
            <div class="member-heading"><span>Team lineup</span>{#if showStats}<span>Build stats</span>{/if}</div>
            <div class="members">
              {#each team.members as member,i}
                {@const card=data.cards[member.card]}
                {@const share=team.wins?team.memberWins[i]!/team.wins:0}
                <div class="member-choice"><button class="member" aria-label={'Inspect '+card?.name+' team'} onclick={()=>selected=team.id}>
                  <RunnerLineupRow runner={buildRunner(member as Build,data,i)} outfit={card?.outfit??'Unknown outfit'} style={styleNames[member.style]} color={colors[member.style]} {showStats}>
                    {#snippet metadata()}<span class="member-share" title={number(team.memberWins[i]??0)+' of '+number(team.wins)+' team wins'}><strong>{pct(share)}</strong><small>of wins</small></span>{/snippet}
                  </RunnerLineupRow>
                  <Icon name="chevron" size={13}/>
                </button>{@render runnerToggle(team,i)}</div>
              {/each}
            </div>
            <footer class="team-results"><dl><div><dt title="Uncertainty in the simulated win rate, calculated with a 95% confidence interval.">Estimated win range</dt><dd>{pct(team.ci[0])}–{pct(team.ci[1])}</dd></div><div><dt>Simulated races</dt><dd>{number(team.n)}</dd></div></dl><div class="team-actions"><Button size="sm" variant="secondary" onclick={event=>{(event.currentTarget as HTMLButtonElement).focus({preventScroll:true});selected=team.id;}}>Details</Button><Button size="sm" variant={lobbyIds.has(team.id)?'secondary':'primary'} disabled={pendingTeams.includes(team.id)||!lobbyIds.has(team.id)&&lobby.length+pendingTeams.length>=3} onclick={()=>ontoggle(team)}>{lobbyIds.has(team.id)?'Remove':pendingTeams.includes(team.id)?'Loading…':lobby.length+pendingTeams.length>=3?'Lobby full':'Add to lobby'}</Button></div></footer>
          </article>
        {/each}
      </div>
      <p class="loaded-count">{number(result.teams.length)} of {number(total)} teams loaded{loading?' · Loading more teams…':''}</p>
    {/if}
    {#if error}<p role="alert">{error} <Button variant="secondary" size="sm" onclick={()=>attempt++}>Retry teams</Button></p>{/if}
  </section>
</div>
<div class="team-details-dialog">
<Dialog open={!!selected} title="Team details" maxWidth="1480px" maxHeight="94dvh" mobileMaxHeight="94dvh" contentPadding="10px" mobileContentPadding="8px" onclose={()=>selected=''}>
  {#snippet headerActions()}<div class="detail-actions">{#if detail}<Button size="sm" variant="secondary" icon="race" loading={simBusy} onclick={()=>simulate(detail!.team.members,true)}>Simulate team</Button><Button size="sm" disabled={pendingTeams.includes(detail.team.id)||!lobbyIds.has(detail.team.id)&&lobby.length+pendingTeams.length>=3} onclick={()=>ontoggle(detail!.team)}>{lobbyIds.has(detail.team.id)?'Remove from lobby':pendingTeams.includes(detail.team.id)?'Loading…':lobby.length+pendingTeams.length>=3?'Lobby full':'Add to lobby'}</Button>{/if}<Button size="sm" variant="secondary" onclick={copyLink}>{copied?'Link copied':'Copy link'}</Button></div>{/snippet}
  {#if detailError}<p role="alert">{detailError}</p>{:else if !detail}<Spinner size={48} centered minHeight="clamp(320px, 60dvh, 620px)" label="Loading team builds…"/>{:else}
    {#if teamError&&!buildTeam}<p role="alert">{teamError}</p>{/if}
    <div class="detail-summary">
      <div class="detail-rate"><strong>{pct(detail.team.wins/detail.team.n)}</strong><span>Team win rate</span></div>
      <dl><div><dt title="Uncertainty in the win rate, calculated with a 95% confidence interval.">Estimated win range</dt><dd>{pct(detail.team.ci[0])}–{pct(detail.team.ci[1])}</dd></div><div><dt>Simulated races</dt><dd>{number(detail.team.n)}</dd></div></dl>
      <div class="detail-choice"><Checkbox id="cm-detail-build-team" label="Build a team" bind:checked={buildTeam}/></div>
    </div>
    {#if buildTeam}
      <section class="detail-selection" aria-label="Selected runners">
        <strong>Build a team · {teamDraft.length}/3</strong>
        <div class="selected-builds">{#each teamDraft as entry}<span><Artwork src={portrait(entry.build.card)} alt="" size="xs"/>{data.cards[entry.build.card]?.name}<button aria-label={'Remove '+data.cards[entry.build.card]?.name+' from selection'} onclick={()=>onremoverunner(entry.key)}><Icon name="close" size={14}/></button></span>{/each}</div>
        <span class="selection-status" role="status">{teamError|| (pendingRunners.length?'Loading captured build…':!teamDraft.length?'Use + beside an Uma to select its build.':'Choose builds from any captured team.')}</span>
        <Button size="sm" disabled={teamDraft.length!==3||lobby.length+pendingTeams.length>=3||pendingRunners.length>0} onclick={()=>{selected='';onbuildteam();}}>Add custom team to lobby</Button>
      </section>
    {/if}
    <RunnerBuildGroup>
    {#each detail.team.members as member,index}
        <RunnerBuildDetails runner={buildRunner(member,data,index)} outfit={data.cards[member.card]?.outfit} color={colors[member.style]} framed skillNames={new Map(Object.entries(detail.skills).map(([id,name])=>[Number(id),name]))}>
          {#snippet headerActions()}<Button size="sm" variant="secondary" disabled={simBusy} onclick={()=>simulate([member])}>Use in simulator</Button>{@render runnerToggle(detail!.team,index)}{/snippet}
          {#snippet metrics()}
            <dl class="runner-results"><div><dt>Individual win rate</dt><dd>{pct(detail!.team.memberWins[index]!/detail!.team.n)}</dd></div><div><dt>Share of team wins</dt><dd>{pct(detail!.team.wins?detail!.team.memberWins[index]!/detail!.team.wins:0)}</dd></div></dl>
          {/snippet}
          {#snippet training()}<RunnerTraining deck={member.deck} parents={member.parents} label={data.cards[member.card]?.name}/>{/snippet}
        </RunnerBuildDetails>
    {/each}</RunnerBuildGroup>
  {/if}
</Dialog>
</div>
<style>
.archetype-workspace{display:grid;gap:14px;min-width:0}
.browse-tools{display:grid;grid-template-columns:minmax(420px,.9fr) minmax(0,1.4fr);gap:12px;min-width:0}.filter-panel,.field-panel{background:var(--surface-1);border-radius:var(--radius-lg);padding:12px 14px;min-width:0}
.filter-heading{display:flex;align-items:center;gap:12px;min-height:26px;margin-bottom:8px}.filter-toggle{display:flex;align-items:center;gap:7px;flex:none;min-height:26px;padding:0;border:0;background:transparent;color:var(--text-primary);font:inherit;cursor:pointer}.filter-toggle>strong{font-size:13px}.filter-toggle>:global(svg){color:var(--accent-primary)}.filter-toggle:focus-visible{outline:2px solid var(--accent-primary);outline-offset:4px;border-radius:4px}.filter-chevron{display:grid;place-items:center;color:var(--text-secondary)}.filter-chevron.open{transform:rotate(180deg)}.filter-count{font-size:10px;color:var(--accent-primary)}.filter-note{font-size:11px;color:var(--text-secondary)}.filter-heading>:global(button:last-child){margin-left:auto;min-height:26px;padding:0 4px;font-size:11px}
.filters{display:grid;grid-template-columns:1fr;gap:10px}.filter-slot{display:grid;grid-template-columns:56px minmax(0,1fr);min-width:0;gap:8px;align-items:center}.slot-number{color:var(--text-secondary);font-size:10px;font-weight:600}.filter-slot.active .slot-number{color:var(--accent-primary)}.slot-controls{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(130px,1fr);gap:8px}.filters :global(.select-control){font-size:11px!important}.filters :global(.selected-copy img){width:22px;height:22px}
.field-panel :global(.chart-frame){gap:8px}.field-panel :global(figcaption){gap:6px;flex-wrap:nowrap}.field-panel :global(.title-row h3){font-size:13px}.field-panel :global(.plot){gap:8px;min-height:0}.field-panel :global(.chart-frame:not(.expanded) .plot[aria-busy="true"]){height:167px}.field-panel :global(.chart-frame:not(.expanded) .state){min-height:167px;padding:8px}.field-panel :global(.chart-tools button){font-size:10px;padding:0 4px;min-height:26px}.field-content{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:16px;align-items:center;min-width:0}.field-stats{display:grid;grid-template-columns:1fr;gap:12px;margin:0;padding-left:16px;border-left:1px solid var(--border-subtle)}.field-stats>div{display:flex;flex-direction:column;gap:3px;min-width:0}.field-stats dt{font-size:11px;line-height:1.3;color:var(--text-secondary)}.field-stats dd{order:-1;margin:0;font-size:21px;font-weight:650;line-height:1.2;font-variant-numeric:tabular-nums}.field-content~.field-help{font-size:10px;margin:0;line-height:1.5}.field-panel :global(.chart-host){min-height:0}.field-content>:global(.lazy-surface){min-width:0}
.team-browser{min-width:0}.browser-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.browser-heading h2{margin:0;font-size:20px;font-weight:650;letter-spacing:-.03em}.browser-heading p{margin:4px 0 0;font-size:11px}.browser-toolbar{display:flex;align-items:center;gap:12px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle);min-width:0}.browser-toolbar>:global(.field){margin-left:auto;width:160px}.browser-toolbar :global(.checkbox){min-height:30px;gap:6px;grid-template-columns:minmax(0,1fr) 16px}.browser-toolbar :global(.checkbox .copy){grid-column:1;grid-row:1}.browser-toolbar :global(.box){grid-column:2;grid-row:1;width:16px;height:16px;border-radius:4px}.browser-toolbar :global(.checkbox strong){font-size:11px;font-weight:500}.ranking-help{font-size:10px;margin:8px 0 12px;line-height:1.5}
.team-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,350px),1fr));gap:12px;align-items:stretch} .team-row{display:flex;flex-direction:column;min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:10px 14px}.team-heading{display:flex;gap:12px;justify-content:space-between;align-items:center;margin-bottom:6px}.team-heading>div:first-child{display:flex;align-items:center;gap:8px;min-width:0}.team-number{color:var(--text-secondary);font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;flex:none}.lineup{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:11px}.lineup .slash{color:var(--text-secondary);opacity:.5}.team-rate{display:flex;align-items:baseline;gap:4px;text-align:right;flex:none}.team-rate strong{display:block;color:var(--accent-primary);font-size:23px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.2}.team-rate>span{line-height:1.2;font-size:10px;color:var(--text-secondary)}
.member-heading{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--text-secondary);padding-bottom:5px;border-bottom:1px solid var(--border-subtle)}.member-heading>span:last-child{padding-right:22px}.members{display:grid;align-content:start;flex:1}.member{display:grid;grid-template-columns:minmax(0,1fr) 13px;column-gap:9px;align-items:center;width:100%;padding:6px 0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);text-align:left;font:inherit;cursor:pointer}.member:hover{background:var(--surface-2)}.member:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.member-share{display:flex;align-items:baseline;gap:4px;flex:none;font-variant-numeric:tabular-nums}.member-share>strong{font-size:11px;font-weight:600}.member-share>small{font-size:9px;color:var(--text-secondary)}.member>:global(svg){transform:rotate(-90deg);color:var(--text-secondary);opacity:.5}.teams-loading{min-height:clamp(360px,65dvh,720px);display:grid;place-items:center}
.team-results{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding-top:7px;margin-top:0;border-top:1px solid var(--border-subtle)}.team-results dl{display:flex;gap:16px;flex:none;margin:0}.team-results dt{font-size:10px;color:var(--text-secondary)}.team-results dd{margin:3px 0 0;font-size:13px;font-weight:550;font-variant-numeric:tabular-nums}.team-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;flex:none;width:182px;margin-left:auto}.team-actions>:global(button){width:100%;font-size:11px;padding-inline:8px;white-space:nowrap;min-height:32px}.in-lobby .team-number{color:var(--accent-primary)}.loaded-count{font-size:10px;margin:12px 0 0}.empty{display:grid;justify-items:center;gap:10px;padding:50px 16px;background:var(--surface-1);border-radius:var(--radius-lg)}.empty>:global(svg){color:var(--text-secondary)}.empty h3,.empty p{margin:0;text-align:center}.empty h3{font-size:15px}
.team-row{position:relative;isolation:isolate;transition:box-shadow .18s ease,background-color .18s ease}.team-open{position:absolute;inset:0;z-index:1;border:0;border-radius:inherit;background:transparent;cursor:pointer}.team-open:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.member,.team-actions{position:relative;z-index:2}.team-row:focus-within{box-shadow:inset 0 0 0 1px var(--accent-primary)}
@media(hover:hover){.team-row:hover{background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--border-primary)}.member:hover{background:var(--surface-3,var(--surface-1))}}
.browser-controls{display:flex;align-items:center;gap:24px;padding-bottom:10px;border-bottom:1px solid var(--border-subtle)}.browser-controls .browser-heading{margin:0;flex:1}.browser-controls .browser-toolbar{border:0;padding:0;flex:none}.browser-controls .browser-toolbar>:global(button){min-height:32px;font-size:11px}.team-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.detail-actions{display:flex;align-items:center;gap:6px}.detail-actions>:global(button){min-height:30px;padding:0 10px;font-size:11px;white-space:nowrap}.detail-summary{display:flex;align-items:center;gap:24px;padding:2px 2px 14px}.detail-rate{display:flex;align-items:baseline;gap:8px;flex:none}.detail-rate strong{font-size:32px;font-weight:650;color:var(--accent-primary);font-variant-numeric:tabular-nums;letter-spacing:-.04em;line-height:1.2}.detail-rate span{font-size:11px;color:var(--text-secondary)}.detail-summary dl{display:flex;gap:24px;margin:0}.detail-summary dt{font-size:10px;color:var(--text-secondary)}.detail-summary dd{font-size:13px;font-weight:600;margin:4px 0 0;font-variant-numeric:tabular-nums}.detail-choice{display:flex;flex-wrap:wrap;gap:8px;margin-left:auto}


.runner-results{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0;padding:0;align-content:start}
.runner-results dt{font-size:10px;color:var(--text-secondary)}.runner-results dd{margin:4px 0 0;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}.runner-results>div:last-child dd{color:var(--runner-color)}

p{font-size:11px;color:var(--text-secondary);line-height:1.5}
@media(max-width:1100px){.detail-summary{flex-wrap:wrap;gap:12px 20px}.detail-choice{flex-basis:100%;margin:0}}
@media(max-width:1000px){.browser-controls{align-items:start;flex-direction:column;gap:10px}.browser-controls .browser-toolbar{width:100%}}
@media(max-width:760px){.detail-summary{gap:12px}.detail-summary dl{gap:20px}.detail-rate strong{font-size:28px}.detail-rate{flex-basis:100%}.detail-choice{gap:4px}.detail-actions>:global(button){padding:0 8px;min-height:36px;font-size:10px}}
@media(prefers-reduced-motion:reduce){.team-row{transition:none}}
@media(max-width:1280px){.team-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,350px),1fr))}}
@media(max-width:1050px){.browse-tools{grid-template-columns:1fr}.team-row{padding:10px 12px}.team-results dl{gap:10px}.browser-toolbar{flex-wrap:wrap}}
@media(max-width:760px){.filter-heading{margin-bottom:0}.filter-note{display:none}.filters{grid-template-columns:1fr;gap:10px;margin-top:10px}.filter-slot{grid-template-columns:48px minmax(0,1fr);gap:6px}.slot-controls{grid-template-columns:minmax(0,1.5fr) minmax(90px,1fr);gap:6px}.field-stats{gap:8px}.team-grid{grid-template-columns:1fr}.browser-heading h2{font-size:18px}.browser-toolbar{gap:8px}.browser-toolbar>:global(.segments){order:0}.browser-toolbar>:global(.field){order:2;width:100%;margin:0}.browser-toolbar>:global(.checkbox){flex:none}.member{grid-template-columns:minmax(0,1fr) 12px;column-gap:7px}.lineup{font-size:10px}.team-rate strong{font-size:21px}.team-results{gap:8px}.team-results dl{gap:8px}.team-results dt{font-size:9px}.team-results dd{font-size:12px}}
@media(max-width:600px){.field-content{grid-template-columns:minmax(0,1fr);gap:10px}.field-stats{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 0 0;border-left:0;border-top:1px solid var(--border-subtle)}.field-stats dd{font-size:19px}.field-stats dt{font-size:10px}}
.filter-columns{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;margin:0 0 6px;color:var(--text-secondary);font-size:10px}.filter-columns>div{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(130px,1fr);gap:8px}
.slot-controls :global(input[role="combobox"]){font-size:11px}
.advanced-filters{margin-top:10px;padding-top:2px;border-top:1px solid var(--border-subtle);min-width:0}
.advanced-content{display:grid;gap:10px;min-width:0;padding-bottom:8px}.advanced-content p{margin:0;font-size:11px;line-height:1.5}
.advanced-content :global(label){font-size:11px}.advanced-content :global(input[role="combobox"]),.advanced-content :global(.select-control){font-size:11px}
.rule-runner{min-width:0}.advanced-content .rule-help{margin-top:-2px}
.rule-fields{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(130px,1fr);gap:8px;min-width:0}.rule-fields>:global(.field){min-width:0}
.rule-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}.rule-preview{flex:1;min-width:0}.rule-preview.ready{color:var(--text-primary)}.rule-preview strong{font-weight:600}.rule-footer>:global(.ui-button){flex:none;min-height:32px;padding-inline:12px;font-size:11px}
.applied-rules{display:grid;gap:6px;list-style:none;padding:0;margin:0;min-width:0}.applied-rules li{display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-sm);font-size:11px;line-height:1.4;min-width:0}.rule-kind{display:flex;align-items:center;gap:4px;flex:none;font-size:10px;font-weight:600;color:var(--text-secondary);white-space:nowrap}.rule-kind>small{font-size:10px;font-weight:400}.rule-matches{display:flex;align-items:center;gap:6px;flex:1;min-width:0}.rule-or{flex:none;font-size:10px;color:var(--text-secondary)}.applied-choice{display:flex;align-items:center;gap:6px;min-width:0}.applied-choice>img{flex:none;object-fit:contain}.applied-choice>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.applied-choice strong{font-size:11px;font-weight:600;color:var(--text-primary)}.applied-choice small{font-size:10px;color:var(--text-secondary)}.applied-rules button{display:grid;place-items:center;flex:none;width:26px;height:26px;padding:0;margin-left:auto;background:transparent;color:var(--text-secondary);border:0;border-radius:var(--radius-sm);cursor:pointer}.applied-rules button:hover{background:var(--surface-3)}.applied-rules button:focus-visible{outline:2px solid var(--accent-primary)}.inline-rules{margin-top:6px}
.field-graph{height:144px;min-width:0;min-height:0}.field-graph :global(.lazy-surface){min-width:0}
@media(min-width:1051px){
  .field-panel{display:flex;flex-direction:column}
  .field-panel :global(.chart-frame:not(.expanded)){flex:1;min-height:0}
  .field-panel :global(.chart-frame:not(.expanded) .plot[aria-busy="true"]){height:auto;min-height:167px}
  .field-content:not(.expanded){flex:1;align-items:stretch}
  .field-content:not(.expanded) .field-graph{height:auto;min-height:144px;contain:size}
  .field-content:not(.expanded) .field-stats{align-self:center}
}
.field-panel :global(.chart-frame.expanded){padding:10px;grid-template-rows:minmax(0,1fr);gap:0}.field-panel :global(.chart-frame.expanded>figcaption){display:none}
.field-content.expanded{flex:1;min-height:0;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:10px;align-items:stretch}
.field-content.expanded .field-graph{grid-row:2;height:auto;overflow:hidden}
.field-content.expanded .field-stats{grid-row:1;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;padding:0;border:0}
.team-details-dialog{--dialog-header-min-height:48px;--dialog-header-padding:8px 12px;--dialog-header-align:center;--dialog-heading-padding:0}
.detail-summary{padding-bottom:8px}
@media(max-width:767px){.rule-fields{grid-template-columns:minmax(0,1fr)}.applied-rules button{width:36px;height:36px}.field-content.expanded .field-stats{gap:8px}.field-content.expanded .field-stats dd{font-size:19px}.field-content.expanded .field-stats dt{font-size:10px}}
@media(max-width:760px){.filter-columns{grid-template-columns:48px minmax(0,1fr);gap:6px;margin-top:10px;margin-bottom:6px}.filter-columns>div{grid-template-columns:minmax(0,1.5fr) minmax(90px,1fr);gap:6px}.filters{margin-top:0}}

.member-choice{position:relative;z-index:2;display:flex;align-items:center;gap:6px;min-width:0}.member-choice+.member-choice{border-top:1px solid var(--border-subtle)}.member-choice>.member{flex:1;min-width:0}.runner-toggle{position:relative;z-index:2;display:grid;place-items:center;width:32px;height:32px;padding:0;flex:none;border:1px solid var(--border-primary);border-radius:var(--radius-sm);background:transparent;color:var(--accent-primary);cursor:pointer}.runner-toggle.chosen{background:var(--color-accent-soft)}.runner-toggle:disabled{opacity:.4;cursor:default}.custom-team{display:grid;gap:8px;margin:0 0 12px;padding:10px 12px;background:var(--surface-1);border-radius:var(--radius-md)}.custom-team header,.custom-team footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.custom-team strong{font-size:12px}.custom-team p,.custom-team small,.custom-team footer>span{font-size:10px;color:var(--text-secondary);margin:2px 0 0}.custom-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.custom-slots>div{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 8px;background:var(--surface-2);border-radius:var(--radius-sm)}.custom-slots>div>span{min-width:0;flex:1}.custom-slots strong,.custom-slots small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.custom-slots .vacant{color:var(--text-secondary);font-size:11px;min-height:40px}@media(max-width:760px){.custom-slots{grid-template-columns:1fr}.custom-team footer{align-items:start;flex-wrap:wrap}.custom-team footer>:global(button){width:100%}}
.detail-choice :global(.checkbox){min-height:30px;gap:6px}.detail-choice :global(.checkbox strong){font-size:11px;font-weight:500}
.detail-selection{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin:0 0 10px;padding:8px 10px;background:var(--surface-2);border-radius:var(--radius-sm);font-size:11px;min-width:0}.detail-selection>strong{flex:none}.selected-builds{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.selected-builds>span{display:inline-flex;align-items:center;gap:4px}.selected-builds :global(.art){border:0;background:transparent}.selected-builds button{display:grid;place-items:center;width:28px;height:28px;border:0;background:transparent;color:var(--text-secondary);cursor:pointer}.selected-builds button:hover{color:var(--accent-primary)}.selection-status{color:var(--text-secondary);font-size:10px}.detail-selection>:global(button){margin-left:auto;white-space:nowrap}.custom-slots :global(.art){width:48px;height:48px;border:0;background:transparent}
.runner-results dd{font-size:16px;margin-top:3px}
@media(max-width:760px){.detail-actions{flex-wrap:wrap;justify-content:flex-end}.detail-choice :global(.checkbox){min-height:36px}.detail-selection>:global(button){width:100%}.runner-toggle{width:36px;height:36px}.selected-builds{flex-basis:100%}}

@media(max-width:760px){.detail-summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center}.detail-rate{grid-column:1;gap:5px}.detail-rate strong{font-size:26px}.detail-rate span{font-size:10px}.detail-summary dl{grid-column:1 / -1;grid-row:2}.detail-choice{grid-column:2;grid-row:1;margin:0}.detail-choice :global(.checkbox){gap:4px}.detail-choice :global(.checkbox strong){font-size:10px}}
</style>
