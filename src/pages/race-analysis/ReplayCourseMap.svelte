<script lang="ts">
  import { onDestroy,untrack } from 'svelte';
  import { Spring,prefersReducedMotion } from 'svelte/motion';
  import type { RaceFrame,RaceRunner } from '@/lib/race/race-capture-parser';
  import { raceFrameAtTime,replayLaneMetres,type InterpolatedRaceFrame } from '@/lib/race/race-replay';
  import Button from '@/components/Button.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { courseSegments,courseLandmarks,type Course,type CourseShape } from './replay-course';
  import { replayTrack,trackPointAtDistance,trackSection,fitTrackCamera,followTrackCamera,placeTrackLabels,trackBasis,trackUnitsPerMetre,type TrackCamera } from './replay-track';
  let {course,shape,frame,frames,laneWidth,onseekdistance,runners,selected=$bindable('0'),visibility,teamColor,viewport,slopes=true,onselectcourse}:{
    course?:Course;shape?:CourseShape;frame?:InterpolatedRaceFrame;frames:RaceFrame[];laneWidth:number;onseekdistance:(distance:number)=>void;runners:RaceRunner[];selected?:string;
    visibility:Record<number,number>;teamColor:(runner:RaceRunner)=>string;viewport:{min:number;max:number};slopes?:boolean;onselectcourse:()=>void;
  }=$props();
  let mapWidth=$state(800),mapHeight=$state(280),map=$state<SVGSVGElement>(),following=$state(true),followZoom=$state(1),manual=$state<TrackCamera>();
  let drag:{id:number;x:number;y:number;view:TrackCamera}|undefined;
  const helpId=$props.id();
  const points=$derived(shape?replayTrack(shape):[]);
  const units=$derived(trackUnitsPerMetre(points));
  const offsetAt=(distance:number,lane:number)=>{
    const p=trackBasis(points,distance,course?.turn);
    return {...p,x:p.x+p.nx*lane*units,y:p.y+p.ny*lane*units};
  };
  const roadPoints=$derived(points.map(p=>offsetAt(p.distance,laneWidth/2)));
  const sections=$derived(courseSegments(course).map(s=>({...s,path:trackSection(roadPoints,s.start,s.end)})));
  const slopePaths=$derived((course?.slopes??[]).map(s=>({...s,path:trackSection(roadPoints,s.start,s.start+s.length)})));
  const path=$derived(roadPoints.map(p=>p.x+','+p.y).join(' '));
  const innerRail=$derived(points.map(p=>p.x+','+p.y).join(' '));
  const outerRail=$derived(points.map(p=>offsetAt(p.distance,laneWidth)).map(p=>p.x+','+p.y).join(' '));
  const guides=$derived(Array.from({length:Math.max(0,Math.ceil(laneWidth/2)-1)},(_,i)=>points.map(p=>offsetAt(p.distance,(i+1)*2)).map(p=>p.x+','+p.y).join(' ')));
  const leader=$derived(Math.max(0,...(frame?.horses.map(h=>h.distance)??[])));
  const seekLimit=$derived(Math.max(0,...(frames.at(-1)?.horses.map(h=>h.distance)??[])));
  const currentSection=$derived(sections.find(s=>leader>=s.start&&leader<s.end));
  const currentSlope=$derived(course?.slopes.find(s=>leader>=s.start&&leader<s.start+s.length)?.slope??0);
  const landmarks=$derived(courseLandmarks(course));
  const upcoming=$derived(landmarks.filter(m=>m.distance>leader+.1).slice(0,3));
  const selectedRunner=$derived(runners.find(r=>r.index===Number(selected)));
  const selectedHorse=$derived(frame?.horses[Number(selected)]);
  const markers=$derived(runners.filter(r=>visibility[r.index]!==2&&frame?.horses[r.index]).map(r=>{
    const horse=frame!.horses[r.index]!,lane=replayLaneMetres(horse.lanePosition,laneWidth);
    return {runner:r,horse,lane,point:offsetAt(horse.distance,lane)};
  }));
  const trail=$derived([...frames.slice(raceFrameAtTime(frames,(frame?.time??0)-2)?.sourceIndex??0,(frame?.sourceIndex??0)+1),...(frame?[frame]:[])]
    .flatMap(f=>{const h=f.horses[Number(selected)];return h?[offsetAt(h.distance,replayLaneMetres(h.lanePosition,laneWidth))]:[];})
    .map(p=>p.x+','+p.y).join(' '));
  const windowPoints=$derived([trackPointAtDistance(roadPoints,viewport.min),...roadPoints.filter(p=>p.distance>viewport.min&&p.distance<viewport.max),trackPointAtDistance(roadPoints,viewport.max)]);
  const target=$derived(following?followTrackCamera(roadPoints,viewport,mapWidth,mapHeight,followZoom):manual??fitTrackCamera(roadPoints,mapWidth,mapHeight,0));
  const motion=new Spring<TrackCamera>({x:500,y:170,scale:1},{stiffness:.24,damping:.9,precision:.001});
  $effect(()=>{shape;following=true;manual=undefined;});
  $effect(()=>{
    const current=untrack(()=>motion.current);
    const jumped=Math.hypot(target.x-current.x,target.y-current.y)*target.scale>Math.min(mapWidth,mapHeight)/2;
    void motion.set(target,{instant:prefersReducedMotion.current||!following||jumped}).catch(()=>{});
  });
  onDestroy(()=>{void motion.set(motion.current,{instant:true});});
  const camera=$derived(following?fitTrackCamera(windowPoints,mapWidth,mapHeight,0,motion.current):motion.current);
  const project=(point:{x:number;y:number})=>({x:(point.x-camera.x)*camera.scale+mapWidth/2,y:(point.y-camera.y)*camera.scale+mapHeight/2});
  const pixelsPerMetre=$derived(Math.max(.01,units*camera.scale));
  const callouts=$derived.by(()=>{
    const layout=placeTrackLabels(markers.map(m=>({index:m.runner.index,distance:m.horse.distance})),38/pixelsPerMetre);
    return markers.map(marker=>{
      const label=layout.find(l=>l.index===marker.runner.index)!;
      const rail=offsetAt(label.distance,label.side<0?-32/pixelsPerMetre:laneWidth+32/pixelsPerMetre);
      const extra=(label.distance-rail.distance)*units;
      const position=project({x:rail.x+rail.tx*extra,y:rail.y+rail.ty*extra});
      return {...marker,anchor:project(marker.point),elbow:project(offsetAt(marker.horse.distance,label.side<0?0:laneWidth)),x:Math.max(20,Math.min(mapWidth-20,position.x)),y:Math.max(20,Math.min(mapHeight-20,position.y))};
    }).filter(m=>m.anchor.x>=0&&m.anchor.x<=mapWidth&&m.anchor.y>=0&&m.anchor.y<=mapHeight);
  });
  const visible=(p:{x:number;y:number},margin=20)=>p.x>=margin&&p.x<=mapWidth-margin&&p.y>=margin&&p.y<=mapHeight-margin;
  const clearLabel=(p:{x:number;y:number})=>visible(p,24)&&callouts.every(c=>Math.hypot(c.x-p.x,c.y-p.y)>40);
  const tickStep=$derived([25,50,100,200,500,1000].find(step=>step*pixelsPerMetre>=80)??1000);
  const distanceTicks=$derived(Array.from({length:Math.floor((shape?.distance??0)/tickStep)},(_,i)=>(i+1)*tickStep).map(distance=>{
    const p=offsetAt(distance,0),a=project(p),b=project(offsetAt(distance,laneWidth));
    return {distance,a,b,label:{x:a.x-p.nx*16,y:a.y-p.ny*16}};
  }).filter(t=>visible(t.a)));
  const courseMarks=$derived(landmarks.map(m=>{
    const p=offsetAt(m.distance,0),a=project(p),b=project(offsetAt(m.distance,laneWidth));
    return {...m,a,b,caption:{x:b.x+p.nx*18,y:b.y+p.ny*18}};
  }).filter(m=>visible(m.a)));
  const packPath=$derived(trackSection(roadPoints,viewport.min,viewport.max));
  function follow(){following=true;manual=undefined;}
  function fullCourse(){manual=fitTrackCamera(points,mapWidth,mapHeight,0);following=false;}
  function localPoint(event:PointerEvent|WheelEvent){
    const matrix=map?.getScreenCTM()?.inverse();
    return matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix):{x:mapWidth/2,y:mapHeight/2};
  }
  function zoom(factor:number,point={x:mapWidth/2,y:mapHeight/2}){
    if(following){followZoom=Math.max(.5,Math.min(1.2,followZoom*factor));return;}
    const scale=Math.max(.15,Math.min(64,camera.scale*factor));
    manual={x:camera.x+(point.x-mapWidth/2)*(1/camera.scale-1/scale),y:camera.y+(point.y-mapHeight/2)*(1/camera.scale-1/scale),scale};
    following=false;
  }
  function wheel(event:WheelEvent){if(!event.ctrlKey&&!event.metaKey)return;event.preventDefault();zoom(event.deltaY<0?1.12:1/1.12,localPoint(event));}
  function beginDrag(event:PointerEvent){
    if(event.button!==0||(event.target as Element).closest('[role="button"]'))return;
    const point=localPoint(event);drag={id:event.pointerId,x:point.x,y:point.y,view:{...camera}};
    map?.setPointerCapture(event.pointerId);
  }
  function moveDrag(event:PointerEvent){
    if(drag?.id!==event.pointerId)return;
    const point=localPoint(event),dx=point.x-drag.x,dy=point.y-drag.y;
    if(Math.hypot(dx,dy)<4||(event.pointerType==='touch'&&Math.abs(dy)>Math.abs(dx)))return;
    following=false;manual={...drag.view,x:drag.view.x-(point.x-drag.x)/drag.view.scale,y:drag.view.y-(point.y-drag.y)/drag.view.scale};
  }
  function endDrag(event:PointerEvent){if(drag?.id!==event.pointerId)return;drag=undefined;if(map?.hasPointerCapture(event.pointerId))map.releasePointerCapture(event.pointerId);}
