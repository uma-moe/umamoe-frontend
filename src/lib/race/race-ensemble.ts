import type { ParsedRaceCapture, RaceHorseFrame } from './race-capture-parser';
import { raceFrameAtTime, raceTimeAtDistance } from './race-replay';

/** Four source-order values per horse: distance, lane, speed, HP. Retain all observed frames. */
export interface RaceTrajectory {
  sample: number;
  seed: number;
  count: number;
  times: Float64Array;
  values: Float32Array;
  finishTimes: number[];
  finishValues: Float32Array;
}

export function compactRaceTrajectory(capture: ParsedRaceCapture, sources: number[], sample: number, interval = 0): RaceTrajectory {
  const count=capture.runners.length, distance=capture.raceDistance!;
  const finishes=capture.runners.map((_,gate)=>raceTimeAtDistance(capture.frames,distance,gate));
  if (!distance || sources.length!==count || new Set(sources).size!==count || sources.some(source=>!Number.isInteger(source)||source<0||source>=count)
    || finishes.some(time=>time===undefined)) throw new Error('A sampled replay is missing a runner or its finish. Retry the batch.');
  // ponytail: Coarse report frames omit subsecond excursions; use the full sampled replay to inspect them. Finishes remain exact.
  const frames=interval>0?capture.frames.filter((frame,index)=>index===0||index===capture.frames.length-1||Math.floor((frame.time-capture.frames[0]!.time)/interval)>Math.floor((capture.frames[index-1]!.time-capture.frames[0]!.time)/interval)):capture.frames;
  const times=Float64Array.from(frames,frame=>frame.time), values=new Float32Array(times.length*count*4), finishTimes=Array<number>(count),finishValues=new Float32Array(count*4);
  sources.forEach((source,gate)=>{
    finishTimes[source]=finishes[gate]!;
    const horse=raceFrameAtTime(capture.frames,finishes[gate]!)!.horses[gate]!;
    finishValues.set([distance,horse.lanePosition,horse.speed,horse.hp],source*4);
  });
  for(let frame=0;frame<times.length;frame++) {
    for(let gate=0;gate<count;gate++) {
      const finished=times[frame]!>=finishes[gate]!;
      const source=sources[gate]!,offset=source*4;
      if(finished){values.set(finishValues.subarray(offset,offset+4),(frame*count+source)*4);values[(frame*count+source)*4+2]=0;continue;}
      const horse=frames[frame]!.horses[gate]!;
      values.set([Math.min(distance,horse.distance),horse.lanePosition,horse.speed,horse.hp],(frame*count+source)*4);
    }
  }
  return {sample,seed:capture.randomSeed!,count,times,values,finishTimes,finishValues};
}

/** Compare runners within their own race; freeze the field when that race's winner finishes. */
export function raceFieldSpread(trajectories:RaceTrajectory[],time:number) {
  const count=trajectories[0]?.count??0,gaps=Array.from({length:count},()=>[] as number[]);
  for(const trajectory of trajectories){
    const frame=trajectoryAtTime(trajectory,Math.min(time,...trajectory.finishTimes));
    let leader=0;for(let source=0;source<count;source++)leader=Math.max(leader,frame[source*4]!);
    for(let source=0;source<count;source++)gaps[source]!.push(Math.max(0,leader-frame[source*4]!));
  }
  return gaps.map((values,source)=>({source,...summarizeSpread(values)}));
}

function summarizeSpread(values:number[]){
  values.sort((a,b)=>a-b);
  const q=(p:number)=>{const at=(values.length-1)*p,left=Math.floor(at);return values[left]!+(values[Math.ceil(at)]!-values[left]!)*(at-left);};
  return {mean:values.reduce((a,b)=>a+b,0)/values.length,p10:q(.1),p25:q(.25),median:q(.5),p75:q(.75),p90:q(.9)};
}

