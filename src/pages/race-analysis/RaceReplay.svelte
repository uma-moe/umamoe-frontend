<script lang="ts">
  import { onDestroy,onMount } from 'svelte';
  import type { ParsedRaceCapture,RaceRunner } from '@/lib/race/race-capture-parser';
  import { raceFrameAtTime,raceReplayBounds,replayViewport,replayLaneMetres,raceTimeAtDistance } from '@/lib/race/race-replay';
  import { formatRaceTime,runningStyleName } from '@/lib/race/race-display';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Tabs from '@/components/Tabs.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RunnerBuild from '@/pages/competitive/RunnerBuild.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import { loadReplayCourses,loadReplayGeometry,courseSegments,type CourseData,type CourseShape } from './replay-course';
  import ReplayCourseMap from './ReplayCourseMap.svelte';
  import ReplayTimeline from './ReplayTimeline.svelte';
  let {capture,skillNames=new Map<number,string>()}:{capture:ParsedRaceCapture;skillNames?:Map<number,string>}=$props();
  let time=$state(0),selected=$state('0'),playing=$state(false),speed=$state('1'),metric=$state('speed'),view=$state('telemetry'),compare=$state(true),windowMeters=$state(80),trackOverride=$state('');
  const trackId=$derived(trackOverride||String(capture.courseId??''));
  let shapes=$state.raw<Record<string,CourseShape>>(),geometryError=$state('');
  let courses=$state.raw<CourseData>(),courseError=$state(''),visibility=$state<Record<number,number>>({}),fullscreenTarget=$state<HTMLDivElement>(),fullscreen=$state(false);
  let toggles=$state({skills:true,blocked:true,slopes:true,speed:false,accel:false,course:true,positionKeep:false,overview:true});
  const toggleLabels={skills:'Skill labels',blocked:'Block indicator',slopes:'Slopes',speed:'Speed [m/s]',accel:'Acceleration [m/s²]',course:'Course events',positionKeep:'Position Keep',overview:'Course overview'};
  let settingsOpen=$state(false);
  let timer:ReturnType<typeof setInterval>|undefined;
  const course=$derived(courses?.courses[trackId]);
  const bounds=$derived(raceReplayBounds(capture.frames,course?.distance??shapes?.[trackId]?.distance??capture.raceDistance));
  const frame=$derived(raceFrameAtTime(capture.frames,time));
  const runner=$derived(capture.runners.find(r=>r.index===Number(selected))??capture.runners[0]);
  const leader=$derived(Math.max(0,...(frame?.horses.map(h=>h.distance)??[])));
  const viewport=$derived(replayViewport(leader,bounds.distanceMax,windowMeters,Math.max(0,...(frame?.horses.map(h=>h.lanePosition)??[]))));
  const segments=$derived(courseSegments(course));
  const laneWidth=$derived(capture.laneDistanceMax&&capture.laneDistanceMax>0?(capture.laneDistanceMax>3?capture.laneDistanceMax:11.25*capture.laneDistanceMax):(course?.laneMax??11250)/1000);
  const laneMetres=(value:number)=>replayLaneMetres(value,laneWidth).toFixed(1);
  const activeSkills=$derived(capture.events.filter(e=>e.type===3&&e.params[0]===runner?.index&&time>=e.frameTime&&time-e.frameTime<2));
  const activations=$derived(capture.events.filter(e=>e.type===3&&e.params[0]===runner?.index).sort((a,b)=>a.frameTime-b.frameTime));
  const currentHorse=$derived(frame?.horses[runner?.index??0]);
  const teamKeys=$derived([...new Set(capture.runners.map(r=>String(r.raw.trainer_id??r.raw.team_id??r.trainerName??r.index)))]);
  const teamColor=(r:RaceRunner)=>['#69b7ee','#e69c72','#c79be7','#78bba3'][teamKeys.indexOf(String(r.raw.trainer_id??r.raw.team_id??r.trainerName??r.index))%4]!;
  const x=(distance:number)=>(distance-viewport.min)/(viewport.max-viewport.min)*1000;
  const racePhase=$derived(!frame?'No telemetry':time>=bounds.endTime?'Finished':leader>=bounds.distanceMax?'Finishing':leader<bounds.distanceMax/6?'Early race':leader<bounds.distanceMax*2/3?'Mid race':'Late race');
  const currentSegment=$derived(segments.find(s=>leader>=s.start&&leader<s.end)?.label??racePhase);
  const fieldOrder=$derived([...capture.runners].sort((a,b)=>time>=bounds.endTime&&capture.frames.length?(a.result?.finishOrder??99)-(b.result?.finishOrder??99):(frame?.horses[b.index]?.distance??0)-(frame?.horses[a.index]?.distance??0)));
  const remainingHp=$derived(currentHorse?Math.min(100,Math.max(0,currentHorse.hp/Math.max(1,capture.frames[0]?.horses[runner?.index??0]?.hp??1)*100)):undefined);
  function pause(){clearInterval(timer);timer=undefined;playing=false;}
  function seek(value:number){pause();time=Math.min(bounds.endTime,Math.max(bounds.startTime,value));}
  function seekDistance(distance:number){const value=raceTimeAtDistance(capture.frames,distance);if(value!==undefined)seek(value);}
  function play(){
    if(playing){pause();return;}if(time>=bounds.endTime)time=bounds.startTime;
    playing=true;let previous=performance.now();
    timer=setInterval(()=>{const now=performance.now();time=Math.min(bounds.endTime,time+(now-previous)/1000*Number(speed));previous=now;if(time>=bounds.endTime)pause();},33);
  }
  function cycle(r:RaceRunner,focus=false){if(focus)visibility=Object.fromEntries(capture.runners.map(item=>[item.index,item.index===r.index?0:1]));else visibility={...visibility,[r.index]:((visibility[r.index]??0)+1)%3};}
  function acceleration(index:number){const source=frame?.sourceIndex??0,left=capture.frames[source],right=capture.frames[source+1];return left&&right&&right.time>left.time?((right.horses[index]?.speed??0)-(left.horses[index]?.speed??0))/(right.time-left.time)/100:0;}
  async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await fullscreenTarget?.requestFullscreen();}catch{courseError='Fullscreen is unavailable in this browser.';}}
  function keydown(event:KeyboardEvent){if(event.target!==document.body)return;if(event.code==='Space'){event.preventDefault();play();}else if(event.key==='ArrowRight'){event.preventDefault();seek(time+.1);}else if(event.key==='ArrowLeft'){event.preventDefault();seek(time-.1);}}
  $effect(()=>{capture;pause();time=capture.frames[0]?.time??0;selected=String(capture.runners[0]?.index??0);trackOverride='';visibility={};});
  async function loadGeometry(){geometryError='';try{shapes=await loadReplayGeometry();}catch{geometryError='Course geometry could not be loaded from resources.';}}
  onMount(()=>{let alive=true;void loadReplayCourses().then(value=>{if(alive)courses=value;}).catch(e=>{if(alive)courseError=e.message;});void loadGeometry();return()=>{alive=false;};});
  onDestroy(pause);
  const chartRunners=$derived(compare?capture.runners:runner?[runner]:[]);
  const option=$derived({
    animation:false,textStyle:{color:$theme==='dark'?'#abb4c3':'#566071'},tooltip:{trigger:'axis'},grid:{left:50,right:25,top:30,bottom:55},xAxis:{type:'value',name:'Time (s)',nameLocation:'middle',nameGap:22,splitLine:{lineStyle:{opacity:.12}}},yAxis:{type:'value',name:metric==='speed'?'m/s':metric==='hp'?'HP %':'Gap (m)',splitLine:{lineStyle:{opacity:.12}}},
    dataZoom:[{type:'inside'},{type:'slider',height:14,bottom:5}],
    series:chartRunners.map(r=>({name:r.name,type:'line',showSymbol:false,lineStyle:{width:r.index===runner?.index?3:1,opacity:r.index===runner?.index?1:.35},itemStyle:{color:teamColor(r)},data:capture.frames.map(f=>[f.time,metric==='speed'?(f.horses[r.index]?.speed??0)/100:metric==='hp'?(f.horses[r.index]?.hp??0)/Math.max(1,capture.frames[0]?.horses[r.index]?.hp??1)*100:Math.max(...f.horses.map(h=>h.distance))-(f.horses[r.index]?.distance??0)])}))
  });
  const rows=$derived([...capture.runners].sort((a,b)=>(a.result?.finishOrder??99)-(b.result?.finishOrder??99)).map(r=>({index:r.index,card:r.cardId??0,place:r.result?.finishOrder??'—',name:r.name,trainer:r.trainerName??'—',style:runningStyleName(r.result?.runningStyle),time:formatRaceTime(r.result?.finishTime),delay:r.result?.startDelayTime.toFixed(3)??'—'})));