</script>
<section class="course-overview" aria-label="Course overview">
  <div class="course-info">
    <h3>Course map <span>{Math.round(viewport.min).toLocaleString()}–{Math.round(Math.min(shape?.distance??viewport.max,viewport.max)).toLocaleString()} m</span></h3>
    {#if course}<div class="course-now"><small>{frame?'AT THE LEADER':'COURSE'}</small><strong>{leader>=course.distance?'Finish':currentSection?.label??'—'}</strong><span>{currentSlope?(currentSlope>0?'Uphill +':'Downhill ')+(currentSlope/10000).toFixed(1)+'%':'Level ground'}{#if currentSection} · {Math.max(0,Math.ceil(currentSection.end-leader))} m to section end{/if}</span>
      {#if selectedHorse}<span class="lane-readout" title={selectedRunner?.name}><b>{replayLaneMetres(selectedHorse.lanePosition,laneWidth).toFixed(1)} m</b> from inner rail · selected runner</span>{/if}
    </div><nav class="upcoming" aria-label="Upcoming course landmarks"><small>UP NEXT · SELECT TO SEEK</small>{#each upcoming as item}<button disabled={item.distance>seekLimit} title={item.label+' at '+Math.round(item.distance)+' m'} aria-label={'Jump to '+item.label+' at '+Math.round(item.distance)+' metres'} onclick={()=>onseekdistance(item.distance)}><i style:background={item.color}></i><span>{item.label}</span><b>{Math.ceil(item.distance-leader)} m</b></button>{:else}<span>Finish reached</span>{/each}</nav>{/if}
  </div>
  <div class="map-scene" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight}>
  <div class="map-controls">
    <Button variant="ghost" size="sm" ariaPressed={following} disabled={!points.length} onclick={follow}>Follow window</Button>
    <Button variant="ghost" size="sm" ariaLabel="Zoom course out" disabled={!points.length||(following?followZoom<=.5:camera.scale<=.15)} onclick={()=>zoom(1/1.3)}>−</Button>
    <Button variant="ghost" size="sm" ariaLabel="Zoom course in" disabled={!points.length||(following?followZoom>=1.2:camera.scale>=64)} onclick={()=>zoom(1.3)}>+</Button>
    <Button variant="ghost" size="sm" disabled={!points.length} onclick={fullCourse}>Full course</Button>
    <details class="map-help"><summary aria-label="Course map help">?</summary><p id={helpId}>Drag to pan · Ctrl / ⌘ + scroll to zoom.<br/>Runner marks show captured lane positions. The selected runner’s line shows the last two seconds. Lane guides are 2 m apart.<br/>Space to play / pause · ← → to step.</p></details>
  </div>
  {#if points.length}
    <!-- Runner callouts provide keyboard selection; the background supports pan and zoom. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg bind:this={map} class="course-map"  viewBox={'0 0 '+mapWidth+' '+mapHeight} role="group" aria-label="Race course and runner positions" aria-describedby={helpId}
      onwheel={wheel} onpointerdown={beginDrag} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} ondblclick={follow}>
      <defs><clipPath id={helpId+'-track'}><rect x="0" y="0" width={mapWidth} height={mapHeight}/></clipPath></defs>
      <g clip-path={'url(#'+helpId+'-track)'}>
        <g class="track-camera" transform={'translate('+mapWidth/2+' '+mapHeight/2+') scale('+camera.scale+') translate('+(-camera.x)+' '+(-camera.y)+')'}>
          <polyline class="track-base" points={path} stroke-width={laneWidth*units}/>
          {#each sections as segment}<polyline class="track-section" points={segment.path} stroke={segment.color} stroke-width={laneWidth*units}><title>{segment.label}: {Math.round(segment.start)}–{Math.round(segment.end)} m</title></polyline>{/each}
          {#if slopes}{#each slopePaths as slope}<polyline class="slope" points={slope.path} stroke={slope.slope>0?'#bd7581':'#719bdd'}><title>{slope.slope>0?'Uphill':'Downhill'}: {slope.start}–{slope.start+slope.length} m</title></polyline>{/each}{/if}
          <polyline class="pack-range" points={packPath} stroke-width={laneWidth*units}><title>Inspected distance window</title></polyline>
          <polyline class="track-rail" points={innerRail}/><polyline class="track-rail" points={outerRail}/>
          {#if pixelsPerMetre>=1}{#each guides as guide}<polyline class="lane-guide" points={guide}/>{/each}{/if}
          {#if selectedRunner&&visibility[selectedRunner.index]!==2}<polyline class="runner-trail" points={trail} stroke={teamColor(selectedRunner)}/>{/if}
        </g>
        {#each distanceTicks as tick}<g class="map-distance"><path d={'M'+tick.a.x+' '+tick.a.y+' L'+tick.b.x+' '+tick.b.y}/>{#if clearLabel(tick.label)}<text x={tick.label.x} y={tick.label.y} text-anchor="middle">{tick.distance.toLocaleString()} m</text>{/if}</g>{/each}
        {#each courseMarks as item}<g class="map-landmark" role="button" tabindex={item.distance<=seekLimit?0:-1} aria-disabled={item.distance>seekLimit}
          aria-label={'Jump to '+item.label+' at '+Math.round(item.distance)+' metres'} style:--landmark-color={item.color}
          onclick={()=>{if(item.distance<=seekLimit)onseekdistance(item.distance);}} onkeydown={event=>{if((event.key==='Enter'||event.key===' ')&&item.distance<=seekLimit){event.preventDefault();onseekdistance(item.distance);}}}>
          <title>{item.label} · {Math.round(item.distance).toLocaleString()} m</title>
          <path class="landmark-hit" d={'M'+item.a.x+' '+item.a.y+' L'+item.b.x+' '+item.b.y}/>
          <path d={'M'+item.a.x+' '+item.a.y+' L'+item.b.x+' '+item.b.y}/>
          {#if clearLabel(item.caption)}<text x={item.caption.x} y={item.caption.y} text-anchor="middle">{item.label}</text>{/if}
        </g>{/each}
      </g>
      {#each callouts as marker (marker.runner.index)}
        <g class="map-runner" class:selected={Number(selected)===marker.runner.index} class:dim={visibility[marker.runner.index]===1}
          role="button" tabindex="0" aria-label={'Follow '+marker.runner.name+' on course'} aria-pressed={Number(selected)===marker.runner.index}
          style:--runner-color={teamColor(marker.runner)} onclick={()=>selected=String(marker.runner.index)}
          onkeydown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selected=String(marker.runner.index);}}}>
          <title>{marker.runner.name} · {Math.round(marker.horse.distance)} m · Lane {marker.lane.toFixed(2)} m · {(marker.horse.speed/100).toFixed(2)} m/s</title>
          <path class="runner-leader" d={'M'+marker.x+' '+marker.y+' L'+marker.elbow.x+' '+marker.elbow.y+' L'+marker.anchor.x+' '+marker.anchor.y}/>
          <path class="runner-location" data-lane-metres={marker.lane} d={'M'+(marker.anchor.x-3)+' '+marker.anchor.y+' H'+(marker.anchor.x+3)+' M'+marker.anchor.x+' '+(marker.anchor.y-3)+' V'+(marker.anchor.y+3)}/>
          <foreignObject x={marker.x-18} y={marker.y-18} width="36" height="36">
            <div class="runner-portrait"><Artwork src={portrait(marker.runner.cardId)} alt="" size="xs" shape="circle" loading="eager"/><b>{marker.runner.index+1}</b></div>
          </foreignObject>
        </g>
      {/each}
    </svg>
  {:else}<p class="unavailable" role="status">Select the race’s course to show its track map. <Button variant="ghost" size="sm" onclick={onselectcourse}>Select course</Button></p>{/if}
  </div>
</section>
<style>
  .course-overview{display:grid;grid-template-columns:176px minmax(0,1fr);gap:12px;min-width:0}.course-info{padding:10px 4px 4px;min-width:0}h3{margin:0;font-size:12px;font-weight:600}h3 span{display:block;font-size:10px;font-weight:400;color:var(--text-secondary);margin-top:3px}.course-info small{font-size:8px;letter-spacing:.08em;color:var(--text-secondary)}.course-now{display:grid;gap:4px;margin-top:14px}.course-now>strong{font-size:14px}.course-now>span{font-size:10px;color:var(--text-secondary);line-height:1.5}.course-now .lane-readout{margin-top:4px}.lane-readout b{color:var(--text-primary);font-variant-numeric:tabular-nums}.upcoming{display:grid;gap:2px;margin-top:12px}.upcoming>small{margin-bottom:3px}.upcoming button{display:flex;align-items:center;gap:6px;width:100%;border:0;border-radius:3px;padding:6px 2px;background:none;color:var(--text-primary);font:inherit;font-size:10px;text-align:left;cursor:pointer}.upcoming button:hover{background:var(--color-accent-soft)}.upcoming button:disabled{opacity:.4;cursor:default}.upcoming i{width:5px;height:5px;border-radius:1px;flex:none}.upcoming button>span{flex:1}.upcoming b{font-size:9px;white-space:nowrap;color:var(--text-secondary);font-variant-numeric:tabular-nums}
  .map-scene{position:relative;min-width:0;height:clamp(240px,32dvh,320px);overflow:hidden}.map-controls{position:absolute;top:4px;right:4px;display:flex;align-items:center;gap:0;z-index:5;background:color-mix(in srgb,var(--surface-1) 90%,transparent);border-radius:6px}.map-controls :global(button){font-size:10px;min-height:24px;padding-inline:5px}.map-controls :global([aria-pressed=true]){color:var(--accent-primary);background:var(--color-accent-soft)}.map-help summary{list-style:none;cursor:pointer;width:24px;text-align:center;font-size:11px;line-height:24px;color:var(--text-secondary)}.map-help summary::-webkit-details-marker{display:none}.map-help p{position:absolute;right:0;top:28px;width:min(260px,calc(100vw - 80px));box-sizing:border-box;padding:12px;background:var(--surface-2);box-shadow:0 6px 20px #0005;border-radius:6px;z-index:6}
  .course-map{display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;overflow:hidden}.course-map:active{cursor:grabbing}.track-base,.track-rail,.track-section,.slope,.pack-range,.lane-guide,.runner-trail{fill:none;stroke-linejoin:round}.track-base{stroke:var(--surface-2)}.track-section{opacity:.6}.track-rail{stroke:var(--text-secondary);stroke-width:1;opacity:.45;vector-effect:non-scaling-stroke}.slope{stroke-width:2;stroke-dasharray:3 4;vector-effect:non-scaling-stroke}.pack-range{stroke:var(--accent-primary);opacity:.35}.lane-guide{stroke:var(--text-primary);opacity:.16;stroke-width:.7;stroke-dasharray:3 6;vector-effect:non-scaling-stroke}.runner-trail{stroke-width:2;opacity:.7;vector-effect:non-scaling-stroke}
  .map-distance path{stroke:var(--text-secondary);stroke-width:.7;opacity:.5}.map-distance text,.map-landmark text{font-size:9px;fill:var(--text-secondary);paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round;pointer-events:none}.map-landmark{cursor:pointer;outline:none}.map-landmark>path{stroke:var(--landmark-color);stroke-width:1.5}.map-landmark>.landmark-hit{stroke:transparent;stroke-width:20;pointer-events:stroke}.map-landmark text{fill:var(--landmark-color);font-weight:600}.map-landmark:hover>path,.map-landmark:focus-visible>path{stroke-width:3}.map-landmark:hover>.landmark-hit,.map-landmark:focus-visible>.landmark-hit{stroke-width:20;stroke:var(--color-accent-soft)}.map-landmark[aria-disabled=true]{cursor:default}
  .map-runner{cursor:pointer;outline:none}.runner-leader{fill:none;stroke:var(--runner-color);stroke-width:1;opacity:.45;pointer-events:none}.runner-location{stroke:var(--runner-color);stroke-width:2.5;pointer-events:none;paint-order:stroke;filter:drop-shadow(0 0 1px var(--surface-1))}.runner-portrait{position:relative;display:grid;place-items:center;width:32px;height:32px;margin:2px;border-radius:50%;background:var(--surface-1);outline:1px solid var(--runner-color)}.runner-portrait b{position:absolute;bottom:-1px;right:-1px;background:var(--runner-color);color:#10151e;font-size:9px;font-weight:700;padding:0 3px;border-radius:3px}.map-runner.selected .runner-leader,.map-runner:focus-visible .runner-leader{stroke-width:2;opacity:1}.map-runner.selected .runner-portrait,.map-runner:focus-visible .runner-portrait{outline:2px solid var(--text-primary)}.dim{opacity:.25}p{font-size:10px;color:var(--text-secondary);margin:0;line-height:1.6}.unavailable{padding:40px 12px}
  @media(max-width:700px){.course-overview{display:block}.course-info{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;padding:4px 2px}.course-info h3{grid-column:1/-1;display:flex;align-items:baseline;gap:8px}h3 span{display:inline;margin:0}.course-now,.upcoming{margin:0}.course-now>small,.upcoming>small{display:none}.course-now>strong{font-size:12px}.course-now .lane-readout{display:none}.upcoming button{padding:3px 0}.upcoming button:nth-of-type(n+3){display:none}.map-controls{top:auto;right:auto;bottom:4px;left:4px}.map-help p{top:auto;right:auto;bottom:28px;left:0}.map-controls :global(button){font-size:9px;padding-inline:4px}}
</style>
