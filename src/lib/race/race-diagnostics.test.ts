import { describe,expect,it } from 'vitest';
import type { ParsedRaceCapture } from './race-capture-parser';
import { hpChangeEvents,lastSpurtResult } from './race-diagnostics';

const capture={frames:[{time:1,horses:[{hp:500},{hp:850}]}],detailed:{annotations:{horses:[{horseIndex:0,maxHp:1000},{horseIndex:1,maxHp:2000}]}}} as ParsedRaceCapture;
const event={time:1,skillId:200001,casterHorseIndex:0,targetHorseIndex:1,requestedHpDelta:-30,appliedHpDelta:-30};

it('displays spurt delay and speed penalties without losing delays after recalculation',()=>{
  const first={result:'True',checkDistance:1600,selectedStartDistance:1630,fullSpurtTargetSpeed:24,selectedTargetSpeed:23.7};
  const latest={...first,checkDistance:1640,delayPenalty:false,speedPenalty:true};
  const replay={raceDistance:2400,runners:[{index:0,result:{lastSpurtStartDistance:1630}}],detailed:{annotations:{horses:[{horseIndex:0,lastSpurtDecision:latest,lastSpurtDecisions:[first,latest]}]}}} as unknown as ParsedRaceCapture;
  expect(lastSpurtResult(replay,0)).toMatchObject({delay:30,speed:23.7,noSpurt:false,speedPenalty:true});
  expect(lastSpurtResult(replay,0).reduction).toBeCloseTo(.3);
  replay.detailed!.annotations.horses[0]!.lastSpurtDecision={...first,selectedStartDistance:1600,selectedTargetSpeed:24};
  expect(lastSpurtResult(replay,0)).toMatchObject({delay:0,speed:24,reduction:0,speedPenalty:false});
  replay.detailed!.annotations.horses[0]!.lastSpurtDecision={...first,result:'False',selectedStartDistance:-1,selectedTargetSpeed:0};
  expect(lastSpurtResult(replay,0)).toMatchObject({noSpurt:true,delay:undefined,speed:undefined,reduction:undefined});
  delete replay.detailed;
  expect(lastSpurtResult(replay,0)).toMatchObject({delay:30,speed:undefined,reduction:undefined});
  replay.runners[0]!.result!.lastSpurtStartDistance=0;
  expect(lastSpurtResult(replay,0).noSpurt).toBe(true);
});

describe('HP change display',()=>{
  it('uses exact application values and the target runner’s maximum HP',()=>{
    expect(hpChangeEvents(capture,[{...event,hpBefore:880.5,hpAfter:850.5}])[0]).toMatchObject({before:880.5,after:850.5,estimated:false,percent:-1.5});
  });
  it('reconstructs successive applications on one tick without assigning the final HP to every event',()=>{
    const events=hpChangeEvents(capture,[event,{...event,requestedHpDelta:100,appliedHpDelta:100}]);
    expect(events[0]).toMatchObject({before:780,after:750,estimated:true,percent:-1.5});
    expect(events[1]).toMatchObject({before:750,after:850,estimated:true,percent:5});
  });
  it('leaves before/after unknown when the capture has no nearby HP observation',()=>{
    expect(hpChangeEvents(capture,[{...event,time:.5}])[0]).toMatchObject({before:undefined,after:undefined,percent:-1.5});
  });
  it('uses applied rather than requested HP for a recovery capped at maximum HP',()=>{
    expect(hpChangeEvents(capture,[{...event,requestedHpDelta:150,appliedHpDelta:10,hpBefore:1990}])[0]).toMatchObject({before:1990,after:2000,estimated:false,percent:.5});
  });
  it('estimates between sparse samples without spreading skill changes across the interval',()=>{
    const sparse={...capture,frames:[{time:0,horses:[{hp:500},{hp:1000}]},{time:1,horses:[{hp:450},{hp:800}]}]} as ParsedRaceCapture;
    const events=hpChangeEvents(sparse,[{...event,time:.4},{...event,time:.7,appliedHpDelta:50}]);
    expect(events[0]).toMatchObject({before:912,after:882,estimated:true});
    expect(events[1]).toMatchObject({before:816,after:866,estimated:true});
  });
  it('preserves simultaneous effect order between samples and ignores other runners’ HP changes',()=>{
    const sparse={...capture,frames:[{time:0,horses:[{hp:500},{hp:1000}]},{time:1,horses:[{hp:450},{hp:850}]}]} as ParsedRaceCapture;
    const events=hpChangeEvents(sparse,[{...event,time:.5},{...event,time:.5,targetHorseIndex:0,appliedHpDelta:-50},{...event,time:.5,appliedHpDelta:100}]);
    expect(events[0]).toMatchObject({before:890,after:860,estimated:true});
    expect(events[2]).toMatchObject({before:860,after:960,estimated:true});
  });
});
