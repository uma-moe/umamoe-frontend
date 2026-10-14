import type { ParsedRaceCapture } from './race-capture-parser';
import { raceFrameAtTime } from './race-replay';

export type DiagnosticRow = Record<string, unknown>;
export interface TimedSpan extends DiagnosticRow { startTime:number; endTime:number; }
export interface HorseDiagnostics extends DiagnosticRow {
  horseIndex:number; spans:(TimedSpan&{mask:number;phase?:number})[];
  frontBlockSpans?: (TimedSpan&{blockerHorseIndex:number})[];
  temptationSpans?: (TimedSpan&{mode:number})[];
  positionKeepReferenceSpans?: (TimedSpan&{referenceHorseIndex:number})[];
  activeSkillSpans?: (TimedSpan&{skillId:number;detailIndex:number})[];
  sampleTimes?:number[]; targetSpeeds?:number[]; accelerationRates?:(number|null)[];
  worldTransformDistanceLoss?:number; startHp?:number; finalHp?:number; maxHp?:number; hpDeficit?:number;
  hpExhaustedTime?:number|null; hpExhaustedDistance?:number|null; rushedFrames?:number;
  lostStartAccelerationFrame?:boolean; finishDistanceToPrevious?:number|null;
  popularity?:number; popularityMarkRankArray?:number[];
  lastSpurtDecision?:DiagnosticRow|null; lastSpurtDecisions?:DiagnosticRow[];
  positionKeepDecisions?:DiagnosticRow[]; baseTargetSpeedSections?:DiagnosticRow[];
  skillActivationDecisions?:DiagnosticRow[]; hpSkillApplications?:DiagnosticRow[];
  temptationDecision?:DiagnosticRow|null;
}
export interface DetailedReplay {
  engineBuild:string; seed:number; replay:{data:string;[key:string]:unknown};
  annotations:{schemaVersion:number;flags:Record<string,number>;sampleTimes?:number[];
    paceMakerSpans?:(TimedSpan&{horseIndex:number})[];horses:HorseDiagnostics[];[key:string]:unknown};
  diagnostics?:DiagnosticRow;
  [key:string]:unknown;
}
const object=(v:unknown):v is DiagnosticRow=>!!v&&typeof v==='object'&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function validateDetailedReplay(value:unknown,count:number):DetailedReplay {
  if(!object(value)||typeof value.engineBuild!=='string'||!Number.isInteger(value.seed)||!object(value.replay)||typeof value.replay.data!=='string'
    ||value.replay.encoding!=='base64'||value.replay.compression!=='gzip'||value.replay.format!=='uma-race-binary'
    ||!object(value.annotations)||!Number.isInteger(value.annotations.schemaVersion)||Number(value.annotations.schemaVersion)<7
    ||!object(value.annotations.flags)||!Object.values(value.annotations.flags).every(v=>Number.isSafeInteger(v)&&Number(v)>0)
    ||!Array.isArray(value.annotations.horses)||value.annotations.horses.length!==count)throw Error('Invalid detailed simulator response.');
  const horses=value.annotations.horses;
  if(new Set(horses.map(h=>object(h)?h.horseIndex:undefined)).size!==count)throw Error('Duplicate simulator runner indices.');
  const times=(v:unknown)=>Array.isArray(v)&&v.every((t,i)=>finite(t)&&(i===0||t>v[i-1]));
  const indices=['horseIndex','blockerHorseIndex','referenceHorseIndex','casterHorseIndex','targetHorseIndex'];
  const check=(v:unknown,key='',depth=0):void=>{
    if(depth>16)throw Error('Simulator diagnostics are nested too deeply.');
    if(typeof v==='number'&&!finite(v))throw Error('Non-finite simulator value.');
    if(key==='sampleTimes'){if(!times(v))throw Error('Invalid simulator sample times.');return;}
    if(Array.isArray(v)){for(const entry of v)check(entry,key,depth+1);return;}
    if(!object(v))return;
    if('startTime' in v&&(!finite(v.startTime)||!finite(v.endTime)||v.endTime<v.startTime))throw Error('Invalid simulator event interval.');
    for(const [k,entry] of Object.entries(v)){
      if(indices.includes(k)&&entry!==null&&(!Number.isInteger(entry)||Number(entry)<-1||Number(entry)>=count))throw Error('Invalid simulator runner reference.');
      check(entry,k,depth+1);
    }
  };
  check(value.annotations);
  const rowLists:Record<string,string[]>={
    spans:['startTime','endTime','mask','phase'],frontBlockSpans:['startTime','endTime','blockerHorseIndex'],
    temptationSpans:['startTime','endTime','mode'],positionKeepReferenceSpans:['startTime','endTime','referenceHorseIndex'],
    activeSkillSpans:['startTime','endTime','skillId','detailIndex'],paceMakerSpans:['startTime','endTime','horseIndex'],
    positionKeepDecisions:['time','sequence','referenceHorseIndex'],baseTargetSpeedSections:['sectionIndex','phase','baseTargetSpeed','random','randomPercentage'],
    lastSpurtDecisions:['time','checkDistance','checkHp','fullSpurtNeedHp','fullSpurtTargetSpeed','selectedStartDistance','selectedTargetSpeed','calculationCount'],
    hpSkillApplications:['time','skillId','casterHorseIndex','targetHorseIndex','requestedHpDelta','appliedHpDelta'],
    skillActivationDecisions:['skillId']
  };
  const checkRows=(record:DiagnosticRow)=>{
    for(const [key,fields] of Object.entries(rowLists))if(record[key]!==undefined){
      const values=record[key];
      if(!Array.isArray(values)||values.some(row=>!object(row)||fields.some(field=>!finite(row[field]))))throw Error('Invalid simulator '+diagnosticLabel(key)+'.');
    }
  };
  checkRows(value.annotations);
  for(const h of horses){
    if(!object(h)||!Number.isInteger(h.horseIndex)||Number(h.horseIndex)<0||Number(h.horseIndex)>=count||!Array.isArray(h.spans))throw Error('Invalid simulator runner annotations.');
    checkRows(h);
    for(const row of (h.skillActivationDecisions??[]) as DiagnosticRow[]){
      if(['required','passed','activated'].some(k=>typeof row[k]!=='boolean')||['roll','threshold'].some(k=>row[k]!==null&&row[k]!==undefined&&!finite(row[k])))throw Error('Invalid skill activation decision.');
    }
    for(const key of ['worldTransformDistanceLoss','startHp','finalHp','maxHp','hpDeficit','rushedFrames','popularity'])
      if(h[key]!==undefined&&!finite(h[key]))throw Error('Invalid simulator '+diagnosticLabel(key)+'.');
    for(const key of ['hpExhaustedTime','hpExhaustedDistance','finishDistanceToPrevious'])
      if(h[key]!==undefined&&h[key]!==null&&!finite(h[key]))throw Error('Invalid simulator '+diagnosticLabel(key)+'.');
    for(const key of ['lastSpurtDecision','temptationDecision'])
      if(h[key]!==undefined&&h[key]!==null&&!object(h[key]))throw Error('Invalid simulator decision.');
    if(h.lostStartAccelerationFrame!==undefined&&typeof h.lostStartAccelerationFrame!=='boolean')throw Error('Invalid start annotation.');
    if(h.popularityMarkRankArray!==undefined&&(!Array.isArray(h.popularityMarkRankArray)||!h.popularityMarkRankArray.every(finite)))throw Error('Invalid popularity marks.');
    const samples=h.sampleTimes??value.annotations.sampleTimes;
    for(const key of ['targetSpeeds','accelerationRates']){
      const values=h[key];
      if(values!==undefined&&(!Array.isArray(values)||!Array.isArray(samples)||values.length!==samples.length||!values.every(v=>v===null||finite(v))))throw Error('Simulator telemetry does not match its sample times.');
    }
  }
  return value as unknown as DetailedReplay;
}
export const diagnosticLabel=(key:string)=>({
  worldTransformDistanceLoss:'Course geometry distance loss (m)',finishDistanceToPrevious:'Gap to previous finisher (m)',
  hpDeficit:'HP shortfall',spans:'Race modes',frontBlockSpans:'Front blocking',positionKeepReferenceSpans:'Position-keep references',
  positionKeepDecisions:'Position-keep decisions',activeSkillSpans:'Skill active periods',hpSkillApplications:'Recovery & HP debuffs',
  skillActivationDecisions:'Skill activation rolls',baseTargetSpeedSections:'Base target speed by section',
  lastSpurtDecisions:'Last-spurt decisions',temptationDecision:'Rushing roll',temptationSpans:'Rushing periods',
  targetSpeeds:'Target speed (m/s)',accelerationRates:'Acceleration (m/s²)',
  blockerHorseIndex:'Blocker',referenceHorseIndex:'Reference runner',casterHorseIndex:'Caster',targetHorseIndex:'Target',horseIndex:'Runner',
  checkHp:'HP at decision',fullSpurtNeedHp:'HP for full spurt',fullSpurtTargetSpeed:'Full spurt speed (m/s)',selectedTargetSpeed:'Selected speed (m/s)',
  selectedStartDistance:'Selected start (m)',checkDistance:'Decision distance (m)',startHp:'Starting HP',finalHp:'Final HP',maxHp:'Maximum HP',
  hpExhaustedTime:'HP exhaustion time (s)',hpExhaustedDistance:'HP exhaustion distance (m)',requestedHpDelta:'Requested HP change',appliedHpDelta:'Applied HP change'
} as Record<string,string>)[key]??key.replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().replace(/\bhp\b/g,'HP').replace(/\bid\b/g,'ID').replace(/^./,c=>c.toUpperCase());

