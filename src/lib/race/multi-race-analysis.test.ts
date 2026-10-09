import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from './race-capture-parser';
import { analyzeMultiRace, groupMultiRaceCaptures, raceRunnerKey } from './multi-race-analysis';
import { teamBuilds } from '../../pages/competitive/analysis-view';

function capture(seed: number, winner = 0): ParsedRaceCapture {
  return {
    source: 'api', fileName: `race-${seed}.json`, courseId: 10101, laneDistanceMax: 15.1875, raceDistance: 1600, randomSeed: seed, track: { condition: 'Firm' },
    frames: [
      { time: 0, horses: [{ distance: 0, lanePosition: 10, speed: 1200, hp: 1000, temptationMode: 0, blockFrontHorseIndex: -1 }, { distance: 0, lanePosition: 20, speed: 1100, hp: 900, temptationMode: 0, blockFrontHorseIndex: -1 }] },
      { time: 90, horses: [{ distance: 1600, lanePosition: 10, speed: 1800, hp: 100, temptationMode: 0, blockFrontHorseIndex: -1 }, { distance: 1590, lanePosition: 20, speed: 1700, hp: 0, temptationMode: 0, blockFrontHorseIndex: -1 }] }
    ],
    events: [{ frameTime: 40, type: 3, params: [0, 200001] }, { frameTime: 70, type: 3, params: [0, 200001] }],
    runners: [0, 1].map((index) => ({ index, cardId: 100 + index, name: index ? 'Runner B' : 'Runner A', isPlayer: index === 0, trainerName: 'Trainer', stats: {}, aptitudes: {}, skillIds: index ? [200002] : [200001], raw: { team_id: index + 1 }, result: { finishOrder: index === winner ? 1 : 2, finishTime: 90 + index, finishDiffTime: 0, startDelayTime: 0, lastSpurtStartDistance: 1100, runningStyle: index + 1 } }))
  };
}

describe('multi-race analysis', () => {
  it('aggregates characters, skills, HP, and double activations without UI services', () => {
    const analysis = analyzeMultiRace([capture(1), capture(2)]);
    expect(analysis.races).toBe(2);
    expect(analysis.entries.every(entry => entry.raceDistance === 1600)).toBe(true);
    expect(analysis.characters[0]).toMatchObject({ name: 'Runner A', races: 2, wins: 2 });
    expect(analysis.skills.find((skill) => skill.skillId === 200001)).toMatchObject({ learned: 2, activations: 4, doubleProcRaces: 2 });
    expect(analysis.hp[0]).toMatchObject({ name: 'Runner A', races: 2, survived: 2, lastSpurtRaces: 2 });
  });

  it('groups captures by track and condition before analysis', () => {
    const wider = capture(2); wider.laneDistanceMax=20;
    expect(groupMultiRaceCaptures([capture(1), wider])).toHaveLength(1);
    const alternate = capture(3); alternate.track.condition = 'Heavy';
    expect(groupMultiRaceCaptures([capture(1), capture(2), alternate]).map((group) => group.captures.length)).toEqual([2, 1]);
  });

  it('merges identical captured builds when aptitude properties arrive in a different order',()=>{
    const first=capture(1),second=capture(2);
    first.runners[0]!.aptitudes={surface:8,distance:7,style:8};
    second.runners[0]!.aptitudes={style:8,surface:8,distance:7};
    expect(teamBuilds([first,second])).toHaveLength(2);
    expect(teamBuilds([first,second]).every(team=>team.appearances===2)).toBe(true);
  });

  it('keeps portrait IDs separate from character grouping keys and shares the fallback identity',()=>{
    const race=capture(1),runner=race.runners[0]!;
    runner.cardId=100101;
    expect(analyzeMultiRace([race]).characters.find(c=>c.name===runner.name)).toMatchObject({key:'100101',cardId:100101});
    delete runner.cardId;runner.charaId=1001;
    const analysis=analyzeMultiRace([race]);
    expect(raceRunnerKey(runner)).toBe('1001');
    expect(analysis.characters.find(c=>c.name===runner.name)).toMatchObject({key:'1001',cardId:undefined});
    expect(analysis.teams.some(t=>t.members.some(m=>m.key==='1001'))).toBe(true);
  });

  it('uses the same spurt history as individual results and excludes missing HP from averages',()=>{
    const race=capture(1),first={result:'True',checkDistance:1060,selectedStartDistance:1090,selectedTargetSpeed:23.5,fullSpurtTargetSpeed:24};
    race.detailed={engineBuild:'test',seed:1,replay:{data:''},annotations:{schemaVersion:7,flags:{},horses:[{horseIndex:0,spans:[],lastSpurtDecisions:[first,{...first,checkDistance:1100}]}]}};
    const unknown=capture(2);unknown.frames=[];
    expect(analyzeMultiRace([race,unknown]).hp[0]).toMatchObject({races:2,startHpEntries:1,finishHpEntries:1,startHpTotal:1000,finishHpTotal:100,spurtDelayEntries:2,spurtSpeedEntries:1,spurtSpeedTotal:23.5});
    expect(analyzeMultiRace([race]).hp[0]).toMatchObject({lastSpurtDistanceTotal:1090,spurtDelayTotal:30});
  });

  it('measures HP at the runner finish rather than a later field frame',()=>{
    const race=capture(1);race.runners[0]!.result!.finishTime=45;
    expect(analyzeMultiRace([race]).hp[0]).toMatchObject({finishHpTotal:550});
  });

  it('uses detailed HP and spurt decisions and excludes unmeasured races from skill-duration averages', () => {
    const detailed=capture(1);
    detailed.detailed={engineBuild:'test',seed:1,replay:{data:''},annotations:{schemaVersion:7,flags:{},horses:[{
      horseIndex:0,spans:[],startHp:1200,finalHp:250,maxHp:2000,activeSkillSpans:[{startTime:10,endTime:16,skillId:200001,detailIndex:0}],
      skillActivationDecisions:[{skillId:200001,required:true,passed:true,activated:false}],
      lastSpurtDecision:{result:'True',selectedStartDistance:1250}
    },{horseIndex:1,spans:[],activeSkillSpans:[],skillActivationDecisions:[{skillId:200002,required:true,passed:false,activated:false}]}]}};
    const analysis=analyzeMultiRace([detailed,capture(2)]);
    expect(analysis.hp[0]).toMatchObject({startHpTotal:2200,finishHpTotal:350,finishHpPercentEntries:2,finishHpPercentTotal:22.5,lastSpurtDistanceTotal:2350});
    expect(analysis.skills.find(s=>s.skillId===200001)).toMatchObject({learned:2,durationTotal:6,measuredEntries:1,passedUntriggered:1});
    expect(analysis.skills.find(s=>s.skillId===200002)).toMatchObject({durationTotal:0,measuredEntries:1,rollFailures:1});
    detailed.detailed.annotations.horses[0]!.lastSpurtDecision={result:'False',selectedStartDistance:1250};
    expect(analyzeMultiRace([detailed]).hp[0]!.lastSpurtRaces).toBe(0);
  });
});