/** One runner's progress at the same elapsed time; finishers stay at their finish line. */
export function raceDistanceSpread(trajectories:RaceTrajectory[],time:number,source:number){
  const values=trajectories.map(trajectory=>trajectoryAtTime(trajectory,time)[source*4]!);
  return {...summarizeSpread(values),values,finished:trajectories.filter(trajectory=>time>=trajectory.finishTimes[source]!).length};
}

/** Interpolate at real elapsed simulation time, keeping finishers at the line. */
export function trajectoryAtTime(trajectory: RaceTrajectory, time: number): Float32Array {
  const {times,values,count}=trajectory, stride=count*4;
  let low=0,high=times.length-1;
  while(low+1<high){const middle=(low+high)>>1;if(times[middle]!<=time)low=middle;else high=middle;}
  const fraction=Math.max(0,Math.min(1,(time-times[low]!)/Math.max(Number.EPSILON,times[high]!-times[low]!)));
  const frame=new Float32Array(stride);
  for(let source=0;source<count;source++){
    const offset=source*4,finish=trajectory.finishTimes[source]!;
    if(time>=finish){frame.set(trajectory.finishValues.subarray(offset,offset+4),offset);frame[offset+2]=0;continue;}
    const finishing=times[high]!>=finish,alpha=finishing?Math.max(0,(time-times[low]!)/Math.max(Number.EPSILON,finish-times[low]!)):fraction;
    for(let i=0;i<4;i++){
      const start=values[low*stride+offset+i]!,end=finishing?trajectory.finishValues[offset+i]!:values[high*stride+offset+i]!;
      frame[offset+i]=start+(end-start)*alpha;
    }
  }
  return frame;
}

export function meanRaceCapture(trajectories: RaceTrajectory[], reference: ParsedRaceCapture): ParsedRaceCapture {
  if(!trajectories.length)throw new Error('Load the sampled trajectories before calculating their mean.');
  const count=reference.runners.length;
  if(trajectories.some(trajectory=>trajectory.count!==count))throw new Error('The sampled replay fields do not match.');
  const end=Math.max(...trajectories.flatMap(trajectory=>trajectory.finishTimes));
  const times=Array.from({length:Math.ceil(end)},(_,index)=>index).concat(end);
  return {...reference,fileName:'Mean of '+trajectories.length+' simulations',randomSeed:undefined,events:[],detailed:undefined,
    // A mean has no actual race result, blocker, temptation event or skill activation.
    runners:reference.runners.map(runner=>({...runner,result:undefined})),
    frames:times.map(time=>{
      const sums=new Float64Array(count*4);
      for(const trajectory of trajectories){const frame=trajectoryAtTime(trajectory,time);for(let i=0;i<sums.length;i++)sums[i]!+=frame[i]!;}
      const horses:RaceHorseFrame[]=Array.from({length:count},(_,source)=>({
        distance:sums[source*4]!/trajectories.length,lanePosition:sums[source*4+1]!/trajectories.length,
        speed:sums[source*4+2]!/trajectories.length,hp:sums[source*4+3]!/trajectories.length,temptationMode:0,blockFrontHorseIndex:-1
      }));
      return {time,horses};
    })
  };
}

function trajectorySignal(trajectory:RaceTrajectory, frame:Float32Array, source:number, signal:string):number {
  const offset=source*4;
  if(signal==='speed')return frame[offset+2]!/100;
  if(signal==='hp')return frame[offset+3]!/Math.max(1,trajectory.values[offset+3]!)*100;
  if(signal==='gap'){
    let leader=0;for(let runner=0;runner<trajectory.count;runner++)leader=Math.max(leader,frame[runner*4]!);
    return leader-frame[offset]!;
  }
  return frame[offset]!;
}

export function meanTrajectorySignal(trajectories:RaceTrajectory[],time:number,source:number,signal:string):number {
  return trajectories.reduce((sum,trajectory)=>sum+trajectorySignal(trajectory,trajectoryAtTime(trajectory,signal==='gap'?Math.min(time,...trajectory.finishTimes):time),source,signal),0)/trajectories.length;
}

