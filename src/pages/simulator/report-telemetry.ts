import type {MonteCarloResult} from './simulator-repository';
import type {ReportBand,ReportTelemetry,SimulationReport} from './simulation-report';
import {simulatorSampleSummary} from './simulator-results';

export interface RunnerTelemetry {source:number;runs:number;seconds:number[];bands:ReportBand[][];ranges:[number,number][];firstFinish:number;curves:Float32Array[];offsets:number[];finish:number[];}
export function telemetrySample(t:ReportTelemetry,curve:number,time:number,metric:number):number {
  const start=t.offsets[curve]!,end=t.offsets[curve+1]!,finish=t.finish_seconds[curve]!;
  if(time>=finish)return t.finish_values[curve]![metric]!;
  const left=Math.min(end-start-1,Math.floor(time)),a=t.columns[metric]![start+left]!;
  const next=left+1,endTime=next<end-start?next:finish,b=next<end-start?t.columns[metric]![start+next]!:t.finish_values[curve]![metric]!;
  return a+(b-a)*(time-left)/Math.max(Number.EPSILON,endTime-left);
}
/** Max each actual field first; independent runner means cannot reconstruct its leader. */
export function telemetryLeaders(report:SimulationReport):Float32Array {
  const t=report.telemetry!,length=report.elapsed_seconds.length,result=new Float32Array(report.samples*length);
  for(let run=0;run<report.samples;run++)for(let at=0;at<length;at++)for(let source=0;source<report.runners.length;source++){
    const distance=telemetrySample(t,source*report.samples+run,at,0),index=run*length+at;
    if(distance>result[index]!)result[index]=distance;
  }
  return result;
}
export function prepareRunnerTelemetry(report:SimulationReport,source:number,maxHp:number[]):RunnerTelemetry {
  const t=report.telemetry!,runs=report.samples,start=source*runs,seconds=report.elapsed_seconds,curves:Float32Array[]=[],offsets=[0],finish=t.finish_seconds.slice(start,start+runs);
  const values:number[][]=[[],[],[]],ranges:[number,number][]=[[Infinity,-Infinity],[0,100],[0,0]];
  for(let metric=0;metric<3;metric++){
    const column:number[]=[];
    for(let run=0;run<runs;run++){
      const curve=start+run,end=finish[run]!;
      for(let at=0;at<Math.ceil(end);at++){
        const v=metric===0?telemetrySample(t,curve,at,2):metric===1?Math.max(0,Math.min(100,telemetrySample(t,curve,at,3)/maxHp[run]!*100)):Math.max(0,t.leaders![run*seconds.length+at]!-telemetrySample(t,curve,at,0));
        column.push(v);ranges[metric]![0]=Math.min(ranges[metric]![0],v);ranges[metric]![1]=Math.max(ranges[metric]![1],v);
      }
      column.push(metric===0?t.finish_values[curve]![2]!:metric===1?Math.max(0,Math.min(100,t.finish_values[curve]![3]!/maxHp[run]!*100)):0);
      if(metric===0)offsets.push(column.length);
    }
    curves.push(Float32Array.from(column));
  }
  const bands=seconds.map(time=>{
    values.forEach(v=>v.length=0);
    for(let run=0;run<runs;run++)if(time<=finish[run]!){
      const curve=start+run;
      values[0]!.push(telemetrySample(t,curve,time,2));
      values[1]!.push(Math.max(0,Math.min(100,telemetrySample(t,curve,time,3)/maxHp[run]!*100)));
      values[2]!.push(Math.max(0,t.leaders![run*seconds.length+time]!-telemetrySample(t,curve,time,0)));
    }
    return values.map(v=>{const s=simulatorSampleSummary(v);return s?[s.mean,s.p10,s.median,s.p90,s.count] as ReportBand:[0,0,0,0,0] as ReportBand;});
  });
  return {source,runs,seconds,bands,ranges,firstFinish:Math.min(...finish),curves,offsets,finish};
}
export function subsetTelemetry(report:SimulationReport,source:number):SimulationReport {
  const t=report.telemetry!,start=source*report.samples,end=start+report.samples,low=t.offsets[start]!,high=t.offsets[end]!;
  return {version:2,clock:report.clock,units:report.units,samples:report.samples,distance_m:[],elapsed_seconds:report.elapsed_seconds,runners:[],crossing_times:[],spatial:[],spatial_coverage:0,
    telemetry:{interval_seconds:1,offsets:t.offsets.slice(start,end+1).map(v=>v-low),finish_seconds:t.finish_seconds.slice(start,end),finish_values:t.finish_values.slice(start,end),columns:t.columns.map(c=>c.slice(low,high)),leaders:t.leaders}};
}
export function promptSpurtRate(result:MonteCarloResult,source:number):number|undefined {
  const rows=result.report?.runners.find(r=>r.source_input_index===source)?.diagnostics;
  if(!rows||!result.last_spurt_decisions)return;
  return rows.filter((d,i)=>result.last_spurt_decisions![i]![source]===1&&d.spurt_start_m!=null&&result.spurt_calculation_distances?.[i]?.[source]?.[0]!=null&&d.spurt_start_m<=result.spurt_calculation_distances[i]![source]![0]!+.001).length/result.runs*100;
}
