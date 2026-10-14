import type { MonteCarloResult } from '../simulator-repository';
import { simulatorSampleSummary } from '../simulator-results';
import {resolveEncodedSkill,skillRarity,type SkillCatalogEntry} from '@/lib/catalog/skill-catalog';
import type { SimulatorUma } from '../simulator-uma';
import type { SkillDistributionRow } from './skills/skill-distributions';

/** Mean, p10, median, p90, sample count. Lateral measurements are metres from the inner rail. */
export type ReportBand = [number, number, number, number, number];
export interface ReportDiagnostic {
  start_delay_seconds:number; gate:number; start_dash_end_seconds:number|null;
  mid_place:number|null; late_place:number|null; blocked_seconds:number; rushed_seconds:number;
  downhill_seconds:number; spot_struggle_seconds:number; duel_seconds:number;
  mode_seconds_by_phase:number[][]; spurt_start_m:number|null; spurt_target_speed_mps:number|null;
  spurt_onset_seconds?:number|null; full_spurt_target_speed_mps?:number|null;
  spurt_acceleration_seconds:number|null; exhausted_at:[number,number]|null; rng_cursor:number;
  hp_applications:{time:number;skillId:number;casterHorseIndex:number;targetHorseIndex:number;requestedHpDelta:number;appliedHpDelta:number}[];
  skill_checks?:[number,number,[number,number,number]][];
}
export interface SimulationReport {
  version:1|2; clock:'simulation_elapsed'; units:string[]; samples:number;
  distance_m:number[]; elapsed_seconds:number[];
  runners:{source_input_index:number;distance:ReportBand[][];elapsed:ReportBand[][];
    diagnostics:ReportDiagnostic[];skill_checks?:[number,number,[number,number,number]][];representative_runs:[number,number,number]}[];
  crossing_times:number[][][]|Float32Array; crossing_shape?:[number,number,number];
  spatial:{run_index:number;trajectories:number[][][]}[]; spatial_coverage:number;
  telemetry?:ReportTelemetry;
}
export interface ReportTelemetry {interval_seconds:number;offsets:number[];finish_seconds:number[];finish_values:number[][];columns:Float32Array[];leaders?:Float32Array;}
export interface BuildComparison {
  version:1; source_input_index:number; alternatives:[string,MonteCarloResult][];
}
/**
 * One colour per runner, by input slot. The first eight are distinct hues ordered so neighbours stay apart under colour-blindness,
 * and every one clears 3:1 against both the dark and light chart surfaces (checked with the dataviz palette validator).
 * Slots 9–18 are a second ring of hues; runners always carry their portrait and name as well, so colour is never the only cue.
 */
export const RUNNER_COLORS=['#3a86e0','#e2672d','#17a673','#c08000','#df5f90','#3c9a3c','#8173e6','#e0524f','#1d9db5','#b06a2a','#b259bb','#7d9c18','#5a6fd0','#c25479','#8f8a1c','#3a98cc','#d26f4f','#9a7fd8'];
export const runnerColor=(source:number)=>RUNNER_COLORS[source%RUNNER_COLORS.length]!;
export function reportNumber(value:number|null|undefined,digits=2) {return value==null||!Number.isFinite(value)?'—':value.toFixed(digits);}
export function reportMean(values:(number|null|undefined)[]) {const finite=values.filter((v):v is number=>v!=null&&Number.isFinite(v));return finite.length?finite.reduce((a,b)=>a+b,0)/finite.length:undefined;}

/** Positive values mean seconds gained by the compared runner at the same distance. */
export function pairedProgression(report:SimulationReport,reference:number,source:number):ReportBand[] {
  return report.distance_m.map((_,point)=>{
    const s=simulatorSampleSummary(Array.from({length:report.samples},(_,run)=>reportCrossing(report,run,reference,point)-reportCrossing(report,run,source,point)));
    return s?[s.mean,s.p10,s.median,s.p90,s.count]:[0,0,0,0,0];
  });
}
/** Matched seeds control the setup; native RNG draws may diverge after the build changes. */
export function compareOutcomes(baseline:MonteCarloResult,alternative:MonteCarloResult,source:number) {
  if(baseline.engine_build!==alternative.engine_build || alternative.seeds.some((seed,i)=>baseline.seeds[i]!==seed))throw new Error('The comparison engine or seed mapping changed. Run the main simulation again.');
  const gains=alternative.finish_times.map((row,i)=>baseline.finish_times[i]![source]!-row[source]!);
  const s=simulatorSampleSummary(gains)!;
  const win=(r:MonteCarloResult)=>r.finish_order.filter(row=>row[0]===source).length/r.runs*100;
  const spurt=(r:MonteCarloResult)=>r.last_spurt_decisions?.filter(row=>row[source]===1).length;
  const margin=s.count>1?1.96*s.sd/Math.sqrt(s.count):undefined;
  return {...s, interval:margin===undefined?undefined:[s.mean-margin,s.mean+margin],winChange:win(alternative)-win({...baseline,runs:alternative.runs,finish_order:baseline.finish_order.slice(0,alternative.runs)}),
    spurtChange:spurt(alternative)==null||spurt(baseline)==null?undefined:(spurt(alternative)!-baseline.last_spurt_decisions!.slice(0,alternative.runs).filter(row=>row[source]===1).length)/alternative.runs*100};
}

