<script lang="ts">
  import {onMount} from 'svelte';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import {portrait} from '@/pages/competitive/analysis-view';
  import type {RaceRunner} from '@/lib/race/race-capture-parser';
  import {raceDistanceSpread,type RaceTrajectory} from '@/lib/race/race-ensemble';
  import {loadReplayGeometry,courseSegments,type Course,type CourseShape} from './replay-course';
  import {replayTrack,trackPointAtDistance,trackSection,fitTrackCamera} from './replay-track';
  let {trajectories,time,course,courseId,distance,runner,color}:{trajectories:RaceTrajectory[];time:number;course?:Course;courseId:number;distance:number;runner:RaceRunner;color:string}=$props();
  let shapes=$state.raw<Record<string,CourseShape>>(),error=$state(''),whole=$state(false),profileWidth=$state(600);
  const uid=$props.id();
  onMount(()=>{let active=true;void loadReplayGeometry().then(data=>{if(active)shapes=data;}).catch(reason=>{if(active)error=reason instanceof Error?reason.message:'Course geometry unavailable.';});return()=>{active=false;};});
  const spread=$derived(raceDistanceSpread(trajectories,time,runner.index));
  const points=$derived(shapes?.[courseId]?replayTrack(shapes[courseId]!):[]);
  const width=$derived(Math.min(distance,Math.max(120,(spread.p90-spread.p10)*2,Math.abs(spread.mean-spread.median)*4)));
  const low=$derived(Math.max(0,Math.min(distance-width,spread.median-width/2))),high=$derived(low+width);
  const x=(value:number)=>(value-low)/(high-low)*600;
  const bins=$derived.by(()=>{const counts=Array<number>(36).fill(0);for(const value of spread.values)if(value>=low&&value<=high)counts[Math.min(35,Math.floor((value-low)/(high-low)*36))]!++;return counts;});
  const peak=$derived(Math.max(1,...bins));
  const outline=$derived('M0,66 '+bins.map((count,index)=>'L'+((index+.5)/bins.length*600)+','+(66-count/peak*56)).join(' ')+' L600,66');
  const camera=$derived(fitTrackCamera(whole?points:[trackPointAtDistance(points,low),...points.filter(p=>p.distance>low&&p.distance<high),trackPointAtDistance(points,high)],520,230,0));
  const project=(point:{x:number;y:number})=>({x:(point.x-camera.x)*camera.scale+260,y:(point.y-camera.y)*camera.scale+115});
  const meanPoint=$derived(project(trackPointAtDistance(points,spread.mean)));
  const startPoint=$derived(project(trackPointAtDistance(points,0))),finishPoint=$derived(project(trackPointAtDistance(points,distance)));
  const sections=$derived(courseSegments(course));
  const rows=$derived([
    {label:'Sections',segments:sections.map(s=>({...s,title:s.label}))},
    {label:'Slopes',segments:(course?.slopes??[]).filter(s=>s.slope).map(s=>({start:s.start,end:s.start+s.length,label:(s.slope>0?'↗ +':'↘ ')+(s.slope/10000).toFixed(1)+'%',title:s.slope>0?'Uphill':'Downhill',color:s.slope>0?'#bd7581':'#719bdd'}))},
    {label:'Phase',segments:[{start:0,end:distance/6,label:'Early',title:'Early race',color:'#81c784'},{start:distance/6,end:distance*2/3,label:'Mid race',title:'Mid race',color:'#69b7ee'},{start:distance*2/3,end:distance,label:'Late race',title:'Late race',color:'#c79be7'}]}
  ]);
</script>

