<script lang="ts">
  import {onDestroy,onMount,untrack} from 'svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import SimulatorReportTelemetry from './SimulatorReportTelemetry.svelte';
  import type {MonteCarloResult} from './simulator-repository';
  import SimulatorReportSpatial from './SimulatorReportSpatial.svelte';
  import {theme} from '@/stores/theme';
  import {reportLineChart} from './report-chart';
  import {loadReplayCourses,courseSegments,type CourseData} from '@/pages/race-analysis/replay-course';
  import {courseTerrain} from '@/pages/race-analysis/replay-timeline';
  import type {SimulationReport,ReportBand} from './simulation-report';
  import type {SimulatorUma} from './simulator-uma';
  import type {CourseCatalogEntry} from '@/lib/catalog/course-catalog';
  let {report,result,umas,selected,inspected,focus,course,suspended=false,onreplay}:{report:SimulationReport;result:MonteCarloResult;inspected:number;onreplay:(index:number)=>void;umas:SimulatorUma[];selected:number[];focus?:number;course?:CourseCatalogEntry;suspended?:boolean}=$props();
  let paired=$state.raw<ReportBand[][]>([]),error=$state(''),pending=$state(false),data=$state.raw<CourseData>(),spatialOpen=$state(false),extra=$state(false),start=$state(0),end=$state(untrack(()=>report.elapsed_seconds.at(-1)??1));
  let worker=$state.raw<Worker>(),generation=0;
  onMount(()=>{
    worker=new Worker(new URL('./simulation-report.worker.ts',import.meta.url),{type:'module'});
    worker.postMessage({initialize:true,report:{distance_m:report.distance_m,crossing_times:report.crossing_times,crossing_shape:report.crossing_shape,samples:report.samples}});
    void loadReplayCourses().then(v=>data=v).catch(()=>{});
  });
  onDestroy(()=>worker?.terminate());
  $effect(()=>{
    const reference=selected[0],sources=[...selected];
    if(reference===undefined||!worker)return;
    pending=true;error='';paired=[];const id=++generation;
    worker.onmessage=e=>{if(e.data.id!==generation)return;pending=false;if(e.data.error)error=e.data.error;else paired=e.data.value;};
    worker.onerror=()=>{if(id===generation){pending=false;error='Could not process paired progression.';}};
    worker.postMessage({id,reference,sources});
  });
  const selectedRows=$derived(selected.map(source=>({source,name:umas[source]!.name+' · #'+(source+1),runner:report.runners.find(r=>r.source_input_index===source)!})));
  const plot=(index:number,unit:string)=>reportLineChart(report.distance_m,selectedRows.map(row=>({...row,bands:row.runner.distance.map(p=>p[index]!)})),unit,$theme==='dark',focus);
  const difference=$derived(reportLineChart(report.distance_m,selectedRows.map((row,i)=>({...row,bands:paired[i]??[]})),'s gained',$theme==='dark',focus));
  function crossing(distance:number) {
    const row=selectedRows[0]?.runner.distance;
    if(!row?.length)return 0;
    const at=Math.min(row.length-1,distance/(course?.distance??1)*(row.length-1)),left=Math.floor(at),right=Math.ceil(at);
    return row[left]![0]![0]+(row[right]![0]![0]-row[left]![0]![0])*(at-left);
  }
  const profile=$derived(course&&data?.courses[course.course_id]);
  const bands=$derived(profile?[
    {label:'Sections',segments:courseSegments(profile,true)},
    {label:'Slopes',segments:courseTerrain(profile).slopes.map(s=>({start:s.start,end:s.end,label:s.slope?(s.slope/10000).toFixed(1)+'%':'Flat',color:s.slope>0?'#bd7581':s.slope<0?'#719bdd':'#737d8a'}))},
    {label:'Phase',segments:[{start:0,end:profile.distance/6,label:'Early',color:'#80ae83'},{start:profile.distance/6,end:profile.distance*2/3,label:'Mid race',color:'#61a9d8'},{start:profile.distance*2/3,end:profile.distance,label:'Late race',color:'#bd94d0'}]}
  ]:[]);
