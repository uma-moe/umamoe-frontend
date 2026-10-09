<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import type {EChartsCoreOption} from 'echarts/core';
  import ChartFrame from '@/components/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Button from '@/components/Button.svelte';
  import ToggleButton from '@/components/ToggleButton.svelte';
  import {theme} from '@/stores/theme';
  import {runnerColor,reportNumber as n,type SimulationReport} from './simulation-report';
  import {subsetTelemetry,type RunnerTelemetry} from './report-telemetry';
  import type {SimulatorUma} from './simulator-uma';
  import type {MonteCarloResult} from './simulator-repository';
  let {report,result,umas,selected,inspected,focus,onreplay,onwindow}:{report:SimulationReport;result:MonteCarloResult;umas:SimulatorUma[];selected:number[];inspected:number;focus?:number;onreplay:(index:number)=>void;onwindow?:(start:number,end:number)=>void}=$props();
  const labels=['Speed','HP remaining','Gap to leader'],units=['m/s','%','m'],styles=['solid','dashed','dotted'] as const;
  let worker=$state.raw<Worker>(),prepared=$state.raw(new Map<number,RunnerTelemetry>()),enabled=$state([true,true,true]),dense=$state(false),expanded=$state(false),zoom=$state([0,100]),error=$state('');
  let host:HTMLDivElement,canvas=$state<HTMLCanvasElement>(),width=$state(0),height=$state(320),picked=$state(-1),pickedLines=$state.raw<number[][][]>([]),pending=$state(false);
  const requests=new Map<number,{kind:'prepare'|'render'|'pick';source:number}>(),loading=new Set<number>();let serial=0,paintId=0,pickId=0;
  const sources=$derived(dense?[inspected]:selected);
  const rows=$derived(sources.flatMap(source=>{const row=prepared.get(source);return row?[row]:[];}));
  const maximum=$derived(Math.max(1,...(report.telemetry?.finish_seconds??[report.elapsed_seconds.at(-1)??1])));
  const window=$derived([maximum*zoom[0]!/100,maximum*zoom[1]!/100]);
  const grid=$derived({left:44,right:width<600?68:88,top:24,bottom:32});
  const ranges=$derived([0,1,2].map(k=>{
    if(k===1)return [0,100];
    const step=k===0?5:10,high=Math.max(step,...selected.map(source=>prepared.get(source)?.ranges[k]?.[1]??0));return [0,Math.ceil(high*1.05/step)*step];
  }));
  function send(kind:'prepare'|'render'|'pick',source:number,data:Record<string,unknown>,transfer:Transferable[]=[]){const id=++serial;requests.set(id,{kind,source});worker!.postMessage({id,source,...$state.snapshot(data)},transfer);return id;}
  onMount(()=>{
    worker=new Worker(new URL('./simulation-report.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=e=>{
      const message=e.data,request=requests.get(message.id);if(!request){message.bitmap?.close();return;}requests.delete(message.id);
      if(message.error){error=message.error;loading.delete(request.source);pending=false;return;}
      if(request.kind==='prepare'){
        loading.delete(request.source);const next=new Map(prepared);next.set(request.source,message.prepared);
        if(next.size>4)next.delete(next.keys().next().value!);prepared=next;
      }else if(request.kind==='render'){
        if(message.id===paintId){if(canvas&&dense){canvas.width=message.bitmap.width;canvas.height=message.bitmap.height;canvas.getContext('2d')!.drawImage(message.bitmap,0,0);}pending=false;}message.bitmap.close();
      }else if(message.id===pickId){picked=message.picked;pickedLines=message.lines;}
    };
    worker.onerror=()=>error='Could not prepare the graph. Reload the results to retry.';
  });
  onDestroy(()=>worker?.terminate());
  $effect(()=>{
    if(!worker||!report.telemetry)return;
    for(const source of selected)if(!prepared.has(source)&&!loading.has(source)){
      loading.add(source);const subset=subsetTelemetry(report,source);
      send('prepare',source,{prepareTelemetry:true,report:subset,maxHp:result.max_hp!.map(row=>row[source]!)},subset.telemetry!.columns.map(c=>c.buffer as ArrayBuffer));
    }
  });
  $effect(()=>{inspected;dense;picked=-1;pickedLines=[];});
  $effect(()=>{
    if(!dense||!prepared.has(inspected)||!worker||!width)return;
    pending=true;error='';paintId=send('render',inspected,{renderTelemetry:true,width,height,ratio:devicePixelRatio||1,grid,window,ranges,enabled,color:runnerColor(inspected)});
  });
  $effect(()=>onwindow?.(window[0]!,window[1]!));
  function size(node:HTMLDivElement){let frame=0;const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{width=node.clientWidth;height=expanded?Math.max(300,node.clientHeight):320;});});observer.observe(node);return {destroy:()=>{observer.disconnect();cancelAnimationFrame(frame);}};}
  function click(x:number,y:number){
    if(!dense||!worker||!prepared.has(inspected))return;
    const time=window[0]!+(x-grid.left)/(width-grid.left-grid.right)*(window[1]!-window[0]!);
    pickId=send('pick',inspected,{pickTelemetry:true,time,y,height,grid,ranges,enabled});
  }
  const option=$derived.by(():EChartsCoreOption=>{
    const dark=$theme==='dark',color=dark?'#abb4c3':'#566071',border=dark?'#303238':'#dce1e6';
    const series:Record<string,unknown>[]=[];
    for(const row of rows)for(let k=0;k<3;k++)if(enabled[k]){
      if(row.source===focus||dense){
        series.push({name:'lower',type:'line',yAxisIndex:k,showSymbol:false,silent:true,stack:'range-'+row.source+'-'+k,stackStrategy:'all',lineStyle:{opacity:0},tooltip:{show:false},data:row.seconds.map((t,i)=>[t,row.bands[i]?.[k]?.[4]?row.bands[i]![k]![1]:null])},
          {name:'spread',type:'line',yAxisIndex:k,showSymbol:false,silent:true,stack:'range-'+row.source+'-'+k,stackStrategy:'all',lineStyle:{opacity:0},areaStyle:{color:runnerColor(row.source),opacity:.035},tooltip:{show:false},data:row.seconds.map((t,i)=>[t,row.bands[i]?.[k]?.[4]?row.bands[i]![k]![3]-row.bands[i]![k]![1]:null])});
      }
      const data=row.seconds.map((t,i)=>[t,row.bands[i]?.[k]?.[4]?row.bands[i]![k]![0]:null]);
      series.push({name:umas[row.source]!.name+' · '+labels[k],type:'line',yAxisIndex:k,showSymbol:false,lineStyle:{color:runnerColor(row.source),width:2,type:styles[k]},itemStyle:{color:runnerColor(row.source)},data:data.map(p=>p[0]!<=row.firstFinish?p:[p[0],null]),
        markLine:k===0?{silent:true,symbol:'none',lineStyle:{color:runnerColor(row.source),opacity:.25},label:{show:false},data:[{xAxis:row.firstFinish}]}:undefined});
      series.push({name:'Unfinished runs · '+umas[row.source]!.name+' · '+labels[k],type:'line',yAxisIndex:k,showSymbol:false,lineStyle:{color:runnerColor(row.source),width:1.5,opacity:.6,type:styles[k]},itemStyle:{color:runnerColor(row.source)},data:data.map(p=>p[0]!>=Math.floor(row.firstFinish)?p:[p[0],null])});
    }
    if(dense&&picked>=0)for(let k=0;k<3;k++)if(enabled[k])series.push({name:'Selected race · '+labels[k],type:'line',yAxisIndex:k,showSymbol:false,lineStyle:{color:runnerColor(inspected),width:3,type:styles[k]},data:pickedLines[k]});
    return {animation:false,textStyle:{fontFamily:'inherit',color},grid,tooltip:{trigger:'axis',axisPointer:{type:'line'},backgroundColor:dark?'#202226':'#fff',borderColor:border,textStyle:{color},formatter:(params:unknown)=>{
      const time=Number((params as {axisValue:number}[])[0]?.axisValue??0),node=document.createElement('div');
      const heading=document.createElement('strong');heading.textContent=n(time,1)+' s';node.append(heading);
      for(const row of rows){const at=Math.min(row.seconds.length-1,Math.round(time)),bands=row.bands[at]!;const line=document.createElement('div');line.style.color=runnerColor(row.source);line.textContent=umas[row.source]!.name+' · '+bands[0]![4]+'/'+result.runs+' still racing';node.append(line);
        for(let k=0;k<3;k++)if(enabled[k]){const reading=document.createElement('div');const b=bands[k]!;reading.textContent=labels[k]+': '+(b[4]?n(b[0],k===1?1:2)+' '+units[k]+' · middle 80% '+n(b[1],1)+'–'+n(b[3],1):'Finished');node.append(reading);}
      }return node;
    }},xAxis:{type:'value',min:0,max:maximum,axisLabel:{color,fontSize:10,hideOverlap:true,formatter:(value:number)=>n(value,0)+' s'},splitLine:{show:false},axisLine:{lineStyle:{color:border}}},
    yAxis:labels.map((label,k)=>({type:'value',min:ranges[k]![0],max:ranges[k]![1],show:enabled[k],position:k===0?'left':'right',offset:k===2?(width<600?32:42):0,name:k===0?'m/s':k===1?'HP %':'Gap m',nameTextStyle:{color,fontSize:10},splitNumber:4,axisLabel:{color,fontSize:9,hideOverlap:true,formatter:(value:number)=>n(value,0)},splitLine:{show:k===0,lineStyle:{color:border}}})),
    dataZoom:[{type:'inside',start:zoom[0],end:zoom[1],zoomOnMouseWheel:'ctrl',moveOnMouseWheel:false}],series:series as EChartsCoreOption['series']};
  });