export function prioritySkills(uma:SimulatorUma,rows:SkillDistributionRow[],catalog:Map<number,SkillCatalogEntry>,distance:number,result?:MonteCarloResult) {
  return rows.map(row=>{
    const resolved=resolveEncodedSkill(catalog,row.id),skill=resolved.skill;
    const rarity=skillRarity(skill,resolved.inherited),unique=rarity==='unique-main'||rarity==='unique-inherited';
    const owned=rarity==='unique-main'&&uma.skills.some(s=>s.skillId===row.id);
    const effects=row.procs.flatMap(({run,proc})=>result?.skill_procs?.[run]?.effects.slice(proc[8],proc[8]+proc[9])??[]);
    const reason=owned?'Owned unique':effects.some(e=>e[1]===10||e[1]===14)?'Start consistency':effects.some(e=>e[1]===9&&e[3]>0)?'HP and spurt feasibility':effects.some(e=>e[3]<0&&e[2]!==0)?'Opponent interference':effects.some(e=>e[1]===31)?'Acceleration window':unique?'Inherited unique':skill?.rarity===2?'Gold skill':'Activation observations';
    return {...row, reason, owned, level:uma.skills.find(s=>s.skillId===row.id)?.level??1,
      priority:owned?100:reason==='Start consistency'?90:reason==='HP and spurt feasibility'?85:reason==='Opponent interference'?80:reason==='Acceleration window'?75:unique?70:skill?.rarity===2?60:20};
  }).sort((a,b)=>b.priority-a.priority||b.total-a.total||a.id-b.id);
}

