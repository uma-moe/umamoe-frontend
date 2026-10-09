import { describe, expect, it } from 'vitest';
import type { RaceFrame } from './race-capture-parser';
import { raceFrameAtTime, raceReplayBounds, replayProgress, replayViewport, raceTimeAtDistance, replayLaneMetres } from './race-replay';

const frames: RaceFrame[] = [
  { time: 2, horses: [{ distance: 10, lanePosition: 100, speed: 1200, hp: 900, temptationMode: 0, blockFrontHorseIndex: -1 }] },
  { time: 4, horses: [{ distance: 50, lanePosition: 300, speed: 1600, hp: 700, temptationMode: 1, blockFrontHorseIndex: 2 }] }
];

describe('race replay domain', () => {
  it('follows the leader with room ahead and fits the captured lane spread', () => {
    expect(replayViewport(0, 2400, 80, 640)).toEqual({ min:0, max:80, laneMax:768 });
    expect(replayViewport(1000, 2400, 80, 8500)).toEqual({ min:936, max:1016, laneMax:10200 });
    expect(replayViewport(900, 2200, 80, 220).laneMax).toBe(500);
    expect(replayViewport(0, 2400, 80, 0).laneMax).toBe(500);
    expect(replayLaneMetres(4999.5,18)).toBe(9);
    expect(replayViewport(1000,2400,400,640).max).toBe(1016);
    expect(replayViewport(2390,2400,80,640).max).toBe(2400);
    expect(replayViewport(2500, 2400, 80, 640)).toEqual({ min:2320, max:2400, laneMax:768 });
  });
  it('adjusts the lane range continuously across the old rounding boundary', () => {
    const limits=[830,831,832,833,834,835].map(lane=>replayViewport(1000,2400,80,lane).laneMax);
    for(let i=1;i<limits.length;i++)expect(limits[i]!-limits[i-1]!).toBeCloseTo(1.2);
  });
  it('interpolates numeric horse state between sparse capture frames', () => {
    const frame = raceFrameAtTime(frames, 3);
    expect(frame).toMatchObject({ time: 3, sourceIndex: 0 });
    expect(frame?.horses[0]).toMatchObject({ distance: 30, lanePosition: 200, speed: 1400, hp: 800, temptationMode: 0, blockFrontHorseIndex:-1 });
    expect(raceFrameAtTime(frames,3.99)?.horses[0]?.blockFrontHorseIndex).toBe(-1);
    expect(raceFrameAtTime(frames,4)?.horses[0]?.blockFrontHorseIndex).toBe(2);
  });

  it('clamps playback outside the available timeline', () => {
    expect(raceFrameAtTime(frames, -10)?.time).toBe(2);
    expect(raceFrameAtTime(frames, 99)?.time).toBe(4);
  });

  it('derives stable playback, distance, and lane bounds', () => {
    const bounds = raceReplayBounds(frames, 100);
    expect(bounds).toEqual({ startTime: 2, endTime: 4, duration: 2, distanceMax: 100, laneMax: 300 });
    expect(replayProgress(3, bounds)).toBe(.5);
    // Captured frames can continue beyond the finish line.
    expect(raceReplayBounds(frames, 40).distanceMax).toBe(40);
    expect(raceReplayBounds(frames).distanceMax).toBe(50);
  });
});
it('aligns course landmarks to captured time, including changes of leader',()=>{
  const crossing=frames.map((f,i)=>({...f,horses:[{...f.horses[0]!,distance:i?20:10},{...f.horses[0]!,distance:i?50:5}]}));
  expect(raceTimeAtDistance(crossing,30)).toBeCloseTo(2+2*25/45);
  expect(raceTimeAtDistance(crossing,0)).toBe(2);
  expect(raceTimeAtDistance(crossing,51)).toBeUndefined();
  // A runner's section changes when that runner crosses, even after losing the lead.
  expect(raceTimeAtDistance(crossing,15,0)).toBe(3);
  expect(raceTimeAtDistance(crossing,15,1)).toBeCloseTo(2+2*10/45);
  expect(raceTimeAtDistance(crossing,30,0)).toBeUndefined();
  expect(raceTimeAtDistance(crossing,0,2)).toBeUndefined();
  expect(raceTimeAtDistance([],30)).toBeUndefined();
});
