<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
  import { analyzeMultiRace,raceRunnerKey } from '@/lib/race/multi-race-analysis';
  import { formatRaceTime, hpRemainingColor, runningStyleName } from '@/lib/race/race-display';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import TextField from '@/components/TextField.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Icon from '@/components/Icon.svelte';
  import RaceSkill from './RaceSkill.svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import RunnerSummary from './RunnerSummary.svelte';
  import RunnerBuildDetails from './RunnerBuildDetails.svelte';
  import RunnerBuildGroup from './RunnerBuildGroup.svelte';
  import SessionDiagnostics from './SessionDiagnostics.svelte';
  import SessionUmaPlot from './SessionUmaPlot.svelte';
  import RunnerReference from './RunnerReference.svelte';
  import { histogram, percent, portrait, rate, score, styleColors, teamBuilds } from './analysis-view';
  import { theme } from '@/stores/theme';
  let { captures, skillNames = new Map<number,string>(), active=true, pending=false, onreplay, onlobby }: {
    captures: ParsedRaceCapture[]; skillNames?: Map<number,string>; active?:boolean; pending?:boolean;
    onreplay?: (index:number,runner?:number,time?:number)=>void; onlobby?: (members:RaceRunner[])=>void;
  } = $props();
  const analysis=$derived(analyzeMultiRace(captures));
  const entries=$derived(captures.flatMap((c,race)=>c.runners.map(runner=>({runner,race}))));
  const characterStyles=$derived.by(()=>{
    const result=new Map<string,Set<number>>();
    for(const {runner} of entries){const key=raceRunnerKey(runner),styles=result.get(key)??new Set<number>();styles.add(runner.result?.runningStyle??0);result.set(key,styles);}
    return new Map([...result].map(([key,styles])=>[key,[...styles].sort().map(id=>runningStyleName(id,true)).join(' / ')]));
  });
  const winners=$derived(entries.filter(e=>e.runner.result?.finishOrder===1));
  const teams=$derived(teamBuilds(captures));
  let teamSearch=$state(''),skillSearch=$state(''),style=$state('all'),uma=$state(''),characterSort=$state('wins'),teamSort=$state('wins'),minimum=$state('0'),teamLimit=$state(12),scorePopulation=$state('all'),skill=$state(''),detail=$state<RaceRunner[]>(),detailTitle=$state(''),selectedRace=$state(0);
  const instanceId=$props.id();
  const sessionSections=[{"id":"overview","title":"Session overview"},{"id":"strategies","title":"Strategy analysis"},{"id":"characters","title":"Uma analysis"},{"id":"teams","title":"Teams & builds"},{"id":"skills","title":"Skill analysis"},{"id":"hp","title":"HP & last spurt"},{"id":"diagnostics","title":"Detailed analysis"}];
  function jump(section:string){document.getElementById(instanceId+'-'+section)?.scrollIntoView({block:'start',behavior:'instant'});}
  $effect(()=>{captures;teamSearch;style;uma;teamSort;teamLimit=12;});
  $effect(()=>{captures;detail=undefined;});
  const ink=$derived($theme==='dark'?'#abb4c3':'#566071');
  function chart(series:unknown[],xAxis:Record<string,unknown>,yAxis:Record<string,unknown>={type:'value'},extra:Record<string,unknown>={}) {
    return {animation:false,textStyle:{color:ink},tooltip:{trigger:'axis'},grid:{left:48,right:24,top:24,bottom:45},xAxis:{nameLocation:'middle',nameGap:30,axisLabel:{fontSize:10,color:ink},splitLine:{lineStyle:{color:ink,opacity:.12}},...xAxis},yAxis:{axisLabel:{fontSize:10,color:ink},splitLine:{lineStyle:{color:ink,opacity:.12}},...yAxis},series,...extra};
  }
  const times=$derived(histogram(winners.map(e=>e.runner.result!.finishTime)));
  const scores=$derived(histogram((scorePopulation==='winners'?winners:entries).map(e=>score(e.runner)).filter(n=>n>0)));
  const feats=$derived.by(()=>{
    if(!winners.length)return [];
    const time=[...winners].sort((a,b)=>a.runner.result!.finishTime-b.runner.result!.finishTime);
    const ranked=winners.filter(e=>score(e.runner)>0).sort((a,b)=>score(b.runner)-score(a.runner));
    return [{label:'Fastest win',entry:time[0]!,value:formatRaceTime(time[0]!.runner.result!.finishTime)},{label:'Slowest win',entry:time.at(-1)!,value:formatRaceTime(time.at(-1)!.runner.result!.finishTime)},...(ranked.length?[{label:'Highest rated winner',entry:ranked[0]!,value:score(ranked[0]!.runner).toLocaleString()},{label:'Lowest rated winner',entry:ranked.at(-1)!,value:score(ranked.at(-1)!.runner).toLocaleString()}]:[])];
  });
  const styles=$derived(analysis.strategies.filter(r=>r.strategy>0));
  const styleRows=$derived(styles.map(row=>({id:row.strategy,name:runningStyleName(row.strategy),entries:row.races,field:rate(row.races,entries.length),wins:row.wins,share:rate(row.wins,captures.length),winrate:rate(row.wins,row.races)})));
  const metricHelp={
    'Field share':'The percentage of all runner entries using this Uma or running style.',
    'Win share':'The percentage of races won by this running style.',
    'Win rate':'Wins divided by appearances. A runner’s rate measures individual wins; a team’s rate measures races won by any member.',
    'Activation rate':'The percentage of learned skill entries that activated at least once. Repeat activations do not increase this percentage.',
    'Avg. active (s)':'Average total active time across runner entries with detailed simulation data, including entries where the skill did not activate.',
    'Wit check failed':'Learned skill entries that failed the activation check against the runner’s wit-based activation chance.',
    'Condition failed':'Learned skill entries that passed the wit check but never met the skill’s activation conditions.',
    'Runner win rate':'The win rate of runners that learned this skill. This is a correlation and does not isolate the skill’s effect.',
    'Double procs':'Runner entries where this skill activated at least twice.',
    'Avg. start HP':'Average HP at the start across entries with an HP measurement.',
    'Avg. finish HP':'Average HP at each runner’s finish, rather than the end of the whole field. Missing measurements are excluded.',
    'Finished with HP':'Percentage of measured entries with HP remaining at their finish.',
    'Avg. spurt delay':'Average distance from the first last-spurt check to the selected spurt start. Zero means no delay. Entries without a spurt measurement are excluded.',
    'Avg. spurt speed':'Average selected last-spurt target speed across entries with detailed speed measurements.'
  };
  const characters=$derived(analysis.characters.filter(r=>rate(r.races,entries.length)>=Number(minimum)).sort((a,b)=>characterSort==='popularity'?b.races-a.races:rate(b.wins,b.races)-rate(a.wins,a.races)));
  const selectedCharacter=$derived(characters.find(r=>r.key===uma)??characters[0]);
  const filteredTeams=$derived(teams.filter(team=>team.members.some(r=>(!uma||raceRunnerKey(r)===uma)&&(style==='all'||String(r.result?.runningStyle)===style))&&(team.trainer+' '+team.members.map(r=>r.name).join(' ')).toLowerCase().includes(teamSearch.toLowerCase())).sort((a,b)=>teamSort==='appearances'?b.appearances-a.appearances:rate(b.wins,b.appearances)-rate(a.wins,a.appearances)));
  const winningPartners=$derived(analysis.teams.filter(t=>t.members.some(m=>m.key===selectedCharacter?.key)).sort((a,b)=>b.wins-a.wins).slice(0,4));
  const compositions=$derived.by(()=>{
    const groups=new Map<string,{key:string;styles:number[];appearances:number;wins:number}>();
    for(const team of teams){const styles=team.members.map(r=>r.result?.runningStyle??0).sort();const key=styles.join('-'),row=groups.get(key)??{key,styles,appearances:0,wins:0};row.appearances+=team.appearances;row.wins+=team.wins;groups.set(key,row);}
    return [...groups.values()].sort((a,b)=>rate(b.wins,b.appearances)-rate(a.wins,a.appearances));
  });
  const compositionRows=$derived(compositions.slice(0,12).map(row=>({id:row.key,name:row.styles.map(id=>runningStyleName(id,true)).join(' / '),appearances:row.appearances,wins:row.wins,winrate:rate(row.wins,row.appearances)})));
  const selectedSkill=$derived(analysis.skills.find(r=>String(r.skillId)===skill)??analysis.skills[0]);
  const distances=$derived(histogram(selectedSkill?.activationDistances??[],16));
  function inspect(members:RaceRunner[],title:string,race:number){detail=members;detailTitle=title;selectedRace=race;}
  function findTeams(card:string,selectedStyle='all'){uma=card;style=selectedStyle;teamSearch='';jump('teams');}
  function representatives(id:number){return analysis.characters.map(r=>({...r,entries:analysis.entries.filter(e=>e.charaKey===r.key&&e.strategy===id)})).filter(r=>r.entries.length).sort((a,b)=>b.entries.length-a.entries.length).slice(0,4);}
