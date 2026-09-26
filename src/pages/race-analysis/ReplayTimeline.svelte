<script lang="ts">
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { raceTimeAtDistance,replayProgress,type ReplayBounds } from '@/lib/race/race-replay';
  import { courseSegments,type Course } from './replay-course';
  let {frames,bounds,course,activations,skillNames,runnerName,time=$bindable(0),speed=$bindable('1'),playing,phase,leader,onplay,onpause,onseek}:{
    frames:ParsedRaceCapture['frames'];bounds:ReplayBounds;course?:Course;activations:ParsedRaceCapture['events'];
    skillNames:Map<number,string>;runnerName:string;time?:number;speed?:string;playing:boolean;phase:string;leader:number;
    onplay:()=>void;onpause:()=>void;onseek:(time:number)=>void;
  }=$props();
  const percent=(value:number)=>replayProgress(value,bounds)*100;
  const progress=$derived(percent(time));
  const segments=$derived(courseSegments(course).flatMap(s=>{
    const start=raceTimeAtDistance(frames,s.start),end=raceTimeAtDistance(frames,s.end)??bounds.endTime;
    return start===undefined?[]:[{...s,time:start,left:percent(start),width:percent(end)-percent(start)}];
  }));
  const phases=$derived([
    {label:'Early race',action:'Start',time:bounds.startTime},
    {label:'Mid race',action:'Mid race',time:raceTimeAtDistance(frames,bounds.distanceMax/6)},
    {label:'Late race',action:'Late race',time:raceTimeAtDistance(frames,bounds.distanceMax*2/3)},
    {label:'Finish',action:'Finish',time:raceTimeAtDistance(frames,bounds.distanceMax)}
  ]);
  const elevation=$derived.by(()=>{
    const distances=[...new Set([0,bounds.distanceMax,...(course?.slopes??[]).flatMap(s=>[s.start,s.start+s.length])])].filter(d=>d>=0&&d<=bounds.distanceMax).sort((a,b)=>a-b);
    const levels=distances.map(d=>(course?.slopes??[]).reduce((height,s)=>height+s.slope*Math.max(0,Math.min(s.length,d-s.start)),0));
    const min=Math.min(...levels),range=Math.max(...levels)-min;
    return distances.map((distance,i)=>({distance,x:percent(raceTimeAtDistance(frames,distance)??bounds.endTime)*10,y:range?38-(levels[i]!-min)/range*28:30}));
  });
  const hillPaths=$derived((course?.slopes??[]).map(s=>{
    const a=elevation.find(p=>p.distance===s.start),b=elevation.find(p=>p.distance===Math.min(bounds.distanceMax,s.start+s.length));
    return {slope:s.slope,path:a&&b?'M'+a.x+' '+a.y+' L'+b.x+' '+b.y:''};
  }));
  const currentSegment=$derived(segments.find(s=>leader>=s.start&&leader<s.end)?.label);
  const slope=$derived(course?.slopes.find(s=>leader>=s.start&&leader<s.start+s.length)?.slope??0);
</script>