export function activeSpan<T extends TimedSpan>(spans:T[]|undefined,time:number):T|undefined {
  return spans?.find(s=>time>=s.startTime&&time<s.endTime);
}
export function modeDuration(h:HorseDiagnostics|undefined,flags:Record<string,number>|undefined,names:string[],phase?:number) {
  if(!h||!flags)return undefined;
  const mask=names.reduce((n,k)=>n|(flags[k]??0),0);
  if(!mask)return undefined;
  return h.spans.reduce((n,s)=>n+((s.mask&mask)&&(phase===undefined||s.phase===phase)?s.endTime-s.startTime:0),0);
}
export function detailedSample(d:DetailedReplay|undefined,h:HorseDiagnostics|undefined,time:number,key:'targetSpeeds'|'accelerationRates') {
  const times=h?.sampleTimes??d?.annotations.sampleTimes,values=h?.[key];
  if(!times?.length||!values?.length||time<times[0]!)return undefined;
  let lo=0,hi=times.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(times[mid]!<=time)lo=mid;else hi=mid-1;}
  return values[lo]??undefined;
}
export function diagnosticHorse(capture:ParsedRaceCapture,index:number) {return capture.detailed?.annotations.horses.find(h=>h.horseIndex===index);}

/** A runner's finish can precede the final frame of the whole field. */
export function runnerHpResult(capture:ParsedRaceCapture,index:number) {
  const horse=diagnosticHorse(capture,index),result=capture.runners.find(r=>r.index===index)?.result;
  const finishTime=result?.finishTimeRaw&&result.finishTimeRaw>0?result.finishTimeRaw:result?.finishTime;
  const finishFrame=finishTime===undefined?capture.frames.at(-1):raceFrameAtTime(capture.frames,finishTime)??capture.frames.at(-1);
  const start=horse?.startHp??capture.frames[0]?.horses[index]?.hp;
  const finish=horse?.finalHp??finishFrame?.horses[index]?.hp;
  const max=horse?.maxHp??start;
  return {start,finish,max,percent:finish!==undefined&&max!==undefined&&max>0?finish/max*100:undefined};
}

