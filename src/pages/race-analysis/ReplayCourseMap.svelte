<script lang="ts">
  import { onDestroy,untrack,type Snippet } from 'svelte';
  import { Spring,prefersReducedMotion } from 'svelte/motion';
  import type { RaceEvent,RaceFrame,RaceRunner } from '@/lib/race/race-capture-parser';
  import { raceFrameAtTime,replayLaneMetres,type InterpolatedRaceFrame } from '@/lib/race/race-replay';
  import Button from '@/components/Button.svelte';
  import ToggleButton from '@/components/ToggleButton.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { courseSegments,courseLandmarks,type Course,type CourseShape } from './replay-course';
  import { replayTrack,trackSection,fitTrackCamera,followTrackCamera,placeTrackLabels,placeTrackCaption,trackBasis,trackUnitsPerMetre,type TrackCamera } from './replay-track';
  let {course,shape,frame,frames,laneWidth,viewDistance,blockerIndex=-1,blocking=[],onexpand,onseekdistance,primary=false,skillEvents=[],runners,raceOrder,selected=$bindable('0'),visibility,teamColor,viewport,slopes=true,showSpeed=false,showAcceleration=false,acceleration,onselectcourse,toolbarStart,toolbarEnd}:{
    blocking?:{horseIndex:number;blockerHorseIndex:number}[];onexpand:()=>void;viewDistance?:number;blockerIndex?:number;primary?:boolean;skillEvents?:RaceEvent[];course?:Course;shape?:CourseShape;frame?:InterpolatedRaceFrame;frames:RaceFrame[];laneWidth:number;onseekdistance:(distance:number)=>void;runners:RaceRunner[];raceOrder:number[];selected?:string;
    visibility:Record<number,number>;teamColor:(runner:RaceRunner)=>string;viewport:{min:number;max:number};slopes?:boolean;showSpeed?:boolean;showAcceleration?:boolean;acceleration?:(index:number)=>number;onselectcourse:()=>void;toolbarStart?:Snippet;toolbarEnd?:Snippet;
  }=$props();
  let mapWidth=$state(800),mapHeight=$state(280),map=$state<SVGSVGElement>(),following=$state(true),followZoom=$state(1.25),manual=$state<TrackCamera>();
  let laneDetail=$state(true);
  const motion=new Spring<TrackCamera>({x:500,y:170,scale:1,angle:0},{stiffness:.35,damping:1,precision:.001});
  const lateralScale=$derived(primary&&laneDetail?2:1);
  let drag:{id:number;x:number;y:number;view:TrackCamera}|undefined;
  const helpId=$props.id();
  const points=$derived(shape?replayTrack(shape):[]);
  const units=$derived(trackUnitsPerMetre(points));
  const offsetAt=(distance:number,lane:number)=>{
    const p=trackBasis(points,distance,course?.turn);
    return {...p,x:p.x+p.nx*lane*units*lateralScale,y:p.y+p.ny*lane*units*lateralScale};
  };
  const roadPoints=$derived(points.map(p=>offsetAt(p.distance,laneWidth/2)));
  const outerPoints=$derived(points.map(p=>offsetAt(p.distance,laneWidth)));
  const seekLimit=$derived(Math.max(0,...(frames.at(-1)?.horses.map(h=>h.distance)??[])));
  const landmarks=$derived(courseLandmarks(course));
  const places=$derived(new Map(raceOrder.map((index,position)=>[index,position+1])));
  const selectedRunner=$derived(runners.find(r=>r.index===Number(selected)));
  const markers=$derived(runners.filter(r=>visibility[r.index]!==2&&frame?.horses[r.index]).map(r=>{
    const horse=frame!.horses[r.index]!,lane=replayLaneMetres(horse.lanePosition,laneWidth);
    return {runner:r,horse,lane,point:offsetAt(horse.distance,lane)};
  }));
  const cone=$derived.by(()=>{
    const horse=frame?.horses[Number(selected)];
    if(!horse||!viewDistance||!points.length)return '';
    const lane=replayLaneMetres(horse.lanePosition,laneWidth);
    // ponytail: illustrative base cone; exact skill-adjusted visibility needs engine telemetry.
    const side=(sign:number)=>Array.from({length:13},(_,i)=>offsetAt(horse.distance+viewDistance*i/12,Math.max(0,Math.min(laneWidth,lane+sign*(.6+laneWidth*.32*i/12)))));
    return [...side(-1),...side(1).reverse()].map(p=>p.x+','+p.y).join(' ');
  });
  const blockLinks=$derived(blocking.flatMap(pair=>{
    const horse=frame?.horses[pair.horseIndex],other=frame?.horses[pair.blockerHorseIndex];
    if(!horse||!other||visibility[pair.horseIndex]===2||visibility[pair.blockerHorseIndex]===2)return [];
    const a=project(offsetAt(horse.distance,replayLaneMetres(horse.lanePosition,laneWidth))),b=project(offsetAt(other.distance,replayLaneMetres(other.lanePosition,laneWidth)));
    const basis=trackBasis(points,other.distance,course?.turn);
    const normal=rotate(basis.nx,basis.ny);
    return [{...pair,a,b,nx:normal.x,ny:normal.y}];
  }));
  const trail=$derived([...frames.slice(raceFrameAtTime(frames,(frame?.time??0)-3)?.sourceIndex??0,(frame?.sourceIndex??0)+1),...(frame?[frame]:[])]
    .flatMap(f=>{const h=f.horses[Number(selected)];return h?[offsetAt(h.distance,replayLaneMetres(h.lanePosition,laneWidth))]:[];})
    .map(p=>p.x+','+p.y).join(' '));
  const labelSize=$derived(primary?(mapWidth<600?28:36):24);
  const overlayHeight=$derived((Number(showSpeed)+Number(showAcceleration))*14);
  const occupiedLane=$derived(Math.max(0,...markers.filter(m=>m.horse.distance>=viewport.min&&m.horse.distance<=viewport.max).map(m=>m.lane)));
  const occupiedWidth=$derived(occupiedLane+2);
  const framedLanes=$derived(Math.max(Math.min(laneWidth,10),occupiedWidth));
  const followPoints=$derived(points.map(p=>offsetAt(p.distance,occupiedWidth/2)));
  const heading=$derived.by(()=>{
    const tangent=trackBasis(points,(viewport.min+viewport.max)/2,course?.turn);
    const angle=-Math.atan2(tangent.ty,tangent.tx),previous=untrack(()=>motion.target.angle);
    return previous+Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));
  });
  const followCamera=$derived.by(()=>{
    const view=followTrackCamera(roadPoints,viewport,mapWidth,mapHeight,followZoom,heading);
    // Use the same course basis as the dots and landmarks, including the finish.
    const centre=offsetAt((viewport.min+viewport.max)/2,framedLanes/2);
    return {...view,x:centre.x,y:centre.y};
  });
  const windowPoints=$derived([offsetAt(viewport.min,framedLanes/2),...roadPoints.filter(p=>p.distance>viewport.min&&p.distance<viewport.max),offsetAt(viewport.max,framedLanes/2)]);
  // Reserve a little space at both rails for portraits beside the actual positions.
  const portraitClearance=$derived(24/(Math.max(.01,units*followCamera.scale)*lateralScale));
  const framingPoints=$derived(windowPoints.flatMap(p=>[
    offsetAt(p.distance,-portraitClearance),
    offsetAt(p.distance,framedLanes+portraitClearance)
  ]));
  const framedCamera=$derived(fitTrackCamera(framingPoints,mapWidth,mapHeight,0,followCamera));
  const target=$derived(following?framedCamera:manual??fitTrackCamera([...points,...outerPoints],mapWidth,mapHeight,0));
  $effect(()=>{shape;following=true;manual=undefined;});
  let cameraTime=NaN;
  $effect(()=>{
    const now=frame?.time??0,seeking=!Number.isFinite(cameraTime)||Math.abs(now-cameraTime)>.5;
    cameraTime=now;
    const current=untrack(()=>motion.current);
    const jumped=Math.hypot(target.x-current.x,target.y-current.y)*target.scale>Math.min(mapWidth,mapHeight)/2;
    void motion.set(target,{instant:prefersReducedMotion.current||!following||jumped||seeking}).catch(()=>{});
  });
  onDestroy(()=>{void motion.set(motion.current,{instant:true});});
  const camera=$derived(following?fitTrackCamera(framingPoints,mapWidth,mapHeight,0,motion.current):motion.current);
  const rotate=(x:number,y:number,angle=camera.angle)=>({x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)});
  const project=(point:{x:number;y:number})=>{
    const p=rotate(point.x-camera.x,point.y-camera.y);
    return {x:p.x*camera.scale+mapWidth/2,y:p.y*camera.scale+mapHeight/2};
  };
  const zoomInDisabled=$derived(following?followZoom>=2:camera.scale>=64);
  const pixelsPerMetre=$derived(Math.max(.01,units*camera.scale));
  const dotRadius=4;
  const displayRange=$derived(following?{min:Math.max(0,viewport.min-Math.max(mapWidth,mapHeight)/pixelsPerMetre/2),max:Math.min(shape?.distance??0,viewport.max+Math.max(mapWidth,mapHeight)/pixelsPerMetre/2)}:{min:0,max:shape?.distance??0});
  const sections=$derived(courseSegments(course).filter(s=>s.end>=displayRange.min&&s.start<=displayRange.max).map(s=>({...s,path:trackSection(roadPoints,Math.max(displayRange.min,s.start),Math.min(displayRange.max,s.end))})));
  const slopePaths=$derived((course?.slopes??[]).filter(s=>s.start+s.length>=displayRange.min&&s.start<=displayRange.max).map(s=>({...s,path:trackSection(roadPoints,Math.max(displayRange.min,s.start),Math.min(displayRange.max,s.start+s.length))})));
  const path=$derived(trackSection(roadPoints,displayRange.min,displayRange.max));
  const innerRail=$derived(trackSection(points,displayRange.min,displayRange.max));
  const outerRail=$derived(trackSection(outerPoints,displayRange.min,displayRange.max));
  const screenMarkers=$derived(markers.map(marker=>{
    const inward=marker.lane>laneWidth/2?-1:1;
    return {...marker,anchor:project(marker.point),normal:rotate(marker.point.nx*inward,marker.point.ny*inward),tangent:rotate(marker.point.tx,marker.point.ty)};
  })
    .filter(m=>m.anchor.x>=0&&m.anchor.x<=mapWidth&&m.anchor.y>=0&&m.anchor.y<=mapHeight));
  let labelTime=NaN,labelView='';
  let slots=$state.raw<{dx:number;dy:number;target?:{dx:number;dy:number}}[]>([]);
  // Smooth only collision offsets: the dot and its portrait still follow the
  // same captured position. Damping 1 prevents overshoot and elastic bouncing.
  const labelMotion=new Spring<{dx:number;dy:number}[]>([],{stiffness:.22,damping:1,precision:.01});
  onDestroy(()=>{void labelMotion.set(labelMotion.current,{instant:true});});
  $effect(()=>{
    const view=[mapWidth,mapHeight,primary,following].join(':'),now=frame?.time??0,jumped=!Number.isFinite(labelTime)||Math.abs(now-labelTime)>.5||view!==labelView;
    labelTime=now;labelView=view;
    const current=untrack(()=>slots);
    let layout=placeTrackLabels(
      screenMarkers.map(m=>({index:m.runner.index,...m.anchor,nx:m.normal.x,ny:m.normal.y,tx:m.tangent.x,ty:m.tangent.y,progress:-(places.get(m.runner.index)??m.runner.index+1)})),labelSize,
      {left:overlayHeight?20:6,right:mapWidth-(overlayHeight?20:6),top:24,bottom:mapHeight-24-overlayHeight},
      jumped?[]:runners.flatMap(r=>current[r.index]?[{index:r.index,...current[r.index]!}]:[]),following,{width:labelSize,height:0,offset:overlayHeight}
    );
    if(prefersReducedMotion.current)layout=layout.map(p=>p.target?{index:p.index,...p.target}:p);
    // Finish a gradual regrouping even if the user pauses the replay midway.
    else if(layout.some(p=>p.target))labelMotion.current;
    const next=runners.map(r=>{
      const p=layout.find(l=>l.index===r.index);
      return p?{dx:p.dx,dy:p.dy,target:p.target}:current[r.index]??{dx:0,dy:0};
    });
    if(jumped||next.some((p,i)=>!current[i]||p.dx!==current[i]!.dx||p.dy!==current[i]!.dy||Boolean(p.target)!==Boolean(current[i]!.target))){
      slots=next;
      void labelMotion.set(next.map(({dx,dy})=>({dx,dy})),{instant:jumped||prefersReducedMotion.current||current.length!==next.length}).catch(()=>{});
    }
  });
  const callouts=$derived(screenMarkers.map(marker=>{
    const current=labelMotion.current[marker.runner.index]??{dx:0,dy:-labelSize/2-10};
    // Keep the exact point exposed even while a collision offset is interpolating.
    const minimum=labelSize/2+7,axis=Math.max(Math.abs(current.dx),Math.abs(current.dy));
    const scale=axis?Math.max(1,minimum/axis):1;
    const offset=axis?{dx:current.dx*scale,dy:current.dy*scale}:{dx:0,dy:-minimum};
    const x=marker.anchor.x+offset.dx,y=marker.anchor.y+offset.dy;
    const length=Math.hypot(x-marker.anchor.x,y-marker.anchor.y)||1,edge=Math.min(labelSize/2-4,length);
    const end={x:x-(x-marker.anchor.x)*edge/length,y:y-(y-marker.anchor.y)*edge/length};
    const tipWidth=labelSize*.12,side={x:-(y-marker.anchor.y)*tipWidth/length,y:(x-marker.anchor.x)*tipWidth/length};
    return {...marker,x,y,telemetryY:Math.max(y+labelSize/2+12,marker.anchor.y+20),connector:[marker.anchor,{x:end.x+side.x,y:end.y+side.y},{x:end.x-side.x,y:end.y-side.y}].map(p=>p.x+','+p.y).join(' ')};
  }).sort((a,b)=>Number(a.runner.index===Number(selected))-Number(b.runner.index===Number(selected))));
  const captions=$derived.by(()=>{
    const obstacles=callouts.flatMap(m=>[{x:m.x,y:m.y,radius:0,width:labelSize+4,height:labelSize+4},{...m.anchor,radius:dotRadius+4}]);
    return new Map(callouts.map(m=>{
      const candidates=(width:number,height:number,above:boolean)=>[
        {x:m.x,y:above?m.y-labelSize/2-height-6:m.telemetryY-10},
        {x:m.x+labelSize/2+width/2+8,y:m.y-height/2},
        {x:m.x-labelSize/2-width/2-8,y:m.y-height/2},
        {x:m.x,y:above?m.telemetryY-10:m.y-labelSize/2-height-6},
        {x:m.x+labelSize/2+width/2+8,y:m.y+labelSize/2+8},
        {x:m.x-labelSize/2-width/2-8,y:m.y+labelSize/2+8},
        {x:m.x+labelSize/2+width/2+8,y:m.y-labelSize/2-height-6},
        {x:m.x-labelSize/2-width/2-8,y:m.y-labelSize/2-height-6},
        {x:m.x+labelSize/2+width/2+40,y:m.y-height/2},
        {x:m.x-labelSize/2-width/2-40,y:m.y-height/2},
        {x:m.x+labelSize/2+width/2+40,y:m.y+labelSize/2+8},
        {x:m.x-labelSize/2-width/2-40,y:m.y+labelSize/2+8}
      ];
      const nameWidth=Math.max(48,m.runner.name.length*6+8);
      const name=placeTrackCaption(candidates(nameWidth,14,true),nameWidth,14,obstacles,{width:mapWidth,height:mapHeight});
      const height=Math.max(14,overlayHeight)+(blocking.some(b=>b.horseIndex===m.runner.index)||m.runner.index===blockerIndex?12:0);
      const values=candidates(58,height,false);
      // In a tight pack, keep the values with the readable name rather than
      // forcing them into the space occupied by a neighbour's portrait.
      values.splice(1,0,{x:name.x,y:name.y+20});
      const telemetry=placeTrackCaption(values,58,height,[...obstacles,{x:name.x,y:name.y+7,radius:0,width:nameWidth,height:14}],{width:mapWidth,height:mapHeight});
      return [m.runner.index,{name,telemetry}] as const;
    }));
  });
  const crowded=$derived(new Set(callouts.filter(a=>callouts.some(b=>a.runner.index!==b.runner.index&&Math.abs(a.x-b.x)<64&&Math.abs(a.y-b.y)<labelSize+overlayHeight+8)).map(a=>a.runner.index)));
  const visible=(p:{x:number;y:number},margin=20)=>p.x>=margin&&p.x<=mapWidth-margin&&p.y>=margin&&p.y<=mapHeight-margin;
  const clearLabel=(p:{x:number;y:number})=>visible(p,24)&&callouts.every(c=>Math.hypot(c.x-p.x,c.y-p.y)>40);
  const tickStep=$derived([25,50,100,200,500,1000].find(step=>step*pixelsPerMetre>=80)??1000);
  const distanceTicks=$derived(Array.from({length:Math.floor((shape?.distance??0)/tickStep)},(_,i)=>(i+1)*tickStep).map(distance=>{
    const p=offsetAt(distance,0),a=project(p),b=project(offsetAt(distance,laneWidth));
    const normal=rotate(p.nx,p.ny);
    return {distance,a,b,label:{x:a.x-normal.x*16,y:a.y-normal.y*16}};
  }).filter(t=>visible(t.a)&&t.distance>=displayRange.min&&t.distance<=displayRange.max));
  const courseMarks=$derived(landmarks.map(m=>{
    const p=offsetAt(m.distance,0),a=project(p),b=project(offsetAt(m.distance,laneWidth));
    const normal=rotate(p.nx,p.ny);
    return {...m,a,b,caption:{x:b.x+normal.x*18,y:b.y+normal.y*18}};
  }).filter(m=>Math.max(m.a.x,m.b.x)>=0&&Math.min(m.a.x,m.b.x)<=mapWidth&&Math.max(m.a.y,m.b.y)>=0&&Math.min(m.a.y,m.b.y)<=mapHeight&&m.distance>=displayRange.min&&m.distance<=displayRange.max));
  const landmarkCaptions=$derived.by(()=>{
    const accepted:typeof courseMarks=[];
    // Keep every landmark interactive; only omit captions that would cover each other.
    for(const item of [...courseMarks].sort((a,b)=>Number(b.label==='Finish')-Number(a.label==='Finish'))){
      if(clearLabel(item.caption)&&accepted.every(p=>Math.abs(p.caption.y-item.caption.y)>14||Math.abs(p.caption.x-item.caption.x)>(p.label.length+item.label.length)*2.6+12))accepted.push(item);
    }
    return new Set(accepted);
  });
  const packPath=$derived(trackSection(followPoints,viewport.min,viewport.max));
  function follow(){following=true;manual=undefined;}
  function fullCourse(){onexpand();manual=undefined;following=false;}
  $effect(()=>{if(!primary&&!following){following=true;manual=undefined;}});
  function localPoint(event:PointerEvent|WheelEvent){
    const matrix=map?.getScreenCTM()?.inverse();
    return matrix?new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix):{x:mapWidth/2,y:mapHeight/2};
  }
  function zoom(factor:number,point={x:mapWidth/2,y:mapHeight/2}){
    if(following){followZoom=Math.max(.5,Math.min(2,followZoom*factor));return;}
    const scale=Math.max(.15,Math.min(64,camera.scale*factor));
    const delta=rotate(point.x-mapWidth/2,point.y-mapHeight/2,-camera.angle);
    manual={x:camera.x+delta.x*(1/camera.scale-1/scale),y:camera.y+delta.y*(1/camera.scale-1/scale),scale,angle:camera.angle};
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
    const delta=rotate(dx,dy,-drag.view.angle);
    following=false;manual={...drag.view,x:drag.view.x-delta.x/drag.view.scale,y:drag.view.y-delta.y/drag.view.scale};
  }
  function endDrag(event:PointerEvent){if(drag?.id!==event.pointerId)return;drag=undefined;if(map?.hasPointerCapture(event.pointerId))map.releasePointerCapture(event.pointerId);}
