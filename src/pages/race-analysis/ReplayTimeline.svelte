<script lang="ts">
  import type { Snippet } from 'svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/InspectPopover.svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { raceTimeAtDistance,replayProgress,type ReplayBounds } from '@/lib/race/race-replay';
  import { courseSegments,type Course } from './replay-course';
  import { courseTerrain,replayTimeTicks } from './replay-timeline';
  let {frames,bounds,timelineEnd,course,time=$bindable(0),speed=$bindable('1'),playing,phase,leader,onplay,onseek,children,telemetry,actions}:{
    frames:ParsedRaceCapture['frames'];bounds:ReplayBounds;timelineEnd?:number;course?:Course;time?:number;speed?:string;playing:boolean;phase:string;leader:number;
    onplay:()=>void;onseek:(time:number)=>void;children?:Snippet<[number[]]>;telemetry?:Snippet;actions?:Snippet;
  }=$props();
  let width=$state(0),labelWidth=$state(0),plotWidth=$state(0),scrollArea=$state<HTMLDivElement>(),tracks=$state<HTMLDivElement>();
  const displayBounds=$derived({...bounds,endTime:timelineEnd??bounds.endTime,duration:(timelineEnd??bounds.endTime)-bounds.startTime});
  const percent=(value:number)=>replayProgress(value,displayBounds)*100;
  const progress=$derived(percent(time));
  $effect(()=>{
    progress;width;labelWidth;
    if(!scrollArea||!tracks||scrollArea.scrollWidth<=scrollArea.clientWidth)return;
    const cursor=tracks.offsetLeft+tracks.clientWidth*progress/100;
    if(cursor<scrollArea.scrollLeft+labelWidth+10||cursor>scrollArea.scrollLeft+scrollArea.clientWidth-12)
      scrollArea.scrollLeft=cursor-labelWidth-(scrollArea.clientWidth-labelWidth)/2;
  });
  const ticks=$derived(replayTimeTicks(bounds.startTime,displayBounds.endTime,Math.max(2,Math.floor(plotWidth/140))));
  const minorTicks=$derived.by(()=>{
    const step=[1,2,5,10,15,30,60,120,300].find(value=>displayBounds.duration/value<=plotWidth/14)??Math.max(1,Math.ceil(displayBounds.duration/60));
    const start=Math.ceil(bounds.startTime/step)*step;
    return Array.from({length:Math.max(0,Math.ceil((displayBounds.endTime-start)/step))},(_,i)=>start+i*step).filter(value=>value>bounds.startTime&&!ticks.includes(value));
  });
  function scrub(value:number){
    // The final timestamp may fall between the slider's millisecond steps.
    onseek(value>=displayBounds.endTime-.001?displayBounds.endTime:value);
  }
  const tickLabel=(value:number)=>{const rounded=Math.round(value*10)/10;return rounded===0?'0:00':formatRaceTime(rounded,Number.isInteger(rounded)?0:1);};
  function timedSection<T extends {start:number;end:number}>(section:T){
    const start=raceTimeAtDistance(frames,section.start),end=section.end>=bounds.distanceMax?displayBounds.endTime:raceTimeAtDistance(frames,section.end)??displayBounds.endTime;
    return start===undefined?[]:[{...section,time:start,left:percent(start),width:Math.max(0,percent(end)-percent(start))}];
  }
  const segments=$derived(courseSegments(course).flatMap(timedSection));
  const phases=$derived([
    {label:'Early race',action:'Start',color:'#8d96a5',time:bounds.startTime},
    {label:'Mid race',action:'Mid race',color:'#69b7ee',time:raceTimeAtDistance(frames,bounds.distanceMax/6)},
    {label:'Late race',action:'Late race',color:'#dfba72',time:raceTimeAtDistance(frames,bounds.distanceMax*2/3)},
    {label:'Final leg',action:'Final leg',color:'#bd91d1',time:raceTimeAtDistance(frames,bounds.distanceMax*5/6)}
  ]);
  const terrain=$derived(course?courseTerrain(course):undefined);
  const slopes=$derived(terrain?.slopes.flatMap(timedSection)??[]);
  const minHeight=$derived(Math.min(0,...(terrain?.elevation.map(point=>point.height)??[])));
  const maxHeight=$derived(Math.max(0,...(terrain?.elevation.map(point=>point.height)??[])));
  const elevation=$derived(terrain?.elevation.map(point=>({distance:point.distance,x:percent(raceTimeAtDistance(frames,point.distance)??displayBounds.endTime)*10,y:maxHeight>minHeight?44-(point.height-minHeight)/(maxHeight-minHeight)*36:36}))??[]);
  const hillPaths=$derived((course?.slopes??[]).map(s=>{
    const a=elevation.find(p=>p.distance===s.start),b=elevation.find(p=>p.distance===Math.min(bounds.distanceMax,s.start+s.length));
    return {slope:s.slope,path:a&&b?'M'+a.x+' '+a.y+' L'+b.x+' '+b.y:''};
  }));
  const currentSegment=$derived(segments.find(s=>leader>=s.start&&leader<s.end)?.label);
  const slope=$derived(course?.slopes.find(s=>leader>=s.start&&leader<s.start+s.length)?.slope??0);
  const slopeLabel=(value:number)=>value===0?'Level':(value>0?'Uphill +':'Downhill ')+(value/10000).toFixed(1)+'%';