/** Keep the original delay visible even after a recovery causes a recalculation. */
export function lastSpurtResult(capture:ParsedRaceCapture,index:number) {
  const horse=diagnosticHorse(capture,index),history=horse?.lastSpurtDecisions;
  const decision=horse?.lastSpurtDecision??history?.at(-1);
  const start=decision?.selectedStartDistance??capture.runners.find(r=>r.index===index)?.result?.lastSpurtStartDistance;
  const noSpurt=!!decision&&!['True','TrueExceedNeedMaximumHp'].includes(String(decision.result))||finite(start)&&start<=0;
  const firstCheck=history?.find(d=>finite(d.checkDistance))?.checkDistance??decision?.checkDistance;
  const baseline=finite(firstCheck)?firstCheck:capture.raceDistance?capture.raceDistance*2/3:undefined;
  const delay=!noSpurt&&finite(start)&&finite(baseline)?Math.max(0,start-baseline):undefined;
  const speed=!noSpurt&&finite(decision?.selectedTargetSpeed)?decision.selectedTargetSpeed:undefined;
  const reduction=speed!==undefined&&finite(decision?.fullSpurtTargetSpeed)?Math.max(0,decision.fullSpurtTargetSpeed-speed):undefined;
  return {start:!noSpurt&&finite(start)?start:undefined,delay,speed,reduction,noSpurt,speedPenalty:!noSpurt&&(decision?.speedPenalty===true||(reduction??0)>=.005)};
}

