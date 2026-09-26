<script lang="ts">
  import type { Summary,Performer,Build,TeamDetail,TeamSearchResponse,TeamDistributionResponse } from './hakuraku-types';
  import { cmGet,snapshotPath,pct,number,buildRunner,styleOrder,styleNames } from './cm-data';
  import { parseQuery,queryText } from './hakuraku-query';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import {virtualScroll,type VirtualRange} from '@/lib/virtual-scroll';
  import Dialog from '@/components/Dialog.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import RunnerBuild from './RunnerBuild.svelte';
  import { supportCardImagePath,loadSupportCardCatalog,type SupportCardCatalogEntry } from '@/lib/catalog/support-card-catalog';
  import { supportCardDisplay } from '@/lib/supports/support-card';
  import { loadCharacterCatalog,type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import { watchFactorCatalog,decodeFactorEntry } from '@/lib/catalog/factor-catalog';
  import SparkItem from '@/components/SparkItem.svelte';
  import { portrait } from './analysis-view';
  import { theme } from '@/stores/theme';
  let {data,query=$bindable(''),lobby,ontoggle,onlobby}:{data:Summary;query?:string;lobby:Performer[];ontoggle:(team:Performer)=>void;onlobby:()=>void}=$props();
  let mode=$state('all'),sort=$state('lower'),offset=$state(0),loading=$state(false),exhausted=$state(false),range=$state<VirtualRange>({start:0,end:0}),attempt=$state(0),result=$state<TeamSearchResponse>(),distribution=$state<TeamDistributionResponse>(),error=$state(''),distributionError=$state('');
  let selected=$state(''),detail=$state<TeamDetail>(),detailError=$state(''),copied=$state(false);
  let supports=$state.raw(new Map<string,SupportCardCatalogEntry>()),characters=$state.raw(new Map<number,CharacterCatalogEntry>());
  $effect(()=>{
    if(!selected)return;
    void loadSupportCardCatalog().then(rows=>supports=new Map(rows.map(row=>[row.id,row]))).catch(()=>{});
    void loadCharacterCatalog().then(rows=>characters=rows).catch(()=>{});
    return watchFactorCatalog();
  });
  const parsed=$derived.by(()=>{try{return {slots:parseQuery(query,data.cards),error:''};}catch(e){return {slots:[],error:(e as Error).message};}});
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
    cmGet<TeamDetail>(snapshotPath(id,'teams/'+encodeURIComponent(team)),controller.signal,id).then(v=>{if(!controller.signal.aborted)detail=v;}).catch(e=>{if(!controller.signal.aborted)detailError=e.message;});
    return ()=>controller.abort();
  });
  function more(){if(!loading&&!error&&!exhausted&&result&&result.teams.length<total){loading=true;offset+=30;}}
  function filterSlot(index:number,key:'card'|'style',value:string){const slots=parsed.error?[{},{},{}]:parsed.slots.map(s=>({...s}));slots[index]={...slots[index],[key]:value?Number(value):undefined};if(key==='card')delete slots[index]!.chara;query=queryText(slots,data.cards);}
  const chart=$derived({
    animationDuration:350,backgroundColor:'transparent',textStyle:{color:$theme==='dark'?'#aebdd0':'#526178'},grid:{top:28,right:24,bottom:50,left:54},tooltip:{trigger:'axis'},
    xAxis:{type:'value',min:0,max:100,interval:10,name:'95% interval lower bound',nameLocation:'middle',nameGap:30,axisLabel:{formatter:'{value}%',color:$theme==='dark'?'#aebdd0':'#526178'},splitLine:{show:false}},
    yAxis:{type:'value',minInterval:1,name:'Teams',axisLabel:{color:$theme==='dark'?'#aebdd0':'#526178'},splitLine:{lineStyle:{opacity:.12}}},
    series:[{name:'Teams',type:'bar',barCategoryGap:'12%',data:Array.from({length:33},(_,i)=>{const bin=distribution?.bins.find(b=>b.index===i);return {value:[(i+.5)*100/33,bin?.count??0],itemStyle:{color:(i+.5)/33>=Math.max(population?.team??1/3,1/3)?'#65c18c':'#4d6685',borderRadius:[2,2,0,0]}};}),markLine:{symbol:'none',label:{show:false},data:[{name:'Neutral team share',xAxis:100/3,lineStyle:{type:'dashed',color:'#9aa8ba'}},...(population?[{name:'Owner-latest average',xAxis:population.team*100,lineStyle:{color:'#f2bf66',width:2}}]:[])]}}]
  });
  async function copyLink(){try{const url=new URL(location.href);url.searchParams.set('snapshot',data.snapshotId);url.searchParams.set('tab','archetypes');url.searchParams.set('team',selected);await navigator.clipboard.writeText(url.href);copied=true;}catch{detailError='Could not copy the team link.';}}
  $effect(()=>{const params=new URLSearchParams(location.search);if(params.get('team'))selected=params.get('team')!;});
