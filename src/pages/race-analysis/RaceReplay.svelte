<script lang="ts">
  import { onDestroy,onMount,tick as flush,untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import type { CustomSeriesRenderItem } from 'echarts';
  import { Spring } from 'svelte/motion';
  import type { ParsedRaceCapture,RaceRunner } from '@/lib/race/race-capture-parser';
  import { raceFrameAtTime,raceReplayBounds,replayViewport,replayLaneMetres,raceTimeAtDistance } from '@/lib/race/race-replay';
  import { formatRaceTime,runningStyleName,trackDetailName,hpRemainingColor } from '@/lib/race/race-display';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import ToggleButton from '@/components/ToggleButton.svelte';
  import StatStrip from '@/components/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';
  import ReplayResults from './ReplayResults.svelte';
  import ReplayDiagnostics from './ReplayDiagnostics.svelte';
  import SkillActivityTimeline from './SkillActivityTimeline.svelte';
  import { activeSpan,blockerAt,frontBlockingSpans,diagnosticHorse,diagnosticLabel,detailedSample,runnerHpResult } from '@/lib/race/race-diagnostics';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RunnerBuild from '@/pages/competitive/RunnerBuild.svelte';
  import RunnerBuildDetails from '@/pages/competitive/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '@/pages/competitive/RunnerBuildGroup.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import { loadReplayCourses,loadReplayGeometry,courseSegments,courseLandmarks,type CourseData,type CourseShape } from './replay-course';
  import ReplayCourseMap from './ReplayCourseMap.svelte';
  import ReplayTimeline from './ReplayTimeline.svelte';
  import ReplayFieldSpread from './ReplayFieldSpread.svelte';
  import ReplayOutcomeCourse from './ReplayOutcomeCourse.svelte';
  import { meanTrajectorySignal,trajectorySeries,type RaceTrajectory } from '@/lib/race/race-ensemble';
  let {capture,ensemble,selected=$bindable('0'),skillNames=new Map<number,string>(),headerActions,sessionReport,hasSession=false,focus,overviewOnly=false,suspended=false,onanalyse}:{capture:ParsedRaceCapture;ensemble?:RaceTrajectory[];selected?:string;skillNames?:Map<number,string>;headerActions?:Snippet;sessionReport?:Snippet;hasSession?:boolean;focus?:{runner:number;time?:number};overviewOnly?:boolean;suspended?:boolean;onanalyse?:(focus:{runner:number;time:number})=>void}=$props();
  let telemetryExpanded=$state(false);
  let time=$state(0),playing=$state(false),speed=$state('1'),metric=$state(untrack(()=>ensemble?'distance':'combined')),chartEvents=$state(true),compare=$state(false),windowMeters=$state(80),trackOverride=$state('');
  let report=$state<HTMLElement>(),analysisTarget=$state<HTMLElement>();
  const trackId=$derived(trackOverride||String(capture.courseId??''));
  let shapes=$state.raw<Record<string,CourseShape>>(),geometryError=$state('');
  let courses=$state.raw<CourseData>(),courseError=$state(''),visibility=$state<Record<number,number>>({}),fullscreenTarget=$state<HTMLDivElement>(),fullscreen=$state(false);
  let toggles=$state({skills:true,blocked:true,slopes:true,speed:false,accel:false,course:true,positionKeep:false,cone:true});
  const toggleLabels={skills:'Skill labels',blocked:'Block indicator',slopes:'Slopes',speed:'Speed [m/s]',accel:'Acceleration [m/s²]',course:'Course events',positionKeep:'Position Keep',cone:'Base view cone'};
  let settingsOpen=$state(false),buildOpen=$state(false),runnerPickerOpen=$state(false),focusView=$state('map'),ensembleView=$state('field');
  const mapPrimary=$derived(focusView==='map');
  let animationFrame:number|undefined,lastTick:number|undefined;
  const course=$derived(courses?.courses[trackId]);
  const bounds=$derived(raceReplayBounds(capture.frames,course?.distance??shapes?.[trackId]?.distance??capture.raceDistance));
  const frame=$derived(raceFrameAtTime(capture.frames,time));
  const runner=$derived(capture.runners.find(r=>r.index===Number(selected))??capture.runners[0]);
  const leader=$derived(Math.max(0,...(frame?.horses.map(h=>h.distance)??[])));
  const viewport=$derived(replayViewport(leader,bounds.distanceMax,windowMeters,Math.max(0,...(frame?.horses.map(h=>h.lanePosition)??[]))));
  // Continuously follow the field spread; restarting a tween each frame stalls its easing.
  const laneScale=new Spring(500,{stiffness:.035,damping:.4,precision:.001});
  const laneTarget=$derived(viewport.laneMax);
  let laneScaleCapture:ParsedRaceCapture|undefined;
  $effect(()=>{
    const instant=laneScaleCapture!==capture;
    laneScaleCapture=capture;
    void laneScale.set(laneTarget,{instant}).catch(()=>{});
  });
  onDestroy(()=>{void laneScale.set(laneScale.current,{instant:true});});
  const displayedLaneMax=$derived(laneScale.current);
  const segments=$derived(courseSegments(course));
  const laneWidth=$derived(capture.laneDistanceMax&&capture.laneDistanceMax>0?(capture.laneDistanceMax>3?capture.laneDistanceMax:11.25*capture.laneDistanceMax):(course?.laneMax??11250)/1000);
  const laneMetres=(value:number)=>replayLaneMetres(value,laneWidth).toFixed(1);
  const recentSkills=$derived(capture.events.filter(e=>e.type===3&&time>=e.frameTime&&time-e.frameTime<2));
  const diagnostic=$derived(diagnosticHorse(capture,runner?.index??0));
  const activeSkills=$derived(diagnostic?.activeSkillSpans?[...new Set(diagnostic.activeSkillSpans.filter(s=>time>=s.startTime&&time<s.endTime).map(s=>s.skillId))].map(id=>({params:[runner?.index??0,id],endTime:Math.max(...diagnostic.activeSkillSpans!.filter(s=>s.skillId===id&&time>=s.startTime&&time<s.endTime).map(s=>s.endTime))})):recentSkills.filter(e=>e.params[0]===runner?.index).map(e=>({...e,endTime:undefined})));
  const blockingSpans=$derived(frontBlockingSpans(capture));
  let allBlocking=$state(false);
  const visibleBlocking=$derived(allBlocking?blockingSpans:blockingSpans.filter(event=>event.horseIndex===runner?.index));
  const blockingNow=$derived(capture.runners.flatMap(r=>{
    const blockerHorseIndex=blockerAt(capture,r.index,time,frame?.horses[r.index]?.blockFrontHorseIndex)??-1;
    return blockerHorseIndex>=0?[{horseIndex:r.index,blockerHorseIndex}]:[];
  }));
  function reviewBlocking(event:typeof blockingSpans[number]){
    selected=String(event.horseIndex);
    visibility={...visibility,[event.horseIndex]:0,[event.blockerHorseIndex]:0};
    toggles={...toggles,blocked:true};reviewTime(event.startTime);
  }
  const blocker=$derived(blockerAt(capture,runner?.index??0,time,frame?.horses[runner?.index??0]?.blockFrontHorseIndex)??-1);
  const blockedRunner=$derived(capture.runners.find(r=>r.index===blocker));
  const reference=$derived(activeSpan(diagnostic?.positionKeepReferenceSpans,time)?.referenceHorseIndex);
  const pacemaker=$derived(activeSpan(capture.detailed?.annotations.paceMakerSpans,time)?.horseIndex);
  const modes=$derived(Object.entries(capture.detailed?.annotations.flags??{}).filter(([,flag])=>((activeSpan(diagnostic?.spans,time)?.mask??0)&flag)!==0).map(([name])=>diagnosticLabel(name)));
  const rushed=$derived(diagnostic?.temptationSpans?activeSpan(diagnostic.temptationSpans,time)?.mode??0:frame?.horses[runner?.index??0]?.temptationMode??0);
  const targetSpeed=$derived(detailedSample(capture.detailed,diagnostic,time,'targetSpeeds'));
  const activations=$derived(capture.events.filter(e=>e.type===3&&e.params[0]===runner?.index).sort((a,b)=>a.frameTime-b.frameTime));
  const currentHorse=$derived(frame?.horses[runner?.index??0]);
  const teamKeys=$derived([...new Set(capture.runners.map(r=>String(r.raw.trainer_id??r.raw.team_id??r.trainerName??r.index)))]);
  const teamColor=(r:RaceRunner)=>typeof r.raw.team_color==='string'&&/^#[0-9a-f]{6}$/i.test(r.raw.team_color)?r.raw.team_color:['#69b7ee','#e69c72','#c79be7','#78bba3'][teamKeys.indexOf(String(r.raw.trainer_id??r.raw.team_id??r.trainerName??r.index))%4]!;
  const stageStart=$derived(Math.max(0,Math.min(...(frame?.horses.map(h=>h.distance)??[0]))));
  const positionViewport=$derived.by(()=>{
    const width=viewport.max-viewport.min,distance=Math.max(0,Math.min(bounds.distanceMax,leader));
    const edge=Math.min(1,distance/width,(bounds.distanceMax-distance)/width);
    // Keep the leader forward during racing; gently center the start and finish.
    const center=distance-width*.3*edge*edge*(3-2*edge);
    return {min:center-width/2,max:center+width/2};
  });
  const stageViewport=$derived(mapPrimary?{min:stageStart,max:Math.max(stageStart+1,leader)}:positionViewport);
  let stageWidth=$state(1000),stageHeight=$state(300);
  const crowdedRunners=$derived.by(()=>{
    const points=capture.runners.flatMap(r=>{const h=frame?.horses[r.index];return h&&visibility[r.index]!==2?[{index:r.index,x:x(h.distance)/1000*stageWidth,y:h.lanePosition/displayedLaneMax*stageHeight}]:[];});
    return new Set(points.filter(a=>points.some(b=>a.index!==b.index&&Math.abs(a.x-b.x)<74&&Math.abs(a.y-b.y)<58)).map(p=>p.index));
  });
  const x=(distance:number)=>(distance-stageViewport.min)/(stageViewport.max-stageViewport.min)*1000;
  const racePhase=$derived(!frame?'No telemetry':time>=bounds.endTime?'Finished':leader>=bounds.distanceMax?'Finishing':leader<bounds.distanceMax/6?'Early race':leader<bounds.distanceMax*2/3?'Mid race':leader<bounds.distanceMax*5/6?'Late race':'Final leg');
  const currentSegment=$derived(segments.find(s=>leader>=s.start&&leader<s.end)?.label??racePhase);
  const finishTimes=$derived(new Map(capture.runners.map(r=>{
    const recorded=r.result?.finishTimeRaw&&r.result.finishTimeRaw>0?r.result.finishTimeRaw:r.result?.finishTime;
    return [r.index,recorded!==undefined&&Number.isFinite(recorded)&&recorded>0?recorded:runnerTimeAtDistance(bounds.distanceMax,r.index)];
  })));
  const finishOrder=$derived([...capture.runners].sort((a,b)=>(a.result?.finishOrder??Infinity)-(b.result?.finishOrder??Infinity)||(finishTimes.get(a.index)??Infinity)-(finishTimes.get(b.index)??Infinity)||a.index-b.index));
  const finishRanks=$derived(new Map(finishOrder.map((r,i)=>[r.index,r.result?.finishOrder??(finishTimes.get(r.index)!==undefined?i+1:undefined)])));
  // Cache the final racing samples once; playback only looks up each runner's HP.
  const finishFrames=$derived(new Map(capture.runners.map(r=>{
    const finish=finishTimes.get(r.index);
    return [r.index,finish===undefined?undefined:capture.frames.findLast(f=>f.time<finish)];
  })));
  const hpResults=$derived(new Map(capture.runners.map(r=>[r.index,runnerHpResult(capture,r.index)])));
  function fieldHp(index:number,finished:boolean){
    const result=hpResults.get(index),hp=finished?result?.finish:frame?.horses[index]?.hp;
    return hp!==undefined&&result?.max?Math.min(100,Math.max(0,hp/result.max*100)):undefined;
  }
  function formatHp(value?:number){
    if(value===undefined)return '—';
    const percent=Math.round(value*10)/10;
    return (percent===0||percent===100?String(percent):percent.toFixed(1))+'%';
  }
  const hpColor=(value?:number)=>hpRemainingColor(value,$theme==='dark');
  function hasFinished(r:RaceRunner){
    const finish=finishTimes.get(r.index);
    return finish!==undefined?time>=finish:(frame?.horses[r.index]?.distance??0)>=bounds.distanceMax;
  }
  const finishedCount=$derived(capture.runners.filter(hasFinished).length);
  const fieldOrder=$derived([...capture.runners].sort((a,b)=>Number(hasFinished(b))-Number(hasFinished(a))||(hasFinished(a)&&hasFinished(b)?(finishRanks.get(a.index)??Infinity)-(finishRanks.get(b.index)??Infinity):(frame?.horses[b.index]?.distance??0)-(frame?.horses[a.index]?.distance??0))));
  const conditions=$derived([
    capture.track.condition?trackDetailName('condition',capture.track.condition)+' ground':undefined,
    capture.track.weather?trackDetailName('weather',capture.track.weather):undefined,
    capture.track.season?trackDetailName('season',capture.track.season):undefined,
    course?course.turn===1?'Right-handed':course.turn===2?'Left-handed':'Straight':undefined
  ].filter(Boolean).join(', ')||'Conditions were not included in this capture');
  const previousHorse=$derived(raceFrameAtTime(capture.frames,time-1)?.horses[runner?.index??0]);
  const laneChange=$derived(currentHorse&&previousHorse?replayLaneMetres(currentHorse.lanePosition-previousHorse.lanePosition,laneWidth):0);
  const runnerState=$derived(runner&&hasFinished(runner)?ensemble?'All samples finished':'Finished'+(finishTimes.get(runner.index)===undefined?'':', '+formatRaceTime(finishTimes.get(runner.index),2)):Math.abs(laneChange)<.05?'Holding lane':(laneChange>0?'Outward +':'Inward ')+laneChange.toFixed(2)+' m / last second');
  function pause(){if(animationFrame!==undefined)cancelAnimationFrame(animationFrame);animationFrame=undefined;lastTick=undefined;playing=false;}
  function seek(value:number){pause();time=Math.min(bounds.endTime,Math.max(bounds.startTime,value));}
  async function reviewTime(value:number){
    seek(value);await flush();
    analysisTarget?.scrollIntoView({block:'start',behavior:'instant'});
  }
  async function reviewRunner(index:number){selected=String(index);await flush();jump('replay');}
  function jump(section:string){pause();report?.querySelector<HTMLElement>('[data-report-section="'+section+'"]')?.scrollIntoView({block:'start',behavior:'instant'});}
  function analyseRunner(){pause();if(overviewOnly)onanalyse?.({runner:runner?.index??0,time});else jump('runner');}
  function seekDistance(distance:number){const value=raceTimeAtDistance(capture.frames,distance);if(value!==undefined)seek(value);}
  function tick(timestamp:number){
    if(!playing)return;
    if(lastTick!==undefined)time=Math.min(bounds.endTime,time+Math.min(.1,(timestamp-lastTick)/1000)*Number(speed));
    lastTick=timestamp;
    if(time>=bounds.endTime){pause();return;}
    animationFrame=requestAnimationFrame(tick);
  }
  function play(){
    if(playing){pause();return;}if(time>=bounds.endTime)time=bounds.startTime;
    playing=true;lastTick=undefined;animationFrame=requestAnimationFrame(tick);
  }
  function cycle(r:RaceRunner,focus=false){if(focus)visibility=Object.fromEntries(capture.runners.map(item=>[item.index,item.index===r.index?0:1]));else visibility={...visibility,[r.index]:((visibility[r.index]??0)+1)%3};}
  function acceleration(index:number){const exact=detailedSample(capture.detailed,diagnosticHorse(capture,index),time,'accelerationRates');if(exact!==undefined)return exact;const source=frame?.sourceIndex??0,left=capture.frames[source],right=capture.frames[source+1];return left&&right&&right.time>left.time?((right.horses[index]?.speed??0)-(left.horses[index]?.speed??0))/(right.time-left.time)/100:0;}
  async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await fullscreenTarget?.requestFullscreen();}catch{courseError='Fullscreen is unavailable in this browser.';}}
  function keydown(event:KeyboardEvent){if(settingsOpen||buildOpen||runnerPickerOpen||event.target!==document.body||!analysisTarget)return;const box=analysisTarget.getBoundingClientRect();if(box.bottom<120||box.top>innerHeight)return;if(event.code==='Space'){event.preventDefault();play();}else if(event.key==='ArrowRight'){event.preventDefault();seek(time+.1);}else if(event.key==='ArrowLeft'){event.preventDefault();seek(time-.1);}}
  let initialized=false;
  $effect(()=>{capture;if(ensemble&&initialized)return;initialized=true;pause();time=capture.frames[0]?.time??0;if(!ensemble)selected=String(capture.runners[0]?.index??0);trackOverride='';visibility={};});
  $effect(()=>{const target=focus;if(!ensemble)capture;untrack(()=>{if(target&&capture.runners.some(r=>r.index===target.runner)){selected=String(target.runner);if(target.time!==undefined)seek(target.time);}});});
  $effect(()=>{capture;untrack(()=>{if(!ensemble)pause();time=Math.min(bounds.endTime,Math.max(bounds.startTime,time));});});
  async function loadGeometry(){geometryError='';try{shapes=await loadReplayGeometry();}catch{geometryError='Course geometry could not be loaded from resources.';}}
  onMount(()=>{let alive=true;void loadReplayCourses().then(value=>{if(alive)courses=value;}).catch(e=>{if(alive)courseError=e.message;});if(!ensemble)void loadGeometry();return()=>{alive=false;};});
  onDestroy(pause);
  const chartRunners=$derived(compare?capture.runners:runner?[runner]:[]);
  const selectedFinish=$derived(finishTimes.get(runner?.index??0));
  const telemetryEnd=$derived(ensemble?bounds.endTime:Math.max(bounds.startTime,Math.min(bounds.endTime,compare?Math.max(...chartRunners.map(r=>finishTimes.get(r.index)??bounds.endTime)):selectedFinish??bounds.endTime)));
  const telemetryFrame=$derived(selectedFinish!==undefined&&time>=selectedFinish?finishFrames.get(runner?.index??0)??frame:frame);
  function chartData(r:RaceRunner,signal:string){
    const finish=finishTimes.get(r.index);
    let data:(number|null)[][];
    if(ensemble&&(signal==='hp'||signal==='gap')){
      data=capture.frames.map(frame=>[frame.time,meanTrajectorySignal(ensemble,frame.time,r.index,signal)]);
    }else if(signal==='target'||signal==='acceleration'){
      const h=diagnosticHorse(capture,r.index),samples=h?.sampleTimes??capture.detailed?.annotations.sampleTimes??[];
      data=samples.map((t,i)=>[t,(signal==='target'?h?.targetSpeeds:h?.accelerationRates)?.[i]??null]);
    }else{
      data=capture.frames.map(f=>[f.time,signal==='distance'?(f.horses[r.index]?.distance??0):signal==='speed'?(f.horses[r.index]?.speed??0)/100:signal==='hp'?(f.horses[r.index]?.hp??0)/Math.max(1,capture.frames[0]?.horses[r.index]?.hp??1)*100:Math.max(...f.horses.map(h=>h.distance))-(f.horses[r.index]?.distance??0)]);
    }
    if(ensemble||finish===undefined||finish>bounds.endTime)return data;
    data=data.filter(point=>point[0]!<finish);
    // Hold the last racing sample at the line; later frames include deceleration.
    if(data.length)data.push([finish,data.at(-1)![1]!]);
    return data;
  }
  $effect(()=>{if(!capture.detailed&&(metric==='target'||metric==='acceleration'))metric='speed';});
  function runnerTimeAtDistance(distance:number,index=runner?.index??0){
    const frames=capture.frames;
    if(distance<=(frames[0]?.horses[index]?.distance??0))return frames[0]?.time;
    const rightIndex=frames.findIndex(frame=>(frame.horses[index]?.distance??0)>=distance);
    if(rightIndex<1)return undefined;
    const left=frames[rightIndex-1]!,right=frames[rightIndex]!,start=left.horses[index]!.distance,end=right.horses[index]!.distance;
    return left.time+(right.time-left.time)*(distance-start)/Math.max(Number.EPSILON,end-start);
  }
  const chartPhases=$derived([{name:'Early race',start:0,end:1/6,color:'#b5b9c2'},{name:'Mid race',start:1/6,end:2/3,color:'#6ab7ee'},{name:'Late race',start:2/3,end:5/6,color:'#dfba72'},{name:'Final leg',start:5/6,end:1,color:'#bd91d1'}].flatMap(phase=>{
    const start=raceTimeAtDistance(capture.frames,bounds.distanceMax*phase.start),end=phase.end===1?telemetryEnd:raceTimeAtDistance(capture.frames,bounds.distanceMax*phase.end)??telemetryEnd;
    return start===undefined?[]:[[{name:phase.name,xAxis:start,itemStyle:{color:phase.color,opacity:.07},label:{show:true,position:'insideTop',fontSize:9,color:$theme==='dark'?'#abb4c3':'#566071',formatter:phase.name.replace(' race','')}},{xAxis:end}]];
  }));
  const chartMarkers=$derived([
    ...activations.map(event=>({name:skillNames.get(event.params[1]!)??'Skill '+event.params[1],xAxis:event.frameTime,lineStyle:{color:'#e8ad63',opacity:.5}})),
    ...[runner?.result?.lastSpurtStartDistance?{name:'Last spurt',distance:runner.result.lastSpurtStartDistance}:undefined].flatMap(event=>{
      const time=event&&runnerTimeAtDistance(event.distance);return time===undefined||!event?[]:[{name:event.name,xAxis:time,lineStyle:{color:'#abb4c3',opacity:.7}}];
    })
  ]);
  const chartBlocking=$derived(blockingSpans.filter(span=>span.horseIndex===runner?.index).map(span=>[{name:'Blocked by '+(capture.runners.find(r=>r.index===span.blockerHorseIndex)?.name??'runner'),xAxis:span.startTime,itemStyle:{color:'#f07777',opacity:.12}},{xAxis:span.endTime}]));
  const signalDefinitions=$derived([
    {value:'distance',label:'Mean progress',unit:'m',color:$theme==='dark'?'#69b7ee':'#176ba0'},
    {value:'speed',label:'Speed',unit:'m/s',color:$theme==='dark'?'#69b7ee':'#176ba0'},
    {value:'hp',label:'HP remaining',unit:'%',color:$theme==='dark'?'#70c4a0':'#247653'},
    {value:'gap',label:ensemble?'Mean gap to leader':'To leader',unit:'m',color:$theme==='dark'?'#e3b56f':'#986514'},
    {value:'target',label:'Target speed',unit:'m/s',color:$theme==='dark'?'#bb9be6':'#7243a1'},
    {value:'acceleration',label:'Acceleration',unit:'m/s²',color:$theme==='dark'?'#df8ca1':'#b33f61'}
  ]);
  const chartSignals=$derived(signalDefinitions.filter(signal=>metric==='combined'?['speed','hp','gap'].includes(signal.value):signal.value===metric));
  function signalValue(signal:string){
    const sample=telemetryFrame,horse=sample?.horses[runner?.index??0];
    if(!sample||!horse)return undefined;
    if(ensemble&&(signal==='hp'||signal==='gap'))return meanTrajectorySignal(ensemble,time,runner?.index??0,signal);
    if(signal==='distance')return horse.distance;
    if(signal==='speed')return horse.speed/100;
    if(signal==='hp')return Math.min(100,Math.max(0,horse.hp/Math.max(1,capture.frames[0]?.horses[runner?.index??0]?.hp??1)*100));
    if(signal==='gap')return Math.max(0,...sample.horses.map(h=>h.distance))-horse.distance;
    if(signal==='target')return detailedSample(capture.detailed,diagnostic,sample.time,'targetSpeeds');
    return detailedSample(capture.detailed,diagnostic,sample.time,'accelerationRates')??acceleration(runner?.index??0);
  }
  const finishLine:CustomSeriesRenderItem=(params,api)=>{
    const area=params.coordSys as unknown as {x:number;y:number;width:number;height:number},position=api.coord?.([api.value(0),0]);
    if(!position||position[0]!<area.x||position[0]!>area.x+area.width)return;
    const x=Math.min(position[0]!,area.x+area.width-8);
    return {type:'group',children:Array.from({length:Math.ceil(area.height/4)*2},(_,i)=>({type:'rect',shape:{x:x+i%2*4,y:area.y+Math.floor(i/2)*4,width:4,height:Math.min(4,area.height-Math.floor(i/2)*4)},style:{fill:(Math.floor(i/2)+i%2)%2?'#17191d':'#f5f5f5'}}))};
  };
  function telemetryOption(expanded:boolean):EChartsCoreOption{
    const multiple=chartSignals.length>1,color=$theme==='dark'?'#abb4c3':'#566071';
    return {
      animation:false,textStyle:{color},
      tooltip:{trigger:'axis',order:'seriesAsc',backgroundColor:$theme==='dark'?'#202226':'#fff',borderColor:$theme==='dark'?'#42464c':'#d2d5da',textStyle:{color:$theme==='dark'?'#e8edf4':'#202226'},axisPointer:{type:'line',lineStyle:{color,opacity:.45}}},
      // Axis labels use the reserved side columns, keeping the plot aligned with the timeline.
      grid:{left:0,right:0,top:8,bottom:expanded?56:8,outerBoundsMode:'none'},
      xAxis:{type:'value',min:bounds.startTime,max:Math.max(bounds.startTime+.001,telemetryEnd),show:expanded,name:'Time (s)',nameLocation:'middle',nameGap:24,axisLabel:{fontSize:10,color,formatter:(value:number)=>Number(value.toFixed(1)).toString(),hideOverlap:true},nameTextStyle:{fontSize:10,color},splitLine:{lineStyle:{opacity:.08}}},
      yAxis:chartSignals.map((signal,i)=>({type:'value',position:multiple&&signal.value!=='speed'?'right':'left',offset:multiple&&signal.value==='gap'?26:0,min:signal.value==='acceleration'?undefined:0,max:signal.value==='hp'?100:undefined,interval:signal.value==='hp'?25:undefined,splitNumber:4,axisLabel:{fontSize:10,color:signal.color,margin:8,hideOverlap:true},axisLine:{show:false},axisTick:{show:false},splitLine:{show:i===0,lineStyle:{color,opacity:.12}}})),
      dataZoom:expanded?[{type:'inside',xAxisIndex:0},{type:'slider',xAxisIndex:0,height:14,bottom:5}]:[],
      visualMap:ensemble?[]:chartSignals.flatMap((signal,i)=>signal.value==='hp'?[{type:'continuous',show:false,min:0,max:100,dimension:1,seriesIndex:chartRunners.map((_,index)=>i*chartRunners.length+index),inRange:{color:Array.from({length:9},(_,step)=>hpColor(step*12.5))}}]:[]),
      series:[...(ensemble??[]).flatMap(trajectory=>chartSignals.map((signal,i)=>({name:"Race "+(trajectory.sample+1)+", "+signal.label,type:"line",xAxisIndex:0,yAxisIndex:i,showSymbol:false,silent:true,lineStyle:{width:1,opacity:Math.max(.025,Math.min(.15,1/Math.sqrt(ensemble!.length)))},itemStyle:{color:signal.color},z:0,tooltip:{show:false},data:trajectorySeries(trajectory,runner?.index??0,signal.value)}))),...chartSignals.flatMap((signal,i)=>chartRunners.map(r=>({name:(ensemble?"Mean · ":"")+(multiple?signal.label+', ':'')+'Gate '+(r.index+1)+', '+r.name,type:'line',xAxisIndex:0,yAxisIndex:i,showSymbol:false,lineStyle:{width:r.index===runner?.index?2.5:1,opacity:r.index===runner?.index?1:.18,type:r.index===runner?.index?'solid':'dotted'},itemStyle:{color:signal.color},z:r.index===runner?.index?3:1,tooltip:{valueFormatter:(value:unknown)=>typeof value==='number'?value.toFixed(signal.value==='hp'?1:2)+' '+signal.unit:String(value)},data:chartData(r,signal.value),...(i===0&&r.index===runner?.index&&chartEvents?{markLine:{silent:false,symbol:['none','none'],label:{show:false},lineStyle:{type:'dashed',width:1},data:chartMarkers.filter(marker=>marker.xAxis<=telemetryEnd)},markArea:{silent:false,label:{show:false},data:[...chartPhases,...chartBlocking]}}:{})}))),...(selectedFinish===undefined?[]:[{id:'finish-line',name:'Finish',type:'custom',renderItem:finishLine,data:[[selectedFinish]],encode:{x:0,y:-1},silent:true,tooltip:{show:false},z:5}])]
    };
  }
  const option=$derived(telemetryOption(telemetryExpanded));
  $effect(()=>{if(telemetryExpanded||suspended)pause();});
