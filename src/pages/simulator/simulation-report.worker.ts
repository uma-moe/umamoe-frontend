import { decode } from '@msgpack/msgpack';
import { normalizeReportResponse, packReportTraces, pairedProgression, type SimulationReport } from './simulation-report';
import {validateSimulatorResponse} from './simulator-response';
import {telemetryLeaders,prepareRunnerTelemetry,type RunnerTelemetry} from './report-telemetry';
let progressionReport:SimulationReport;
const pairedCache=new Map<string,ReturnType<typeof pairedProgression>>();
const telemetryCache=new Map<number,RunnerTelemetry>();
self.onmessage=(event:MessageEvent)=>{
  const {id,bytes,report,reference,sources,initialize,validation}=event.data;
  try {
    if(event.data.prepareTelemetry){
      const prepared=prepareRunnerTelemetry(report,0,event.data.maxHp);prepared.source=event.data.source;
      telemetryCache.set(prepared.source,prepared);
      if(telemetryCache.size>4)telemetryCache.delete(telemetryCache.keys().next().value!);
      self.postMessage({id,prepared:{...prepared,curves:[]}});return;
    }
    if(event.data.renderTelemetry){
      const p=event.data,r=telemetryCache.get(p.source)!;
      if(!r)throw new Error('Runner curves were released. Inspect this runner again.');
      const {width,height,ratio,grid,window,ranges,enabled,color}=p;
      const canvas=new OffscreenCanvas(Math.round(width*ratio),Math.round(height*ratio)),ctx=canvas.getContext('2d')!;
      ctx.scale(ratio,ratio);ctx.beginPath();ctx.rect(grid.left,grid.top,width-grid.left-grid.right,height-grid.top-grid.bottom);ctx.clip();
      const x=(v:number)=>grid.left+(v-window[0])/(window[1]-window[0])*(width-grid.left-grid.right);
      const y=(v:number,k:number)=>height-grid.bottom-(v-ranges[k][0])/(ranges[k][1]-ranges[k][0])*(height-grid.top-grid.bottom);
      ctx.strokeStyle=color;ctx.lineWidth=.8;ctx.globalAlpha=Math.max(.004,.14/Math.sqrt(r.runs));
      for(let k=0;k<3;k++)if(enabled[k]){
        ctx.setLineDash(k===0?[]:k===1?[5,3]:[1,3]);
        for(let run=0;run<r.runs;run++){
          ctx.beginPath();let started=false;
          for(let j=r.offsets[run]!;j<r.offsets[run+1]!;j++){
            const time=j===r.offsets[run+1]!-1?r.finish[run]!:j-r.offsets[run]!;
            if(time<window[0]-1||time>window[1]+1)continue;
            const px=x(time),py=y(r.curves[k]![j]!,k);started?ctx.lineTo(px,py):ctx.moveTo(px,py);started=true;
          }ctx.stroke();
        }
      }
      const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap},{transfer:[bitmap]});return;
    }
    if(event.data.pickTelemetry){
      const p=event.data,r=telemetryCache.get(p.source)!;let best=-1,distance=8;
      for(let run=0;run<r.runs;run++)if(p.time<=r.finish[run]!){
        const at=Math.floor(p.time),left=r.offsets[run]!+at,right=Math.min(left+1,r.offsets[run+1]!-1),endTime=right===r.offsets[run+1]!-1?r.finish[run]!:at+1;
        for(let k=0;k<3;k++)if(p.enabled[k]){
          const a=r.curves[k]![left]!,b=r.curves[k]![right]!,value=a+(b-a)*(p.time-at)/Math.max(Number.EPSILON,endTime-at);
          const y=p.height-p.grid.bottom-(value-p.ranges[k][0])/(p.ranges[k][1]-p.ranges[k][0])*(p.height-p.grid.top-p.grid.bottom),delta=Math.abs(y-p.y);
          if(delta<distance){distance=delta;best=run;}
        }
      }
      const lines=best<0?[]:r.curves.map(column=>Array.from(column.subarray(r.offsets[best],r.offsets[best+1]),(v,j)=>[j===r.offsets[best+1]!-r.offsets[best]!-1?r.finish[best]:j,v]));
      self.postMessage({id,picked:best,lines});return;
    }
    if(initialize){progressionReport=report;pairedCache.clear();return;}
    const value=bytes?normalizeReportResponse(typeof bytes==='string'?JSON.parse(bytes):new Uint8Array(bytes)[0]===123?JSON.parse(new TextDecoder().decode(bytes)):decode(new Uint8Array(bytes))):sources.map((source:number)=>{
      const key=reference+':'+source;
      if(!pairedCache.has(key))pairedCache.set(key,pairedProgression(report??progressionReport,reference,source));
      return pairedCache.get(key);
    });
    if(validation)validateSimulatorResponse(validation.path,validation.body,value);
    if(bytes&&value?.report?.telemetry){value.report.telemetry.leaders=telemetryLeaders(value.report);}
    const transfer=bytes?packReportTraces(value):[];
    const points=value?.report?.crossing_times;
    if(points instanceof Float32Array)transfer.push(points.buffer as ArrayBuffer);
    if(bytes&&value?.report?.telemetry){for(const column of value.report.telemetry.columns)transfer.push(column.buffer);transfer.push(value.report.telemetry.leaders.buffer);}
    self.postMessage({id,value,validated:!!validation},{transfer});
  } catch(error) {self.postMessage({id,error:error instanceof Error?error.message:'Could not process simulation data.'});}
};