export const raceMetricHelp:Record<string,string>={
  'Finish':'Finishing position in this race. A lower number means a better finish.',
  'Runner':'The runner’s name, starting gate and running style. Select a runner to inspect their race.',
  'Time / gap':'Race completion time. The gap below it is the distance to the previous finisher when that runner crossed the finish line.',
  'Start delay':'Time spent waiting after the start. Delays of 80 ms or more are marked as late starts. A delay above one simulation frame (66.6 ms) also loses the first acceleration frame; that is highlighted separately.',
  'Start delay (ms)':'Time spent waiting after the start. Delays of 80 ms or more are marked as late starts. A delay above one simulation frame (66.6 ms) also loses the first acceleration frame.',
  'Start':'The start is marked delayed if it was at least 80 ms late or lost the first acceleration frame. Losing that frame starts above 66.6 ms.',
  'Spurt delay':'Distance between the first last-spurt check and the selected spurt start. Zero means no delay. For recorded-only captures, delay is estimated from the late-race boundary. Speed is the selected spurt target; a negative value in parentheses shows the reduction from the full-spurt target, in m/s.',
  'HP result':'HP remaining at the finish, or where it ran out. The second line shows starting HP and any recorded shortfall.',
  'HP at finish':'HP remaining when the runner finishes. Zero means HP was exhausted; the exhaustion distance shows where it happened.',
  'Race modes (s)':'Seconds spent dueling, running downhill, or in position-keeping pace modes. Downhill time in the late race is shown separately.',
  'Course loss (m)':'Additional distance travelled because of track geometry, including the runner’s path through corners.',
  'Course loss':'Additional distance travelled because of track geometry, including the runner’s path through corners.',
  'Incidents (s)':'Total seconds spent front-blocked or rushing. Rushing periods and front-blocking periods can overlap.',
  'Blocked (s)':'Total time with another runner blocking the path directly ahead.',
  'Build':'The five build stats. SP is the total cost of learned skills; popularity is the simulator’s ranking of the runner.',
  'Outcome':'Activated means the skill triggered. Wit check failed means its activation check did not pass. Passed wit check, failed condition means the check passed but the skill’s race conditions were not met.',
  'Triggers':'Number of recorded activations for this skill during the race.',
  'First (s)':'Time of the first activation or active period. Select the time to watch that moment in replay.',
  'Active (s)':'Total elapsed time the skill was active. Overlapping effects from the same skill are counted once; instant effects can last only one simulation tick.',
  'Wit check':'The random percentage drawn for the skill’s wit check. A value below the activation chance passes; an equal or higher value fails. For example, 22% passes an 80% chance and 91% fails. A dash means no wit check is required. The race conditions still need to be met.',
  'Wit threshold (%)':'Chance of passing the skill’s activation check, determined by wit and any relevant modifiers. Passing the check does not guarantee the skill’s conditions are met.',
  'Wit check threshold':'Chance of passing the skill’s activation check, determined by wit and any relevant modifiers. Passing the check does not guarantee the skill’s conditions are met.',
  'Mode':'A race behaviour active during the recorded periods, such as downhill running, dueling or position keeping.',
  'Active time (s)':'Total time this race behaviour was active. Expand the period count to inspect its start and end times.',
  'Periods':'Number of separate active periods. Expand the count to see each period and jump to it in replay.',
  'HP at decision':'HP available when the simulator calculated the last-spurt plan.',
  'HP for full spurt':'HP needed to start the full-speed spurt at this decision point and sustain it to the finish.',
  'Full spurt speed':'Target speed for a full last spurt before an HP shortage lowers the selected speed.',
  'Time (s)':'Seconds since the start of the race. Select a time to jump to that moment in replay.',
  'Target (m/s)':'The simulator’s desired speed at this sample, including active effects. Actual speed may differ while accelerating or being blocked.',
  'Accel. (m/s²)':'The acceleration rate at this sample. Positive values speed the runner up; negative values slow them down.',
  'Section':'One of 24 equal distance sections used for the race’s base target-speed calculation. Select a section to replay its beginning.',
  'Distance (m)':'Distance along the course, measured from the start. A range shows the section’s start and end.',
  'Phase':'The race phase used for this course section: early, mid, late or last spurt.',
  'RNG (%)':'Random adjustment to base target speed for this section. Positive values raise speed and negative values lower it. It is included in the displayed base target speed.',
  'Base target speed':'Target speed for each course section before temporary effects. The RNG adjustment is already included. The lower graph isolates that random adjustment.',
  'Pace over time':'Target speed and acceleration over the race. Target speed is the desired speed, so it can differ from actual running speed.',
  'HP before → after':'HP immediately before and after a skill applies. Values marked ≈ are estimates reconstructed from replay samples; exact application values are used when available.',
  'Applied HP':'HP actually added or removed by the skill. Recovery capped at maximum HP and debuffs applied after exhaustion can be smaller than requested.',
  'HP change':'HP actually added or removed by the skill, with the change as a percentage of the runner’s maximum HP in parentheses. Recovery capped at maximum HP and debuffs applied after exhaustion can be smaller than requested; that requested amount is shown separately.',
  'Max HP (%)':'The applied HP change as a percentage of the affected runner’s maximum HP. This is not a percentage of HP remaining.',
  'Reference':'The runner used as the reference for this position-keeping decision. Select their name to inspect them.',
  'Check / chance':'The random check value and the chance required for this behaviour. The check passes when it is below the chance. For example, 22% < 80% passes; 91% ≥ 80% fails.',
  'Roll (%)':'The random value used for this behaviour decision. Compare it with the threshold to see why the attempt passed or failed.',
  'Threshold (%)':'The chance threshold used for this behaviour decision. It is specific to the attempted behaviour.',
  'Avg. active (s)':'Average active time across the displayed detailed runner entries, including entries where the behaviour never activated.',
  'Total active (s)':'Total active time across all displayed detailed runner entries.',
  'Runners':'Number of detailed runner entries where this behaviour was active.',
  'Race':'The race number in this imported session.',
  'Source':'Detailed measurements come from resimulation. Recorded values are used if resimulation is unavailable.'
};

