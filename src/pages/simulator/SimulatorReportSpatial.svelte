<script lang="ts">
  import {onMount} from 'svelte';
  import {telemetrySample} from './report-telemetry';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import {theme} from '@/stores/theme';
  import {loadReplayGeometry,type CourseShape} from '@/pages/race-analysis/replay-course';
  import {coursePreviewTrack} from './simulator-course-preview';
  import {trackBasis,trackUnitsPerMetre} from '@/pages/race-analysis/replay-track';
  import {runnerColor,type SimulationReport} from './simulation-report';
  import type {SimulatorUma} from './simulator-uma';
  import type {CourseCatalogEntry} from '@/lib/catalog/course-catalog';
  let {report,umas,selected,course,suspended=false}:{report:SimulationReport;umas:SimulatorUma[];selected:number[];course?:CourseCatalogEntry;suspended?:boolean}=$props();
  let time=$state(0),playing=$state(false),visible=$state(true),host:HTMLDivElement,shapes=$state.raw<Record<string,CourseShape>>({});
  const surfaces=new Map<HTMLCanvasElement,{source:number;track:boolean}>();
  const coverage=$derived(report.telemetry?report.samples:report.spatial_coverage);
  const max=$derived(report.telemetry?Math.max(...report.telemetry.finish_seconds):report.elapsed_seconds.at(-1)??0);
  const geometry=$derived(course&&shapes[course.course_id]?coursePreviewTrack(shapes[course.course_id]!,true).points:[]);
  const points=$derived(geometry.filter((_,i)=>i%3===0));
  const scale=$derived(points.length?trackUnitsPerMetre(points):1);
  const meanPaths=$derived(report.runners.map(r=>({source:r.source_input_index,positions:r.elapsed.map(p=>[p[0]![0],p[1]![0]])})));
  const trackMeans=$derived(points.length?meanPaths.map(r=>({source:r.source,positions:r.positions.map(p=>{const b=trackBasis(points,p[0]!,course?.turn);return [b.x+b.nx*p[1]!*scale,b.y+b.ny*p[1]!*scale];})})):[]);
  function observation(rows:number[][],at:number) {
    const a=rows[Math.min(rows.length-1,Math.floor(at))]!,b=rows[Math.min(rows.length-1,Math.ceil(at))]!;
    return a.map((v,k)=>v+(b[k]!-v)*(at-Math.floor(at)));
  }
  function paint() {
    const clouds=selected.map(source=>({source,mean:observation(meanPaths.find(r=>r.source===source)!.positions,time),values:report.telemetry?Array.from({length:report.samples},(_,run)=>[telemetrySample(report.telemetry!,source*report.samples+run,time,0),telemetrySample(report.telemetry!,source*report.samples+run,time,1)]):report.spatial.map(s=>observation(s.trajectories[source]!,time))}));
    const all=clouds.flatMap(c=>[...c.values,c.mean]),distances=all.map(p=>p[0]!);
    const centre=distances.length?distances.reduce((a,b)=>a+b,0)/distances.length:0;
    const low=Math.max(0,Math.min(centre-50,...distances.map(v=>v-10))),high=Math.max(centre+50,...distances.map(v=>v+10));
    const laneMax=Math.max(2,Math.ceil(Math.max(...all.map(v=>v[1]!))+.5));
    for(const [canvas,{source,track}] of surfaces) {
      const rect=canvas.getBoundingClientRect();if(!rect.width)continue;
      const ratio=devicePixelRatio||1,w=rect.width,h=210;
      if(canvas.width!==Math.round(w*ratio)){canvas.width=Math.round(w*ratio);canvas.height=h*ratio;}
      const ctx=canvas.getContext('2d');if(!ctx)continue;
      ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
      const dark=$theme==='dark',grid=dark?'#303238':'#dfe3e8';
      ctx.strokeStyle=grid;ctx.fillStyle=dark?'#aeb3bc':'#596271';ctx.font='10px sans-serif';
      const cloud=clouds.find(c=>c.source===source);if(!cloud)continue;
      let position:(p:number[])=>[number,number];
      let pathPosition:(index:number)=>[number,number];
      const meanPath=meanPaths.find(r=>r.source===source)!.positions;
      if(track&&points.length) {
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-24,y=Math.min(...ys)-24;
        const fit=Math.min((w-30)/(Math.max(...xs)-x+24),(h-30)/(Math.max(...ys)-y+24));
        const offsetX=(w-(Math.max(...xs)-x+24)*fit)/2;
        ctx.beginPath();points.forEach((p,i)=>{const px=offsetX+(p.x-x)*fit,py=15+(p.y-y)*fit;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.lineWidth=10;ctx.stroke();ctx.lineWidth=1;
        position=p=>{const b=trackBasis(points,p[0]!,course?.turn);return [offsetX+(b.x+b.nx*p[1]!*scale-x)*fit,15+(b.y+b.ny*p[1]!*scale-y)*fit];};
        const path=trackMeans.find(r=>r.source===source)!.positions;
        pathPosition=i=>[offsetX+(path[i]![0]!-x)*fit,15+(path[i]![1]!-y)*fit];
      } else {
        for(let i=0;i<=4;i++){const x=40+(w-60)*i/4;ctx.beginPath();ctx.moveTo(x,16);ctx.lineTo(x,h-30);ctx.stroke();ctx.fillText(Math.round(low+(high-low)*i/4)+' m',x-13,h-10);}
        for(let i=0;i<=4;i++){const y=h-30-(h-50)*i/4;ctx.fillText((laneMax*i/4).toFixed(1),5,y+3);}
        ctx.fillText('Lateral m',3,10);
        position=p=>[40+(p[0]!-low)/(high-low)*(w-60),h-30-p[1]!/laneMax*(h-50)];
        pathPosition=i=>position(meanPath[i]!);
      }
      ctx.save();if(!track){ctx.beginPath();ctx.rect(40,12,w-60,h-36);ctx.clip();}
      ctx.strokeStyle=runnerColor(source);ctx.lineWidth=2;ctx.globalAlpha=.75;ctx.beginPath();
      const first=track?0:Math.max(0,Math.floor(time)-5),last=Math.min(meanPath.length-1,Math.floor(time));
      for(let i=first;i<=last;i++){const [x,y]=pathPosition(i);i===first?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();
      ctx.fillStyle=runnerColor(source);ctx.globalAlpha=.4;
      cloud.values.forEach(p=>{const [x,y]=position(p);ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
      const [x,y]=position(cloud.mean);ctx.strokeStyle=runnerColor(source);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-6,y);ctx.lineTo(x+6,y);ctx.moveTo(x,y-6);ctx.lineTo(x,y+6);ctx.stroke();ctx.lineWidth=1;
      ctx.restore();
    }
  }
  function surface(node:HTMLCanvasElement,options:{source:number;track:boolean}) {surfaces.set(node,options);const resize=new ResizeObserver(paint);resize.observe(node);paint();return {destroy(){resize.disconnect();surfaces.delete(node);}};}
  $effect(()=>{time;selected;geometry;$theme;paint();});
  $effect(()=>{if(suspended||!visible)playing=false;});
  onMount(()=>{time=max/2;
    void loadReplayGeometry().then(v=>shapes=v).catch(()=>{});
    const observer=new IntersectionObserver(entries=>visible=entries.some(e=>e.isIntersecting));observer.observe(host);
    const timer=setInterval(()=>{if(playing&&!document.hidden&&!suspended){time=Math.min(max,time+.4);if(time===max)playing=false;}},100);
    return ()=>{clearInterval(timer);observer.disconnect();};
  });
</script>
<div bind:this={host} class="spatial">
  <div class="controls"><Button size="sm" variant="secondary" onclick={()=>{if(time===max)time=0;playing=!playing;}}>{playing?'Pause':'Play distributions'}</Button><label>Elapsed time <input aria-label="Distribution elapsed time" type="range" min="0" {max} step="0.1" bind:value={time}/></label><strong>{time.toFixed(1)} s</strong></div>
  <p>● {coverage} sampled positions · ━ Mean path and + mean position across all {report.samples} races. Each view uses the same elapsed time and shared axes.</p>
  <div class="spatial-labels"><span>Course position · shared distance and lateral scale</span><span>Track position · later passes appear below earlier passes</span></div>
  {#each selected as source}<div class="runner-cloud"><RunnerReference name={umas[source]!.name+' · #'+(source+1)} cardId={umas[source]!.cardId} compact/><div class="clouds"><canvas use:surface={{source,track:false}} aria-label={umas[source]!.name+' joint distance and lateral distribution'}></canvas><canvas use:surface={{source,track:true}} aria-label={umas[source]!.name+' sampled positions on the track'}></canvas></div></div>{/each}
  <details><summary>Position coverage & interpretation</summary><p>Dots preserve distance and lateral position from the same sampled race. Showing {coverage}/{report.samples} trajectories; means use the entire batch. The course view shows the last five seconds of the mean path, while the track shows its history. These averaged paths are distributions in this field, rather than actual races.</p></details>
</div>
<style>
  .spatial{padding-top:8px;min-width:0}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.controls label{display:flex;gap:8px;align-items:center;flex:1;font-size:11px;min-width:180px}.controls input{flex:1;min-width:40px}.controls strong{font-size:12px;font-variant-numeric:tabular-nums}p{font-size:11px;color:var(--text-secondary);line-height:1.5;margin:8px 0}.clouds,.spatial-labels{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.spatial-labels{padding-top:4px;font-size:10px;color:var(--text-secondary)}.runner-cloud{padding:8px 0;border-top:1px solid var(--border-subtle)}canvas{width:100%;height:210px;background:var(--surface-2);border-radius:var(--radius-sm)}
  @media(max-width:650px){.clouds{grid-template-columns:1fr}.spatial-labels{display:none}}
</style>