<section class="course-outcomes" aria-label="Track and course distributions" data-mean-distance={spread.mean} style:--runner-color={color}>
  <header><RunnerReference name={runner.name} cardId={runner.cardId} compact/><div class="readings"><span>Mean <strong>{spread.mean.toFixed(1)} m</strong></span><span>Middle 80% <strong>{spread.p10.toFixed(0)}–{spread.p90.toFixed(0)} m</strong></span><span>{spread.finished} / {trajectories.length} finished</span></div></header>
  <div class="course-grid">
    <div class="track"><div class="view-heading"><h3>Track ribbon</h3><Button size="sm" variant="ghost" onclick={()=>whole=!whole}>{whole?'Follow spread':'Show whole track'}</Button></div>
      {#if points.length}
        <svg class="track-map" viewBox="0 0 520 230" role="img" aria-label={runner.name+' mean position '+spread.mean.toFixed(1)+' metres with middle 50% and 80% of sampled positions'}>
          <defs><clipPath id={uid+'-portrait'}><circle cx={meanPoint.x} cy={meanPoint.y-30} r="14"/></clipPath></defs>
          <g transform={'translate(260 115) scale('+camera.scale+') translate('+(-camera.x)+' '+(-camera.y)+')'}>
            <polyline class="track-base" points={trackSection(points,0,distance)}/>
            {#each sections as section}<polyline class="track-section" points={trackSection(points,section.start,section.end)} style:stroke={section.color}/>{/each}
            <polyline class="track-rail" points={trackSection(points,0,distance)}/>
            <polyline class="ribbon outer" points={trackSection(points,spread.p10,spread.p90)}/>
            <polyline class="ribbon inner" points={trackSection(points,spread.p25,spread.p75)}/>
          </g>
          <circle cx={startPoint.x} cy={startPoint.y} r="4" class="start"/><text x={startPoint.x} y={startPoint.y+21} text-anchor="middle" class="boundary">Start</text>
          <path d={'M'+finishPoint.x+','+(finishPoint.y-12)+'v24'} class="finish"/><text x={finishPoint.x} y={finishPoint.y+25} text-anchor="middle" class="boundary">Finish</text>
          <path d={'M'+meanPoint.x+','+(meanPoint.y-16)+'v16'} class="mean-link"/>
          <circle cx={meanPoint.x} cy={meanPoint.y} r="5" class="mean-dot"/>
          <circle cx={meanPoint.x} cy={meanPoint.y-30} r="15" class="portrait-ring"/>
          <image href={portrait(runner.cardId)} x={meanPoint.x-14} y={meanPoint.y-44} width="28" height="28" clip-path={'url(#'+uid+'-portrait)'} preserveAspectRatio="xMidYMid slice"/>
        </svg>
      {:else}<p class="map-status" role="status">{error||(shapes?'No track outline for this course. The distance profile remains available.':'Loading course geometry…')}</p>{/if}
      <div class="map-caption"><span>{whole?'Whole course':'Following '+Math.round(low)+'–'+Math.round(high)+' m'}</span><span>Mean marker · Bands follow course distance</span></div>
    </div>
    <div class="profile"><div class="view-heading"><h3>Course cross-section</h3><span>{time.toFixed(1)} s elapsed</span></div>
      <div class="profile-plot">
        <div class="row-labels"><span>Samples<small>{(peak/trajectories.length*100).toFixed(0)}% peak</small></span>{#each rows as row}<span>{row.label}</span>{/each}</div>
        <div class="distance-plot" bind:clientWidth={profileWidth}>
          <svg viewBox="0 0 600 174" preserveAspectRatio="none" role="img" aria-label={runner.name+' sampled distance distribution with corners, slopes and phases'}>
            {#each [0,.25,.5,.75,1] as tick}<line class="grid" x1={tick*600} x2={tick*600} y1="8" y2="166"/>{/each}
            <path d={outline+' Z'} class="sample-area"/>
            {#each bins as count,index}{#if count}<rect class="sample-bin" x={index*600/36+.5} y={66-count/peak*56} width={600/36-1} height={count/peak*56}><title>{Math.round(low+index/36*width)}–{Math.round(low+(index+1)/36*width)} m: {count} races ({(count/trajectories.length*100).toFixed(1)}%)</title></rect>{/if}{/each}
            <path d={outline} class="sample-curve"/>
            <line class="profile-range outer" x1={x(spread.p10)} x2={x(spread.p90)} y1="77" y2="77"/>
            <line class="profile-range inner" x1={x(spread.p25)} x2={x(spread.p75)} y1="77" y2="77"/>
            {#each rows as row,index}<rect class="band-base" x="0" y={90+index*25} width="600" height="20"/>{#each row.segments.filter(s=>s.end>=low&&s.start<=high) as segment}
              {@const left=Math.max(0,x(segment.start))}{@const right=Math.min(600,x(segment.end))}
              <rect x={left} y={90+index*25} width={right-left} height="20" fill={segment.color} fill-opacity=".2"><title>{segment.title}: {Math.round(segment.start)}–{Math.round(segment.end)} m</title></rect>
              <line x1={left} x2={right} y1={110+index*25} y2={110+index*25} stroke={segment.color} stroke-width="2"/>
              {#if (right-left)/600*profileWidth>65}<text transform={'translate('+(left+right)/2+' '+(104+index*25)+') scale('+600/Math.max(1,profileWidth)+' 1)'} text-anchor="middle">{segment.label}</text>{/if}
            {/each}{#if row.label==='Slopes'&&!row.segments.some(s=>s.end>=low&&s.start<=high)}<text transform={'translate(300 '+(104+index*25)+') scale('+600/Math.max(1,profileWidth)+' 1)'} text-anchor="middle">Level ground</text>{/if}{/each}
            <line class="mean-line" x1={x(spread.mean)} x2={x(spread.mean)} y1="4" y2="164"><title>Mean distance {spread.mean.toFixed(1)} m</title></line>
            <circle cx={x(spread.mean)} cy="77" r="3" class="mean-dot"/>
          </svg>
          <div class="axis">{#each [0,.25,.5,.75,1] as tick}<span style:left={tick*100+'%'}>{Math.round(low+width*tick)} m</span>{/each}</div>
        </div>
      </div>
      <div class="course-overview" role="img" aria-label={'Inspected course window '+Math.round(low)+' to '+Math.round(high)+' metres of '+distance+' metres'}><span style:left={low/distance*100+'%'} style:width={width/distance*100+'%'}></span><i style:left={spread.mean/distance*100+'%'}></i></div>
      <div class="overview-labels"><span>Start</span><span>Inspected window · {distance.toLocaleString()} m course</span><span>Finish</span></div>
    </div>
  </div>
  <footer><span class="legend"><i class="dot"></i>Mean <i class="outer-key"></i>Middle 80% <i class="inner-key"></i>Middle 50%</span><span>One Uma across {trajectories.length} races at the same time. Bands show distance spread, not occupied lanes. Finishers stay at the line.{#if spread.values.some(value=>value<low||value>high)} Tails outside the inspected window are clipped.{/if}</span></footer>
</section>
<style>
  .course-outcomes{min-width:0}header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px}header :global(.runner-reference .art){width:24px;height:28px}header :global(.runner-name strong){font-size:12px}.readings{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary);margin-left:auto}.readings strong{color:var(--text-primary);font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}.course-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:16px}.track,.profile{min-width:0}.track{padding-right:16px;border-right:1px solid var(--border-subtle)}.view-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px}h3{font-size:11px;margin:0}.view-heading>span{font-size:10px;color:var(--text-secondary)}.track-map{display:block;width:100%;height:220px;overflow:hidden;background:color-mix(in srgb,var(--runner-color) 3%,var(--surface-1));border-radius:5px}polyline{fill:none;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.track-base{stroke:var(--surface-3);stroke-width:17}.track-section{stroke-width:13;opacity:.4}.track-rail{stroke:var(--text-secondary);stroke-dasharray:2 4;stroke-width:1;opacity:.5}.ribbon{stroke:var(--runner-color)}.ribbon.outer{stroke-width:22;opacity:.25}.ribbon.inner{stroke-width:13;opacity:.75}.mean-dot{fill:var(--text-primary);stroke:var(--surface-1);stroke-width:1.5;vector-effect:non-scaling-stroke}.portrait-ring{fill:var(--surface-1);stroke:var(--runner-color);stroke-width:2}.mean-link{stroke:var(--text-primary);opacity:.7}.start{fill:var(--accent-success)}.finish{stroke:var(--text-primary);stroke-width:3;stroke-dasharray:3 2}.boundary{font-size:10px;fill:var(--text-secondary)}.map-caption{display:flex;justify-content:space-between;gap:10px;font-size:9px;color:var(--text-secondary);padding-top:5px}.map-status{height:220px;display:grid;place-items:center;color:var(--text-secondary);font-size:11px;margin:0}.profile-plot{display:grid;grid-template-columns:48px minmax(0,1fr);gap:6px;margin-top:20px}.row-labels{display:grid;grid-template-rows:90px 25px 25px 25px;font-size:9px;color:var(--text-secondary)}.row-labels span{padding-top:7px}.row-labels span:first-child{padding-top:20px}.row-labels small{display:block;font-size:8px;margin-top:3px}.distance-plot{min-width:0}.distance-plot svg{display:block;width:100%;height:174px;overflow:hidden}.distance-plot text{fill:var(--text-primary);font-size:10px}.grid{stroke:var(--border-subtle);vector-effect:non-scaling-stroke}.sample-area{fill:var(--runner-color);opacity:.15}.sample-bin{fill:var(--runner-color);opacity:.3}.sample-bin:hover{opacity:.8}.sample-curve{fill:none;stroke:var(--runner-color);stroke-width:1.5;vector-effect:non-scaling-stroke}.band-base{fill:var(--surface-2)}.profile-range{stroke:var(--runner-color);stroke-linecap:round;vector-effect:non-scaling-stroke}.profile-range.outer{stroke-width:8;opacity:.25}.profile-range.inner{stroke-width:5;opacity:.8}.mean-line{stroke:var(--text-primary);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}.axis{height:18px;position:relative;font-size:9px;color:var(--text-secondary)}.axis span{position:absolute;white-space:nowrap;transform:translateX(-50%)}.axis span:first-child{transform:none}.axis span:last-child{transform:translateX(-100%)}.course-overview{height:7px;position:relative;background:var(--surface-3);margin:11px 0 0 54px;border-radius:3px}.course-overview span{position:absolute;top:0;height:100%;background:var(--runner-color);opacity:.35;border-radius:2px}.course-overview i{position:absolute;top:-2px;height:11px;width:2px;background:var(--runner-color);transform:translateX(-50%)}.overview-labels{display:flex;justify-content:space-between;margin:5px 0 0 54px;font-size:8px;color:var(--text-secondary)}footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:9px;line-height:1.5;color:var(--text-secondary)}.legend{display:flex;align-items:center;gap:5px;white-space:nowrap}.legend i{display:inline-block;background:var(--runner-color);margin-left:7px}.legend .dot{width:6px;height:6px;background:var(--text-primary);border-radius:50%;margin-left:0}.outer-key{width:18px;height:8px;opacity:.25;border-radius:2px}.inner-key{width:18px;height:5px;opacity:.8;border-radius:2px}@container race-main (max-width:780px){.course-grid{grid-template-columns:1fr}.track{padding-right:0;border:0}.readings{margin-left:0;gap:8px}.profile-plot{margin-top:6px}.track-map{height:190px}}@media(max-width:600px){.course-grid{grid-template-columns:1fr}.track{padding-right:0;border:0}.readings{margin-left:0;gap:8px}.profile-plot{margin-top:6px}.track-map{height:190px}.map-caption{font-size:8px}}
</style>