export function validateReport(value:unknown,runs:number,count:number):value is SimulationReport {
  const r=value as SimulationReport;
  const numbers=(v:unknown):v is number[]=>Array.isArray(v)&&v.every(Number.isFinite);
  const ordered=(v:number[])=>v.every((n,i)=>n>=0&&(i===0||n>v[i-1]!));
  const checks=(v:unknown)=>Array.isArray(v)&&v.length<=65535&&v.every(c=>Array.isArray(c)&&c.length===3&&Number.isSafeInteger(c[0])&&c[0]>=0&&Number.isSafeInteger(c[1])&&c[1]>=0&&numbers(c[2])&&c[2].length===3&&c[2].every(n=>Number.isSafeInteger(n)&&n>=0));
  const diagnostic=(d:ReportDiagnostic)=>{
    if(!d||!['start_delay_seconds','blocked_seconds','rushed_seconds','downhill_seconds','spot_struggle_seconds','duel_seconds','gate','rng_cursor'].every(k=>Number.isFinite(d[k as keyof ReportDiagnostic])))return false;
    if(!Number.isInteger(d.gate)||d.gate<1||d.gate>count||!Number.isSafeInteger(d.rng_cursor)||d.rng_cursor<0)return false;
    if(!Array.isArray(d.mode_seconds_by_phase)||d.mode_seconds_by_phase.length!==4||!d.mode_seconds_by_phase.every(p=>numbers(p)&&p.length===5&&p.every(n=>n>=0)))return false;
    if(!['start_dash_end_seconds','spurt_start_m','spurt_target_speed_mps','spurt_acceleration_seconds','spurt_onset_seconds','full_spurt_target_speed_mps'].every(k=>d[k as keyof ReportDiagnostic]==null||Number.isFinite(d[k as keyof ReportDiagnostic])))return false;
    if(![d.mid_place,d.late_place].every(p=>p===null||Number.isInteger(p)&&p!>=1&&p!<=count))return false;
    if(d.exhausted_at!==null&&(!numbers(d.exhausted_at)||d.exhausted_at.length!==2))return false;
    if(d.skill_checks!==undefined&&!checks(d.skill_checks))return false;
    return Array.isArray(d.hp_applications)&&d.hp_applications.every(a=>a&&['time','skillId','casterHorseIndex','targetHorseIndex','requestedHpDelta','appliedHpDelta'].every(k=>Number.isFinite(a[k as keyof typeof a]))&&[a.casterHorseIndex,a.targetHorseIndex].every(i=>Number.isInteger(i)&&i>=0&&i<count));
  };
  if(!r||![1,2].includes(r.version)||r.clock!=='simulation_elapsed'||r.samples!==runs||!Array.isArray(r.units)||r.units.join('|')!=='s|m/s|m/s|m/s²|HP|m'||!numbers(r.distance_m)||r.distance_m.length<2||r.distance_m.length>128||!ordered(r.distance_m)||!numbers(r.elapsed_seconds)||r.elapsed_seconds.length<1||r.elapsed_seconds.length>1400||!ordered(r.elapsed_seconds))return false;
  if(!Array.isArray(r.runners)||r.runners.length!==count||new Set(r.runners.map(s=>s.source_input_index)).size!==count)return false;
  const bands=(v:unknown,size:number,metrics:number)=>Array.isArray(v)&&v.length===size&&v.every(p=>Array.isArray(p)&&p.length===metrics&&p.every(b=>numbers(b)&&b.length===5&&b[4]!>=0&&b[4]!<=runs));
  if(!r.runners.every(s=>Number.isInteger(s.source_input_index)&&s.source_input_index>=0&&s.source_input_index<count&&bands(s.distance,r.distance_m.length,6)&&bands(s.elapsed,r.elapsed_seconds.length,4)&&Array.isArray(s.diagnostics)&&s.diagnostics.length===runs&&s.diagnostics.every(diagnostic)&&(s.skill_checks===undefined||checks(s.skill_checks))&&numbers(s.representative_runs)&&s.representative_runs.length===3&&s.representative_runs.every(i=>Number.isInteger(i)&&i>=0&&i<runs)))return false;
  if(r.crossing_times instanceof Float32Array) {
    if(!r.crossing_shape||r.crossing_shape[0]!==runs||r.crossing_shape[1]!==count||r.crossing_shape[2]!==r.distance_m.length||r.crossing_times.length!==runs*count*r.distance_m.length||!r.crossing_times.every(Number.isFinite))return false;
  } else if(!Array.isArray(r.crossing_times)||r.crossing_times.length!==runs||!r.crossing_times.every(run=>Array.isArray(run)&&run.length===count&&run.every(row=>numbers(row)&&row.length===r.distance_m.length)))return false;
  if(r.version===2) {
    const t=r.telemetry,size=runs*count;
    if(!r.elapsed_seconds.every((second,i)=>second===i))return false;
    if(!t||t.interval_seconds!==1||!numbers(t.offsets)||t.offsets.length!==size+1||t.offsets[0]!==0||!t.offsets.every((v,i)=>Number.isSafeInteger(v)&&v>=0&&(i===0||v>t.offsets[i-1]!))||!numbers(t.finish_seconds)||t.finish_seconds.length!==size||!t.finish_seconds.every((v,i)=>v>0&&v<=1400&&(t.offsets[i+1]!-t.offsets[i]!)===Math.ceil(v))||!Array.isArray(t.finish_values)||t.finish_values.length!==size||!t.finish_values.every(v=>numbers(v)&&v.length===4)||!Array.isArray(t.columns)||t.columns.length!==4||!t.columns.every(c=>c instanceof Float32Array&&c.length===t.offsets.at(-1)&&c.every(Number.isFinite)))return false;
  }
  return Array.isArray(r.spatial)&&r.spatial.length<=32&&r.spatial.length===r.spatial_coverage&&r.spatial.every(s=>Number.isInteger(s.run_index)&&s.run_index>=0&&s.run_index<runs&&Array.isArray(s.trajectories)&&s.trajectories.length===count&&s.trajectories.every(t=>Array.isArray(t)&&t.length>0&&t.length<=r.elapsed_seconds.length&&t.every(p=>numbers(p)&&p.length===4)));
}

export const DIAGNOSTIC_FIELDS=['start_delay_seconds','gate','start_dash_end_seconds','mid_place','late_place','blocked_seconds','rushed_seconds','downhill_seconds','spot_struggle_seconds','duel_seconds','mode_seconds_by_phase','spurt_start_m','spurt_onset_seconds','spurt_target_speed_mps','full_spurt_target_speed_mps','spurt_acceleration_seconds','exhausted_at','hp_applications','rng_cursor'] as const;