</script>

{#snippet movementReadings()}<StatStrip label="Runner movement" presentation="inline" items={[{id:'lane',label:'From inner rail',value:currentHorse?laneMetres(currentHorse.lanePosition):'—',unit:'m'},{id:'acceleration',label:'Acceleration',value:currentHorse?acceleration(runner?.index??0).toFixed(2):'—',unit:'m/s²'},...(!ensemble?[{id:'procs',label:'Skill triggers',value:activations.filter(e=>e.frameTime<=time).length}]:[])]}/>{/snippet}
{#snippet telemetryActions()}<SegmentedControl compact options={[...(ensemble?[{value:'distance',label:'Progress'}]:[]),{value:'combined',label:'Combined'},{value:'speed',label:'Speed'},{value:'hp',label:'HP'},{value:'gap',label:'Gap'},...(capture.detailed?[{value:'target',label:'Target speed'},{value:'acceleration',label:'Acceleration'}]:[])]} bind:value={metric} label="Telemetry metric"/><span class="desktop-chart-options"><ToggleButton icon="users" label="Compare runners" pressed={compare} onclick={()=>compare=!compare}/>{#if !ensemble}<ToggleButton icon="activity" label="Race events" pressed={chartEvents} onclick={()=>chartEvents=!chartEvents}/>{/if}</span><span class="mobile-chart-options"><InspectPopover label="Telemetry display options" align="end">{#snippet trigger()}<span class="guide-trigger"><Icon name="tune" size={16}/></span>{/snippet}<h3>Telemetry display</h3><ToggleButton icon="users" label="Compare runners" pressed={compare} onclick={()=>compare=!compare}/>{#if !ensemble}<ToggleButton icon="activity" label="Race events" pressed={chartEvents} onclick={()=>chartEvents=!chartEvents}/>{/if}</InspectPopover></span>{/snippet}
{#snippet telemetryHelp()}<InspectPopover label="How to read race telemetry">{#snippet trigger()}<span class="guide-trigger"><Icon name="info" size={15}/></span>{/snippet}<h3>Race telemetry</h3>{#if ensemble}<p>Faint curves show every sampled race; the solid curve is their arithmetic mean at the same elapsed time. Select an Uma to follow its spread on the track and graph. Finishers stay at the line.</p><p>Click the chart to seek, or use the Replay time slider. Compare runners adds each Uma’s mean curve.</p>{:else}<p>Combined overlays speed, remaining HP and distance behind the leader in one chart. Live values are shown on the left. The speed scale is on the left of the graph; HP and distance scales are on the right. The curves, course lanes and skill icons share one replay time axis. Click the chart to seek, or use the Replay time slider with the keyboard.</p><p>Choose a single signal to focus on it, or enable Compare runners to add faint dotted traces for the rest of the field. Race events show skill activation lines and front blocking intervals. Expand the graph to zoom and pan.</p>{/if}</InspectPopover>{/snippet}
<svelte:document onvisibilitychange={()=>{if(document.hidden)pause();}}/>
<svelte:window onkeydown={keydown} onfullscreenchange={()=>fullscreen=!!document.fullscreenElement}/>
<section class="replay" class:overview={overviewOnly} class:ensemble-view={!!ensemble} bind:this={report}>
  {#if !overviewOnly}
  <header class="replay-header"><div class="replay-title"><span class="replay-icon"><Icon name="race" size={22}/></span><div><div class="course-heading"><h2>{(course?(courses?.names[course.raceTrackId]??'Track'):'Race capture')+', '+Math.round(bounds.distanceMax).toLocaleString()+' m'+(course?', '+(course.surface===1?'Turf':'Dirt'):'')}</h2><div class="capture-summary"><span>{capture.runners.length} runners, {formatRaceTime(bounds.endTime)}</span><strong>{capture.detailed?'Detailed resimulation':'Recorded race'}</strong></div></div><p>{conditions} <span class="course-source">{trackOverride?'Manual course':capture.courseId?'Course detected':'Select a course in Display options'}</span></p></div></div>{#if headerActions}<div class="header-actions">{@render headerActions()}</div>{/if}</header>
  <nav class="report-navigation" aria-label="Jump to analysis section">
    <div class="report-links"><Button variant="secondary" size="sm" icon="race" onclick={()=>jump('replay')}>Race replay</Button><Button variant="secondary" size="sm" icon="rankings" onclick={()=>jump('results')}>Race results</Button><Button variant="secondary" size="sm" icon="chart" onclick={()=>jump('runner')}>Runner analysis</Button>{#if hasSession}<Button variant="secondary" size="sm" icon="users" onclick={()=>jump('session')}>Session analysis</Button>{/if}</div>
  </nav>
  {/if}
  <Dialog bind:open={settingsOpen} title="Display options" maxWidth="620px" contentPadding="16px" mobileContentPadding="12px">
   <div class="replay-toolbar" id="replay-settings">
    <section class="course-controls"><h3>Course & precision</h3><SelectField id="replay-track" label="Track" bind:value={trackOverride} options={[{value:'',label:capture.courseId?'Auto, Course '+capture.courseId:'Auto-detect from replay'},...Object.entries(courses?.courses??{}).map(([id,c])=>({value:id,label:(courses?.names[c.raceTrackId]??id)+', '+c.distance+'m, '+(c.surface===1?'Turf':'Dirt')+(c.turn===1?', Right':', Left')}))]}/><div class="precision-fields"><label>View window <span><input aria-label="View window metres" type="number" min="20" max="400" step="10" bind:value={windowMeters}/> m</span></label><label>Replay frame <span><input aria-label="Replay frame" type="number" min="0" max={Math.max(0,capture.frames.length-1)} value={frame?.sourceIndex??0} onchange={e=>seek(capture.frames[Number(e.currentTarget.value)]?.time??time)}/> / {capture.frames.length}</span></label></div></section>
    {#each [{title:'Runner overlays',keys:['skills','blocked','speed','accel']},{title:'Course overlays',keys:['course','slopes','positionKeep','cone']}] as group}<section><h3>{group.title}</h3><div class="options">{#each group.keys as option}<ToggleButton icon="eye" label={toggleLabels[option as keyof typeof toggleLabels]} pressed={toggles[option as keyof typeof toggles]} onclick={()=>toggles[option as keyof typeof toggles]=!toggles[option as keyof typeof toggles]}/>{/each}</div></section>{/each}
   </div>
   {#snippet actions()}<Button size="sm" variant="secondary" onclick={()=>{toggles={skills:true,blocked:true,slopes:true,speed:false,accel:false,course:true,positionKeep:false,cone:true};windowMeters=80;}}>Reset display</Button><Button size="sm" onclick={()=>settingsOpen=false}>Done</Button>{/snippet}
  </Dialog>
  {#if courseError}<p class="notice" role="status">{courseError}</p>{/if}
  <div class="race-panels">
  <section class="analysis-section replay-panel" data-report-section="replay" aria-label="Race replay section" bind:this={analysisTarget}>
  <div class="replay-layout" bind:this={fullscreenTarget}>
    {#snippet replayTitle()}<div class="replay-view"><h2>{ensemble?"Mean race replay":"Race replay"}</h2><SegmentedControl compact label="Primary replay view" options={[{value:'positions',label:'Race positions'},{value:'map',label:'Course map'}]} bind:value={focusView}/></div>{/snippet}
    {#snippet replayTools()}<div class="stage-tools" role="group" aria-label="Replay actions"><Button variant="secondary" size="sm" icon="tune" onclick={()=>settingsOpen=true}>Display options</Button><span class="replay-guide"><InspectPopover label="Replay guide" align="end">{#snippet trigger()}<span class="guide-trigger"><Icon name="info" size={15}/>Guide</span>{/snippet}<div class="course-legend"><strong>Reading the replay</strong><small>Drag to pan. Ctrl / ⌘ + scroll to zoom. Follow window keeps the racing pack in view. Lanes ×2 expands lane spacing. Portraits and dots share the current race position number; gold marks the leader.</small><small>Select a runner to follow their speed, HP and skills. Use the timeline to jump to any moment. Select or hover a runner to see crowded labels.</small>{#each [{label:'Straight',color:'#64918c'},{label:'Final straight',color:'#419168'},{label:'Corner',color:'#7b7ea8'},{label:'Final corner',color:'#bb9148'}] as item}<span><i style:background={item.color}></i>{item.label}</span>{/each}</div></InspectPopover></span><Button variant="secondary" size="sm" onclick={toggleFullscreen}>{fullscreen?'Exit fullscreen':'Fullscreen'}</Button></div>{/snippet}
    {#if ensemble}
      <div class="ensemble-views"><SegmentedControl compact label="Progression display" bind:value={ensembleView} options={[{value:'field',label:'Field spread'},{value:'course',label:'Track & course'}]}/><span>Distributions at the same elapsed time</span></div>
      {#if ensembleView==='field'}<ReplayFieldSpread trajectories={ensemble} {time} runners={capture.runners} bind:selected {teamColor}/>
      {:else if runner}<ReplayOutcomeCourse trajectories={ensemble} {time} {course} courseId={Number(trackId)} distance={bounds.distanceMax} {runner} color={teamColor(runner)}/>{/if}
    {:else}
    {#if !mapPrimary||!shapes}<div class="stage-heading">{@render replayTitle()}{@render replayTools()}</div>{/if}
  <div class="positions-target" class:fullscreen-target={!mapPrimary} hidden={mapPrimary}>
    <div class="race-stage" hidden={mapPrimary} data-lane-max={displayedLaneMax} data-lane-target={viewport.laneMax} aria-label="Runner positions by distance and lane">
      <div class="lane-axis" title="Lateral distance from the inside rail, in metres"><small>Lane (m)</small>{#each [0,.25,.5,.75,1] as fraction}<span style:bottom={fraction*100+'%'}>{laneMetres(displayedLaneMax*fraction)}</span>{/each}</div>
      <div class="track-plane" bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
        <span class="rail-label">INSIDE RAIL</span>
        <svg class="course-background" viewBox="0 0 1000 410" preserveAspectRatio="none" aria-hidden="true">
          {#each [.25,.5,.75,1] as fraction}<line x1="0" x2="1000" y1={410*(1-fraction)} y2={410*(1-fraction)} class="lane-guide"/>{/each}
          {#if toggles.course}{#each segments as segment}<rect x={x(segment.start)} y="0" width={(segment.end-segment.start)/(stageViewport.max-stageViewport.min)*1000} height="410" fill={segment.color} fill-opacity=".07"/><line x1={x(segment.start)} x2={x(segment.start)} y1="0" y2="410" stroke={segment.color} stroke-dasharray="4 4"/>{/each}
          {#each [{distance:bounds.distanceMax/6,label:'Mid race'},{distance:bounds.distanceMax*10/24,label:'Position Keep ends'},{distance:bounds.distanceMax*2/3,label:'Late race'}] as marker}<line x1={x(marker.distance)} x2={x(marker.distance)} y1="0" y2="410" class="phase-marker"/>{/each}{/if}
          {#if toggles.slopes}{#each course?.slopes??[] as slope}<polygon points={slope.slope>0?x(slope.start)+',410 '+x(slope.start+slope.length)+',410 '+x(slope.start+slope.length)+',205':x(slope.start)+',410 '+x(slope.start)+',205 '+x(slope.start+slope.length)+',410'} fill={slope.slope>0?'#bd7581':'#719bdd'} fill-opacity=".07"/>{/each}{/if}
          {#if toggles.positionKeep&&leader<bounds.distanceMax*10/24}{@const factor=1+(bounds.distanceMax-1000)*.0008}{#each [{min:3,max:5*factor,color:'#be91d4'},{min:6.5*factor,max:7*factor,color:'#69b7ee'},{min:7.5*factor,max:8*factor,color:'#7bc8a0'}] as zone}<rect x={x(leader-zone.max)} width={(zone.max-zone.min)/(stageViewport.max-stageViewport.min)*1000} y="0" height="410" fill={zone.color} fill-opacity=".16"/>{/each}{/if}
          {#each [0,bounds.distanceMax] as distance}<line class="race-boundary" data-distance={distance} x1={x(distance)} x2={x(distance)} y1="0" y2="410"/>{/each}
        </svg>
        {#each [{distance:0,label:'Start'},{distance:bounds.distanceMax,label:'Finish'}].filter(m=>m.distance>=stageViewport.min&&m.distance<=stageViewport.max) as marker}<span class="course-label boundary-label" style:left={x(marker.distance)/10+'%'}>{marker.label}</span>{/each}
        {#if toggles.course}{#each segments.filter(s=>s.start>0&&s.start>=stageViewport.min&&s.start<=stageViewport.max) as segment}<span class="course-label" style:left={x(segment.start)/10+'%'}>{segment.label}</span>{/each}{#each [{distance:bounds.distanceMax/6,label:'Mid race'},{distance:bounds.distanceMax*2/3,label:'Late race'}].filter(m=>m.distance>=stageViewport.min&&m.distance<=stageViewport.max) as marker}<span class="course-label phase" style:left={x(marker.distance)/10+'%'}>{marker.label}</span>{/each}{/if}
        {#each capture.runners as r}{@const horse=frame?.horses[r.index]}{#if horse&&visibility[r.index]!==2&&horse.distance>=stageViewport.min&&horse.distance<=stageViewport.max&&(mapPrimary||horse.lanePosition<=displayedLaneMax)}
          <button class="replay-marker" class:crowded={crowdedRunners.has(r.index)} class:dim={visibility[r.index]===1} class:triggered={toggles.skills&&recentSkills.some(e=>e.params[0]===r.index)} class:selected={r.index===runner?.index} class:front-blocked={toggles.blocked&&blockingNow.some(b=>b.horseIndex===r.index)} style:left={x(horse.distance)/10+'%'} style:bottom={horse.lanePosition/displayedLaneMax*(mapPrimary?30:100)+'%'} style:--runner-color={teamColor(r)} aria-label={'Inspect '+r.name} aria-pressed={r.index===runner?.index} title={r.name+', '+(horse.speed/100).toFixed(2)+' m/s, HP '+Math.round(horse.hp)+', '+horse.distance.toFixed(1)+'m, Lane '+Math.round(horse.lanePosition)} onclick={()=>selected=String(r.index)}>
            {#if toggles.blocked&&(blockerAt(capture,r.index,time,horse.blockFrontHorseIndex)??-1)>=0}<span class="blocked" title="Blocked">!</span>{/if}
            <span class="portrait"><Artwork src={portrait(r.cardId)} alt="" size="sm" shape="circle"/><b>{r.index+1}</b></span>
            <span class="hp"><i style:width={(fieldHp(r.index,false)??0)+'%'} style:background={hpColor(fieldHp(r.index,false))}></i></span>
            {#if r.index===runner?.index}<span class="marker-name">{r.name}</span>{/if}
            {#if !mapPrimary&&(toggles.speed||toggles.accel)}<span class="marker-telemetry">{#if toggles.speed}<span title="Speed (m/s)">{(horse.speed/100).toFixed(2)}</span>{/if}{#if toggles.accel}<span title="Acceleration (m/s²)">{acceleration(r.index)>0?'+':''}{acceleration(r.index).toFixed(2)}</span>{/if}</span>{/if}
          </button>
        {/if}{/each}
        <div class="distance-axis">{#each [0,.25,.5,.75,1] as fraction}<span style:left={fraction*100+'%'}>{Math.round(stageViewport.min+(stageViewport.max-stageViewport.min)*fraction)}m</span>{/each}</div>
      </div>
    </div>

  </div>
    {#if shapes}<ReplayCourseMap toolbarStart={replayTitle} toolbarEnd={replayTools} viewDistance={toggles.cone?courses?.baseViewDistance:undefined} blockerIndex={toggles.blocked?blocker:-1} blocking={toggles.blocked?blockingNow:[]} onexpand={()=>focusView='map'} primary={mapPrimary} skillEvents={toggles.skills?recentSkills:[]} frames={capture.frames} {laneWidth} onseekdistance={seekDistance} {course} shape={shapes[trackId]} onselectcourse={()=>settingsOpen=true} {frame} runners={capture.runners} raceOrder={fieldOrder.map(r=>r.index)} bind:selected {visibility} {teamColor} viewport={positionViewport} slopes={toggles.slopes} showSpeed={toggles.speed} showAcceleration={toggles.accel} {acceleration}/>{:else}<div class="map-loading fullscreen-target" class:primary={mapPrimary} hidden={!mapPrimary}>{#if geometryError}<p class="notice" role="status">{geometryError} <Button variant="secondary" size="sm" onclick={loadGeometry}>Retry course geometry</Button></p>{:else}<Spinner centered label="Loading course map…"/>{/if}</div>{/if}
  <aside class="live-roster" aria-label="Race field">

    <header>
      <div class="field-heading"><h3>Race field <span>{capture.runners.length}</span></h3><span class="field-order">{ensemble?'Mean position':finishedCount===capture.runners.length?'Finish order':'Live order'}</span>{#if Object.values(visibility).some(value=>value>0)}<IconButton size="sm" icon="eye" label="Show all runners" onclick={()=>visibility={}}/>{/if}</div>
      <p>{finishedCount?finishedCount+' / '+capture.runners.length+' finished':'Select a runner to follow'}</p>
    </header>
    <div class="field-runners">{#each fieldOrder as r,index (r.index)}
      {@const horse=frame?.horses[r.index]}
      {@const finished=hasFinished(r)}
      {@const place=finished?ensemble?undefined:finishRanks.get(r.index):frame?index+1:undefined}
      {@const gap=horse?Math.max(0,leader-horse.distance):undefined}
      {@const finish=finishTimes.get(r.index)}
      <div class="field-runner" class:finished class:chosen={runner?.index===r.index} class:front-blocked={toggles.blocked&&blockingNow.some(b=>b.horseIndex===r.index)} class:dimmed={visibility[r.index]===1} class:hidden-runner={visibility[r.index]===2} style:--team-color={teamColor(r)} data-runner-index={r.index}>
        <button class="runner-pick" aria-pressed={runner?.index===r.index} aria-label={'Follow '+r.name} onclick={()=>selected=String(r.index)}>
          <span class="field-place" class:podium={place!==undefined&&place<=3} title={finished?'Final placing':'Current position'}>{place??'—'}</span>
          <Artwork src={portrait(r.cardId)} alt="" size="xs"/>
          <span class="field-name"><strong>{r.name}</strong><small class="field-meta"><span>Gate {r.index+1}</span><span>{runningStyleName(r.result?.runningStyle??Number(r.raw.runningStyle))}</span></small></span>
          <span class="field-hp" title="HP remaining relative to maximum HP"><strong style:color={hpColor(fieldHp(r.index,finished))}>{formatHp(fieldHp(r.index,finished))}</strong><small>HP</small></span>
          <span class="field-gap" title={finished?ensemble?'All samples finished':'Finish time':'Distance behind the leader'}>{finished?(ensemble?'At line':finish===undefined?'—':formatRaceTime(finish,2)):gap===undefined?'—':gap<.05?'Lead':gap.toFixed(1)+' m'}<small class:finish-status={finished}>{#if finished}<Icon name="check" size={10}/>{ensemble?'All finished':'Finished'}{:else}{horse?(horse.speed/100).toFixed(1)+' m/s':'No frame'}{/if}</small></span>
        </button>
        <IconButton size="sm" icon={visibility[r.index]===2?'eye-off':'eye'} label={r.name+': '+(['visible','dimmed','hidden'][visibility[r.index]??0])+'. Change visibility'} title="Click to dim, then hide; Shift-click to focus" onclick={event=>cycle(r,event.shiftKey)}/>
      </div>
    {/each}</div>
    {#if runner}<section class="runner-snapshot" aria-label="Selected runner telemetry"><header><div class="snapshot-identity"><Artwork src={portrait(runner.cardId)} alt="" size="xs"/><div><small>{ensemble?"Following mean":"Following"}</small><h3>{runner.name}</h3></div></div><div class="snapshot-actions"><InspectPopover label="Following details" align="end">
          {#snippet trigger()}<span class="snapshot-details-trigger"><Icon name="info" size={14}/>Details</span>{/snippet}
          <div class="snapshot-details"><h3>{runner.name}</h3>
            <div class="snapshot-movement"><p>{runnerState}{#if rushed}, rushed{/if}</p>{@render movementReadings()}</div>
            {#if !ensemble}{#if blockedRunner}<p>Blocked by Gate {blocker+1}: <button class="diagnostic-link" onclick={()=>selected=String(blocker)}>{blockedRunner.name} ↗</button></p>{:else}<p>No front blocker at this moment.</p>{/if}
            <h4>Current skills</h4>
            {#each activeSkills as event}<div class="snapshot-skill"><RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)}/>{#if event.endTime!==undefined}<small>{Math.max(0,event.endTime-time).toFixed(1)}s left</small>{/if}</div>{:else}<p>No current skill activation.</p>{/each}{/if}
            {#if diagnostic}<div class="live-diagnostics">
              <span>Target speed <b>{targetSpeed?.toFixed(2)??'—'} m/s</b></span><span>HP <b>{currentHorse?.hp.toFixed(0)??'—'} / {diagnostic.maxHp?.toFixed(0)??'—'}</b></span>
              <span class="mode-list">{modes.join(', ')||'No special mode'}</span>
              {#each [{label:'Position-keep reference',index:reference},{label:'Pacemaker',index:pacemaker}] as item}{#if item.index!==undefined&&item.index>=0}
                <button class="diagnostic-link" onclick={()=>selected=String(item.index)}>{item.label}: #{item.index+1} {capture.runners.find(r=>r.index===item.index)?.name} ↗</button>
              {/if}{/each}
            </div>{/if}
          </div>
        </InspectPopover>{#if !ensemble}<Button variant="secondary" size="sm" icon="chart" ariaLabel="Analyse this runner" onclick={analyseRunner}>Analyse</Button>{/if}</div></header>
        <div class="runner-state" class:runner-finished={hasFinished(runner)}><span>{runnerState}</span>{#if rushed}<b>Rushed</b>{/if}</div>
        <div class="runner-extra">{@render movementReadings()}</div>
        {#if !ensemble}<div class="snapshot-status">
          {#if blockedRunner}<button class="blocked-by" title={'Front blocker: Gate '+(blocker+1)+', '+blockedRunner.name} onclick={()=>selected=String(blocker)}><Icon name="warning" size={12}/><span>Blocked by <strong>{blockedRunner.name}</strong> ↗</span></button>{:else}<small class="blocker-clear">No front blocker</small>{/if}
          <div class="current-skills" aria-label="Current skills">{#each activeSkills as event}<span class="active-skill"><RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)} iconOnly/></span>{/each}</div>
        </div>{/if}
</section>{/if}
  </aside>{/if}
  <div class="replay-timeline"><ReplayTimeline frames={capture.frames} {bounds} timelineEnd={telemetryEnd} {course} bind:time bind:speed {playing} phase={racePhase} {leader} onplay={play} onseek={seek}>
    {#snippet actions()}
      {#if !telemetryExpanded}<div class="playback-actions-options">{@render telemetryActions()}</div><span id="runner-telemetry-expand"><Button variant="secondary" size="sm" ariaLabel="Expand Race telemetry" onclick={()=>telemetryExpanded=true}>Expand</Button></span>{/if}
    {/snippet}
    {#snippet telemetry()}
      <div class="telemetry"><ChartFrame plain compact expandable maximize id="runner-telemetry" title="Race telemetry" showHeader={false} legend={telemetryExpanded?chartSignals.map(signal=>({label:signal.label+' ('+signal.unit+')',color:signal.color})):[]} bind:expanded={telemetryExpanded}>
        {#snippet titleActions()}{@render telemetryHelp()}{/snippet}
        {#snippet actions()}{@render telemetryActions()}{/snippet}

        <div class="telemetry-columns" class:expanded={telemetryExpanded}>
          {#if !telemetryExpanded}<div class="telemetry-reading" class:combined={metric==='combined'} aria-label="Selected runner telemetry"><div class="telemetry-heading"><h3 class="timeline-label">{ensemble?"Mean telemetry":"Race telemetry"}</h3>{@render telemetryHelp()}</div>{#each chartSignals as signal}{@const value=signalValue(signal.value)}<div class="signal-reading" style:--signal-color={signal.color}><span>{signal.label}</span><strong style:color={signal.value==='hp'?hpColor(value):undefined}>{value===undefined?'—':value.toFixed(signal.value==='hp'?1:2)} <small>{signal.unit}</small></strong></div>{/each}</div>{/if}
          <div class="telemetry-track"><LazyEChartsSurface {option} label={ensemble?"All sampled trajectories and their mean":"Runner telemetry over time"} height={220} zoomable={telemetryExpanded} onaxisclick={seek}/>{#if !telemetryExpanded}<span class="telemetry-cursor" aria-hidden="true"></span>{/if}</div>
        </div>
      </ChartFrame></div>
    {/snippet}
    {#snippet children(ticks)}
    {#if runner&&!ensemble}<SkillActivityTimeline {capture} index={runner.index} {skillNames} {time} {ticks} startTime={bounds.startTime} endTime={telemetryEnd} onseek={seek}/>{/if}
    {#if toggles.skills&&!ensemble}
      <div class="skill-feed" aria-label="Recent course skill triggers">
        <span class="timeline-label" title="Skills activated by the race field in the last 2 seconds">Race activations</span>
        <div class="skill-feed-scroll" role="group" aria-label="Recent skill activations (last 2 seconds)">
          {#each recentSkills.filter(e=>visibility[e.params[0]!]!==2) as event}
            {@const r=capture.runners.find(r=>r.index===event.params[0])}
            {#if r}<button class="skill-trigger" class:inspected={r.index===runner?.index} title={r.name+' at '+event.frameTime.toFixed(2)+' s'} aria-label={'Inspect '+r.name+' skill trigger at '+event.frameTime.toFixed(2)+' seconds'} onclick={()=>{selected=String(r.index);seek(event.frameTime);}}>
              <span class="activation-runner"><Artwork src={portrait(r.cardId)} alt={r.name} size="xs"/><b title={'Gate '+(r.index+1)}>{r.index+1}</b></span><RaceSkill id={event.params[1]!} name={skillNames.get(event.params[1]!)}/>
            </button>{/if}
          {:else}<span class="no-triggers">No recent activation</span>{/each}
        </div>
      </div>
    {/if}
    {/snippet}
  </ReplayTimeline></div>
  </div>
  </section>
  {#if !overviewOnly}
  <section class="analysis-section results-panel" data-report-section="results" aria-label="Race results section">
    <ReplayResults capture={{...capture,raceDistance:bounds.distanceMax}} selectedIndex={runner?.index} oninspect={index=>{selected=String(index);jump('runner');}} />
  </section>
  <section class="analysis-section runner-panel" data-report-section="runner" aria-label="Runner analysis section">
{#if runner}
  <header class="report-heading"><h2>Runner analysis</h2><Button variant="secondary" size="sm" icon="clipboard" onclick={()=>buildOpen=true}>Build details</Button></header>
  {#snippet runnerOverview()}
    <article class="runner-card" style:--runner-color={teamColor(runner)}>
      <RunnerBuild {runner} {skillNames} compact raceContext={{surface:course?.surface,distance:course?.distance??capture.raceDistance}}>
        {#snippet headerActions()}<Button variant="ghost" size="sm" ariaLabel="Choose runner" onclick={()=>runnerPickerOpen=true}><span class="gate-label">Gate {runner.index+1}<Icon name="chevron" size={14}/></span></Button>{/snippet}
      </RunnerBuild>
    </article>
  {/snippet}
  {#snippet blockingPanel()}
      <section class="events blocking-analysis" aria-label="Blocking incidents">
        <header><h3>Front blocking <small>{visibleBlocking.length} {visibleBlocking.length===1?'incident':'incidents'}</small></h3><Checkbox id="blocking-scope" label="All runners" bind:checked={allBlocking}/></header>
        <div class="event-list">{#each visibleBlocking as event}
          {@const blocked=capture.runners.find(r=>r.index===event.horseIndex)}
          {@const blocker=capture.runners.find(r=>r.index===event.blockerHorseIndex)}
          <button class:active={time>=event.startTime&&time<event.endTime&&runner.index===event.horseIndex} aria-label={'Review '+blocked?.name+' blocked by '+blocker?.name+' at '+event.startTime.toFixed(2)+' seconds'} onclick={()=>reviewBlocking(event)}>
            <time>{formatRaceTime(event.startTime)}</time><Artwork src={portrait(blocked?.cardId)} alt="" size="xs"/><span class="blocking-pair"><strong>{blocked?.name}</strong><small>Blocked by {blocker?.name}</small></span><span>{(event.endTime-event.startTime).toFixed(2)} s ↗</span>
          </button>
        {:else}<p>No front blocking recorded {allBlocking?'in this race':'for '+runner.name}.</p>{/each}</div>
      </section>
  {/snippet}
  <div class="runner-outcomes"><ReplayDiagnostics {capture} index={runner.index} {skillNames} distance={bounds.distanceMax} blocking={blockingPanel} overview={runnerOverview} onseek={reviewTime} onselect={reviewRunner}/></div>
{/if}
  </section>
  {#if hasSession}<div class="session-report" data-report-section="session">{@render sessionReport?.()}</div>{/if}
  {/if}
  </div>
  <Dialog bind:open={runnerPickerOpen} title="Choose runner" maxWidth="1040px" contentPadding="12px" mobileContentPadding="8px">
    <div class="runner-choices">{#each capture.runners as choice}
      <button class="runner-choice" class:chosen={choice.index===runner?.index} style:--runner-color={teamColor(choice)} aria-label={'Gate '+(choice.index+1)+' · '+choice.name} aria-pressed={choice.index===runner?.index} onclick={()=>{selected=String(choice.index);runnerPickerOpen=false;}}>
        <span class="choice-gate">Gate {choice.index+1}{#if choice.index===runner?.index}<Icon name="check" size={14}/>{/if}</span>
        <RunnerBuild runner={choice} {skillNames} compact raceContext={{surface:course?.surface,distance:course?.distance??capture.raceDistance}}/>
      </button>
    {/each}</div>
  </Dialog>
  <div class="runner-build-dialog"><Dialog bind:open={buildOpen} title="Runner build" maxWidth="980px" maxHeight="92dvh" contentPadding="12px" mobileContentPadding="8px">
    {#if runner}<RunnerBuildGroup single><article class="race-build-card"><RunnerBuildDetails {runner} {skillNames} color={teamColor(runner)} raceContext={{surface:course?.surface,distance:course?.distance??capture.raceDistance}}>
      {#snippet metrics()}{#if runner.result}<section class="entry-metadata"><h3>Race entry</h3><dl>{#each [{label:'Game finish time',value:formatRaceTime(runner.result.finishTime)},{label:'Time behind previous',value:runner.result.finishDiffTime.toFixed(3)+' s'},{label:'Guts / wit rank',value:runner.result.gutsOrder+' / '+runner.result.wizOrder},{label:'Result reason code',value:runner.result.defeatReason},{label:'Popularity',value:diagnostic?.popularity??runner.raw.popularity??'—'},{label:'Mood',value:['','Awful','Bad','Normal','Good','Great'][Number(runner.raw.motivation)]??'—'}] as fact}<div><dt>{fact.label}</dt><dd>{fact.value}</dd></div>{/each}</dl></section>{/if}{/snippet}
    </RunnerBuildDetails></article></RunnerBuildGroup>{/if}
    {#snippet actions()}<Button variant="secondary" size="sm" onclick={()=>buildOpen=false}>Close</Button>{/snippet}
  </Dialog></div>
</section>


<style>

  .replay{grid-template-columns:minmax(0,1fr);--control-height:32px;min-width:0;display:grid;gap:0}.replay-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;border-bottom:1px solid var(--border-subtle);margin-bottom:12px}.replay-title{display:flex;align-items:center;gap:10px;min-width:0}.replay-icon{display:grid;place-items:center;color:var(--accent-primary);flex:none}h2{font-size:17px;font-weight:650;margin:0}p{font-size:12px;color:var(--text-secondary);line-height:1.6;margin:0}.course-source{display:inline-block;font-size:10px;margin-left:10px;color:var(--text-secondary)}.course-heading{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:5px}.capture-summary{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--text-secondary)}.header-actions{min-width:0;max-width:45%;flex:none}.capture-summary strong{padding:4px 7px;background:var(--surface-2);border-radius:4px;font-size:10px;font-weight:500;color:var(--text-secondary)}.analysis-section{min-width:0;scroll-margin-top:80px;padding:0 16px 16px}.replay-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:12px 16px;align-items:start}.replay :global(.ui-button.sm){min-height:32px}.guide-trigger{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-secondary);padding:6px}
  .replay-toolbar{--control-height:32px;display:grid;gap:20px}.replay-toolbar h3{font-size:13px;margin:0 0 8px}.course-controls{display:grid;gap:8px;min-width:0}.precision-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.precision-fields label{display:grid;gap:6px;font-size:11px;color:var(--text-secondary)}input[type=number]{width:75px;padding:6px;border:1px solid var(--border-primary);background:var(--surface-2);border-radius:var(--radius-sm);color:var(--text-primary);font:inherit}.options{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}.options :global(.ui-toggle){justify-content:space-between}.notice{padding:12px}
  .fullscreen-target{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);overflow:hidden}.replay-layout:fullscreen{overflow:auto;padding:12px 16px;background:var(--surface-1)}
  .stage-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 2px;grid-column:1/-1}.course-legend{display:grid;gap:8px;color:var(--text-secondary);font-size:9px}.course-legend span{display:flex;gap:4px;align-items:center}.course-legend i{width:7px;height:7px;border-radius:2px}
  .race-stage{height:clamp(320px,38dvh,410px);position:relative;padding:26px 12px 52px;box-sizing:border-box}.lane-axis{position:absolute;z-index:3;pointer-events:none;text-shadow:0 1px 3px var(--surface-1);left:0;top:26px;bottom:52px;width:36px;font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.lane-axis span{position:absolute;right:0;transform:translateY(50%)}.lane-axis small{position:absolute;top:-23px;right:0;font-size:9px;white-space:nowrap}.track-plane{position:relative;height:100%;border-bottom:2px solid var(--border-primary);overflow:clip;overflow-clip-margin:44px}.course-background{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none}.lane-guide{stroke:var(--border-primary);stroke-width:1;opacity:.5}.rail-label{position:absolute;bottom:9px;left:8px;font-size:8px;letter-spacing:.08em;color:var(--text-tertiary,var(--text-secondary));opacity:.7}.race-boundary{stroke:var(--text-primary);stroke-width:1.5;vector-effect:non-scaling-stroke}.boundary-label{color:var(--text-primary);font-weight:600}.phase-marker{stroke:var(--text-secondary);stroke-dasharray:5 5}.course-label{position:absolute;top:4px;font-size:9px;white-space:nowrap;color:var(--text-secondary);transform:translateX(3px)}.course-label.phase{top:18px}
  .replay-marker{position:absolute;transform:translate(-50%,50%);display:flex;flex-direction:column;align-items:center;width:40px;height:40px;padding:0;gap:0;background:none;border:0;color:var(--text-primary);cursor:pointer;z-index:2}.replay-marker.selected,.replay-marker:focus-visible{z-index:4}.replay-marker:focus-visible{outline:2px solid var(--accent-primary);outline-offset:5px;border-radius:50%}.portrait{position:relative;display:block;border:2px solid var(--runner-color);border-radius:50%;background:var(--surface-1)}.replay-marker.selected .portrait{box-shadow:0 0 0 3px var(--surface-1),0 0 0 5px var(--runner-color)}.portrait b{position:absolute;bottom:-2px;right:-3px;padding:1px 4px;font-size:10px;font-weight:700;color:#141923;border-radius:4px;background:var(--runner-color)}.hp{position:absolute;top:calc(100% + 3px);display:block;width:36px;height:3px;background:var(--surface-3);border-radius:3px;overflow:hidden}.hp i{display:block;height:100%;background:var(--accent-success)}.marker-name{display:none;position:absolute;bottom:calc(100% + 8px);font-size:10px;font-weight:600;white-space:nowrap;background:var(--surface-1);padding:2px 5px;border-radius:3px;pointer-events:none}.blocked{position:absolute;right:-13px;top:-8px;color:var(--accent-error);font-weight:800;font-size:18px}.distance-axis{position:absolute;inset:100% 0 auto;height:20px;margin-top:34px;font-size:9px;color:var(--text-secondary)}.distance-axis span{position:absolute;transform:translateX(-50%);white-space:nowrap}.distance-axis span:first-child{transform:none}.distance-axis span:last-child{transform:translateX(-100%)}
  .map-loading{height:170px;display:grid;place-items:center}.map-loading.primary{height:clamp(320px,38dvh,410px)}
  .dim{opacity:.25}.live-roster{min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:16px 10px}.live-roster>header{padding:0 4px 8px}.live-roster h3{display:flex;justify-content:space-between;font-size:14px;margin:0 0 6px}.live-roster h3 span{color:var(--text-secondary);font-size:11px}.live-roster p{font-size:11px}.field-runner{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--border-subtle);border-radius:4px}.field-runner.chosen{background:var(--color-accent-soft)}.field-runner.dimmed .runner-pick{opacity:.5}.hidden-runner .runner-pick{opacity:.35}.runner-pick{flex:1;min-width:0;display:flex;align-items:center;gap:8px;border:0;padding:10px 4px;background:none;text-align:left;color:var(--text-primary);cursor:pointer}.field-place{width:16px;text-align:center;font-size:12px;color:var(--text-secondary);flex:none}.field-name{flex:1;min-width:0}.field-name strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600}.field-name small,.field-gap small{display:block;color:var(--text-secondary);font-size:10px;margin-top:4px}.field-gap{font-size:12px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.current-skills{display:flex;gap:4px;flex-wrap:wrap;min-height:24px;margin-top:10px;font-size:11px;color:var(--text-secondary);align-items:center}
  .runner-card{display:grid;gap:12px;align-content:start;min-width:0;background:var(--surface-1);border-radius:var(--radius-lg);padding:12px}.telemetry{min-width:0;display:grid;gap:12px}.telemetry :global(.chart-actions .checkbox strong){font-size:11px}.telemetry :global(.chart-tools){gap:6px;flex-wrap:nowrap}.telemetry :global(.chart-tools>.ui-button){flex:none}.telemetry :global(.chart-actions){gap:4px 12px;justify-content:flex-start;flex:1}.telemetry :global(.chart-actions .checkbox){min-height:32px;grid-template-columns:16px auto;gap:6px}.telemetry :global(.chart-actions .box){width:16px;height:16px}.telemetry :global(.chart-frame.expanded .lazy-surface),.telemetry :global(.chart-frame.expanded .lazy-surface>figure),.telemetry :global(.chart-frame.expanded .chart-host),.telemetry :global(.chart-frame.expanded .placeholder){height:100%;min-height:0}.events h3 small{font-size:10px;color:var(--text-secondary);font-weight:400;margin-left:4px}.events{background:var(--surface-1);border-radius:var(--radius-lg);overflow:hidden}.events header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px}.events h3{font-size:13px;margin:0}.events header>span{font-size:10px;color:var(--text-secondary)}.event-list{max-height:260px;overflow:auto;padding:0 12px 12px}.event-list button{display:flex;align-items:center;gap:12px;width:100%;padding:9px 4px;border:0;border-top:1px solid var(--border-subtle);background:none;color:var(--text-primary);cursor:pointer}.event-list time{font:11px var(--font-mono);color:var(--text-secondary)}.event-list button>span:last-child{font-size:11px;margin-left:auto;color:var(--text-secondary)}.event-list button.active{background:color-mix(in srgb,var(--accent-warning) 8%,transparent)}
  @media(max-width:1150px){.replay-layout{grid-template-columns:minmax(0,1fr) 280px;gap:12px}.field-name strong{font-size:11px}.runner-pick{gap:5px}}
  @media(max-width:950px){.live-roster{border-left:0;border-top:1px solid var(--border-subtle);padding:12px 0 0}.replay-layout{grid-template-columns:1fr}.field-runners{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}}
  @media(max-width:700px){.map-loading{height:160px}.map-loading.primary{height:390px}.replay-header{align-items:start;flex-wrap:wrap}.header-actions{width:100%;max-width:100%}.course-heading{gap:4px 8px}.replay-title{gap:8px}.replay-icon{display:none}h2{font-size:14px}.replay-header p{font-size:11px}.course-source{display:block;margin-left:0}.replay-header>:global(button){flex:none}.replay-header{padding:12px}.capture-summary{display:flex;gap:6px;font-size:9px}.analysis-section{padding:0 10px 12px}.course-controls{min-width:0;width:100%}.options{gap:4px 12px}.race-stage{height:330px}.lane-axis{width:33px}.stage-heading{padding:0 2px}.current-skills{margin-top:10px}.telemetry :global(.chart-tools){width:100%;align-items:start}.field-runners{grid-template-columns:1fr}.runner-pick{padding:9px 5px;gap:10px}.field-name strong{font-size:12px}.field-name small{font-size:10px}.marker-name{font-size:9px;max-width:90px;overflow:hidden;text-overflow:ellipsis}}.replay-marker.front-blocked .portrait{outline:2px solid var(--accent-error);outline-offset:3px}.field-runner.front-blocked .field-place{color:var(--accent-error);font-weight:700}
  .live-roster{padding:4px 0 4px 16px;border-left:1px solid var(--border-subtle);border-radius:0}.runner-extra{margin-top:9px}.runner-state{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:9px;color:var(--text-secondary);margin-top:8px}.runner-state b{color:var(--accent-warning);font-weight:500}.live-roster>header{padding-bottom:6px}.runner-pick{padding-block:6px}.field-name small,.field-gap small{margin-top:2px}
  @media(max-width:700px){.stage-heading{padding-block:0}.runner-pick{padding-block:6px}}
.live-diagnostics{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:8px;font-size:10px;color:var(--text-secondary)}.live-diagnostics b{color:var(--text-primary);font-weight:500}.mode-list{flex-basis:100%;color:var(--accent-primary)}.diagnostic-link{padding:0;border:0;background:none;color:var(--accent-primary);font:inherit;text-align:left;cursor:pointer}.blocked-by{display:flex;align-items:center;gap:8px;width:100%;padding:8px 0;border:0;background:none;text-align:left;color:var(--accent-error);cursor:pointer}.blocked-by span{display:grid;gap:3px}.blocked-by strong{font-size:12px}.active-skill{display:inline-flex;align-items:center;gap:4px}

  .stage-tools{display:flex;align-items:center;gap:6px}
  .replay-marker:hover .marker-name,.replay-marker:focus-visible .marker-name{display:block}.replay-marker.triggered .portrait{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent-warning) 70%,transparent)}.marker-telemetry{position:absolute;top:calc(100% + 10px);display:flex;gap:4px;font-size:9px;white-space:nowrap;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px var(--surface-1)}.crowded .marker-telemetry{visibility:hidden}.crowded.selected .marker-telemetry,.crowded:hover .marker-telemetry,.crowded:focus-visible .marker-telemetry{visibility:visible}.replay-marker:hover{z-index:5}.marker-telemetry>span+span{color:var(--text-secondary);padding-left:4px;border-left:1px solid var(--border-primary)}
  .skill-feed{display:grid;grid-template-columns:var(--timeline-label-width) minmax(0,1fr) var(--timeline-value-width);align-items:center;gap:var(--timeline-column-gap);height:32px;margin-top:4px;min-width:0}.skill-feed>.timeline-label{white-space:nowrap}.skill-feed-scroll{display:flex;align-items:center;gap:12px;min-width:0;height:32px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}.skill-feed-scroll::-webkit-scrollbar{display:none}.skill-trigger{display:flex;align-items:center;gap:5px;flex:none;border:0;border-radius:0;padding:0;background:none;color:var(--text-primary);cursor:pointer}.skill-trigger:hover{color:var(--accent-primary)}.skill-trigger:focus-visible{outline:2px solid var(--accent-primary);outline-offset:-2px}.activation-runner{position:relative;flex:none;display:block}.activation-runner b{position:absolute;right:0;bottom:0;padding:0 2px;border-radius:2px;background:var(--surface-1);font-size:9px;font-weight:500;color:var(--text-secondary)}.skill-trigger.inspected .activation-runner b{color:var(--accent-primary)}.skill-trigger :global(.art){width:28px;height:28px;border:0;background:transparent}.no-triggers{font-size:10px;color:var(--text-secondary)}
  @media(max-width:700px){.skill-feed>.timeline-label{position:sticky;left:0;z-index:5;background:var(--surface-1)}}
  .blocking-pair{display:grid;gap:3px;text-align:left;min-width:0}.blocking-pair strong{font-size:11px;font-weight:500}.blocking-pair small{font-size:10px;color:var(--text-secondary)}.events .event-list p{padding:8px 4px}
  @media(min-width:951px) and (max-height:1100px){.field-runners{max-height:380px;overflow-y:auto;scrollbar-width:thin}}

  [hidden]{display:none!important}.runner-snapshot{display:grid;gap:8px}.runner-snapshot header{display:flex;align-items:center;justify-content:space-between;gap:4px}.runner-snapshot h3{font-size:12px;margin:0}.runner-extra{margin-top:0}.stage-heading{padding-bottom:4px}.live-roster :global(.icon-button){width:26px;min-width:26px;height:28px;min-height:28px}

.race-panels{min-width:0;display:grid;gap:20px;padding-top:12px}.stage-heading{flex-wrap:wrap}.replay-view{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.stage-tools{margin-left:auto;flex-wrap:wrap}
.replay-header{background:var(--surface-1);border:0;border-radius:var(--radius-lg);margin:0 0 8px;padding:12px 16px}.report-navigation{position:sticky;top:var(--utility-height);z-index:calc(var(--z-header) - 2);display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;background:var(--bg-primary);border-bottom:1px solid var(--border-subtle)}.report-links{display:flex;align-items:center;gap:4px;min-width:0;overflow-x:auto;scrollbar-width:thin}.report-navigation :global(.ui-button){flex:none;white-space:nowrap;font-size:11px;min-height:32px}.report-links :global(.ui-button){font-weight:500}.report-links :global(.ui-button svg){width:15px;height:15px}.analysis-section{padding:16px;background:var(--surface-1);border-radius:var(--radius-lg)}.results-panel{padding:0}.report-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.report-heading h2{font-size:17px}.runner-card{padding:0 16px 0 0;border-right:1px solid var(--border-subtle);border-radius:0;background:transparent}.telemetry :global(.chart-frame.surface){padding:0;background:transparent}.runner-outcomes{margin-top:16px}.session-report,[data-report-section]{scroll-margin-top:50px}.session-report{min-width:0;border-top:1px solid var(--border-subtle);padding-top:12px}
@media(max-width:767px){.report-navigation{flex-wrap:wrap;padding-block:4px;gap:4px}.report-links{width:100%;gap:2px}.report-navigation :global(.ui-button){font-size:10px;min-height:30px;padding-inline:6px}.report-navigation>:global(.ui-button){margin-left:auto}.race-panels{gap:14px;padding-top:10px}.analysis-section{padding:12px}.results-panel{padding:0}.report-heading{flex-wrap:wrap;gap:10px}.runner-card{border-right:0;padding:0}.session-report,[data-report-section]{scroll-margin-top:78px}}

/* Keep live readings with the replay; the analysis below shares one runner context. */
.runner-panel{padding-block:12px}.runner-panel>.report-heading{margin-bottom:8px}
.blocking-analysis .event-list button{padding:4px 0}.blocking-analysis .blocking-pair{gap:1px;line-height:1.3}.blocking-analysis .event-list p{padding:3px 0}
.runner-card{display:block;padding:0 0 8px;border:0;border-bottom:1px solid var(--border-subtle);border-radius:0;background:transparent}.telemetry{gap:0}.runner-outcomes{margin-top:8px}.blocking-analysis{margin-top:0}.blocking-analysis{background:transparent;border-radius:0}.blocking-analysis>header{padding:0 0 4px}.blocking-analysis .event-list{padding:0;max-height:180px}.blocking-analysis :global(.checkbox){min-height:28px;font-size:11px}.runner-snapshot{padding-top:10px;border-top:1px solid var(--border-subtle);margin-top:10px;gap:6px}.runner-snapshot header{gap:8px}.runner-snapshot h3{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.runner-snapshot :global(.inline-stats dd){font-size:12px}.runner-snapshot :global(.inline-stats dt){font-size:9px}.runner-snapshot :global(.inline-stats>div){gap:2px;padding-block:2px}.runner-snapshot .runner-state{margin-top:0}.runner-snapshot .current-skills{margin-top:0}.runner-snapshot .blocked-by{padding:2px 0}.runner-snapshot .live-diagnostics{gap:3px 8px;margin-top:0}.runner-snapshot .blocked-by :global(.art){width:24px;height:24px}.runner-snapshot .blocked-by strong{font-size:11px}

@media(max-width:700px){.runner-card{gap:6px;padding:0 0 8px}.runner-outcomes{margin-top:8px}.blocking-analysis{margin-top:0}.blocking-analysis>header{flex-wrap:wrap;gap:6px}}

.entry-metadata{margin-top:20px}.entry-metadata h3{font-size:13px;margin:0 0 10px}.entry-metadata dl{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;font-size:11px;margin:0}.entry-metadata dt{color:var(--text-secondary)}.entry-metadata dd{margin:3px 0 0}.blocking-analysis :global(.checkbox){grid-template-columns:16px auto;gap:6px}.blocking-analysis :global(.box){width:16px;height:16px}


.fullscreen-target{grid-column:1;grid-row:2;align-self:stretch}
.live-roster{grid-column:2;grid-row:2;padding:0;border:0;border-radius:0;min-width:0}
.replay-timeline{grid-column:1/-1;grid-row:3;min-width:0;margin-top:0}
.stage-heading{padding:0 0 8px;border-bottom:1px solid var(--border-subtle)}
.stage-heading h2{font-size:18px}
.stage-tools{margin-left:0;gap:6px;flex-wrap:nowrap}
.stage-tools :global(.ui-button){min-height:32px;font-size:11px;padding-inline:10px;white-space:nowrap}
.replay-guide{display:inline-flex}
.replay-guide :global(.trigger),.telemetry :global(.trigger){border:1px solid var(--factor-field-border);border-radius:var(--radius-md);background:var(--factor-field-bg)}
.guide-trigger{min-height:30px;box-sizing:border-box;padding:5px 8px}
.field-heading{display:flex;align-items:center;gap:8px}
.live-roster .field-heading h3{align-items:center;justify-content:flex-start;gap:6px;margin:0;font-size:14px;line-height:20px;white-space:nowrap}
.field-order{margin-left:auto;font-size:11px;color:var(--text-secondary)}
.live-roster>header p{margin:0;padding:3px 0;font-size:11px;line-height:14px}
.field-runners{scrollbar-gutter:stable}
.field-runner{border:1px solid var(--border-subtle);border-radius:6px;background:var(--factor-field-bg);gap:4px}
.field-runner:hover{background:var(--surface-2)}
.field-runner.chosen{background:var(--color-accent-soft)}
.runner-pick{display:grid;grid-template-columns:24px 30px minmax(0,1fr) 43px auto;gap:6px;padding:2px 6px}
.field-place{display:grid;place-items:center;width:24px;min-height:28px;font-size:12px;font-weight:600;border-radius:4px;background:var(--surface-2)}
.field-place.podium{color:var(--accent-warning)}
.field-name strong{font-size:13px;line-height:17px}
.field-name small,.field-gap small{font-size:10px;line-height:13px;margin-top:0}
.field-gap{font-weight:600;font-size:13px;line-height:17px}
.field-gap small{font-weight:400}
.field-hp{display:grid;gap:0;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;line-height:17px;white-space:nowrap}
.field-hp strong{font-weight:600}
.field-hp small{font-size:10px;line-height:13px;color:var(--text-secondary)}
.field-gap .finish-status{display:flex;align-items:center;justify-content:flex-end;gap:3px;color:var(--accent-success)}
.live-roster :global(.icon-button){width:28px;min-width:28px;height:28px;min-height:28px;margin-right:4px;background:var(--factor-field-bg);border-color:var(--factor-field-border)}
.runner-snapshot{margin-top:8px;padding:8px;border:1px solid var(--border-subtle);border-radius:8px;background:var(--surface-2);gap:5px}
.runner-snapshot header{gap:8px}
.snapshot-identity{display:flex;align-items:center;gap:8px;min-width:0}
.snapshot-identity>div{min-width:0}
.snapshot-identity small{display:block;font-size:10px;color:var(--text-secondary);line-height:13px}
.runner-snapshot .snapshot-identity h3{font-size:13px;line-height:17px}
.runner-snapshot header :global(.ui-button){min-height:30px;padding:4px 8px;font-size:11px}
.runner-snapshot .runner-state{font-size:10px;line-height:13px;margin:0}
.snapshot-actions{display:flex;align-items:center;gap:4px;flex:none}
.snapshot-details-trigger{display:flex;align-items:center;gap:4px;padding:4px 6px;min-height:30px;box-sizing:border-box;border:1px solid var(--factor-field-border);border-radius:var(--radius-md);background:var(--factor-field-bg);font-size:11px}
.snapshot-details{display:grid;gap:8px}
.snapshot-movement{display:none}
.snapshot-details h4{font-size:12px;margin:4px 0 0}
.snapshot-details p{font-size:11px}
.snapshot-skill{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.snapshot-skill small{font-size:11px;color:var(--text-secondary);white-space:nowrap}
.snapshot-status{display:flex;align-items:center;gap:8px;min-width:0;height:24px}
.snapshot-status .blocked-by{width:auto;min-width:0;max-width:75%;margin:0;padding:2px 4px;gap:4px;font-size:10px;white-space:nowrap}
.snapshot-status .blocked-by span{display:block;overflow:hidden;text-overflow:ellipsis}
.snapshot-status .blocked-by strong{font-size:10px;font-weight:500}
.snapshot-status .blocked-by :global(svg){flex:none}
.blocker-clear{font-size:10px;color:var(--text-secondary);white-space:nowrap}
.snapshot-status .current-skills{display:flex;align-items:center;flex-wrap:nowrap;gap:4px;margin:0;min-width:0;height:24px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none}
.snapshot-status .current-skills::-webkit-scrollbar{display:none}
.runner-snapshot :global(.inline-stats dd){font-size:14px;line-height:1}
.runner-snapshot :global(.inline-stats dt){font-size:10px;line-height:1}
.runner-snapshot :global(.inline-stats>div){gap:3px;padding-block:2px}
.runner-finished{color:var(--accent-success)}
.blocked-by,.diagnostic-link{border:1px solid var(--border-primary);border-radius:5px;background:var(--factor-field-bg);padding:4px 6px}
.telemetry :global(.chart-tools>.ui-button){background:var(--factor-field-bg);border-color:var(--factor-field-border);min-height:32px}
@media(min-width:951px){
  .replay-layout{height:100%;grid-template-columns:minmax(0,1fr) 360px;grid-template-rows:auto minmax(160px,1fr) auto;gap:10px 16px}
  .replay-panel{height:min(100dvh,1080px);min-height:720px;padding:12px 16px;box-sizing:border-box}
  .replay-layout:fullscreen{height:100dvh;box-sizing:border-box}
  .fullscreen-target{height:100%;min-height:0}
  .race-stage,.map-loading.primary{height:100%;min-height:0}
  .live-roster{height:100%;min-height:0;box-sizing:border-box;display:grid;grid-template-rows:auto minmax(0,1fr) auto}
  .live-roster>header{padding-bottom:4px}
  .field-runners{min-height:0;max-height:none;overflow-y:auto;scrollbar-width:thin;display:flex;flex-direction:column;gap:2px}
  .field-runner{flex:none}
  .runner-pick :global(.art){width:30px;height:30px}
  .runner-snapshot{height:126px;max-height:none;box-sizing:border-box;grid-template-rows:30px 13px 29px 24px;gap:4px;overflow:visible}
  .active-skill{flex:none}
  .telemetry-track :global(.chart-host),.telemetry-track :global(.lazy-surface),.telemetry-track :global(.placeholder){height:240px;min-height:0}
  .replay-header{padding:12px 16px}
  .course-heading{margin-bottom:4px}
  .course-heading h2{font-size:17px;line-height:22px}
  .replay-header p{font-size:11px;line-height:16px}
  .report-navigation{padding-block:4px}
  .report-navigation :global(.ui-button){min-height:32px}
  .race-panels{padding-top:12px}
  .replay-timeline :global(.period-track),.replay-timeline :global(.strip-label){height:32px;min-height:32px}
  .replay-timeline :global(.skill-period),.replay-timeline :global(.skill-group){top:1px}
}
@media(min-width:951px) and (max-height:1000px){
  .telemetry-track :global(.chart-host),.telemetry-track :global(.lazy-surface),.telemetry-track :global(.placeholder){height:clamp(84px,calc(100dvh - 770px),190px)}
  .runner-pick{padding:1px 4px;grid-template-columns:22px 26px minmax(0,1fr) 41px auto;gap:5px}
  .runner-pick :global(.art){width:26px;height:26px}
  .field-name strong,.field-gap,.field-hp{font-size:12px;line-height:15px}
  .field-name small,.field-gap small,.field-hp small{font-size:10px;line-height:11px}
  .field-place{width:22px;min-height:26px}
  .runner-snapshot{height:119px;padding:6px;gap:3px}
}
@media(min-width:951px) and (max-height:850px){
  .replay-layout{row-gap:8px}
  .runner-pick{padding-block:0;min-height:0;grid-template-columns:22px 24px minmax(0,1fr) 41px auto}
  .runner-pick :global(.art){width:24px;height:24px}
  .field-place{min-height:24px}
  .field-runner :global(.icon-button){height:24px;min-height:24px}
  .runner-snapshot{height:72px;grid-template-rows:30px 24px;gap:4px}
  .runner-snapshot>.runner-state,.runner-snapshot>.runner-extra{display:none}
  .snapshot-movement{display:grid;gap:8px}
}
@media(min-width:951px) and (max-width:1400px){.replay-layout{grid-template-columns:minmax(0,1fr) 320px}}
@media(max-width:950px){
  .fullscreen-target,.live-roster,.replay-timeline{grid-column:auto;grid-row:auto}
  .stage-heading{order:0}.fullscreen-target{order:1}.replay-timeline{order:2}.live-roster{order:3}
  .stage-tools{margin-left:0;flex-wrap:wrap}
  .field-runners{gap:4px}
  .runner-snapshot{margin-top:12px}
}

.telemetry{margin:0}
.telemetry :global(.chart-frame){container-type:normal;gap:4px}
.telemetry :global(.chart-frame>figcaption){align-items:center;flex-wrap:wrap;gap:8px 16px}
.telemetry :global(.chart-heading){flex:none}
.telemetry :global(.chart-tools){flex-wrap:wrap;justify-content:flex-end}
.telemetry :global(.chart-actions){flex:none;gap:12px}
.telemetry :global(.chart-frame .plot){min-height:0;overflow:visible}
.telemetry-reading{grid-column:1;grid-row:1;display:flex;flex-direction:column;justify-content:space-around;gap:8px;width:88px;padding-block:8px;min-width:0;box-sizing:border-box}
.signal-reading{flex:1;display:grid;align-content:center;gap:4px;padding-left:8px;border-left:2px solid var(--signal-color);min-width:0}
.signal-reading>span{font-size:11px;color:var(--text-secondary)}
.signal-reading strong{font-size:18px;line-height:1.2;font-weight:600;color:var(--text-primary);font-variant-numeric:tabular-nums}
.signal-reading strong small{font-size:10px;font-weight:400;color:var(--text-secondary)}
.telemetry-columns{display:grid;grid-template-columns:var(--timeline-label-width) minmax(0,1fr) var(--timeline-value-width);gap:var(--timeline-column-gap);min-width:0}
.telemetry-track{grid-column:2;grid-row:1;position:relative;min-width:0;min-height:0;border-radius:8px;background:color-mix(in srgb,var(--surface-2) 45%,transparent)}
.telemetry-track :global(.chart-host>div),.telemetry-track :global(.chart-host svg){overflow:visible!important}
.telemetry-cursor{position:absolute;top:8px;bottom:8px;left:var(--replay-position);width:2px;transform:translateX(-1px);background:var(--accent-primary);pointer-events:none;z-index:2}
.telemetry-cursor::before{content:'';position:absolute;top:-3px;left:-2px;width:6px;height:6px;border-radius:50%;background:var(--accent-primary)}
.telemetry-columns.expanded{flex:1;min-height:0;grid-template-columns:40px minmax(0,1fr) var(--timeline-value-width)}
.telemetry-columns.expanded .telemetry-track{height:100%}
.telemetry :global(.chart-frame.expanded){height:100%;padding:16px}
.telemetry :global(.chart-frame.expanded .plot){flex:1;min-height:0}
.telemetry :global(.chart-frame.expanded figcaption){flex-wrap:wrap}
.desktop-chart-options{display:flex;align-items:center;gap:8px}
.telemetry-heading{display:flex;align-items:center;gap:6px;flex:none}
.telemetry-heading h3{margin:0;white-space:nowrap}
.telemetry-heading .guide-trigger{min-height:24px;padding:3px}
.telemetry-heading :global(.trigger){flex:none}
.playback-actions-options{display:contents}
@container playback (max-width:1250px){
  .playback-actions-options .desktop-chart-options{display:none}
  .playback-actions-options .mobile-chart-options{display:inline-flex}
}
.mobile-chart-options{display:none}
@media(min-width:951px) and (max-height:1000px){
  .telemetry-reading{gap:4px;padding-block:4px}
  .signal-reading{gap:2px}
  .signal-reading>span{font-size:10px;line-height:12px}
  .signal-reading strong{font-size:16px}
}
@media(max-width:700px){
  .stage-heading h2{font-size:16px}
  .telemetry :global(.chart-frame>figcaption){position:sticky;left:0;width:var(--timeline-visible-width);box-sizing:border-box;gap:6px}
  .telemetry :global(.chart-tools){display:contents}
  .telemetry :global(.chart-heading){order:0;width:100%}
  .telemetry :global(.chart-tools>.ui-button){order:2;margin-left:0}
  .telemetry :global(.chart-actions){order:1;flex:1;justify-content:space-between;gap:4px;flex-wrap:nowrap}
  .telemetry-reading{position:sticky;left:0;z-index:5;background:var(--surface-1)}
  .signal-reading{min-width:0;padding-left:7px}
  .signal-reading strong{font-size:18px}
  .signal-reading>span,.signal-reading strong small{font-size:10px}
  .desktop-chart-options{display:none}.mobile-chart-options{display:inline-flex}
  .telemetry .mobile-chart-options :global(.popover .ui-toggle){min-height:36px}
  .telemetry :global(.chart-frame.expanded>figcaption){position:static;width:auto}
  .telemetry-columns.expanded{min-width:0}
}
@media(min-width:951px) and (max-height:950px){
  .telemetry-columns:not(.expanded) .telemetry-reading{width:100%;gap:0;padding-block:0}
  .telemetry-columns:not(.expanded) .telemetry-heading h3{display:none}
  .telemetry-columns:not(.expanded) .telemetry-heading .guide-trigger{min-height:20px;padding:2px}
  .telemetry-columns:not(.expanded) .signal-reading{display:flex;align-items:center;justify-content:space-between;gap:4px;flex:1;padding-left:6px}
  .telemetry-columns:not(.expanded) .signal-reading strong{font-size:12px;line-height:16px}
  .telemetry-columns:not(.expanded) .signal-reading strong small{font-size:8px}
}

 .runner-card{display:block;min-width:0;padding:0;border:0;border-radius:0;background:transparent;overflow:visible}.runner-card :global(.build){display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);align-items:center;gap:24px}.runner-card :global(.build-identity){padding:0}.runner-card :global(.build-content){padding:0;display:block}.runner-card :global(.stat-overview){display:flex;align-items:center;gap:28px}.runner-card :global(.section-heading){display:none}.runner-card :global(.stats-container){width:min(460px,100%);flex:0 1 460px}.runner-card :global(.inline-stats>div){border:0;padding-block:3px}.runner-card :global(.inline-stats dd){font-size:14px}.runner-card :global(.race-aptitudes){gap:16px;flex:none}.runner-card :global(.race-aptitude>span:first-child){display:none}.runner-card :global(.race-aptitude small){order:-1;font-size:11px}.runner-card :global(.build-identity>.ui-button){flex:none;font-size:11px;min-height:30px;padding-inline:6px}.gate-label{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.runner-panel>.report-heading>:global(.ui-button){min-height:32px;padding-inline:12px;font-size:11px}.runner-outcomes{margin-top:0}
.runner-choices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.runner-choice{display:block;min-width:0;padding:0;border:1px solid var(--border-subtle);border-top:2px solid var(--runner-color);border-radius:0 0 var(--radius-md) var(--radius-md);background:var(--surface-2);color:var(--text-primary);text-align:left;font:inherit;cursor:pointer}.runner-choice.chosen{outline:2px solid var(--accent-primary);outline-offset:-2px}.runner-choice:hover{background:var(--surface-3)}.runner-choice:focus-visible{outline:2px solid var(--text-primary);outline-offset:2px}.choice-gate{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 0;font-size:10px;color:var(--text-secondary)}.choice-gate :global(svg){color:var(--accent-primary)}.runner-choice :global(.race-aptitude small){display:none}.runner-choice :global(.identity h3){font-size:14px}.runner-choice :global(.portrait){height:48px}.runner-choice :global(.veteran-identity){grid-template-columns:44px minmax(0,1fr) auto;gap:8px}
.race-build-card{border:0;border-radius:0;background:transparent;min-width:0}.race-build-card :global(.entry-metadata){border:0;padding:0;margin:0}.race-build-card :global(.entry-metadata h3){font-size:12px;margin:0 0 6px}.race-build-card :global(.entry-metadata dl){grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.race-build-card :global(.entry-metadata dl>div){padding:0;border:0}.race-build-card :global(.entry-metadata dt){font-size:10px}.race-build-card :global(.entry-metadata dd){font-size:12px;margin:3px 0 0}
@media(max-width:800px){.runner-choices{grid-template-columns:repeat(2,minmax(0,1fr))}.runner-card{padding:0}}@media(max-width:520px){.runner-choices{grid-template-columns:minmax(0,1fr)}.runner-card :global(.race-aptitudes){gap:8px}.runner-card :global(.race-aptitude){gap:3px}.runner-card :global(.race-aptitude small){font-size:9px}}
@media(max-width:1200px){.runner-card :global(.stat-overview){flex-wrap:wrap;gap:5px 16px}.runner-card :global(.stats-container){width:100%;flex-basis:100%}.runner-card :global(.race-aptitudes){gap:16px}}
@media(max-width:800px){.runner-card :global(.build){grid-template-columns:minmax(0,1fr);gap:6px}.runner-card :global(.stat-overview){gap:6px}.runner-card :global(.race-aptitudes){gap:16px}.runner-card :global(.inline-stats dd){font-size:13px}.runner-panel>.report-heading>:global(.ui-button){min-height:32px;font-size:11px}}
.field-name .field-meta{display:flex;gap:6px;white-space:nowrap}
.overview{padding:0}.overview .race-panels{padding-top:0}.overview .analysis-section.replay-panel{border:0;border-radius:0;padding:0;background:transparent}

.overview .telemetry-columns:not(.expanded) .telemetry-track :global(.chart-host),.overview .telemetry-columns:not(.expanded) .telemetry-track :global(.lazy-surface),.overview .telemetry-columns:not(.expanded) .telemetry-track :global(.placeholder){height:clamp(220px,24dvh,280px);min-height:0}
@media(min-width:951px){.overview .analysis-section.replay-panel{height:auto;min-height:0}.overview .replay-layout:not(:fullscreen){height:auto;grid-template-rows:auto clamp(340px,40dvh,500px) auto}}
@media(max-width:950px){.overview .replay-layout:not(:fullscreen) :global(.map-scene){height:340px}}
  .ensemble-views{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}.ensemble-views>span{font-size:10px;color:var(--text-secondary)}.ensemble-view .analysis-section.replay-panel{padding:0;height:auto;min-height:0}.ensemble-view .replay-layout:not(:fullscreen){display:block;height:auto;min-height:0}.ensemble-view .replay-timeline{margin-top:8px}.ensemble-view .race-panels{gap:0}
</style>