/** Schema 7 records exact deltas, but replay HP is sampled and truncated to whole HP. */
export function hpChangeEvents(capture:ParsedRaceCapture,events:DiagnosticRow[]):(DiagnosticRow&{before:number|undefined;after:number|undefined;estimated:boolean;percent:number|undefined})[] {
  return events.map((event,index)=>{
    const time=Number(event.time),target=Number(event.targetHorseIndex),delta=Number(event.appliedHpDelta);
    const maxHp=diagnosticHorse(capture,target)?.maxHp;
    let before=typeof event.hpBefore==='number'?event.hpBefore:undefined;
    let after=typeof event.hpAfter==='number'?event.hpAfter:undefined;
    const estimated=before===undefined&&after===undefined;
    if(before!==undefined&&after===undefined)after=before+delta;
    if(after!==undefined&&before===undefined)before=after-delta;
    if(estimated){
      const frame=raceFrameAtTime(capture.frames,time);
      const left=frame&&capture.frames[frame.sourceIndex];
      const right=frame&&capture.frames[frame.sourceIndex+1];
      if(left&&Math.abs(left.time-time)<1e-5&&left.horses[target]){
        // A sample on the event tick includes all applications. Undo the later ones.
        const later=events.slice(index+1).filter(other=>Number(other.targetHorseIndex)===target&&Math.abs(Number(other.time)-time)<1e-5);
        after=left.horses[target]!.hp-later.reduce((total,other)=>total+Number(other.appliedHpDelta),0);
        before=after-delta;
      }else if(left&&right&&left.time<time&&time<=right.time&&left.horses[target]&&right.horses[target]){
        // Interpolate consumption, not the HP jumps from skills. Reapply each jump
        // at its event time, preserving the simulator's order for simultaneous effects.
        const interval=events.map((other,i)=>({other,i})).filter(({other})=>Number(other.targetHorseIndex)===target&&Number(other.time)>left.time+1e-5&&Number(other.time)<=right.time+1e-5);
        const changes=interval.reduce((total,{other})=>total+Number(other.appliedHpDelta),0);
        const preceding=interval.filter(({other,i})=>Number(other.time)<time-1e-5||(Math.abs(Number(other.time)-time)<1e-5&&i<index)).reduce((total,{other})=>total+Number(other.appliedHpDelta),0);
        const fraction=(time-left.time)/(right.time-left.time);
        before=left.horses[target]!.hp+(right.horses[target]!.hp-left.horses[target]!.hp-changes)*fraction+preceding;
        after=before+delta;
      }
      if(before!==undefined&&after!==undefined){
        before=Math.max(0,Math.min(maxHp??Infinity,before));
        after=Math.max(0,Math.min(maxHp??Infinity,after));
      }
    }
    return {...event,before,after,estimated,percent:typeof maxHp==='number'&&maxHp>0?delta/maxHp*100:undefined};
  });
}
export function blockerAt(capture:ParsedRaceCapture,index:number,time:number,fallback?:number) {
  const spans=diagnosticHorse(capture,index)?.frontBlockSpans;
  const blocker=spans===undefined?fallback:activeSpan(spans,time)?.blockerHorseIndex??-1;
  return blocker!==undefined&&blocker!==index&&capture.runners.some(r=>r.index===blocker)?blocker:-1;
}