</script>
<div class="archetype-workspace">
<section class="panel"><div class="heading"><h2>Team filters</h2><Button variant="ghost" size="sm" onclick={()=>query=''}>Reset</Button></div>
  <div class="filters">{#each [0,1,2] as index}<div><h3>Teammate {index+1}</h3><SelectField id={'cm-filter-card-'+index} label="Uma / outfit" value={String(parsed.slots[index]?.card??'')} onchange={v=>filterSlot(index,'card',v)} options={[{value:'',label:'Any Uma'},...Object.entries(data.cards).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([id,card])=>({value:id,label:card.name+' · '+card.outfit}))]}/><SelectField id={'cm-filter-style-'+index} label="Style" value={String(parsed.slots[index]?.style??'')} onchange={v=>filterSlot(index,'style',v)} options={[{value:'',label:'Any style'},...styleOrder.map(id=>({value:String(id),label:styleNames[id]!}))]}/></div>{/each}</div>
  <details class="query"><summary>Team query</summary><label for="team-query">Three slots separated by /; use “Without” to exclude an Uma or style.</label><input id="team-query" bind:value={query} placeholder="Front / Any / Without Debuffer"/></details>
  {#if parsed.error}<p role="alert">{parsed.error}</p>{/if}
</section>
<div class="distribution"><ChartFrame plain surface id="cm-team-distribution" title="Team performance distribution" description={mode==='unique'?'Each player’s highest-ranked matching team.':'All matching evaluated teams.'} state={distributionError?'error':distribution?'ready':'loading'} expandable>
  {#snippet actions()}{#if distributionError}<Button size="sm" variant="secondary" onclick={()=>attempt++}>Retry distribution</Button>{/if}{/snippet}
  {#if distribution}<div class="distribution-stats"><span>{number(distribution.totalTeams)} teams</span><span>Median <strong>{distribution.median===null?'—':pct(distribution.median)}</strong></span><span>Top 10% <strong>{distribution.topDecile===null?'—':pct(distribution.topDecile)}</strong></span></div><LazyEChartsSurface option={chart} label="Team performance distribution by 95% interval lower bound" height={250}/>{/if}
</ChartFrame></div>
<section class="panel"><div class="heading"><h2>Archetype Analysis</h2><div class="controls"><Tabs items={[{id:'all',label:'All teams'},{id:'unique',label:'Best per player'}]} bind:value={mode} label="Team representation" variant="segmented"/><SelectField id="cm-team-sort" label="Rank teams by" bind:value={sort} options={[{value:'lower',label:'95% interval lower bound'},{value:'rate',label:'Observed win rate'}]}/><Button variant="secondary" size="sm" onclick={onlobby}>Lobby {lobby.length}/3</Button></div></div>
  {#if !result&&!error}<p role="status">Loading captured teams…</p>{:else if result&&!result.teams.length}<p>No captured teams match these requirements.</p>{:else if result}
    <div class="team-table"><div class="table-heading"><span>#</span><span>Team · select an Uma for details</span><button class="sort" aria-label="Sort teams by win rate" onclick={()=>sort='rate'}>Team win% {sort==='rate'?'↓':'↕'}</button><button class="sort" aria-label="Sort teams by confidence interval" onclick={()=>sort='lower'}>95% interval {sort==='lower'?'↓':'↕'}</button><span>Races</span><span>Lobby</span></div>
    <div use:virtualScroll={{items:result.teams,key:t=>t.id,estimate:210,searchText:t=>t.members.map(m=>data.cards[m.card]?.name??m.card).join(' '),onrange:r=>range=r,onend:more}}>{#each result.teams.slice(range.start,range.end) as team,index (team.id)}<article data-virtual-index={range.start+index} class="team-row"><span class="rank">{range.start+index+1}</span><div class="members">{#each team.members as member,i}<button class="member" aria-label={'Inspect '+data.cards[member.card]?.name+' team'} onclick={()=>selected=team.id}><RunnerBuild runner={buildRunner(member as Build,data,i)}/><small>{pct(team.wins?team.memberWins[i]!/team.wins:0)} of team wins</small></button>{/each}</div><strong class="team-rate">{pct(team.wins/team.n)}</strong><span class="ci">{pct(team.ci[0])}–{pct(team.ci[1])}</span><span class="races">{number(team.n)}</span><Button size="sm" variant={lobbyIds.has(team.id)?'secondary':'ghost'} disabled={!lobbyIds.has(team.id)&&lobby.length>=3} onclick={()=>ontoggle(team)}>{lobbyIds.has(team.id)?'Added':lobby.length>=3?'Full':'+ Add'}</Button></article>{/each}
    </div></div><p class="loaded-count">{number(result.teams.length)} of {number(total)} teams loaded{loading?' · Loading more teams…':''}</p>
  {/if}
  {#if error}<p role="alert">{error} <Button variant="secondary" size="sm" onclick={()=>attempt++}>Retry teams</Button></p>{/if}
</section>
</div>
<Dialog open={!!selected} title="Team details" maxWidth="1180px" onclose={()=>selected=''}>
  {#snippet headerActions()}{#if detail}<Button size="sm" disabled={!lobbyIds.has(detail.team.id)&&lobby.length>=3} onclick={()=>ontoggle(detail!.team)}>{lobbyIds.has(detail.team.id)?'Remove from lobby':lobby.length>=3?'Lobby full':'Add to lobby'}</Button>{/if}<Button size="sm" variant="secondary" onclick={copyLink}>{copied?'Link copied':'Copy link'}</Button>{/snippet}
  {#if detailError}<p role="alert">{detailError}</p>{:else if !detail}<p role="status">Loading team builds…</p>{:else}<p>{pct(detail.team.wins/detail.team.n)} team win rate · {pct(detail.team.ci[0])}–{pct(detail.team.ci[1])} 95% interval · {number(detail.team.n)} races</p><div class="builds">
    {#each detail.team.members as member,index}<article><RunnerBuild runner={buildRunner(member,data,index)} expanded skillNames={new Map(Object.entries(detail.skills).map(([id,name])=>[Number(id),name]))}/><dl><dt>Individual win rate</dt><dd>{pct(detail.team.memberWins[index]!/detail.team.n)}</dd><dt>Share of team wins</dt><dd>{pct(detail.team.wins?detail.team.memberWins[index]!/detail.team.wins:0)}</dd><dt>Rank score</dt><dd>{number(member.score)}</dd></dl>
    {#if member.deck?.length||member.parents?.length}<details><summary>Training setup</summary>{#if member.deck?.length}<h3>Support deck</h3><div class="support-deck">{#each member.deck as card}{@const resource=supports.get(String(card.id))}{@const label=resource?supportCardDisplay(resource).character+' · '+supportCardDisplay(resource).title:'Support '+card.id}<div title={label+' · limit break '+card.lb}><Artwork src={supportCardImagePath(card.id)} alt={label} size="sm"/><small>LB {card.lb}</small></div>{/each}</div>{/if}{#if member.parents?.length}<h3>Parents & grandparents</h3><div class="parent-builds">{#each member.parents as parent}{@const character=characters.get(parent.cardId)}<details><summary><Artwork src={portrait(parent.cardId)} alt="" size="xs"/><span>{character?.name??data.cards[parent.cardId]?.name??parent.cardId}<small>{parent.factors.length} sparks · {parent.factors.reduce((n,f)=>n+f.level,0)} stars</small></span></summary><div class="parent-sparks">{#each parent.factors as factor}{@const spark=decodeFactorEntry(factor.id,factor.level)}<SparkItem name={spark.name} level={spark.level} tone={spark.category==='stats'?'blue':spark.category==='aptitude'?'pink':spark.category==='unique'?'green':'white'} compact/>{/each}</div></details>{/each}</div>{/if}</details>{/if}
    </article>{/each}</div>{/if}
</Dialog>
<style>.sort{padding:0;min-height:28px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}.sort:hover{color:var(--accent-primary)}.archetype-workspace{display:grid;gap:32px;min-width:0}.distribution{min-width:0}.panel{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:20px}.heading,.controls{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.heading{justify-content:space-between;margin-bottom:16px}h2{margin:0;font-size:17px;font-weight:650;letter-spacing:-.02em}h3{font-size:11px;margin:0 0 8px}.filters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.filters>div{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:6px 10px;padding-bottom:14px;border-bottom:1px solid var(--border-subtle)}.filters h3{grid-column:1/-1;font-size:10px;color:var(--text-secondary);margin:0 0 2px}.filters :global(label){font-size:10px}.query{margin-top:16px}summary{font-size:12px;cursor:pointer}label{font-size:11px;display:block;margin:12px 0 6px;color:var(--text-secondary)}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border-primary);border-radius:var(--radius-md);background:var(--surface-1);color:var(--color-text);font:inherit}.distribution-stats{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:12px;color:var(--text-secondary)}.distribution-stats strong{color:var(--color-text);font-size:20px;font-weight:500;margin-left:6px}.table-heading,.team-row{display:grid;grid-template-columns:18px minmax(0,1fr) 60px 90px 50px 55px;gap:12px;align-items:center}.table-heading{font-size:10px;color:var(--text-secondary);padding-bottom:10px}.team-row{border-top:1px solid var(--border-subtle);padding:18px 0;font-size:11px}.members{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.members :global(.build){gap:6px}.members :global(.stats){font-size:10px}.member{min-width:0;padding:7px;border:0;background:transparent;color:var(--color-text);text-align:left;cursor:pointer;font:inherit}.member:hover{background:var(--surface-2)}small{display:block;font-size:9px;color:var(--text-secondary);margin-top:8px}.team-rate{color:var(--accent-primary)}.ci,.races,.rank{color:var(--text-secondary)}.builds{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.builds article{min-width:0}dl{display:grid;grid-template-columns:1fr auto;gap:8px;font-size:11px;margin:20px 0}dt{color:var(--text-secondary)}dd{margin:0}.support-deck{display:flex;flex-wrap:wrap;gap:6px}.parent-builds{display:grid;gap:10px}.parent-builds summary{display:flex;gap:8px;align-items:center;font-size:11px;padding:7px 0}.parent-sparks{display:flex;flex-wrap:wrap;gap:4px;padding:8px 0}.builds h3{margin-top:18px}p{font-size:12px;color:var(--text-secondary);line-height:1.6}@media(max-width:1300px){.filters{grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.filters>div{grid-template-columns:1fr}}@media(max-width:1200px){.members{grid-template-columns:1fr}.team-row,.table-heading{grid-template-columns:20px minmax(200px,1fr) 64px 100px 55px 62px}}@media(max-width:760px){.filters>div{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.filters,.builds{grid-template-columns:1fr}.table-heading{display:flex;gap:16px}.table-heading>span{display:none}.team-row{grid-template-columns:25px minmax(0,1fr) auto;gap:8px}.members{grid-column:2/4}.team-rate{grid-column:2}.ci{grid-column:2}.races{grid-column:3;grid-row:auto}.team-row>:global(button){grid-column:3}.controls{width:100%}.distribution-stats{gap:12px;flex-wrap:wrap}}</style>