</script>
<svelte:window onkeydown={keydown} onfullscreenchange={()=>fullscreen=!!document.fullscreenElement}/>
<section class="replay">
  <header class="replay-header"><div class="replay-title"><span class="replay-icon"><Icon name="race" size={24}/></span><div><h2>Race replay</h2><p>{course?(courses?.names[course.raceTrackId]??'Track'):'Race capture'} · {Math.round(bounds.distanceMax).toLocaleString()} m · {capture.track.condition??'Unknown condition'} · {capture.track.weather??'Unknown weather'} <span class="course-source">{trackOverride?'Manual course':capture.courseId?'Course detected':'Course not identified'}</span></p></div></div><Button variant="secondary" size="sm" icon="tools" ariaExpanded={settingsOpen} ariaControls="replay-settings" onclick={()=>settingsOpen=!settingsOpen}>Display options</Button></header>
  {#if settingsOpen}<div class="replay-toolbar" id="replay-settings">
    <div class="course-controls"><SelectField id="replay-track" label="Track" bind:value={trackOverride} options={[{value:'',label:capture.courseId?'Auto · Course '+capture.courseId:'Auto-detect from replay'},...Object.entries(courses?.courses??{}).map(([id,c])=>({value:id,label:(courses?.names[c.raceTrackId]??id)+' · '+c.distance+'m · '+(c.surface===1?'Turf':'Dirt')+(c.turn===1?' · Right':' · Left')}))]}/><label>View window <input aria-label="View window metres" type="number" min="20" max="400" step="10" bind:value={windowMeters}/> m</label><label>Frame <input aria-label="Replay frame" type="number" min="0" max={Math.max(0,capture.frames.length-1)} value={frame?.sourceIndex??0} onchange={e=>seek(capture.frames[Number(e.currentTarget.value)]?.time??time)}/> / {capture.frames.length}</label></div>
    <div class="options">{#each Object.entries(toggleLabels) as [key,label]}<Checkbox id={'replay-option-'+key} {label} bind:checked={toggles[key as keyof typeof toggles]}/>{/each}</div>
    <Button variant="ghost" size="sm" onclick={()=>{const next=!Object.values(toggles).every(Boolean);toggles={skills:next,blocked:next,slopes:next,speed:next,accel:next,course:next,positionKeep:next,overview:next};}}>Toggle options</Button>
  </div>{/if}
  {#if courseError}<p class="notice" role="status">{courseError}</p>{/if}
  <div class="replay-layout" bind:this={fullscreenTarget}>
  <div class="fullscreen-target">
    <div class="stage-heading"><div><strong>Race positions</strong><span class="stage-section">{currentSegment}</span></div><div class="course-legend">{#each [{label:'Straight',color:'#64918c'},{label:'Final straight',color:'#419168'},{label:'Corner',color:'#7b7ea8'},{label:'Final corner',color:'#bb9148'}] as item}<span><i style:background={item.color}></i>{item.label}</span>{/each}</div><Button variant="ghost" size="sm" onclick={toggleFullscreen}>{fullscreen?'Exit fullscreen':'Fullscreen'}</Button></div>
    <div class="race-stage" aria-label="Runner positions by distance and lane">
      <div class="lane-axis" title="Lateral distance from the inside rail, in metres"><small>Lane · m</small>{#each [0,.25,.5,.75,1] as fraction}<span style:bottom={fraction*100+'%'}>{laneMetres(viewport.laneMax*fraction)}</span>{/each}</div>
      <div class="track-plane">
        <span class="rail-label">INSIDE RAIL</span>
        <svg class="course-background" viewBox="0 0 1000 410" preserveAspectRatio="none" aria-hidden="true">
          {#each [.25,.5,.75,1] as fraction}<line x1="0" x2="1000" y1={410*(1-fraction)} y2={410*(1-fraction)} class="lane-guide"/>{/each}
          {#if toggles.course}{#each segments as segment}<rect x={x(segment.start)} y="0" width={(segment.end-segment.start)/(viewport.max-viewport.min)*1000} height="410" fill={segment.color} fill-opacity=".07"/><line x1={x(segment.start)} x2={x(segment.start)} y1="0" y2="410" stroke={segment.color} stroke-dasharray="4 4"/>{/each}
          {#each [{distance:bounds.distanceMax/6,label:'Mid race'},{distance:bounds.distanceMax*10/24,label:'Position Keep ends'},{distance:bounds.distanceMax*2/3,label:'Late race'},{distance:bounds.distanceMax,label:'Goal In'}] as marker}<line x1={x(marker.distance)} x2={x(marker.distance)} y1="0" y2="410" class="phase-marker"/>{/each}{/if}
          {#if toggles.slopes}{#each course?.slopes??[] as slope}<polygon points={slope.slope>0?x(slope.start)+',410 '+x(slope.start+slope.length)+',410 '+x(slope.start+slope.length)+',205':x(slope.start)+',410 '+x(slope.start)+',205 '+x(slope.start+slope.length)+',410'} fill={slope.slope>0?'#bd7581':'#719bdd'} fill-opacity=".07"/>{/each}{/if}
          {#if toggles.positionKeep&&leader<bounds.distanceMax*10/24}{@const factor=1+(bounds.distanceMax-1000)*.0008}{#each [{min:3,max:5*factor,color:'#be91d4'},{min:6.5*factor,max:7*factor,color:'#69b7ee'},{min:7.5*factor,max:8*factor,color:'#7bc8a0'}] as zone}<rect x={x(leader-zone.max)} width={(zone.max-zone.min)/(viewport.max-viewport.min)*1000} y="0" height="410" fill={zone.color} fill-opacity=".16"/>{/each}{/if}
        </svg>
        {#if toggles.course}{#each segments.filter(s=>s.start>=viewport.min&&s.start<=viewport.max) as segment}<span class="course-label" style:left={x(segment.start)/10+'%'}>{segment.label}</span>{/each}{#each [{distance:bounds.distanceMax/6,label:'Mid race'},{distance:bounds.distanceMax*2/3,label:'Late race'},{distance:bounds.distanceMax,label:'Goal In'}].filter(m=>m.distance>=viewport.min&&m.distance<=viewport.max) as marker}<span class="course-label phase" style:left={x(marker.distance)/10+'%'}>{marker.label}</span>{/each}{/if}
        {#each capture.runners as r}{@const horse=frame?.horses[r.index]}{#if horse&&visibility[r.index]!==2}
          <button class="replay-marker" class:dim={visibility[r.index]===1} class:selected={r.index===runner?.index} style:left={x(horse.distance)/10+'%'} style:bottom={horse.lanePosition/viewport.laneMax*100+'%'} style:--runner-color={teamColor(r)} aria-label={'Inspect '+r.name} title={r.name+' · '+(horse.speed/100).toFixed(2)+' m/s · HP '+Math.round(horse.hp)+' · '+horse.distance.toFixed(1)+'m · Lane '+Math.round(horse.lanePosition)} onclick={()=>{selected=String(r.index);visibility=Object.fromEntries(capture.runners.map(item=>[item.index,item.index===r.index?0:1]));}}>
            {#if toggles.skills}<span class="skill-popups">{#each capture.events.filter(e=>e.type===3&&e.params[0]===r.index&&time>=e.frameTime&&time-e.frameTime<2) as event}<span><RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)}/></span>{/each}{#if horse.temptationMode>0}<span>Rushed</span>{/if}</span>{/if}
            {#if toggles.blocked&&horse.blockFrontHorseIndex>=0&&horse.blockFrontHorseIndex<capture.runners.length}<span class="blocked" title="Blocked">!</span>{/if}
            <span class="portrait"><Artwork src={portrait(r.cardId)} alt="" size="sm" shape="circle"/><b>{r.index+1}</b></span>
            <span class="hp"><i style:width={Math.min(100,Math.max(0,horse.hp/Math.max(1,capture.frames[0]?.horses[r.index]?.hp??1)*100))+'%'}></i></span>
            {#if r.index===runner?.index}<span class="marker-name">{r.name}</span>{/if}
            {#if toggles.speed}<span class="telemetry-value">{(horse.speed/100).toFixed(2)}</span>{/if}{#if toggles.accel}<span class="telemetry-value">{acceleration(r.index).toFixed(2)} m/s²</span>{/if}
          </button>
        {/if}{/each}
        <div class="distance-axis">{#each [0,.25,.5,.75,1] as fraction}<span style:left={fraction*100+'%'}>{Math.round(viewport.min+(viewport.max-viewport.min)*fraction)}m</span>{/each}</div>
      </div>
    </div>

    <ReplayTimeline frames={capture.frames} {bounds} {course} {activations} {skillNames} runnerName={runner?.name??'Selected runner'} bind:time bind:speed {playing} phase={racePhase} {leader} onplay={play} onpause={pause} onseek={seek}/>
    <div class="replay-context" hidden={!toggles.overview}>
    {#if toggles.overview}{#if shapes}<ReplayCourseMap frames={capture.frames} {laneWidth} onseekdistance={seekDistance} {course} shape={shapes[trackId]} onselectcourse={()=>settingsOpen=true} {frame} runners={capture.runners} bind:selected {visibility} {teamColor} {viewport} slopes={toggles.slopes}/>{:else if geometryError}<p class="notice" role="status">{geometryError} <Button variant="ghost" size="sm" onclick={loadGeometry}>Retry course geometry</Button></p>{:else}<p class="notice">Loading course geometry…</p>{/if}{/if}

    </div>
  </div>
  <aside class="live-roster" aria-label="Race field">
    <header><h3>Race field <span>{capture.runners.length}</span></h3><p>{time>=bounds.endTime&&frame?'Final result':'Distance order'} · select a runner to inspect</p></header>
    <div class="field-runners">{#each fieldOrder as r,index}{@const horse=frame?.horses[r.index]}<div class="field-runner" class:chosen={runner?.index===r.index} class:dimmed={visibility[r.index]===1} class:hidden-runner={visibility[r.index]===2} style:--team-color={teamColor(r)}>
      <button class="runner-pick" aria-pressed={runner?.index===r.index} aria-label={'Follow '+r.name} onclick={()=>selected=String(r.index)}><span class="field-place">{frame?index+1:'—'}</span><Artwork src={portrait(r.cardId)} alt="" size="xs"/><span class="field-name"><strong>{r.name}</strong><small>Gate {r.index+1} · {runningStyleName(r.result?.runningStyle)}</small></span><span class="field-gap">{horse?(index===0?'Lead':(leader-horse.distance).toFixed(1)+' m'):'—'}<small>{horse?(horse.speed/100).toFixed(1)+' m/s':'No frame'}</small></span></button>
      <IconButton size="sm" icon={visibility[r.index]===2?'eye-off':'eye'} label={r.name+': '+(['visible','dimmed','hidden'][visibility[r.index]??0])+'. Change visibility'} title="Click to dim, then hide; Shift-click to focus" onclick={event=>cycle(r,event.shiftKey)}/>
    </div>{/each}</div>
    <Button variant="ghost" size="sm" onclick={()=>visibility={}}>Show all runners</Button>
    {#if runner}<div class="live-focus"><div><Artwork src={portrait(runner.cardId)} alt="" size="sm" shape="circle"/><span><small>SELECTED RUNNER · GATE {runner.index+1}</small><strong>{runner.name}</strong><span class="runner-style">{runningStyleName(runner.result?.runningStyle)}</span></span></div><StatStrip label="Live runner data" presentation="inline" items={[{id:'speed',label:'Speed',value:currentHorse?(currentHorse.speed/100).toFixed(2):'—',unit:'m/s'},{id:'hp',label:'HP remaining',value:remainingHp===undefined?'—':remainingHp.toFixed(1),unit:'%'},{id:'gap',label:'To leader',value:currentHorse?(leader-currentHorse.distance).toFixed(1):'—',unit:'m'}]}/><div class="current-skills">{#each activeSkills as event}<RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)}/>{:else}<span>No skill activation at this moment</span>{/each}</div></div>{/if}

  </aside>
  </div>
</section>
<Tabs items={[{id:'telemetry',label:'Runner Analysis'},{id:'results',label:'Race Results'}]} bind:value={view} label="Replay analysis" variant="underline"/>
{#if view==='results'}
  <DataTable plain caption="Race results" columns={[{key:'place',label:'Place',numeric:true},{key:'name',label:'Uma'},{key:'style',label:'Strategy'},{key:'time',label:'Finish time',numeric:true},{key:'delay',label:'Start delay (s)',numeric:true},{key:'trainer',label:'Trainer'}]} {rows}>{#snippet cell(row,column)}{#if column.key==='name'}<button class="result-runner" onclick={()=>{selected=String(row.index);view='telemetry';}}><Artwork src={portrait(Number(row.card))} alt="" size="xs"/>{row.name}</button>{:else}{row[column.key]}{/if}{/snippet}</DataTable>
{:else if runner}
  <div class="runner-analysis"><section class="runner-card"><SelectField id="replay-runner" label="Inspect runner" options={capture.runners.map(r=>({value:String(r.index),label:r.name}))} bind:value={selected}/><RunnerBuild {runner} {skillNames} expanded/></section>
    <div class="telemetry"><ChartFrame plain surface id="runner-telemetry" title={runner.name+' · Race telemetry'} description="Zoom to inspect a section. The selected runner is highlighted.">
      {#snippet titleActions()}<Tabs items={[{id:'speed',label:'Speed'},{id:'hp',label:'HP'},{id:'gap',label:'Gap'}]} bind:value={metric} label="Telemetry metric" variant="underline"/>{/snippet}
      {#snippet actions()}<Button size="sm" variant="ghost" onclick={()=>compare=!compare}>{compare?'Selected runner only':'Compare all runners'}</Button>{/snippet}
      <LazyEChartsSurface {option} label="Runner telemetry over time" height={280} zoomable/>
    </ChartFrame><section class="events"><header><h3>Skill activations</h3><span>{activations.length} events · select an event to seek</span></header><div class="event-list">{#each activations as event}<button class:active={Math.abs(time-event.frameTime)<2} onclick={()=>seek(event.frameTime)}><time>{formatRaceTime(event.frameTime)}</time><RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)}/><span>{Math.round(raceFrameAtTime(capture.frames,event.frameTime)?.horses[runner.index]?.distance??0)}m</span></button>{:else}<p>No recorded skill activations for this runner.</p>{/each}</div></section></div>
  </div>
{/if}


<style>
  .replay{min-width:0}.replay-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px}.replay-title{display:flex;align-items:center;gap:12px;min-width:0}.replay-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:var(--color-accent-soft);color:var(--accent-primary);flex:none}h2{font-size:20px;letter-spacing:-.025em;margin:0 0 4px}p{font-size:12px;color:var(--text-secondary);line-height:1.6;margin:0}.course-source{display:inline-block;font-size:10px;margin-left:10px;color:var(--accent-primary)}.replay-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
  .replay-toolbar{display:flex;flex-wrap:wrap;gap:20px;padding:18px;background:var(--surface-1);border-radius:var(--radius-lg);margin-bottom:16px}.course-controls{display:grid;gap:12px;min-width:280px}.course-controls>label{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary)}input[type=number]{width:65px;padding:6px;border:1px solid var(--border-primary);background:var(--surface-2);border-radius:var(--radius-sm);color:var(--text-primary);font:inherit}.options{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;flex:1}.options :global(.checkbox){min-height:32px;gap:8px}.options :global(strong){font-size:11px}.options :global(.box){width:18px;height:18px}.notice{padding:16px}
  .fullscreen-target{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);overflow:hidden}.replay-layout:fullscreen{overflow:auto;padding:20px;background:var(--surface-1)}
  .stage-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 20px 0}.stage-heading strong{font-size:13px}.stage-section{font-size:11px;color:var(--text-secondary);margin-left:12px}.course-legend{display:flex;flex-wrap:wrap;gap:10px;color:var(--text-secondary);font-size:9px}.course-legend span{display:flex;gap:4px;align-items:center}.course-legend i{width:7px;height:7px;border-radius:2px}
  .race-stage{height:clamp(230px,25dvh,270px);position:relative;padding:30px 38px 42px 58px;box-sizing:border-box}.lane-axis{position:absolute;left:0;top:30px;bottom:42px;width:46px;font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.lane-axis span{position:absolute;right:0;transform:translateY(50%)}.lane-axis small{position:absolute;top:-23px;right:0;font-size:9px;white-space:nowrap}.track-plane{position:relative;height:100%;border-bottom:2px solid var(--border-primary);overflow:clip;overflow-clip-margin:44px}.course-background{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none}.lane-guide{stroke:var(--border-primary);stroke-dasharray:3 7;stroke-width:1;opacity:.5}.rail-label{position:absolute;bottom:9px;left:8px;font-size:8px;letter-spacing:.08em;color:var(--text-tertiary,var(--text-secondary));opacity:.7}.phase-marker{stroke:var(--text-secondary);stroke-dasharray:5 5}.course-label{position:absolute;top:4px;font-size:9px;white-space:nowrap;color:var(--text-secondary);transform:translateX(3px)}.course-label.phase{top:18px}
  .replay-marker{position:absolute;transform:translate(-50%,50%);display:flex;flex-direction:column;align-items:center;padding:0;gap:3px;background:none;border:0;color:var(--text-primary);cursor:pointer;z-index:2}.replay-marker.selected,.replay-marker:focus-visible{z-index:4}.replay-marker:focus-visible{outline:2px solid var(--accent-primary);outline-offset:5px;border-radius:50%}.portrait{position:relative;display:block;border:2px solid var(--runner-color);border-radius:50%;background:var(--surface-1)}.replay-marker.selected .portrait{box-shadow:0 0 0 3px var(--surface-1),0 0 0 5px var(--runner-color)}.portrait b{position:absolute;bottom:-2px;right:-3px;padding:1px 4px;font-size:10px;font-weight:700;color:#141923;border-radius:4px;background:var(--runner-color)}.hp{display:block;width:36px;height:3px;background:var(--surface-3);border-radius:3px;overflow:hidden}.hp i{display:block;height:100%;background:var(--accent-success)}.marker-name{position:absolute;top:calc(100% + 6px);font-size:10px;font-weight:600;white-space:nowrap;background:var(--surface-1);padding:2px 5px;border-radius:3px;pointer-events:none}.telemetry-value{font-size:10px;background:var(--surface-2);padding:2px 4px;white-space:nowrap;font-variant-numeric:tabular-nums}.blocked{position:absolute;right:-13px;top:-8px;color:var(--accent-error);font-weight:800;font-size:18px}.skill-popups{position:absolute;bottom:calc(100% + 10px);display:flex;flex-direction:column;gap:3px;align-items:center;font-size:10px;white-space:nowrap}.skill-popups>span{padding:2px 4px;background:var(--surface-1);border-radius:4px}.distance-axis{position:absolute;inset:100% 0 auto;height:20px;margin-top:20px;font-size:10px;color:var(--text-secondary)}.distance-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}
  .replay-context{margin:0 12px 10px;padding-top:4px;border-top:1px solid var(--border-subtle)}
  .dim{opacity:.25}.live-roster{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:16px 10px}.live-roster>header{padding:0 6px 12px}.live-roster h3{display:flex;justify-content:space-between;font-size:14px;margin:0 0 6px}.live-roster h3 span{color:var(--text-secondary);font-size:11px}.live-roster p{font-size:11px}.field-runner{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--border-subtle);border-radius:4px}.field-runner.chosen{background:var(--color-accent-soft)}.field-runner.dimmed .runner-pick{opacity:.5}.hidden-runner .runner-pick{opacity:.35}.runner-pick{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:0;padding:10px 4px;background:none;text-align:left;color:var(--text-primary);cursor:pointer}.field-place{width:16px;text-align:center;font-size:12px;color:var(--text-secondary);flex:none}.field-name{flex:1;min-width:0}.field-name strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.field-name small,.field-gap small{display:block;color:var(--text-secondary);font-size:10px;margin-top:4px}.field-gap{font-size:12px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .live-focus{min-width:0;margin:10px 6px 0;padding:14px 0 0;border-top:1px solid var(--border-subtle)}.live-focus>div:first-child{display:flex;align-items:center;gap:12px;margin-bottom:12px}.live-focus>div:first-child>span{display:grid;gap:5px}.live-focus small{font-size:9px;letter-spacing:.06em;color:var(--text-secondary)}.live-focus strong{font-size:16px}.runner-style{font-size:11px;color:var(--text-secondary)}.current-skills{display:flex;gap:4px;flex-wrap:wrap;min-height:24px;margin-top:10px;font-size:11px;color:var(--text-secondary);align-items:center}
  .runner-analysis{display:grid;grid-template-columns:300px minmax(0,1fr);gap:20px}.runner-card{display:grid;gap:16px;align-content:start;min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:18px}.telemetry{min-width:0;display:grid;gap:20px}.events{background:var(--surface-1);border-radius:var(--radius-lg);overflow:hidden}.events header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px}.events h3{font-size:13px;margin:0}.events header>span{font-size:10px;color:var(--text-secondary)}.event-list{max-height:260px;overflow:auto;padding:0 12px 12px}.event-list button{display:flex;align-items:center;gap:12px;width:100%;padding:9px 4px;border:0;border-top:1px solid var(--border-subtle);background:none;color:var(--text-primary);cursor:pointer}.event-list time{font:11px var(--font-mono);color:var(--text-secondary)}.event-list button>span:last-child{font-size:11px;margin-left:auto;color:var(--text-secondary)}.event-list button.active{background:color-mix(in srgb,var(--accent-warning) 8%,transparent)}.result-runner{display:flex;align-items:center;gap:10px;border:0;background:none;color:var(--accent-primary);cursor:pointer}
  @media(max-width:1150px){.replay-layout{grid-template-columns:minmax(0,1fr) 280px;gap:12px}.course-legend{display:none}.field-name strong{font-size:11px}.runner-pick{gap:5px}}
  @media(max-width:950px){.replay-layout{grid-template-columns:1fr}.field-runners{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.runner-analysis{grid-template-columns:260px minmax(0,1fr)}}
  @media(max-width:700px){.replay-header{align-items:start}.replay-title{gap:8px}.replay-icon{display:none}h2{font-size:18px}.replay-header p{font-size:11px}.course-source{display:block;margin-left:0}.replay-header>:global(button){flex:none}.replay-toolbar{padding:14px}.course-controls{min-width:0;width:100%}.options{gap:4px 12px}.race-stage{height:250px;padding-right:32px;padding-left:42px}.lane-axis{width:33px}.stage-heading{padding:8px 12px}.stage-section{display:none}.replay-context{margin-inline:12px}.live-focus>div:first-child{margin-bottom:12px}.current-skills{margin-top:10px}.runner-analysis{grid-template-columns:1fr}.field-runners{grid-template-columns:1fr}.runner-pick{padding:9px 5px;gap:10px}.field-name strong{font-size:12px}.field-name small{font-size:10px}.marker-name{font-size:9px;max-width:90px;overflow:hidden;text-overflow:ellipsis}}
</style>