</script>

<ChartFrame id="simulation-telemetry" title="Speed, HP and position" plain compact expandable maximize bind:expanded>
  {#snippet actions()}
    <div class="metric-controls">{#each labels as label,k}<ToggleButton icon={k===0?'activity':k===1?'heart':'race'} label={k===1?'HP':k===2?'Position':label} pressed={enabled[k]!} onclick={()=>{if(enabled.filter(Boolean).length>1||!enabled[k])enabled=enabled.map((v,i)=>i===k?!v:v);}}/>{/each}
    <Button size="sm" variant="secondary" ariaLabel={dense?'Compare mean curves':'Show every sampled run for '+umas[inspected]!.name} onclick={()=>dense=!dense}>{dense?'Compare means':'Show runs'}</Button>
    <Button size="sm" variant="ghost" onclick={()=>zoom=[0,100]}>Reset zoom</Button></div>
  {/snippet}
  <div class="telemetry-plot" class:expanded aria-busy={rows.length!==sources.length||pending} bind:this={host} use:size style:--height={`${height}px`}>
    {#if dense}<canvas bind:this={canvas} aria-hidden="true"></canvas>{/if}
    <LazyEChartsSurface {option} label="Combined mean speed, HP percentage and gap to the actual leader" {height} zoomable onplotclick={click} onzoom={(start,end)=>zoom=[start,end]}/>
  </div>
  <div class="telemetry-key"><span>━ Speed · ┄ HP · ⋯ Gap to leader</span><span>{dense?result.runs+' runs · '+umas[inspected]!.name:'Mean curves · '+result.runs+' races'}{pending?' · drawing curves…':''}</span></div>
  {#if picked>=0}<div class="picked-race"><span><strong>Race {picked+1}</strong> · seed {result.seeds[picked]} · {umas[inspected]!.name}: place {result.finish_order[picked]!.indexOf(inspected)+1}, {n(result.finish_times[picked]![inspected],3)} s</span><Button variant="secondary" size="sm" onclick={()=>onreplay(picked)}>Open race</Button></div>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !rows.length}<p role="status">Preparing the comparison…</p>{/if}
</ChartFrame>
<p class="telemetry-note">1 s observations · curves stop at their own finish. Lighter tails average the remaining unfinished runs; hover for counts. Ctrl + scroll, pinch or keyboard to zoom.</p>
<style>
  .telemetry-plot{position:relative;min-width:0;height:var(--height)}.telemetry-plot.expanded{flex:1;height:auto;min-height:300px}.telemetry-plot canvas{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.metric-controls{display:flex;gap:4px;align-items:center;flex-wrap:wrap}.metric-controls :global(button){font-size:11px;min-height:30px}.telemetry-key{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary)}.telemetry-note{font-size:10px;color:var(--text-secondary);margin:6px 0 0;line-height:1.5}.picked-race{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;padding-top:6px}.telemetry-plot :global(figure){position:relative}.telemetry-plot :global(.placeholder){background:transparent}
  @media(max-width:600px){.picked-race{flex-wrap:wrap}.metric-controls{gap:2px}.telemetry-note{font-size:10px}}
</style>