</script>
<div class="progression">
  {#if error}<p role="alert">{error}</p>{/if}
  {#if report.telemetry}
    <SimulatorReportTelemetry {report} {result} {umas} {selected} {inspected} {focus} {onreplay} onwindow={(low,high)=>{start=low;end=high;}}/>
    <div class="course-context" aria-label="Course context aligned to the reference runner's mean crossing time">
      {#each bands as band}<div><span class="band-label">{band.label}</span><div class="band">{#each band.segments as segment}
        {@const low=crossing(segment.start)}{@const high=crossing(segment.end)}
        <span style:left={(low-start)/Math.max(.001,end-start)*100+'%'} style:width={(high-low)/Math.max(.001,end-start)*100+'%'} style:--band-color={segment.color} title={segment.label+' · '+Math.round(segment.start)+'–'+Math.round(segment.end)+' m'}>{(high-low)/Math.max(.001,end-start)>.1?segment.label:''}</span>
      {/each}</div></div>{/each}
    </div><p class="report-note course-reference">Course context: {umas[selected[0]??0]?.name} · mean crossing times.</p>
  {:else}
    <p class="report-note">This response contains {report.spatial_coverage}/{report.samples} sampled trajectories. Run against a version 2 backend for every-run telemetry; no races are fetched automatically.</p>
    <div class="progression-plots"><div><h3>Speed · m/s</h3><LazyEChartsSurface option={plot(1,'m/s')} label="Mean speed by course distance" height={205}/></div><div><h3>Remaining HP</h3><LazyEChartsSurface option={plot(4,'HP')} label="Mean HP by course distance" height={205}/></div></div>
  {/if}
  <details><summary>Where time is gained or lost</summary><div aria-busy={pending}><h3>Paired time gained <small>vs. {umas[selected[0]??0]?.name} · higher is faster</small></h3><LazyEChartsSurface option={difference} label="Paired time gained at the same course distance" height={220}/></div></details>
  <details bind:open={extra}><summary>Target speed, acceleration and lateral position</summary>{#if extra}<div class="pair-plots"><div><h3>Target speed</h3><LazyEChartsSurface option={plot(2,'m/s')} label="Mean target speed by distance" height={190}/></div><div><h3>Acceleration</h3><LazyEChartsSurface option={plot(3,'m/s²')} label="Mean acceleration by distance" height={190}/></div></div><h3>Lateral position</h3><LazyEChartsSurface option={plot(5,'m from inner rail')} label="Mean lateral position by distance" height={190}/>{/if}</details>
  <details bind:open={spatialOpen}><summary>Spatial distributions on the track and course</summary>{#if spatialOpen}<SimulatorReportSpatial {report} {umas} {selected} {course} suspended={suspended||!spatialOpen}/>{/if}</details>
  <details><summary>How to read these comparisons</summary><p class="report-note">Mean curves use all {report.samples} races. Focus a runner in the comparison bar for its middle 80% range. Time gained uses paired simulation-clock crossings; finish times above use the official result clock.</p></details>
</div>
<style>
  .progression>details{display:inline-block;vertical-align:top;border:0;margin-right:18px;padding:6px 0}.progression>details[open]{display:block;width:100%;margin-right:0}
  .progression{min-width:0}h3{font-size:12px;margin:0 0 6px;min-height:18px}h3 small{font-size:10px;color:var(--text-secondary);font-weight:400;margin-left:6px}.progression-plots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:10px}.progression-plots>div,.pair-plots>div{min-width:0}.pair-plots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.course-context{display:grid;gap:2px;margin:10px 88px 0 0;font-size:9px}.course-reference{margin:4px 0!important;font-size:10px!important}.course-context>div{display:grid;grid-template-columns:44px 1fr;align-items:center}.band-label{color:var(--text-secondary)}.band{position:relative;height:14px;background:var(--surface-2);overflow:hidden}.band>span{position:absolute;inset-block:0;display:grid;place-items:center;white-space:nowrap;overflow:hidden;border-bottom:1px solid var(--band-color);background:color-mix(in srgb,var(--band-color) 12%,transparent)}summary{font-size:12px;cursor:pointer;color:var(--accent-primary)}
  @media(max-width:1100px){.progression-plots{grid-template-columns:repeat(2,minmax(0,1fr))}.progression-plots>div:first-child{grid-column:1/-1}}
  @media(max-width:600px){.course-context{margin-right:68px}.progression-plots,.pair-plots{grid-template-columns:1fr}.progression-plots{gap:14px}.progression-plots>div:first-child{grid-column:auto}}
</style>