</script>

<section bind:clientWidth={width} class="playback" style:--timeline-visible-width={width+'px'} aria-label="Race playback" style:--replay-position={progress+'%'}>
  <div class="playback-controls" role="toolbar" aria-label="Playback and telemetry controls">
    <Button size="sm" onclick={onplay} disabled={!frames.length}>{playing?'Pause':'Play'}</Button>
    <Button variant="secondary" size="sm" onclick={()=>onseek(bounds.startTime)}>Restart</Button>
    <Button variant="secondary" size="sm" onclick={()=>onseek(time-1)}>−1s</Button>
    <Button variant="secondary" size="sm" onclick={()=>onseek(time+1)}>+1s</Button>
    <div class="playback-state"><span><strong class="race-phase">{phase}</strong>{#if currentSegment}<span>{currentSegment}</span>{/if}{#if slope}<span>{slopeLabel(slope)}</span>{/if}</span><span>Leader {Math.round(Math.min(leader,bounds.distanceMax)).toLocaleString()} / {Math.round(bounds.distanceMax).toLocaleString()} m <span class="remaining">{Math.round(Math.max(0,bounds.distanceMax-leader)).toLocaleString()} m remaining</span></span></div>
    {#if actions}<div class="playback-actions">{@render actions()}</div>{/if}
    <span class="playback-clock"><strong>{formatRaceTime(time,2)}</strong><span class="clock-total"> / {formatRaceTime(bounds.endTime,2)}</span></span>
    <Button variant="secondary" size="sm" ariaLabel="Finish" onclick={()=>onseek(displayBounds.endTime)}>Finish ▦</Button>
    <SelectField id="playback-speed" label="Playback speed" hideLabel options={['0.5','1','2','4','8'].map(value=>({value,label:value+'×'}))} bind:value={speed}/>
    <InspectPopover label="How to read the replay timeline" align="end">{#snippet trigger()}<span class="timeline-help"><Icon name="info" size={16}/></span>{/snippet}<h3>Course and skill timeline</h3><p>The telemetry graph, course lanes and skill icons use the same replay time axis. Course boundaries mark when the race leader reaches each section; elevation is relative to the start.</p><p>Select a course section or race phase to jump to its start. Drag the blue handle to scrub, or focus it and use the arrow keys.</p><p>The skills below belong to the selected runner. Select an activation to replay it. Skill icons show activation times and highlight while active. Numbered icons group nearby activations. Open Skill activity details for names, exact durations and activation rolls.</p></InspectPopover>
  </div>
  <small class="scroll-hint">Scroll sideways to see the full course and skill timeline</small>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The shared horizontal timeline must be reachable with the keyboard.) -->
  <div bind:this={scrollArea} class="timeline-scroll" role="region" aria-label="Course and skills" tabindex="0"><div class="timeline-content">
  <div class="time-scrubber">
    <div class="time-label timeline-label">Time <span>m:ss</span></div>
    <div bind:clientWidth={plotWidth} class="time-axis" style:--progress={progress+'%'}>
      <div class="time-ticks" aria-label="Elapsed time in minutes and seconds">{#each ticks as value}<span style:left={percent(value)+'%'} >{tickLabel(value)}</span>{/each}{#each minorTicks as value}<i style:left={percent(value)+'%'} aria-hidden="true"></i>{/each}</div>
      <input class="time-slider" aria-label="Replay time" aria-valuetext={time.toFixed(2)+' seconds, '+phase+(currentSegment?', '+currentSegment:'')} title="Drag to seek through the replay" type="range" min={bounds.startTime} max={displayBounds.endTime} step=".001" value={Math.min(time,displayBounds.endTime)} disabled={!frames.length} oninput={event=>scrub(Number(event.currentTarget.value))}/>
    </div>
  </div>
  {@render telemetry?.()}
  <div class="race-timeline" title="Drag the blue handle to scrub through the replay">
    <div bind:clientWidth={labelWidth} class="timeline-labels" aria-hidden="true"><span class="timeline-label" title="Elevation relative to the race start">Elevation (m)</span><span class="timeline-label">Slope</span><span class="timeline-label">Course</span><span class="timeline-label">Race phase</span></div>
    <div bind:this={tracks} class="course-tracks">
      <div class="terrain">
        {#if course}<svg viewBox="0 0 1000 52" preserveAspectRatio="none" role="img" aria-label="Course elevation profile; uphill in pink and downhill in blue">
          <path class="terrain-fill" d={'M0 52 '+elevation.map(p=>'L'+p.x+' '+p.y).join(' ')+' L1000 '+(elevation.at(-1)?.y??36)+' L1000 52Z'}/>
          <polyline class="terrain-line" points={elevation.map(p=>p.x+','+p.y).join(' ')}/>
          {#each hillPaths as hill}<path class="hill" d={hill.path} stroke={hill.slope>0?'#bd7581':'#719bdd'}/>{/each}
        </svg>{:else}<span class="unknown-course">Select a course in Display options to see its terrain and sections.</span>{/if}
      </div>
      <div class="slope-bands" aria-label="Course slopes">{#each slopes as section}<button style:left={section.left+'%'} style:width={section.width+'%'} style:--segment-color={section.slope>0?'#bd7581':section.slope<0?'#719bdd':'#737d89'} class:narrow={section.width<5} class:active={leader>=section.start&&leader<section.end} title={slopeLabel(section.slope)+', '+Math.round(section.start)+'–'+Math.round(section.end)+' m'} aria-label={'Seek to '+slopeLabel(section.slope)+' at '+Math.round(section.start)+' metres'} onclick={()=>onseek(section.time)}><span class="slope-name">{slopeLabel(section.slope)}</span><span class="slope-symbol" aria-hidden="true">{section.slope>0?'↗':section.slope<0?'↘':'–'}</span></button>{/each}</div>
      <div class="course-bands" aria-label="Course sections">{#each segments as segment}<button style:left={segment.left+'%'} style:width={segment.width+'%'} style:--segment-color={segment.color} class:active={leader>=segment.start&&leader<segment.end} title={segment.label+', '+Math.round(segment.start)+'–'+Math.round(segment.end)+' m'} aria-label={'Seek to '+segment.label+' at '+Math.round(segment.start)+' metres'} onclick={()=>onseek(segment.time)}>{segment.label}</button>{/each}</div>
      <div class="phase-navigation" aria-label="Race phases">{#each phases as item,index}{#if item.time!==undefined}
        {@const end=phases[index+1]?.time??displayBounds.endTime}
        <button style:left={percent(item.time)+'%'} style:width={Math.max(0,percent(end)-percent(item.time))+'%'} style:--segment-color={item.color} class:active={time>=item.time&&time<end} aria-label={item.action} title={item.label+' at '+item.time.toFixed(2)+' s'} onclick={()=>onseek(item.time!)}>{item.label}</button>
      {/if}{/each}</div>
      <div class="timeline-cursor" aria-hidden="true"></div>
    </div>
    <div class="timeline-values"><span class="elevation-range">{#if course}<span>{maxHeight.toFixed(1)} m</span><span>{minHeight.toFixed(1)} m</span>{/if}</span><span></span><span></span><span class="finish">Finish ▦</span></div>
  </div>
  {#if children}<div class="timeline-skills">{@render children(ticks)}</div>{/if}
  </div></div>
</section>

<style>
  .playback :global(.timeline-label){font-size:11px;font-weight:500;line-height:16px;color:var(--text-primary)}
  .playback{container:playback / inline-size}
  .playback-actions{display:flex;align-items:center;gap:8px;flex:none;min-width:0}
  .playback-state{min-width:0}
  .playback-state>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .playback{--timeline-label-width:160px;--timeline-value-width:64px;--timeline-column-gap:12px;--time-scale-height:22px;min-width:0;padding-top:8px;border-top:1px solid var(--border-subtle)}.playback-controls{display:flex;align-items:center;gap:4px;margin-bottom:4px}.playback-state{display:flex;align-items:center;gap:8px;flex:1;margin-left:12px;font-size:11px;color:var(--text-secondary);font-variant-numeric:tabular-nums}.race-phase{color:var(--accent-primary);font-weight:600}.playback-clock{font-size:11px;color:var(--text-secondary);margin-inline:8px;white-space:nowrap;font-variant-numeric:tabular-nums}.playback-clock strong{font-size:15px;color:var(--text-primary);font-weight:600}.playback-controls :global(.ui-button){min-height:32px;font-size:11px}.playback-controls :global(.field){width:72px}.playback-controls :global(.field select){min-height:32px;padding-block:4px}.timeline-help{display:grid;place-items:center;width:32px;height:32px;color:var(--text-secondary);border:1px solid var(--factor-field-border);border-radius:var(--radius-md);background:var(--factor-field-bg);box-sizing:border-box}
  .race-timeline,.time-scrubber{display:grid;grid-template-columns:var(--timeline-label-width) minmax(0,1fr) var(--timeline-value-width);gap:var(--timeline-column-gap);min-width:0}.timeline-labels,.course-tracks,.timeline-values{display:grid;grid-template-rows:28px 18px 20px 18px;gap:2px;min-width:0}.timeline-labels{font-size:11px;color:var(--text-secondary)}.timeline-labels>span{display:flex;align-items:center;white-space:nowrap;gap:4px}.course-tracks{position:relative}.terrain{min-width:0;position:relative}.terrain svg{width:100%;height:100%;display:block}.terrain-fill{fill:var(--color-accent-soft)}.terrain-line{fill:none;stroke:var(--text-secondary);stroke-width:1;vector-effect:non-scaling-stroke}.hill{fill:none;stroke-width:2;vector-effect:non-scaling-stroke}.unknown-course{display:flex;align-items:center;height:100%;font-size:11px;color:var(--text-secondary)}
  .slope-bands,.course-bands,.phase-navigation{position:relative;min-width:0}.slope-bands button,.course-bands button,.phase-navigation button{position:absolute;inset-block:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border:0;border-right:1px solid var(--surface-1);border-radius:0;background:color-mix(in srgb,var(--segment-color) 18%,var(--surface-1));box-shadow:inset 0 -2px var(--segment-color);font:inherit;font-size:11px;color:var(--text-secondary);padding:0 6px;cursor:pointer;text-align:center}.slope-bands button{font-size:10px;box-shadow:none}.phase-navigation button{font-size:10px;box-shadow:none}.slope-bands button.active,.course-bands button.active,.phase-navigation button.active{background:color-mix(in srgb,var(--segment-color) 34%,var(--surface-1));color:var(--text-primary)}.slope-bands button:hover,.course-bands button:hover,.phase-navigation button:hover{background:color-mix(in srgb,var(--segment-color) 45%,var(--surface-1));color:var(--text-primary)}.slope-bands button:focus-visible,.course-bands button:focus-visible,.phase-navigation button:focus-visible{outline:2px solid var(--accent-primary);outline-offset:-2px;z-index:4}
  .timeline-cursor{position:absolute;top:0;bottom:0;left:var(--replay-position);width:2px;background:var(--accent-primary);transform:translateX(-1px);pointer-events:none;z-index:3}.timeline-values{color:var(--text-secondary);font-size:10px;text-align:right;font-variant-numeric:tabular-nums}.elevation-range{display:flex;flex-direction:column;justify-content:space-between;padding-block:4px}.finish{display:flex;align-items:center;justify-content:flex-end}.time-axis{grid-column:2;min-width:0;position:relative}.time-axis::before{content:"";position:absolute;top:calc(var(--time-scale-height) + 7px);left:0;right:0;height:4px;border-radius:4px;background:linear-gradient(to right,var(--accent-primary) var(--progress),var(--border-primary) var(--progress));pointer-events:none}.time-ticks{position:relative;height:var(--time-scale-height);font-size:13px;line-height:16px;font-weight:600;color:var(--text-primary);font-variant-numeric:tabular-nums;pointer-events:none}.time-ticks>span::after,.time-ticks>i{content:"";position:absolute;top:15px;left:50%;width:1px;height:9px;background:var(--text-secondary)}.time-ticks>i{top:20px;left:0;height:4px;opacity:.45}.time-ticks>span{position:absolute;white-space:nowrap;transform:translateX(-50%)}.timeline-skills{margin-top:6px}p{font-size:12px;line-height:1.6;color:var(--text-secondary)}h3{font-size:14px;margin-top:0}
  .time-slider{display:block;width:calc(100% + 14px);height:18px;margin:0 -7px;padding:0;appearance:none;-webkit-appearance:none;background:transparent;cursor:ew-resize;position:relative;z-index:4;touch-action:none}.time-slider::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:transparent}.time-slider::-moz-range-track{height:4px;border-radius:4px;background:transparent}.time-slider::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:14px;height:14px;border:2px solid var(--text-primary);border-radius:50%;background:var(--accent-primary);margin-top:-5px;box-shadow:0 0 0 2px var(--surface-1)}.time-slider::-moz-range-thumb{width:10px;height:10px;border:2px solid var(--text-primary);border-radius:50%;background:var(--accent-primary);box-shadow:0 0 0 2px var(--surface-1)}.time-slider:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px;border-radius:4px}
  @media(max-width:700px){.playback-actions{flex:1 1 100%;max-width:100%;flex-wrap:wrap}.playback-actions :global(.segments){min-width:0;max-width:100%}.playback{--timeline-label-width:160px;--timeline-value-width:64px;--timeline-column-gap:8px}.playback-controls{gap:4px;flex-wrap:wrap}.playback-state{flex-basis:100%;order:2;margin:4px 0 0;font-size:10px}.playback-state>span:last-child{display:none}.playback-clock{flex:1;margin:0;text-align:right}.playback-clock strong{font-size:13px}.clock-total,.remaining{display:none}.playback-controls :global(.field){width:58px}.playback-controls>:global(.ui-button){padding-inline:6px}.timeline-help{width:22px}.timeline-labels{font-size:10px}.slope-bands button,.course-bands button,.phase-navigation button{padding-inline:2px}.time-ticks{font-size:11px}.timeline-values{font-size:9px}.timeline-skills{margin-top:6px}}
.timeline-scroll{position:relative;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin}.timeline-content{min-width:0}.timeline-scroll:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}.scroll-hint,.slope-symbol{display:none}.narrow .slope-name{display:none}.narrow .slope-symbol{display:inline}@media(max-width:700px){.timeline-content{min-width:620px}.timeline-scroll{padding-bottom:6px}.scroll-hint{display:block;font-size:10px;color:var(--text-secondary);margin-bottom:8px}.timeline-labels{position:sticky;left:0;z-index:5;background:var(--surface-1)}.timeline-labels>span{padding-right:6px}}
  @media(min-width:951px){
    .playback{padding-top:6px}
    .playback-controls{margin-bottom:2px}
    .timeline-labels,.course-tracks,.timeline-values{grid-template-rows:24px 14px 18px 14px;gap:1px}
    .time-slider{height:10px}.playback{--time-scale-height:20px}.time-axis::before{top:calc(var(--time-scale-height) + 3px)}.time-ticks>span::after{top:16px;height:5px}.time-ticks>i{top:19px;height:3px}
  }
  @media(min-width:951px) and (max-height:1000px){.timeline-labels,.course-tracks,.timeline-values{grid-template-rows:20px 12px 16px 12px}.playback-controls{margin-bottom:0}.timeline-skills{margin-top:4px}}
  @media(min-width:951px) and (max-height:850px){.playback{padding-top:4px}}
  .time-label{align-self:stretch;display:flex;align-items:center;justify-content:flex-start;gap:7px;line-height:16px;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap}.time-label span{font-size:10px;font-weight:400;color:var(--text-secondary)}
  @media(max-width:700px){.time-label{position:sticky;left:0;z-index:5;background:linear-gradient(to right,var(--surface-1) calc(100% - 16px),transparent)}}
.playback-state>span{display:flex;align-items:center;flex-wrap:wrap;gap:8px}.remaining{margin-left:8px}
</style>