/** Expand only the small diagnostic records; keep large crossing columns in float32 storage. */
export function normalizeReportResponse(value:unknown):unknown {
  if(!value||typeof value!=='object')return value;
  const root=value as {report?:Record<string,unknown>};
  const r=root.report;
  if(!r)return value;
  const shape=r.crossing_shape;
  if(r.crossing_times instanceof Uint8Array||Array.isArray(shape)) {
    if(!Array.isArray(shape)||shape.length!==3||!shape.every(Number.isInteger)||shape[0]<1||shape[0]>1000||shape[1]<2||shape[1]>18||shape[2]<2||shape[2]>128)throw new Error('Invalid report crossing shape.');
    const size=shape[0]*shape[1]*shape[2],raw=r.crossing_times;
    if(raw instanceof Uint8Array) {
      if(raw.byteLength!==size*4)throw new Error('Truncated report crossing data.');
      const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),points=new Float32Array(size);
      for(let i=0;i<size;i++)points[i]=view.getFloat32(i*4,true);
      r.crossing_times=points;
    } else if(Array.isArray(raw)&&raw.length===size&&raw.every(Number.isFinite))r.crossing_times=Float32Array.from(raw);
    else if(!(raw instanceof Float32Array&&raw.length===size))throw new Error('Invalid report crossing data.');
  }
  const telemetry=r.telemetry as Record<string,unknown>|undefined;
  if(telemetry) {
    if(!Array.isArray(telemetry.columns)||telemetry.columns.length!==4)throw new Error('Invalid trajectory columns.');
    telemetry.columns=telemetry.columns.map(raw=>{
      if(raw instanceof Float32Array)return raw;
      if(raw instanceof Uint8Array) {
        if(raw.byteLength%4)throw new Error('Truncated trajectory data.');
        const data=new Float32Array(raw.byteLength/4),view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);
        for(let i=0;i<data.length;i++)data[i]=view.getFloat32(i*4,true);
        return data;
      }
      if(Array.isArray(raw)&&raw.every(Number.isFinite))return Float32Array.from(raw);
      throw new Error('Invalid trajectory data.');
    });
  }
  if(Array.isArray(r.runners))for(const runner of r.runners as Record<string,unknown>[]) {
    if(!Array.isArray(runner.diagnostics))continue;
    runner.diagnostics=runner.diagnostics.map(row=>{
      if(!Array.isArray(row))return row;
      const fields=r.diagnostic_fields;
      if(!Array.isArray(fields)||fields.length!==DIAGNOSTIC_FIELDS.length||fields.some((f,i)=>f!==DIAGNOSTIC_FIELDS[i])||row.length!==fields.length)throw new Error('Incompatible report diagnostic fields.');
      const record=Object.fromEntries(fields.map((field,i)=>[field,row[i]]));
      if(!Array.isArray(record.hp_applications))throw new Error('Invalid report HP records.');
      record.hp_applications=record.hp_applications.map((a:unknown)=>{
        if(!Array.isArray(a)||a.length!==6||!a.every(Number.isFinite))throw new Error('Invalid report HP application.');
        return {time:a[0],skillId:a[1],casterHorseIndex:a[2],targetHorseIndex:a[3],requestedHpDelta:a[4],appliedHpDelta:a[5]};
      });
      return record;
    });
  }
  return value;
}
export function reportCrossing(report:SimulationReport,run:number,source:number,point:number):number {
  return report.crossing_times instanceof Float32Array
    ?report.crossing_times[(run*report.crossing_shape![1]+source)*report.distance_m.length+point]!
    :report.crossing_times[run]![source]![point]!;
}

/** Transfer proc columns without cloning hundreds of thousands of tiny numeric arrays. */
export function packReportTraces(value:unknown):ArrayBuffer[] {
  const root=value as {report?:unknown;skill_procs?:{activations:number[][]|Float64Array;effects:number[][]|Float64Array}[]};
  if(!root?.report||!root.skill_procs)return [];
  const buffers:ArrayBuffer[]=[];
  for(const [key,width] of [['activations',10],['effects',4]] as const) {
    const flat=new Float64Array(root.skill_procs.reduce((sum,trace)=>sum+(trace[key] as number[][]).length*width,0));
    let offset=0;
    for(const trace of root.skill_procs) {
      const rows=trace[key] as number[][],end=offset+rows.length*width;
      rows.forEach((row,i)=>flat.set(row,offset+i*width));
      trace[key]=flat.subarray(offset,end);offset=end;
    }
    buffers.push(flat.buffer as ArrayBuffer);
  }
  return buffers;
}
export async function expandReportTraces(value:unknown):Promise<void> {
  const root=value as {report?:unknown;skill_procs?:{activations:number[][]|Float64Array;effects:number[][]|Float64Array}[]};
  if(!root?.report||!root.skill_procs)return;
  const scheduler=(globalThis as unknown as {scheduler?:{yield:()=>Promise<void>}}).scheduler;
  for(const [index,trace] of root.skill_procs.entries()){
    for(const [key,width] of [['activations',10],['effects',4]] as const){
      const flat=trace[key];
      if(!(flat instanceof Float64Array))continue;
      trace[key]=Array.from({length:flat.length/width},(_,i)=>flat.subarray(i*width,(i+1)*width) as unknown as number[]);
    }
    if((index+1)%32===0)await (scheduler?scheduler.yield():new Promise<void>(resolve=>setTimeout(resolve,0)));
  }
}