</script>
{#snippet runnerSummary(runner:RaceRunner,race:number)}
  <button class="build-summary" onclick={()=>inspect([runner],runner.name,race)} aria-label={'Inspect '+runner.name+' build'}>
    <RunnerSummary {runner} labelStats={false} showScore={false} layout="row" color={styleColors[runner.result?.runningStyle??0]}/>
    <Icon name="chevron" size={13}/>
  </button>
{/snippet}
<div class="analysis" aria-label="Session analysis">
  <nav class="session-navigation" aria-label="Jump to session section">{#each sessionSections as section}<Button variant="ghost" size="sm" onclick={()=>jump(section.id)}>{section.title}</Button>{/each}</nav>
  <div class="session-sections">
  {#if active}<dl class="session-counts" aria-label="Session totals">{#each [{label:'Races',value:captures.length},{label:'Runner entries',value:entries.length},{label:'Umas',value:analysis.characters.length},{label:'Team builds',value:teams.length},{label:'Skill activations',value:analysis.skills.reduce((n,s)=>n+s.activations,0)}] as metric}<div><dt>{metric.label}</dt><dd>{metric.value.toLocaleString()}</dd></div>{/each}</dl>{/if}
<section class="analysis-section" id={instanceId+'-overview'} ><header class="analysis-heading"><h2>Session overview</h2><p>Results and field distribution across the selected races.</p></header><div class="section-body">{#if active}

  <div class="overview">
    <ChartFrame plain surface compact expandable maximize id="winning-times" title="Winning time distribution" description="The spread of race-winning finish times."><LazyEChartsSurface height={210} label="Winning time distribution" option={chart([{type:'bar',data:times.counts,itemStyle:{color:'#69b7ee',borderRadius:[3,3,0,0]}}],{type:'category',data:times.labels.map(value=>formatRaceTime(value,2)),axisLabel:{rotate:25}})}/></ChartFrame>
    <ChartFrame plain surface compact expandable maximize id="score-distribution" title="Score distribution" state={scores.counts.length?'ready':'empty'} emptyDetail="Training scores were not included in these captures.">
      {#snippet actions()}<SegmentedControl compact options={[{value:'all',label:'All runners'},{value:'winners',label:'Winners'}]} bind:value={scorePopulation} label="Score population"/>{/snippet}
      <LazyEChartsSurface height={210} label="Training score distribution" option={chart([{type:'bar',data:scores.counts,itemStyle:{color:'#7bc8a0'}}],{type:'category',data:scores.labels.map(n=>(n/1000).toFixed(1)+'k')})}/>
    </ChartFrame>
    <ChartFrame plain surface compact id="session-highlights" title="Notable performances">
      <div class="highlights">{#each feats as feat}<div class="performance-row"><span>{feat.label}</span><button onclick={()=>inspect([feat.entry.runner],feat.entry.runner.name,feat.entry.race)} aria-label={'Inspect '+feat.entry.runner.name+' '+feat.label+' build'}><RunnerReference name={feat.entry.runner.name} cardId={feat.entry.runner.cardId} compact/><Icon name="chevron" size={12}/></button><strong class="performance-value">{feat.value}</strong></div>{/each}</div>
    </ChartFrame>
  </div>
  <ChartFrame plain surface compact expandable maximize id="gate-results" title="Gate performance" description="Win rate for each starting gate.">
    <LazyEChartsSurface height={210} label="Win rate by gate" option={chart([{type:'bar',data:Array.from({length:Math.max(0,...captures.map(r=>r.runners.length))},(_,i)=>({value:+rate(winners.filter(e=>e.runner.index===i).length,entries.filter(e=>e.runner.index===i).length).toFixed(1),itemStyle:{color:styleColors[i%4+1]}}))}],{type:'category',data:Array.from({length:Math.max(0,...captures.map(r=>r.runners.length))},(_,i)=>String(i+1)),name:'Gate'},{type:'value',name:'Win %'})}/>
  </ChartFrame>
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-strategies'} ><header class="analysis-heading"><h2>Strategy analysis</h2><p>See which running styles and team compositions win.</p></header><div class="section-body">{#if active}
  <DataTable plain compact caption="Running style performance" columnHelp={metricHelp} rows={styleRows} columns={[{key:'name',label:'Running style'},{key:'entries',label:'Entries',numeric:true},{key:'field',label:'Field share',numeric:true},{key:'wins',label:'Wins',numeric:true},{key:'share',label:'Win share',numeric:true},{key:'winrate',label:'Win rate',numeric:true}]}>
    {#snippet cell(row,column)}{#if column.key==='name'}<Button variant="ghost" size="sm" onclick={()=>findTeams('',String(row.id))}><span class="style-dot" style:background={styleColors[Number(row.id)]}></span>{row.name}</Button>{:else if ['field','share','winrate'].includes(column.key)}{Number(row[column.key]).toFixed(1)}%{:else}{row[column.key]}{/if}{/snippet}
  </DataTable>
  <div class="two-col"><ChartFrame plain surface compact expandable maximize id="style-breakdown" title="Strategy breakdown" description="Population compared with the winners." legend={[{label:'Field share',color:'#69b7ee'},{label:'Win share',color:'#7bc8a0'}]}>
    <LazyEChartsSurface height={210} label="Strategy population and win share" option={chart([{name:'Field share',type:'bar',data:styles.map(r=>+rate(r.races,entries.length).toFixed(1)),itemStyle:{color:'#69b7ee'}},{name:'Win share',type:'bar',data:styles.map(r=>+rate(r.wins,captures.length).toFixed(1)),itemStyle:{color:'#7bc8a0'}}],{type:'category',data:styles.map(r=>runningStyleName(r.strategy,true))},{type:'value',name:'Share %'})}/>
  </ChartFrame><ChartFrame plain surface compact expandable maximize id="style-saturation" title="Strategy saturation" description="Win rate as more runners use the same style." legend={styles.map(r=>({label:runningStyleName(r.strategy,true),color:styleColors[r.strategy]!}))}>
    <LazyEChartsSurface height={210} label="Strategy saturation" option={chart(styles.map(r=>({name:runningStyleName(r.strategy),type:'line',symbolSize:7,itemStyle:{color:styleColors[r.strategy]},data:r.saturation.map(b=>[b.count,+rate(b.wins,b.races).toFixed(1)])})),{type:'value',min:1,max:Math.max(9,...captures.map(c=>c.runners.length)),minInterval:1,name:'In room'},{type:'value',name:'Win %'})}/>
  </ChartFrame></div>
  <div class="two-col">
    <ChartFrame plain surface compact id="session-representatives" title="Style representatives" description="Select an Uma to find its captured teams."><div class="representatives">{#each styles as row}<div><h4 style:color={styleColors[row.strategy]}>{runningStyleName(row.strategy)}</h4>{#each representatives(row.strategy) as r}<button class="uma-row" onclick={()=>findTeams(r.key,String(row.strategy))}><RunnerReference name={r.name} cardId={r.cardId} detail={r.entries.length+' entries'}/><strong title="Individual win rate">{percent(r.entries.filter(e=>e.finishOrder===1).length,r.entries.length)}</strong></button>{/each}</div>{/each}</div></ChartFrame>
    <ChartFrame plain surface compact id="session-compositions" title="Team compositions" description="Wins by any member of the team."><DataTable plain compact caption="Session team compositions" columnHelp={metricHelp} rows={compositionRows} columns={[{key:'name',label:'Lineup'},{key:'appearances',label:'Races',numeric:true},{key:'wins',label:'Wins',numeric:true},{key:'winrate',label:'Win rate',numeric:true}]}>{#snippet cell(row,column)}{#if column.key==='name'}<span class="lineup">{#each compositions.find(r=>r.key===row.id)?.styles??[] as id,i}{#if i}<span class="slash">/</span>{/if}<span style:color={styleColors[id]}>{runningStyleName(id,true)}</span>{/each}</span>{:else if column.key==='winrate'}{Number(row.winrate).toFixed(1)}%{:else}{row[column.key]}{/if}{/snippet}</DataTable></ChartFrame>
  </div>
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-characters'} ><header class="analysis-heading"><h2>Uma analysis</h2><p>Compare field share, win rates and winning partners.</p></header><div class="section-body">{#if active}
  <div class="toolbar"><SelectField id="uma-minimum" label="Minimum field share" options={[{value:'0',label:'All Umas'},{value:'3',label:'At least 3%'},{value:'5',label:'At least 5%'}]} bind:value={minimum}/><SelectField id="uma-ranking" label="Rank by" options={[{value:'wins',label:'Win rate'},{value:'popularity',label:'Popularity'}]} bind:value={characterSort}/></div>
  <div class="uma-analysis"><ChartFrame plain surface compact id="session-umas" title="Uma breakdown" description="Select an Uma to explore its team combinations."><div class="ranking"><DataTable plain compact caption="Session Uma performance" columnHelp={metricHelp} maxHeight={460} rows={characters.map(r=>({id:r.key,name:r.name,cardId:r.cardId??'—',entries:r.races,field:rate(r.races,entries.length),wins:r.wins,winrate:rate(r.wins,r.races)}))} columns={[{key:'name',label:'Uma'},{key:'winrate',label:'Win rate',numeric:true},{key:'entries',label:'Entries',numeric:true},{key:'field',label:'Field share',numeric:true},{key:'wins',label:'Wins',numeric:true}]}>{#snippet cell(row,column)}{#if column.key==='name'}<button class="character-select" class:selected={selectedCharacter?.key===row.id} aria-pressed={selectedCharacter?.key===row.id} onclick={()=>uma=String(row.id)}><RunnerReference name={String(row.name)} cardId={typeof row.cardId==='number'?row.cardId:undefined} detail={characterStyles.get(String(row.id))}/></button>{:else if ['field','winrate'].includes(column.key)}{Number(row[column.key]).toFixed(1)}%{:else}{row[column.key]}{/if}{/snippet}</DataTable></div></ChartFrame>
    <ChartFrame plain surface compact expandable maximize id="uma-popularity" title="Popularity vs. performance" description="Select a portrait or a row to inspect an Uma.">
      <SessionUmaPlot {characters} entries={entries.length} selected={selectedCharacter?.key} onselect={key=>uma=key}/>
      {#if selectedCharacter}<div class="uma-inspection"><RunnerReference name={selectedCharacter.name} cardId={selectedCharacter.cardId}/><dl><div><dt>Win rate</dt><dd>{percent(selectedCharacter.wins,selectedCharacter.races)}</dd></div><div><dt>Field share</dt><dd>{percent(selectedCharacter.races,entries.length)}</dd></div><div><dt>Entries</dt><dd>{selectedCharacter.races}</dd></div></dl><Button size="sm" variant="secondary" onclick={()=>findTeams(selectedCharacter.key)}>Find teams</Button></div>{/if}
    </ChartFrame>
  </div>
  {#if selectedCharacter}<ChartFrame plain surface compact id="session-partners" title={'Winning partners for '+selectedCharacter.name}>
    <DataTable plain compact caption="Winning team lineups" columnHelp={metricHelp} rows={winningPartners.map(t=>({id:t.key,appearances:t.appearances,wins:t.wins,winrate:rate(t.wins,t.appearances)}))} columns={[{key:'lineup',label:'Team lineup',sortable:false},{key:'winrate',label:'Win rate',numeric:true},{key:'appearances',label:'Races',numeric:true},{key:'wins',label:'Wins',numeric:true}]}>
      {#snippet cell(row,column)}{#if column.key==='lineup'}<div class="partner-lineup">{#each winningPartners.find(t=>t.key===row.id)?.members??[] as member}<button onclick={()=>findTeams(member.key)} aria-label={'Find teams with '+member.name}><RunnerReference name={member.name} cardId={member.cardId} compact/></button>{/each}</div>{:else if column.key==='winrate'}{Number(row.winrate).toFixed(1)}%{:else}{row[column.key]}{/if}{/snippet}
    </DataTable>
  </ChartFrame>{/if}
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-teams'} ><header class="analysis-heading"><h2>Teams & builds</h2><p>Find captured builds and return to their race.</p></header><div class="section-body">{#if active}
  <div class="toolbar"><TextField id="cm-search" label="Uma or trainer" type="search" placeholder="Search teams and builds…" bind:value={teamSearch}/><SelectField id="team-style" label="Strategy" options={[{value:'all',label:'All strategies'},...[1,2,3,4].map(id=>({value:String(id),label:runningStyleName(id)}))]} bind:value={style}/><SelectField id="team-sort" label="Sort teams" options={[{value:'wins',label:'Team win rate'},{value:'appearances',label:'Most appearances'}]} bind:value={teamSort}/></div>
  <div class="section-heading"><p>{filteredTeams.length.toLocaleString()} matching team builds</p>{#if uma}<Button variant="secondary" size="sm" icon="close" onclick={()=>uma=''}>Clear Uma filter</Button>{/if}</div>
  <div class="team-grid">{#each filteredTeams.slice(0,teamLimit) as team,i}<section class="team-card"><header class="team-heading"><div><span class="team-number">#{i+1}</span><span class="lineup">{#each team.members as runner,j}{#if j}<span class="slash">/</span>{/if}<span style:color={styleColors[runner.result?.runningStyle??0]}>{runningStyleName(runner.result?.runningStyle,true)}</span>{/each}</span></div><div class="team-rate"><strong>{percent(team.wins,team.appearances)}</strong><span>team wins</span></div></header><div class="member-heading"><span>{team.trainer}</span><span>Build stats</span></div><div class="team-members">{#each team.members as runner}{@render runnerSummary(runner,team.races[0]!)}{/each}</div><footer><span>{team.wins} wins in {team.appearances} races</span><div><Button variant="secondary" size="sm" onclick={()=>inspect(team.members,team.trainer,team.races[0]!)}>Inspect team</Button>{#if onlobby}<Button variant="primary" size="sm" onclick={()=>onlobby?.(team.members)}>Add to lobby</Button>{/if}</div></footer></section>{:else}<EmptyState icon="search" title="No matching teams" description="Clear the Uma filter or try another strategy or name."/>{/each}</div>
  {#if filteredTeams.length}<div class="team-pagination"><span>Showing {Math.min(teamLimit,filteredTeams.length)} of {filteredTeams.length} teams</span>{#if teamLimit<filteredTeams.length}<Button variant="secondary" size="sm" onclick={()=>teamLimit+=12}>Show more teams</Button>{/if}</div>{/if}
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-skills'} ><header class="analysis-heading"><h2>Skill analysis</h2><p>Learned skills, activation conditions and active time.</p></header><div class="section-body">{#if active}
  <dl class="session-counts" aria-label="Session skill totals"><div><dt>Learned entries</dt><dd>{analysis.skills.reduce((n,r)=>n+r.learned,0).toLocaleString()}</dd></div><div><dt>Activation rate</dt><dd>{percent(analysis.skills.reduce((n,r)=>n+r.activatedRunners,0),analysis.skills.reduce((n,r)=>n+r.learned,0))}</dd></div></dl>
  <div class="toolbar"><TextField id="analysis-search" label="Filter skills" type="search" bind:value={skillSearch} placeholder="Search learned skills…"/><SelectField id="skill-selection" label="Inspect activation locations" options={analysis.skills.map(r=>({value:String(r.skillId),label:skillNames.get(r.skillId)??('Skill '+r.skillId)}))} value={String(selectedSkill?.skillId??'')} onchange={v=>skill=v}/></div>
  <ChartFrame plain surface compact expandable maximize id="skill-locations" title="Activation locations" description={selectedSkill?skillNames.get(selectedSkill.skillId)??('Skill '+selectedSkill.skillId):'No activation events available'}><LazyEChartsSurface height={190} label="Skill activation distance" option={chart([{type:'bar',data:distances.counts,itemStyle:{color:'#d194df'}}],{type:'category',data:distances.labels.map(n=>Math.round(n)+'m'),axisLabel:{rotate:25}},{type:'value',name:'Activations'})}/></ChartFrame>
  <DataTable plain compact caption="Skill Analysis" columnHelp={metricHelp} columns={[{key:'name',label:'Skill'},{key:'learned',label:'Learned',numeric:true},{key:'activated',label:'Activation rate',numeric:true},{key:'active',label:'Avg. active (s)',numeric:true},{key:'failed',label:'Wit check failed',numeric:true},{key:'untriggered',label:'Condition failed',numeric:true},{key:'double',label:'Double procs',numeric:true},{key:'winrate',label:'Runner win rate',numeric:true}]} rows={analysis.skills.map(r=>({id:r.skillId,name:skillNames.get(r.skillId)??('Skill '+r.skillId),learned:r.learned,activated:percent(r.activatedRunners,r.learned),active:r.measuredEntries?(r.durationTotal/r.measuredEntries).toFixed(2):'—',failed:r.measuredEntries?r.rollFailures:'—',untriggered:r.measuredEntries?r.passedUntriggered:'—',double:r.doubleProcRaces,winrate:percent(r.wins,r.learned)})).filter(r=>r.name.toLowerCase().includes(skillSearch.toLowerCase()))}>{#snippet cell(row,column)}{#if column.key==='name'}<button class="skill-select" class:selected={String(row.id)===String(selectedSkill?.skillId)} aria-pressed={String(row.id)===String(selectedSkill?.skillId)} onclick={()=>skill=String(row.id)}><RaceSkill id={Number(row.id)} name={String(row.name)}/></button>{:else}{row[column.key]}{/if}{/snippet}</DataTable>
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-hp'} ><header class="analysis-heading"><h2>HP & last spurt</h2><p>Check remaining HP and last-spurt timing for your runners.</p></header><div class="section-body">{#if active}
  <DataTable plain compact caption="HP & Last Spurt" columnHelp={metricHelp} maxHeight={420} columns={[{key:'name',label:'Your Uma'},{key:'finish',label:'Avg. finish HP',numeric:true},{key:'delay',label:'Avg. spurt delay',numeric:true},{key:'speed',label:'Avg. spurt speed',numeric:true},{key:'entries',label:'Races',numeric:true},{key:'winrate',label:'Win rate',numeric:true},{key:'start',label:'Avg. start HP',numeric:true},{key:'survival',label:'Finished with HP',numeric:true}]} rows={analysis.hp.map(r=>({id:r.key,name:r.name,cardId:r.cardId??'—',entries:r.races,finishPercent:r.finishHpPercentEntries?r.finishHpPercentTotal/r.finishHpPercentEntries:'—',winrate:percent(r.wins,r.races),start:r.startHpEntries?r.startHpTotal/r.startHpEntries:'—',finish:r.finishHpEntries?r.finishHpTotal/r.finishHpEntries:'—',survival:r.finishHpEntries?percent(r.survived,r.finishHpEntries):'—',delay:r.spurtDelayEntries?r.spurtDelayTotal/r.spurtDelayEntries:'—',speed:r.spurtSpeedEntries?r.spurtSpeedTotal/r.spurtSpeedEntries:'—'}))}>
    {#snippet cell(row,column)}{#if column.key==='name'}<button class="character-select" onclick={()=>{uma=String(row.id);jump('characters');}} aria-label={'Show '+row.name+' analysis'}><RunnerReference name={String(row.name)} cardId={typeof row.cardId==='number'?row.cardId:undefined}/></button>{:else if column.key==='delay'}<span class:warning={typeof row.delay==='number'&&row.delay>.05}>{typeof row.delay==='number'?row.delay.toFixed(1)+' m':'—'}</span>{:else if column.key==='speed'}{typeof row.speed==='number'?row.speed.toFixed(2)+' m/s':'—'}{:else if column.key==='finish'}<span class="finish-hp" style:color={hpRemainingColor(typeof row.finishPercent==='number'?row.finishPercent:undefined,$theme==='dark')}>{typeof row.finish==='number'?Math.round(row.finish).toLocaleString():'—'}{#if typeof row.finishPercent==='number'}<span>({row.finishPercent.toFixed(1)}%)</span>{/if}</span>{:else if column.key==='start'}{typeof row[column.key]==='number'?Math.round(Number(row[column.key])).toLocaleString():'—'}{:else}{row[column.key]}{/if}{/snippet}
  </DataTable>
  {#if !analysis.hp.length}<p>No player runners were identified in these captures.</p>{/if}
{/if}</div></section>
<section class="analysis-section" id={instanceId+'-diagnostics'}><header class="analysis-heading"><h2>Detailed analysis</h2><p>Compare simulation decisions across races and inspect each runner.</p></header>{#if active}<SessionDiagnostics {captures} {skillNames} {onreplay} {pending} onbuild={(runner,race)=>inspect([runner],runner.name,race)}/>{/if}</section>
</div>
</div>
<Dialog open={Boolean(detail)} title={detailTitle} maxWidth={detail?.length===1?'820px':'1120px'} onclose={()=>detail=undefined}><RunnerBuildGroup single={detail?.length===1}>{#each detail??[] as runner}<RunnerBuildDetails {runner} {skillNames} color={styleColors[runner.result?.runningStyle??0]} raceContext={{distance:captures[selectedRace]?.raceDistance}}/>{/each}</RunnerBuildGroup>{#snippet actions()}{#if onreplay}<Button variant="secondary" size="sm" icon="race" onclick={()=>{const runner=detail?.length===1?detail[0]?.index:undefined;detail=undefined;onreplay?.(selectedRace,runner);}}>View race replay</Button>{/if}{#if onlobby&&detail?.length===3}<Button size="sm" onclick={()=>{onlobby?.(detail!);detail=undefined;}}>Add team to lobby</Button>{/if}{/snippet}</Dialog>
<style>
  .analysis,.session-sections,.section-body{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;gap:12px}
  .session-sections{gap:24px}.analysis-section{min-width:0;scroll-margin-top:50px}
  .session-navigation{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}
  .session-navigation :global(.ui-button){font-size:12px;font-weight:500}
  .analysis-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 16px;margin-bottom:10px}
  h2,h4,p{margin:0}h2{font-size:16px;font-weight:650}h4{font-size:12px;font-weight:600;margin-bottom:4px}
  p{font-size:12px;line-height:1.5;color:var(--text-secondary)}.analysis-heading p{font-size:11px}
  .session-counts{display:flex;flex-wrap:wrap;gap:8px 32px;margin:0;font-size:12px}
  .session-counts>div{display:flex;align-items:baseline;gap:8px}.session-counts dt{color:var(--text-secondary)}.session-counts dd{margin:0;font-weight:650;font-variant-numeric:tabular-nums}
  .overview,.two-col,.uma-analysis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-width:0}
  .overview>:global(figure:last-child){grid-column:1/-1}.overview>:global(figure:last-child .plot){justify-content:center}
  .highlights{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
  .performance-row{display:grid;grid-template-columns:110px minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;padding:6px 0;border-bottom:1px solid var(--border-subtle);font-size:11px}
  .performance-row>span{color:var(--text-secondary)}.performance-row:nth-last-child(-n+2){border-bottom:0}
  .performance-row button{display:flex;align-items:center;gap:6px;min-width:0;padding:0;border:0;background:none;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}
  .performance-row button:hover{color:var(--accent-primary)}.performance-row button :global(svg){flex:none;transform:rotate(-90deg)}
  .performance-value{font-size:14px;font-weight:650;color:var(--accent-primary);font-variant-numeric:tabular-nums;white-space:nowrap}
  .style-dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;vertical-align:middle}.lineup{display:inline-flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:11px}.slash{color:var(--text-secondary);opacity:.5}
  .representatives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 20px}
  .uma-row{display:flex;align-items:center;gap:8px;width:100%;min-width:0;padding:5px 0;border:0;border-bottom:1px solid var(--border-subtle);background:none;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}
  .uma-row>:global(.runner-reference){flex:1;min-width:0;font-size:12px}.uma-row strong{font-size:12px;font-weight:600;text-align:right;font-variant-numeric:tabular-nums}.uma-row:hover{color:var(--accent-primary)}.uma-row:last-child{border-bottom:0}
  .toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.toolbar>:global(.field){flex:1;min-width:180px}
  .uma-analysis{align-items:start}.ranking{min-width:0}.character-select{display:flex;align-items:center;gap:8px;padding:2px 0;border:0;background:none;color:var(--text-primary);font:inherit;cursor:pointer}.character-select.selected,.character-select:hover{color:var(--accent-primary)}
  .uma-inspection{display:flex;align-items:center;flex-wrap:wrap;gap:10px 20px;padding-top:10px;border-top:1px solid var(--border-subtle)}.uma-inspection>:global(.runner-reference){margin-right:auto}.uma-inspection dl{display:flex;flex-wrap:wrap;gap:16px;margin:0}.uma-inspection dl>div{display:flex;align-items:baseline;gap:6px;font-size:11px}.uma-inspection dt{color:var(--text-secondary)}.uma-inspection dd{margin:0;font-weight:600}.partner-lineup{display:flex;flex-wrap:wrap;gap:6px 20px}.partner-lineup button{padding:0;border:0;background:none;color:inherit;font:inherit;cursor:pointer;text-align:left}.partner-lineup button:hover{color:var(--accent-primary)}.partner-lineup>:global(button){flex:1;min-width:140px}.warning{color:var(--accent-warning)}.finish-hp{display:inline-flex;align-items:baseline;gap:5px;white-space:nowrap}.finish-hp>span{font-size:10px}
  .section-heading{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
  .team-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px}
  .team-card{min-width:0;display:flex;flex-direction:column;background:var(--surface-1);border-radius:var(--radius-lg);padding:10px 14px;container-type:inline-size}
  .team-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}.team-heading>div:first-child{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}
  .team-number{font-size:12px;color:var(--text-secondary);font-weight:600}.team-rate{display:flex;align-items:baseline;gap:4px;flex:none}.team-rate strong{color:var(--accent-primary);font-size:23px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.team-rate>span{font-size:10px;color:var(--text-secondary)}
  .member-heading{display:flex;justify-content:space-between;gap:8px;font-size:10px;color:var(--text-secondary);padding-bottom:5px;border-bottom:1px solid var(--border-subtle)}.member-heading>span:last-child{padding-right:20px}
  .team-members{display:grid;align-content:start;flex:1;min-width:0}
  .build-summary{display:grid;grid-template-columns:minmax(0,1fr) 13px;align-items:center;gap:8px;width:100%;min-width:0;padding:6px 0;border:0;border-bottom:1px solid var(--border-subtle);border-radius:var(--radius-sm);background:transparent;color:var(--text-primary);font:inherit;text-align:left;cursor:pointer}.build-summary:last-child{border-bottom:0}.build-summary:hover{background:var(--surface-2)}.build-summary>:global(svg){transform:rotate(-90deg);color:var(--text-secondary)}
  .team-card>footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px solid var(--border-subtle)}.team-card>footer>span{font-size:11px;color:var(--text-secondary)}.team-card>footer>div{display:flex;gap:6px;margin-left:auto}
  .team-pagination{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text-secondary)}
  .skill-select{padding:2px 0;border:0;background:none;cursor:pointer}.skill-select.selected{box-shadow:0 0 0 1px var(--accent-primary);border-radius:4px}
  .analysis :global(.compact th),.analysis :global(.compact td){padding:4px 8px}.analysis :global(td .runner-reference){vertical-align:middle}.analysis :global(th),.analysis :global(.sort){font-size:11px;text-transform:none;letter-spacing:0}
  .analysis :global(.chart-frame.expanded .lazy-surface),.analysis :global(.chart-frame.expanded .lazy-surface>figure),.analysis :global(.chart-frame.expanded .chart-host),.analysis :global(.chart-frame.expanded .placeholder){height:100%;min-height:0}
  @media(min-width:1450px){.overview{grid-template-columns:repeat(3,minmax(0,1fr))}.overview>:global(figure:last-child){grid-column:auto}.highlights{grid-template-columns:minmax(0,1fr)}.performance-row:last-child{border-bottom:0}.performance-row:nth-last-child(2){border-bottom:1px solid var(--border-subtle)}}
  @media(max-width:760px){.session-sections{gap:20px}.overview,.two-col,.uma-analysis{grid-template-columns:minmax(0,1fr)}.overview>:global(figure:last-child){grid-column:auto}.highlights{grid-template-columns:minmax(0,1fr)}.performance-row{grid-template-columns:98px minmax(0,1fr) auto;gap:6px}.performance-row:nth-last-child(2){border-bottom:1px solid var(--border-subtle)}.performance-row:last-child{border-bottom:0}.performance-value{font-size:12px}.representatives{gap:10px}.toolbar>:global(.field){min-width:140px}.team-card{padding:10px 12px}.session-counts{gap:6px 20px}.analysis :global(.chart-frame.surface.compact){padding:10px 12px}}
</style>