<section class="playback" aria-label="Race playback">
  <header class="playback-state"><span><strong class="race-phase">{phase}</strong>{#if currentSegment}<span> · {currentSegment}</span>{/if}{#if slope}<span> · {slope>0?'Uphill':'Downhill'}</span>{/if}</span><span>Leader {Math.round(Math.min(leader,bounds.distanceMax)).toLocaleString()} / {Math.round(bounds.distanceMax).toLocaleString()} m <span class="remaining">· {Math.round(Math.max(0,bounds.distanceMax-leader)).toLocaleString()} m remaining</span></span></header>
  <div class="race-timeline">
    <div class="scrub-events" aria-label={runnerName+' skill activations'}>{#each activations as event}
      <button style:left={percent(event.frameTime)+'%'} aria-label={'Seek to '+(skillNames.get(event.params[1]!)??'skill')+' at '+event.frameTime.toFixed(2)+' seconds'} title={(skillNames.get(event.params[1]!)??'Skill')+' · '+event.frameTime.toFixed(2)+' s'} onclick={()=>onseek(event.frameTime)}><i></i></button>
    {/each}</div>
    <div class="terrain">
      <svg viewBox="0 0 1000 46" preserveAspectRatio="none" role="img" aria-label="Course elevation profile; uphill in pink and downhill in blue">
        <path class="terrain-fill" d={'M0 46 '+elevation.map(p=>'L'+p.x+' '+p.y).join(' ')+' L1000 '+(elevation.at(-1)?.y??30)+' L1000 46Z'}/>
        <polyline class="terrain-line" points={elevation.map(p=>p.x+','+p.y).join(' ')}/>
        {#each hillPaths as hill}<path class="hill" d={hill.path} stroke={hill.slope>0?'#bd7581':'#719bdd'}/>{/each}
      </svg>
      <input aria-label="Replay time" aria-valuetext={time.toFixed(2)+' seconds, '+phase+(currentSegment?', '+currentSegment:'')} title="Drag to seek through the replay" type="range" min={bounds.startTime} max={bounds.endTime} step=".001" bind:value={time} disabled={!frames.length} oninput={onpause}/>
    </div>
    <div class="course-bands" aria-label="Course sections">
      {#each segments as segment}<button style:left={segment.left+'%'} style:width={segment.width+'%'} style:--segment-color={segment.color} class:active={leader>=segment.start&&leader<segment.end} title={segment.label+' · '+Math.round(segment.start)+'–'+Math.round(segment.end)+' m'} aria-label={'Seek to '+segment.label+' at '+Math.round(segment.start)+' metres'} onclick={()=>onseek(segment.time)}>{segment.label}</button>{/each}
    </div>
    <div class="phase-navigation" aria-label="Race phases">
      {#each phases as item,index}{#if item.time!==undefined}
        {@const end=phases[index+1]?.time??bounds.endTime}
        <button style:left={percent(item.time)+'%'} style:width={Math.max(0,percent(end)-percent(item.time))+'%'} class:active={time>=item.time&&(time<end||index===phases.length-1)} aria-label={item.action} title={item.label+' · '+item.time.toFixed(2)+' s'} onclick={()=>onseek(item.time!)}>{item.label}</button>
      {/if}{/each}
    </div>
    <div class="timeline-cursor" style:left={progress+'%'} aria-hidden="true"><i></i></div>
  </div>
  <div class="timeline-key"><span>Time · {bounds.startTime.toFixed(0)} s</span><span><i class="up"></i>Uphill <i class="down"></i>Downhill <i class="skill"></i>{runnerName}’s skills</span><span>{bounds.endTime.toFixed(2)} s</span></div>
  <div class="playback-controls"><Button size="sm" onclick={onplay} disabled={!frames.length}>{playing?'Pause':'Play'}</Button><Button variant="ghost" size="sm" onclick={()=>onseek(bounds.startTime)}>Restart</Button><Button variant="ghost" size="sm" onclick={()=>onseek(time-1)}>−1s</Button><Button variant="ghost" size="sm" onclick={()=>onseek(time+1)}>+1s</Button><span class="playback-clock"><strong>{time.toFixed(2)}s</strong><span class="clock-total"> / {bounds.endTime.toFixed(2)}s</span></span><SelectField id="playback-speed" label="Playback speed" hideLabel options={['0.5','1','2','4','8'].map(value=>({value,label:value+'×'}))} bind:value={speed}/></div>
</section>

<style>
  .playback{margin:0 20px;padding:4px 0 8px;min-width:0}.playback-state{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary);margin-bottom:4px;font-variant-numeric:tabular-nums}.playback-state>span:first-child{display:flex;gap:4px}.race-phase{color:var(--accent-primary);font-weight:600}.race-timeline{position:relative;margin-inline:7px}.scrub-events{height:16px;position:relative}.scrub-events button{position:absolute;top:-3px;transform:translateX(-50%);border:0;width:22px;height:22px;background:none;cursor:pointer;display:grid;place-items:center;padding:0;z-index:2}.scrub-events i{width:6px;height:6px;transform:rotate(45deg);background:var(--accent-warning)}.scrub-events button:hover i,.scrub-events button:focus-visible i{width:9px;height:9px}
  .terrain{position:relative;height:46px}.terrain svg{width:100%;height:100%;display:block}.terrain-fill{fill:var(--color-accent-soft);opacity:.5}.terrain-line{fill:none;stroke:var(--text-secondary);stroke-width:1;opacity:.5}.hill{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.terrain input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}.terrain:focus-within{outline:2px solid var(--accent-primary);outline-offset:2px;border-radius:3px}
  .course-bands,.phase-navigation{position:relative;height:24px}.phase-navigation{height:20px}.course-bands button,.phase-navigation button{position:absolute;inset-block:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-right:1px solid var(--surface-1);border-radius:0;font:inherit;color:var(--text-secondary);padding:3px 5px;cursor:pointer;text-align:center}.course-bands button{background:color-mix(in srgb,var(--segment-color) 24%,var(--surface-1));box-shadow:inset 0 -2px var(--segment-color);font-size:10px}.course-bands button.active,.course-bands button:hover{background:color-mix(in srgb,var(--segment-color) 48%,var(--surface-1));color:var(--text-primary)}.phase-navigation button{font-size:10px;background:var(--surface-2)}.phase-navigation button.active,.phase-navigation button:hover{color:var(--accent-primary);background:var(--color-accent-soft)}.timeline-cursor{position:absolute;top:0;bottom:0;width:2px;background:var(--accent-primary);transform:translateX(-1px);pointer-events:none;z-index:3}.timeline-cursor>i{position:absolute;top:0;left:-4px;width:10px;height:10px;border-radius:50%;background:var(--accent-primary);box-shadow:0 0 0 2px var(--surface-1)}
  .timeline-key{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:9px;color:var(--text-secondary);margin:4px 7px 8px}.timeline-key>span:nth-child(2){display:flex;align-items:center;gap:5px}.timeline-key i{display:inline-block;width:7px;height:2px}.timeline-key .up{background:#bd7581}.timeline-key .down{background:#719bdd;margin-left:5px}.timeline-key .skill{width:5px;height:5px;transform:rotate(45deg);background:var(--accent-warning);margin-left:5px}
  .playback-controls{display:flex;align-items:center;gap:6px}.playback-clock{flex:1;text-align:right;font-size:11px;color:var(--text-secondary);margin-right:8px;white-space:nowrap;font-variant-numeric:tabular-nums}.playback-clock strong{font-size:18px;color:var(--text-primary);font-weight:600}.playback-controls :global(.field){width:72px}
  @media(max-width:700px){.playback{margin-inline:12px}.playback-state{font-size:10px}.remaining{display:none}.timeline-key>span:nth-child(2){display:none}.playback-controls{gap:4px;flex-wrap:wrap}.playback-clock{font-size:10px;margin:0}.playback-clock strong{font-size:15px}.playback-controls :global(.field){width:68px}.clock-total{display:none}.playback-controls>:global(.ui-button){padding-inline:8px;font-size:11px}}
</style>