</script>
<section class="course-overview" class:primary hidden={!primary} aria-label="Course overview">
  <span class="sr-only" id={helpId}>Select a runner to follow them. Drag to pan; Ctrl or Command plus scroll to zoom. Open Replay guide for more.</span>
  <div class="map-toolbar" role="toolbar" aria-label="Race replay controls">
    {@render toolbarStart?.()}
    <div class="map-controls" role="group" aria-label="Course camera controls">
      <ToggleButton icon="grid" label="Lanes ×2" ariaLabel="Expand lane spacing" pressed={laneDetail} onclick={()=>laneDetail=!laneDetail}/>
      <SegmentedControl compact label="Course camera" options={[{value:'follow',label:'Follow window',disabled:!points.length},{value:'full',label:'Full course',disabled:!points.length}]} value={following?'follow':'full'} onchange={value=>value==='follow'?follow():fullCourse()}/>
      <div class="map-zoom" role="group" aria-label="Course zoom">
        <Button variant="secondary" size="sm" ariaLabel="Zoom course out" disabled={!points.length||(following?followZoom<=.5:camera.scale<=.15)} onclick={()=>zoom(1/1.3)}>−</Button>
        <Button variant="secondary" size="sm" ariaLabel="Zoom course in" disabled={!points.length||zoomInDisabled} onclick={()=>zoom(1.3)}>+</Button>
      </div>
    </div>
    {@render toolbarEnd?.()}
  </div>
  <div class="map-scene fullscreen-target" bind:clientWidth={mapWidth} bind:clientHeight={mapHeight}>
  <div class="map-caption"><strong>Window</strong><span>{Math.round(viewport.min).toLocaleString()}–{Math.round(viewport.max).toLocaleString()} m</span>{#if primary&&laneDetail}<small>Lane spacing ×2</small>{/if}{#if cone}<small class="cone-label" title="Illustrative base view range from resources. Skill modifiers and exact visible identities are not returned by the simulator.">Base view · {viewDistance} m</small>{/if}</div>
  {#if blockerIndex>=0}{@const blocker=runners.find(r=>r.index===blockerIndex)}{#if blocker}<button class="map-blocker" onclick={()=>selected=String(blockerIndex)} title="Inspect the reported front blocker"><Artwork src={portrait(blocker.cardId)} alt="" size="xs"/><span><small>BLOCKING {selectedRunner?.name}</small><strong>{blocker.name} ↗</strong></span></button>{/if}{/if}
  {#if points.length}
    <!-- Runner callouts provide keyboard selection; the background supports pan and zoom. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <svg bind:this={map} class="course-map" style:--portrait-size={labelSize+"px"}  viewBox={'0 0 '+mapWidth+' '+mapHeight} role="group" aria-label="Race course and runner positions" aria-describedby={helpId}
      onwheel={wheel} onpointerdown={beginDrag} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} ondblclick={follow}>
      <defs><clipPath id={helpId+'-track'}><rect x="0" y="0" width={mapWidth} height={mapHeight}/></clipPath></defs>
      <g clip-path={'url(#'+helpId+'-track)'}>
        <g class="track-camera" transform={'translate('+mapWidth/2+' '+mapHeight/2+') scale('+camera.scale+') rotate('+(camera.angle*180/Math.PI)+') translate('+(-camera.x)+' '+(-camera.y)+')'}>
          <polyline class="track-base" points={path} stroke-width={laneWidth*units*lateralScale}/>
          {#each sections as segment}<polyline class="track-section" points={segment.path} stroke={segment.color} stroke-width={laneWidth*units*lateralScale}><title>{segment.label}: {Math.round(segment.start)}–{Math.round(segment.end)} m</title></polyline>{/each}
          {#if slopes}{#each slopePaths as slope}<polyline class="slope" points={slope.path} stroke={slope.slope>0?'#bd7581':'#719bdd'}><title>{slope.slope>0?'Uphill':'Downhill'}: {slope.start}–{slope.start+slope.length} m</title></polyline>{/each}{/if}
          <polyline class="pack-range" points={packPath} stroke-width={occupiedWidth*units*lateralScale}><title>Inspected distance window</title></polyline>
          {#if cone}<polygon class="view-cone" points={cone}><title>Base view range · illustrative, not skill-adjusted</title></polygon>{/if}
          <polyline class="track-rail" points={innerRail}/><polyline class="track-rail" points={outerRail}/>
          {#if selectedRunner&&visibility[selectedRunner.index]!==2}<polyline class="runner-trail" points={trail} stroke={teamColor(selectedRunner)}/>{/if}
        </g>
        {#each distanceTicks as tick}<g class="map-distance"><path d={'M'+tick.a.x+' '+tick.a.y+' L'+tick.b.x+' '+tick.b.y}/>{#if clearLabel(tick.label)}<text x={tick.label.x} y={tick.label.y} text-anchor="middle">{tick.distance.toLocaleString()} m</text>{/if}</g>{/each}
        {#each courseMarks as item}<g class="map-landmark" role="button" tabindex={item.distance<=seekLimit?0:-1} aria-disabled={item.distance>seekLimit}
          aria-label={'Jump to '+item.label+' at '+Math.round(item.distance)+' metres'} style:--landmark-color={item.color}
          onclick={()=>{if(item.distance<=seekLimit)onseekdistance(item.distance);}} onkeydown={event=>{if((event.key==='Enter'||event.key===' ')&&item.distance<=seekLimit){event.preventDefault();onseekdistance(item.distance);}}}>
          <title>{item.label} · {Math.round(item.distance).toLocaleString()} m</title>
          <path class="landmark-hit" d={'M'+item.a.x+' '+item.a.y+' L'+item.b.x+' '+item.b.y}/>
          {#if item.label==='Finish'}
            {@const length=Math.hypot(item.b.x-item.a.x,item.b.y-item.a.y)}
            {@const rows=Math.max(2,Math.round(length/6))}
            {@const square=length/rows}
            <g class="map-finish" aria-hidden="true" transform={'translate('+item.a.x+' '+item.a.y+') rotate('+(Math.atan2(item.b.y-item.a.y,item.b.x-item.a.x)*180/Math.PI-90)+')'}>
              {#each Array(rows) as _,row}{#each [0,1] as column}<rect x={(column-1)*square} y={row*square} width={square} height={square} fill={(row+column)%2?'#151515':'#f5f5f5'}/>{/each}{/each}
            </g>
          {:else}<path d={'M'+item.a.x+' '+item.a.y+' L'+item.b.x+' '+item.b.y}/>{/if}
          {#if landmarkCaptions.has(item)}<text x={item.caption.x} y={item.caption.y} text-anchor="middle">{item.label}</text>{/if}
        </g>{/each}
      </g>
      {#each blockLinks as link}
        <g class="block-connection" class:focused={link.horseIndex===Number(selected)||link.blockerHorseIndex===Number(selected)} aria-label={(runners.find(r=>r.index===link.horseIndex)?.name??'Runner')+' blocked by '+(runners.find(r=>r.index===link.blockerHorseIndex)?.name??'runner')}>
          <path class="block-link" d={'M'+link.a.x+' '+link.a.y+' L'+link.b.x+' '+link.b.y}/>
          <circle cx={link.a.x} cy={link.a.y} r={dotRadius+4}/>
          <path class="block-stop" d={'M'+(link.b.x-link.nx*10)+' '+(link.b.y-link.ny*10)+' L'+(link.b.x+link.nx*10)+' '+(link.b.y+link.ny*10)}/>
        </g>
      {/each}
      {#each callouts as marker (marker.runner.index)}
        {@const caption=captions.get(marker.runner.index)!}
        <g class="map-runner" data-distance={marker.horse.distance} data-runner-index={marker.runner.index} class:leading={places.get(marker.runner.index)===1} class:crowded={crowded.has(marker.runner.index)} class:triggered={skillEvents.some(e=>e.params[0]===marker.runner.index)} class:selected={Number(selected)===marker.runner.index} class:blocker={marker.runner.index===blockerIndex} class:blocked-runner={blocking.some(b=>b.horseIndex===marker.runner.index)} class:dim={visibility[marker.runner.index]===1}
          role="button" tabindex="0" aria-label={'Follow '+marker.runner.name+' on course'} aria-pressed={Number(selected)===marker.runner.index}
          style:--runner-color={teamColor(marker.runner)} onclick={()=>selected=String(marker.runner.index)}
          onkeydown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selected=String(marker.runner.index);}}}>
          <title>{marker.runner.name} · {Math.round(marker.horse.distance)} m · Lane {marker.lane.toFixed(2)} m · {(marker.horse.speed/100).toFixed(2)} m/s</title>
          <polygon class="runner-leader" points={marker.connector}/>
          <circle class="runner-hit" cx={marker.anchor.x} cy={marker.anchor.y} r="14"/>
          <circle id={helpId+'-dot-'+marker.runner.index} class="runner-location" data-lane-metres={marker.lane} cx={marker.anchor.x} cy={marker.anchor.y} r={dotRadius}/>
          {#if Number(selected)===marker.runner.index}<circle id={helpId+'-selection'} class="selection-ring" cx={marker.anchor.x} cy={marker.anchor.y} r={dotRadius+3}/>{/if}
          <foreignObject class="runner-callout" x={marker.x-labelSize/2} y={marker.y-labelSize/2} width={labelSize} height={labelSize}>
            <div class="runner-portrait"><Artwork src={portrait(marker.runner.cardId)} alt="" size="xs" shape="circle" loading="eager"/><b title={'Place '+places.get(marker.runner.index)+' · Gate '+(marker.runner.index+1)}>{places.get(marker.runner.index)}</b></div>
          </foreignObject>
          <text class="runner-name" x={caption.name.x} y={caption.name.y+10} text-anchor="middle">{marker.runner.name}</text>
          {#if showSpeed}<text class="runner-telemetry runner-speed" x={caption.telemetry.x} y={caption.telemetry.y+10} text-anchor="middle">{(marker.horse.speed/100).toFixed(2)}<tspan class="overlay-unit"> m/s</tspan></text>{/if}
          {#if showAcceleration}{@const value=acceleration?.(marker.runner.index)??0}<text class="runner-telemetry runner-acceleration" x={caption.telemetry.x} y={caption.telemetry.y+10+(showSpeed?14:0)} text-anchor="middle">{value>0?'+':''}{value.toFixed(2)}<tspan class="overlay-unit"> m/s²</tspan></text>{/if}
          {#if blocking.some(b=>b.horseIndex===marker.runner.index)}<text class="blocked-caption" x={caption.telemetry.x} y={caption.telemetry.y+10+overlayHeight} text-anchor="middle">BLOCKED</text>{/if}
          {#if marker.runner.index===blockerIndex}<text class="blocker-caption" x={caption.telemetry.x} y={caption.telemetry.y+10+overlayHeight} text-anchor="middle">BLOCKER</text>{/if}
        </g>
      {/each}
      <!-- Keep exact positions visible while portraits move into a clearer arrangement. -->
      <g class="position-overlay" aria-hidden="true">
        {#each callouts as marker (marker.runner.index)}
          <g class:leading={places.get(marker.runner.index)===1} class:dim={visibility[marker.runner.index]===1} style:--runner-color={teamColor(marker.runner)}>
            <use href={'#'+helpId+'-dot-'+marker.runner.index}/>
            {#if Number(selected)===marker.runner.index}<use href={'#'+helpId+'-selection'}/>{/if}
          </g>
        {/each}
      </g>
    </svg>
  {:else}<p class="unavailable" role="status">Select the race’s course to show its track map. <Button variant="secondary" size="sm" onclick={onselectcourse}>Select course</Button></p>{/if}
  </div>
</section>
<style>
  .position-overlay{pointer-events:none}
  .crowded :is(.runner-telemetry,.blocked-caption,.blocker-caption){visibility:hidden}.crowded.selected :is(.runner-telemetry,.blocked-caption,.blocker-caption),.crowded:hover :is(.runner-telemetry,.blocked-caption,.blocker-caption),.crowded:focus-visible :is(.runner-telemetry,.blocked-caption,.blocker-caption){visibility:visible}
  .leading .runner-portrait{outline-color:var(--accent-warning)}.leading .runner-portrait b{background:var(--accent-warning)}.leading .runner-location{stroke:var(--accent-warning);stroke-width:2}.leading .runner-leader{stroke:var(--accent-warning)}

  .runner-telemetry{fill:var(--text-primary);font-size:11px;font-weight:600;font-variant-numeric:tabular-nums;paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round;pointer-events:none}.overlay-unit{font-size:9px;font-weight:400;fill:var(--text-secondary)}

  .course-overview{min-width:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.map-caption{position:absolute;left:8px;top:8px;display:flex;align-items:baseline;gap:8px;z-index:4;pointer-events:none;background:color-mix(in srgb,var(--surface-1) 90%,transparent);border-radius:4px;padding:3px 5px}.map-caption strong{font-size:11px}.map-caption span,.map-caption small{font-size:9px;color:var(--text-secondary)}.map-caption small{color:var(--accent-primary)}
  .course-overview{display:contents}.course-overview[hidden]{display:none}
  .map-toolbar{grid-column:1/-1;grid-row:1;display:flex;align-items:center;gap:16px;min-width:0;flex-wrap:wrap;padding-bottom:8px;border-bottom:1px solid var(--border-subtle)}
  .map-controls{display:flex;align-items:center;gap:8px;margin-left:auto;min-width:0;flex-wrap:wrap}
  .map-zoom{display:flex;gap:4px}.map-zoom :global(.ui-button){min-width:32px;padding-inline:8px;min-height:32px}
  .map-scene{grid-column:1;grid-row:2;position:relative;min-width:0;min-height:0;height:100%;overflow:hidden;border-radius:8px;background:var(--surface-2)}
  .map-caption{top:auto;bottom:8px;left:8px}
  .course-map{display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;overflow:hidden}.course-map:active{cursor:grabbing}.track-base,.track-rail,.track-section,.slope,.pack-range,.runner-trail{fill:none;stroke-linejoin:round}.track-base{stroke:var(--surface-2)}.track-section{opacity:.12}.track-rail{stroke:var(--text-secondary);stroke-width:1;opacity:.45;vector-effect:non-scaling-stroke}.slope{stroke-width:2;vector-effect:non-scaling-stroke}.pack-range{stroke:var(--accent-primary);opacity:.13}.runner-trail{stroke-width:3;opacity:.85;vector-effect:non-scaling-stroke}
  .map-distance path{stroke:var(--text-secondary);stroke-width:.7;opacity:.5}.map-distance text,.map-landmark text{font-size:9px;fill:var(--text-secondary);paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;stroke-linejoin:round;pointer-events:none}.map-landmark{cursor:pointer;outline:none}.map-landmark>path{stroke:var(--landmark-color);stroke-width:1.5}.map-landmark>.landmark-hit{stroke:transparent;stroke-width:20;pointer-events:stroke}.map-landmark text{fill:var(--landmark-color);font-weight:600}.map-landmark:hover>path,.map-landmark:focus-visible>path{stroke-width:3}.map-landmark:hover>.landmark-hit,.map-landmark:focus-visible>.landmark-hit{stroke-width:20;stroke:var(--color-accent-soft)}.map-landmark[aria-disabled=true]{cursor:default}
  .map-runner{cursor:pointer;outline:none}.runner-leader{fill:color-mix(in srgb,var(--runner-color) 24%,var(--surface-1));stroke:var(--runner-color);stroke-width:1;stroke-linejoin:round}.runner-hit{fill:transparent}.runner-location{fill:var(--runner-color);stroke:var(--surface-1);stroke-width:1.5;pointer-events:none}.selection-ring{fill:none;stroke:var(--text-primary);stroke-width:1.5;pointer-events:none}.runner-name{display:none;fill:var(--text-primary);font-size:10px;font-weight:600;paint-order:stroke;stroke:var(--surface-1);stroke-width:4px;pointer-events:none}.map-runner.selected .runner-name,.map-runner:hover .runner-name,.map-runner:focus-visible .runner-name{display:block}.blocked-runner .runner-portrait{outline:2px solid var(--accent-error)}.blocked-runner .runner-leader{stroke:var(--accent-error);opacity:.85}.runner-portrait{position:relative;display:grid;place-items:center;width:calc(var(--portrait-size) - 4px);height:calc(var(--portrait-size) - 4px);margin:2px;border-radius:50%;background:var(--surface-1);outline:1px solid var(--runner-color)}.runner-portrait :global(.art){width:100%;height:100%}.runner-portrait b{position:absolute;bottom:-1px;right:-1px;background:var(--runner-color);color:#10151e;font-size:10px;line-height:13px;font-weight:700;min-width:12px;box-sizing:border-box;text-align:center;padding:0 3px;border-radius:3px}.map-runner.selected .runner-leader,.map-runner:hover .runner-leader,.map-runner:focus-visible .runner-leader{stroke:var(--text-primary);stroke-width:1.5;opacity:1}.map-runner.selected .runner-portrait,.map-runner:hover .runner-portrait,.map-runner:focus-visible .runner-portrait{outline:2px solid var(--text-primary)}.dim{opacity:.25}p{font-size:10px;color:var(--text-secondary);margin:0;line-height:1.6}.unavailable{padding:40px 12px}
  .triggered .runner-portrait{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-warning) 45%,transparent)}
  @media(max-width:950px){.map-toolbar{grid-row:auto;order:0;gap:8px;align-items:start}.map-controls{margin-left:0}.map-scene{grid-row:auto;order:1;height:390px}.map-caption{gap:5px}.map-caption small{font-size:8px}}
.view-cone{fill:var(--accent-primary);fill-opacity:.08;stroke:var(--accent-primary);stroke-width:1.5;vector-effect:non-scaling-stroke;pointer-events:none}.block-connection{fill:none;stroke:var(--accent-error);stroke-width:2;opacity:.6;pointer-events:none}.block-connection.focused{stroke-width:2.5;opacity:1}.block-stop{stroke-width:4;stroke-linecap:round}.map-caption .cone-label{pointer-events:auto;color:var(--accent-primary)}
.map-blocker{position:absolute;right:8px;bottom:8px;z-index:4;display:flex;align-items:center;gap:7px;padding:4px 8px;border:1px solid var(--border-primary);border-radius:6px;background:var(--surface-1);text-align:left;color:var(--accent-error);cursor:pointer}.map-blocker span{display:grid;gap:3px}.map-blocker small{font-size:8px;letter-spacing:.04em}.map-blocker strong{font-size:11px}.map-runner.blocker .runner-portrait{outline:2px solid var(--accent-error)}.blocker-caption,.blocked-caption{fill:var(--accent-error);font-size:8px;paint-order:stroke;stroke:var(--surface-1);stroke-width:3px;pointer-events:none}
.view-cone{fill-opacity:.04;stroke-opacity:.35;stroke-width:1}.runner-trail{stroke-width:2;opacity:.55}
@media(max-width:700px){.map-caption .cone-label{display:none}}
</style>
