<script lang="ts">
  import {onMount,onDestroy,untrack} from 'svelte';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import {theme} from '@/stores/theme';
  import {compactRaceTrajectory,raceSignalSpreads,racePositionClouds,trajectoryPreviewSamples,type RaceTrajectory} from '@/lib/race/race-ensemble';
  import type {ParsedRaceCapture} from '@/lib/race/race-capture-parser';
  import type {CourseCatalogEntry} from '@/lib/catalog/course-catalog';
  import type {MonteCarloInput} from './race-sim-request';
  import {simulatorRepository,type MonteCarloResult} from './simulator-repository';
  import {simulatorReplayCapture,simulatorSampleReplay} from './simulator-results';
  import {simulatorTeamColor} from './simulator-roster.svelte';
  import type {SimulatorUma} from './simulator-uma';
  let {result,input,umas,course,track,suspended=false}:{result:MonteCarloResult;input?:MonteCarloInput;umas:SimulatorUma[];course:CourseCatalogEntry;track:ParsedRaceCapture['track'];suspended?:boolean}=$props();
  let host:HTMLDivElement,loaded=$state(0),target=$state(0),loading=$state(false),error=$state('');
  let trajectories=$state.raw<RaceTrajectory[]>([]),time=$state(0),playing=$state(false),visible=$state(false),started=false;
  const saved=new Map<number,RaceTrajectory>(),canvases=new Map<number,HTMLCanvasElement>();
  let controller:AbortController|undefined;
  const end=$derived(Math.max(1,...trajectories.flatMap(trajectory=>trajectory.finishTimes)));
  const trends=$derived(raceSignalSpreads(trajectories));
  const trendScales=$derived((['speed','hp','gap'] as const).map(key=>{
    const values=trends.runners.flatMap(runner=>runner[key].flatMap(value=>value?[value.mean,value.p10,value.p90]:[]));
    const step=key==='speed'?5:10;
    return {key,label:key==='speed'?'Speed (m/s)':key==='hp'?'Remaining HP (%)':'Gap to leader (m)',min:Math.min(0,Math.floor(Math.min(0,...values)/step)*step),max:Math.max(key==='hp'?100:step,Math.ceil(Math.max(0,...values)/step)*step)};
  }));
  const trendPlots=$derived(trends.runners.map(runner=>({source:runner.source,plots:trendScales.map(scale=>{
    const series=runner[scale.key],x=(index:number)=>30+index/Math.max(1,trends.times.length-1)*260,y=(value:number)=>78-(value-scale.min)/(scale.max-scale.min)*58;
    const valid=series.flatMap((value,index)=>value?[{value,index}]:[]);
    const line=series.map((value,index)=>value?(index&&series[index-1]?'L':'M')+x(index).toFixed(1)+','+y(value.mean).toFixed(1):'').join(' ');
    const band=valid.length?'M'+valid.map(({value,index})=>x(index).toFixed(1)+','+y(value.p90).toFixed(1)).join(' L')+' L'+[...valid].reverse().map(({value,index})=>x(index).toFixed(1)+','+y(value.p10).toFixed(1)).join(' L')+' Z':'';
    return {...scale,line,band};
  })})));
  const clouds=$derived(racePositionClouds(trajectories,time));
  const domain=$derived.by(()=>{
    const values=clouds.flatMap(row=>row.points.map(point=>point.distance));
    if(!values.length)return {min:0,max:course.distance};
    const low=Math.min(...values),high=Math.max(...values),span=Math.max(60,high-low),centre=(low+high)/2;
    const min=Math.max(0,Math.min(course.distance-span,centre-span*.6));
    return {min,max:Math.min(course.distance,Math.max(min+60,centre+span*.6))};
  });
  const laneMax=$derived(Math.min(10000,Math.max(100,Math.ceil(Math.max(0,...clouds.flatMap(row=>row.points.map(point=>point.lane)))*1.15/100)*100))); 
  const clock=(value:number)=>Math.floor(value/60)+':'+(value%60).toFixed(1).padStart(4,'0');
  onDestroy(()=>controller?.abort());
  onMount(()=>{
    const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(visible&&!started){started=true;void load(false);}},{rootMargin:'120px'});
    observer.observe(host);return()=>observer.disconnect();
  });
  $effect(()=>{
    if(!playing||suspended||!visible||!trajectories.length)return;
    const from=untrack(()=>time),start=performance.now();let frame=0,last=0;
    function animate(now:number){if(now-last>=1000/24){time=Math.min(end,from+(now-start)/1000*4);last=now;if(time>=end){playing=false;return;}}frame=requestAnimationFrame(animate);}
    frame=requestAnimationFrame(animate);return()=>cancelAnimationFrame(frame);
  });
  function canvas(node:HTMLCanvasElement,source:number){canvases.set(source,node);const observer=new ResizeObserver(()=>draw());observer.observe(node);draw();return {destroy(){observer.disconnect();canvases.delete(source);}};}
  function draw(){
    const dark=$theme==='dark',text=dark?'#929bad':'#657081',grid=dark?'#303238':'#dfe3e8',mean=dark?'#f4f6f8':'#1c2532';
    for(const [source,node] of canvases){
      const row=clouds[source],ctx=node.getContext('2d');if(!row||!ctx)continue;
      const width=node.clientWidth,height=112,dpr=Math.min(2,devicePixelRatio||1);
      if(node.width!==Math.round(width*dpr)||node.height!==height*dpr){node.width=Math.round(width*dpr);node.height=height*dpr;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const left=31,right=width-9,top=8,bottom=87;
      const x=(distance:number)=>left+(distance-domain.min)/Math.max(1,domain.max-domain.min)*(right-left);
      const y=(lane:number)=>bottom-lane/laneMax*(bottom-top);
      ctx.font='9px system-ui';ctx.fillStyle=text;ctx.strokeStyle=grid;ctx.lineWidth=.6;
      for(const fraction of [0,.5,1]){const yp=bottom-(bottom-top)*fraction;ctx.beginPath();ctx.moveTo(left,yp);ctx.lineTo(right,yp);ctx.stroke();ctx.textAlign='right';ctx.fillText((laneMax*fraction/100).toFixed(laneMax<1000?1:0)+'%',left-5,yp+3);}
      ctx.textAlign='left';ctx.fillText(Math.round(domain.min)+' m',left,105);ctx.textAlign='right';ctx.fillText(Math.round(domain.max)+' m',right,105);
      const color=umas[source]?.teamColor??simulatorTeamColor(umas[source]?.teamId);
      ctx.fillStyle=color;ctx.globalAlpha=Math.max(.22,Math.min(.6,4/Math.sqrt(trajectories.length)));
      for(const point of row.points){ctx.beginPath();ctx.arc(x(point.distance),y(point.lane),2.5,0,Math.PI*2);ctx.fill();}
      ctx.globalAlpha=1;ctx.strokeStyle=mean;ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(x(row.distance),y(row.lane),5,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x(row.distance)-8,y(row.lane));ctx.lineTo(x(row.distance)+8,y(row.lane));ctx.moveTo(x(row.distance),y(row.lane)-8);ctx.lineTo(x(row.distance),y(row.lane)+8);ctx.stroke();
    }
  }
  $effect(()=>{clouds;domain;laneMax;$theme;draw();});
  function publish(){trajectories=[...saved.values()].sort((a,b)=>a.sample-b.sample);if(trajectories.length&&time===0)time=Math.max(...trajectories.flatMap(trajectory=>trajectory.finishTimes))*.7;}
  async function load(all:boolean){
    if(loading)return;if(!input){error='Run a new batch to load its progression.';return;}
    const request=controller=new AbortController();loading=true;error='';target=all?result.runs:Math.min(24,result.runs);
    try{
      if(result.first_replay&&!saved.has(0)){
        if(result.first_replay.seed!==result.seeds[0])throw Error('The first replay does not match its seed. Run a new batch.');
        const capture=simulatorReplayCapture(result.first_replay,umas,course,track);
        saved.set(0,compactRaceTrajectory(capture,result.first_replay.runner_source_indices,0,.5));loaded=saved.size;publish();
      }
      const indices=all?result.seeds.map((_,index)=>index):trajectoryPreviewSamples(result.runs);
      const remaining=indices.filter(index=>!saved.has(index));let next=0;
      const worker=async()=>{while(next<remaining.length&&!request.signal.aborted){
        const sample=remaining[next++]!;
        const response=await simulatorRepository.monteCarlo({body:{input,seeds:[result.seeds[sample]],output_mode:'skills',output_format:'json'},signal:request.signal});
        if(request.signal.aborted)return;
        const replay=simulatorSampleReplay(result,response.result,sample),capture=simulatorReplayCapture(replay,umas,course,track);
        saved.set(sample,compactRaceTrajectory(capture,replay.runner_source_indices,sample,.5));loaded=saved.size;
        if(loaded===1||loaded%4===0)publish();
      }};
      await Promise.all(Array.from({length:Math.min(4,remaining.length)},()=>worker()));
    }catch(reason){if(!request.signal.aborted){error=reason instanceof Error?reason.message:'Could not load progression.';request.abort();}}
    finally{publish();loading=false;}
  }
</script>
<div class="ensemble" bind:this={host} aria-label="Monte Carlo progression" data-loaded-races={loaded} data-total-races={result.runs}>
  <ChartFrame plain surface id="simulator-progression" title="How the race unfolds" description="Each runner has their own position cloud. Forward progress and sideways movement stay paired within each sampled race.">
    {#snippet actions()}<span class="coverage">{loaded} / {result.runs} races</span>{#if loading}<Button variant="ghost" size="sm" onclick={()=>controller?.abort()}>Stop loading</Button>{:else if loaded<result.runs}<Button variant="ghost" size="sm" onclick={()=>load(loaded>=Math.min(24,result.runs))}>{error?'Retry':loaded>=Math.min(24,result.runs)?'Load all '+result.runs+' races':'Load preview'}</Button>{/if}{/snippet}
    {#if loading}<progress aria-label="Progression races loaded" value={loaded} max={target}></progress>{/if}
    {#if error}<p role="alert" class="load-error">{error}</p>{/if}
    {#if trajectories.length}
      <div class="playback"><Button size="sm" variant="secondary" ariaLabel={playing?'Pause progression':'Play progression'} onclick={()=>{if(time>=end)time=0;playing=!playing;}}>{playing?'Pause':'Play'} <span class="speed">4×</span></Button><label for="progression-time" class="clock">{clock(time)} <span>/ {clock(end)}</span></label><input id="progression-time" aria-label="Progression time" type="range" min={0} max={end} step="0.05" bind:value={time} oninput={()=>playing=false}/><div class="landmarks">{#each [{label:'Start',at:0},{label:'25%',at:.25},{label:'50%',at:.5},{label:'75%',at:.75},{label:'Finish',at:1}] as mark}<button onclick={()=>{playing=false;time=mark.at*end;}}>{mark.label}</button>{/each}</div></div>
      <div class="reading-guide"><span><i class="sample"></i>One sampled race <i class="average"></i>Mean position</span><span>Distance along course → · Outward from rail ↑</span></div>
      <div class="cloud-grid">{#each umas as uma,source}
        {@const row=clouds[source]!}
        <article class="position-cloud" data-runner-index={source} data-mean-distance={row.distance} data-mean-lane={row.lane}><header><RunnerReference name={uma.name} cardId={uma.cardId} compact/><span>{row.finished===trajectories.length?'Finished':Math.round(row.distance).toLocaleString()+' m'}</span></header><div role="img" aria-label={uma.name+': distance and lateral lane distribution across '+trajectories.length+' races. Mean distance '+row.distance.toFixed(1)+' metres; mean lane offset '+(row.lane/100).toFixed(1)+' percent of track width.'}><canvas use:canvas={source} aria-hidden="true"></canvas></div></article>
      {/each}</div>
      <p class="footnote">{loaded<result.runs?'Position preview uses '+loaded+' of '+result.runs+' seeds spread across the batch.':'All '+result.runs+' sampled races are included.'} Each dot belongs to that runner in one race; clouds are individual possibilities. Lane offset is measured from the inner rail as a percentage of track width. Scales follow the field and are shared by every runner. Playback uses half-second position samples.</p>
    {:else}<div class="preparing"><strong>{loading?'Preparing the position preview…':'Position preview'}</strong><p>Finish and skill summaries use all {result.runs} races. Progression loads separately as you reach this section.</p>{#if !loading}<Button variant="secondary" size="sm" onclick={()=>load(false)}>Load progression</Button>{/if}</div>{/if}
  </ChartFrame>
  {#if trajectories.length}<ChartFrame plain surface id="simulator-race-trends" title="Pace, stamina and race position" description={'Mean and middle 80% across '+loaded+' loaded races. Each column shares a scale across all runners; the vertical marker follows the progression clock.'}>
    <div class="trend-key"><span><i></i>Mean</span><span><i class="spread"></i>Middle 80%</span><span>{loaded} / {result.runs} sampled races</span></div>
    <div class="trend-rows">{#each trendPlots as runner}<article class="trend-row" data-trend-runner={runner.source}><RunnerReference name={umas[runner.source]!.name} cardId={umas[runner.source]!.cardId} compact/>{#each runner.plots as plot}<svg viewBox="0 0 300 102" role="img" aria-label={umas[runner.source]!.name+': '+plot.label+', mean and 10th–90th percentile over elapsed simulation time'}><text class="metric-label" x="30" y="10">{plot.label}</text><line class="trend-grid" x1="30" x2="290" y1="20" y2="20"/><line class="trend-grid" x1="30" x2="290" y1="78" y2="78"/><text x="25" y="23" text-anchor="end">{plot.max}</text><text x="25" y="81" text-anchor="end">{plot.min}</text><path class="trend-band" d={plot.band}/><path class="trend-mean" d={plot.line}/><line class="trend-cursor" x1={30+time/end*260} x2={30+time/end*260} y1="16" y2="78"/><text x="30" y="97">0 s</text><text x="160" y="97" text-anchor="middle">{Math.round(trends.end/2)} s</text><text x="290" y="97" text-anchor="end">{Math.round(trends.end)} s</text></svg>{/each}</article>{/each}</div>
    <p class="footnote">Speed includes runners still racing at each instant; a curve ends when all that runner’s samples have finished. HP is relative to each race’s initial HP and stays at its finishing value. Gap is measured against the leader within the same race and freezes when that race’s winner finishes. Curves use 81 elapsed-time checkpoints; official finish times use a different clock.</p>
  </ChartFrame>{/if}
</div>
<style>
  .ensemble{display:grid;gap:16px;min-width:0}.trend-key{display:flex;gap:16px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary);margin-bottom:12px}.trend-key>span{display:flex;align-items:center;gap:6px}.trend-key>span:last-child{margin-left:auto}.trend-key i{width:14px;height:2px;background:var(--accent-primary)}.trend-key i.spread{height:8px;opacity:.2}.trend-rows{display:grid;min-width:0}.trend-row{display:grid;grid-template-columns:180px repeat(3,minmax(0,1fr));gap:18px;align-items:center;padding:10px 0;border-top:1px solid var(--border-subtle);min-width:0}.trend-row svg{display:block;width:100%;height:105px;min-width:0}.trend-row text{font-size:9px;fill:var(--text-secondary)}.trend-row .metric-label{font-size:10px;fill:var(--text-primary)}.trend-grid{stroke:var(--border-subtle);stroke-width:.6}.trend-band{fill:var(--accent-primary);fill-opacity:.16}.trend-mean{stroke:var(--accent-primary);fill:none;stroke-width:1.5}.trend-cursor{stroke:var(--text-secondary);stroke-width:.7;stroke-dasharray:3 3}.trend-row :global(.runner-name strong){font-size:11px}.trend-row :global(.runner-reference .art){width:24px;height:30px}@container race-main (max-width:1000px){.trend-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px 12px;padding:12px 0}.trend-row> :global(.runner-reference){grid-column:1/-1}.trend-row svg{height:95px}}@media(max-width:600px){.trend-row{grid-template-columns:minmax(0,1fr);gap:6px}.trend-row svg{height:105px}.trend-key{gap:10px}.trend-key>span:last-child{margin-left:0}}.coverage{font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-secondary)}progress{display:block;width:100%;height:3px;accent-color:var(--accent-primary);margin:0 0 12px}.playback{display:grid;grid-template-columns:auto auto minmax(100px,1fr) auto;gap:12px;align-items:center;margin:0 0 12px;min-width:0}.speed{font-size:10px;opacity:.6}.clock{font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:600}.clock>span{font-size:11px;font-weight:400;color:var(--text-secondary)}input{width:100%;min-width:0;accent-color:var(--accent-primary);cursor:ew-resize;height:28px}.landmarks{display:flex;gap:4px}.landmarks button{border:0;border-radius:var(--radius-sm);background:transparent;color:var(--text-secondary);padding:7px 6px;font:inherit;font-size:10px;cursor:pointer}.landmarks button:hover{color:var(--accent-primary);background:var(--color-accent-soft)}.landmarks button:focus-visible{outline:2px solid var(--accent-primary)}.reading-guide{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary);margin-bottom:12px}.reading-guide>span:first-child{display:flex;align-items:center;gap:6px}.sample{width:5px;height:5px;border-radius:50%;background:var(--accent-primary);margin-left:2px}.average{width:9px;height:9px;border:1.5px solid var(--text-primary);border-radius:50%;margin-left:12px}.cloud-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.position-cloud{min-width:0;padding:8px 10px 4px;background:var(--surface-2);border:1px solid var(--border-subtle);border-radius:var(--radius-md)}.position-cloud header{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.position-cloud header>span{font-size:10px;color:var(--text-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}.position-cloud :global(.runner-reference){min-width:0}.position-cloud :global(.runner-name strong){font-size:11px}.position-cloud :global(.runner-reference .art){width:22px;height:27px}.position-cloud canvas{display:block;width:100%;height:112px}.footnote{margin:12px 0 0;max-width:110ch;font-size:10px;line-height:1.7;color:var(--text-secondary)}.preparing{padding:24px 0;font-size:12px}.preparing p{font-size:11px;color:var(--text-secondary);line-height:1.6}.load-error{font-size:12px;color:var(--color-danger)}@media(max-width:1000px){.playback{grid-template-columns:auto auto minmax(100px,1fr)}.landmarks{grid-column:1/-1;justify-content:space-between}.cloud-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.cloud-grid{grid-template-columns:1fr}.playback{grid-template-columns:auto 1fr;gap:8px}.clock{text-align:right}.playback input{grid-column:1/-1;grid-row:2}.landmarks{grid-row:3}.position-cloud canvas{height:112px}}
</style>
