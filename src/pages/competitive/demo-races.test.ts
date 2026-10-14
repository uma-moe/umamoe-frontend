import { expect,it } from 'vitest';
import { frontBlockingSpans,blockerAt } from '@/lib/race/race-diagnostics';
import { raceFrameAtTime } from '@/lib/race/race-replay';
import { makeDemoRaces } from './demo-races';
import { analyzeMultiRace,groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
import { histogram,teamBuilds } from './analysis-view';

it('provides deterministic complete race fixtures with one winner per race and consistent aggregates',()=>{
  const races=makeDemoRaces(24);
  expect(races).toEqual(makeDemoRaces(24));
  expect(makeDemoRaces(24,'tokyo',true)).not.toEqual(races);
  for(const race of races){
    expect(race.runners.map(row=>row.result!.finishOrder).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8,9]);
    expect(new Set(race.runners.map(row=>row.cardId)).size).toBe(9);
    expect(race.frames.at(-1)!.horses.every(horse=>horse.distance===race.raceDistance)).toBe(true);
    expect(race.events.every(event=>race.runners[event.params[0]!]!.skillIds.includes(event.params[1]!))).toBe(true);
  }
  const analysis=analyzeMultiRace(races);
  expect(analysis.entries).toHaveLength(216);
  expect(analysis.characters.reduce((total,row)=>total+row.wins,0)).toBe(24);
  expect(analysis.teams.reduce((total,row)=>total+row.wins,0)).toBe(24);
  expect(groupMultiRaceCaptures([...races,...makeDemoRaces(2,'hanshin')])).toHaveLength(2);
  const teams=teamBuilds(races);
  expect(teams).toHaveLength(36);
  expect(teams.every(team=>team.appearances===2)).toBe(true);
  expect(teams.reduce((sum,team)=>sum+team.wins,0)).toBe(24);
  expect(histogram([1,1,2,3],2).counts).toEqual([2,2]);
  expect(histogram([])).toEqual({labels:[],counts:[]});
});
it('includes inspectable synthetic blocking without changing recorded race data',()=>{
  const race=makeDemoRaces(1)[0]!;
  const spans=frontBlockingSpans(race);
  expect(spans).toHaveLength(2);
  for(const span of spans){
    const frame=raceFrameAtTime(race.frames,span.startTime)!;
    const horse=frame.horses[span.horseIndex]!,front=frame.horses[span.blockerHorseIndex]!;
    expect(front.distance-horse.distance).toBeCloseTo(1.2);
    expect(horse.lanePosition).toBe(front.lanePosition);
    expect(blockerAt(race,span.horseIndex,span.startTime,horse.blockFrontHorseIndex)).toBe(span.blockerHorseIndex);
    expect(raceFrameAtTime(race.frames,span.endTime)!.horses[span.horseIndex]!.blockFrontHorseIndex).toBe(-1);
  }
  expect(blockerAt(race,0,0,0)).toBe(-1);
  expect(blockerAt(race,0,0,99)).toBe(-1);
});