export function trajectorySeries(trajectory: RaceTrajectory, source: number, signal: string): number[][] {
  const stride=trajectory.count*4;
  // ponytail: Background plots keep at most 241 points; use extrema buckets if subsecond spikes need inspection.
  const step=Math.max(1,Math.ceil(trajectory.times.length/240));
  const indices=Array.from({length:Math.ceil(trajectory.times.length/step)},(_,index)=>index*step);
  if(indices.at(-1)!==trajectory.times.length-1)indices.push(trajectory.times.length-1);
  return indices.map(frame=>{const time=trajectory.times[frame]!;return [time,trajectorySignal(trajectory,signal==='gap'?trajectoryAtTime(trajectory,Math.min(time,...trajectory.finishTimes)):trajectory.values.subarray(frame*stride,(frame+1)*stride),source,signal)];});
}

/** Joint distance/lane observations: a point always comes from one runner in one race. */
export function racePositionClouds(trajectories:RaceTrajectory[],time:number){
  const rows=Array.from({length:trajectories[0]?.count??0},(_,source)=>({source,points:[] as {sample:number;distance:number;lane:number}[],distance:0,lane:0,finished:0}));
  for(const trajectory of trajectories){
    const frame=trajectoryAtTime(trajectory,time);
    for(const row of rows){
      const distance=frame[row.source*4]!,lane=frame[row.source*4+1]!;
      row.points.push({sample:trajectory.sample,distance,lane});row.distance+=distance;row.lane+=lane;
      row.finished+=Number(time>=trajectory.finishTimes[row.source]!);
    }
  }
  return rows.map(row=>({...row,distance:row.distance/trajectories.length,lane:row.lane/trajectories.length}));
}

/** Spread the preview across the batch's original seed order; do not select by outcome. */
export function trajectoryPreviewSamples(runs:number,limit=24):number[]{
  const count=Math.min(runs,limit);
  return Array.from({length:count},(_,index)=>count===1?0:Math.round(index*(runs-1)/(count-1)));
}

/** Report curves share elapsed time. Gaps stay paired within each original race. */
export function raceSignalSpreads(trajectories:RaceTrajectory[],steps=80){
  const count=trajectories[0]?.count??0,end=Math.max(0,...trajectories.flatMap(trajectory=>trajectory.finishTimes));
  const times=Array.from({length:steps+1},(_,step)=>step/steps*end);
  const runners=Array.from({length:count},(_,source)=>({source,speed:[] as (ReturnType<typeof summarizeSpread>|null)[],hp:[] as ReturnType<typeof summarizeSpread>[],gap:[] as ReturnType<typeof summarizeSpread>[]}));
  const winnerTimes=trajectories.map(trajectory=>Math.min(...trajectory.finishTimes));
  // ponytail: 81 checkpoints keep report curves cheap; inspect the full replay for brief spikes.
  for(const time of times){
    const samples=runners.map(()=>({speed:[] as number[],hp:[] as number[],gap:[] as number[]}));
    trajectories.forEach((trajectory,sample)=>{
      const frame=trajectoryAtTime(trajectory,time),field=time<=winnerTimes[sample]!?frame:trajectoryAtTime(trajectory,winnerTimes[sample]!);
      let leader=0;for(let source=0;source<count;source++)leader=Math.max(leader,field[source*4]!);
      for(let source=0;source<count;source++){
        const row=samples[source]!,offset=source*4;
        if(time<trajectory.finishTimes[source]!)row.speed.push(frame[offset+2]!/100);
        row.hp.push(frame[offset+3]!/Math.max(1,trajectory.values[offset+3]!)*100);
        row.gap.push(Math.max(0,leader-field[offset]!));
      }
    });
    runners.forEach((runner,source)=>{const row=samples[source]!;runner.speed.push(row.speed.length?summarizeSpread(row.speed):null);runner.hp.push(summarizeSpread(row.hp));runner.gap.push(summarizeSpread(row.gap));});
  }
  return {end,times,runners};
}