/** Multiple effects of one skill can overlap; count elapsed active time once. */
export function skillActiveDuration(h:HorseDiagnostics|undefined,id:number):number|undefined {
  if(!h?.activeSkillSpans)return undefined;
  let end=-Infinity,total=0;
  for(const span of h.activeSkillSpans.filter(s=>s.skillId===id).sort((a,b)=>a.startTime-b.startTime)){
    total+=Math.max(0,span.endTime-Math.max(end,span.startTime));end=Math.max(end,span.endTime);
  }
  return total;
}

/** Recorded blocking intervals, with detailed annotations taking precedence. */
export function frontBlockingSpans(capture:ParsedRaceCapture) {
  const result:{horseIndex:number;blockerHorseIndex:number;startTime:number;endTime:number}[]=[];
  for(const runner of capture.runners){
    const reported=diagnosticHorse(capture,runner.index)?.frontBlockSpans;
    if(reported!==undefined){
      for(const span of reported)if(span.endTime>span.startTime&&span.blockerHorseIndex!==runner.index&&capture.runners.some(r=>r.index===span.blockerHorseIndex))
        result.push({...span,horseIndex:runner.index});
      continue;
    }
    let previous:typeof result[number]|undefined;
    for(let i=0;i<capture.frames.length-1;i++){
      const frame=capture.frames[i]!,endTime=capture.frames[i+1]!.time;
      const blocker=frame.horses[runner.index]?.blockFrontHorseIndex??-1;
      if(blocker<0||blocker===runner.index||!capture.runners.some(r=>r.index===blocker)||endTime<=frame.time){previous=undefined;continue;}
      if(previous?.blockerHorseIndex===blocker&&previous.endTime===frame.time)previous.endTime=endTime;
      else{previous={horseIndex:runner.index,blockerHorseIndex:blocker,startTime:frame.time,endTime};result.push(previous);}
    }
  }
  return result.sort((a,b)=>a.startTime-b.startTime||a.horseIndex-b.horseIndex);
}
