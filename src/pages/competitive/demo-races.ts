import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';

// Synthetic fixtures, never presented as measured game or simulator results.
export const demoCharacters = [
  [100101, 'Special Week'], [100201, 'Silence Suzuka'], [100301, 'Tokai Teio'],
  [100601, 'Oguri Cap'], [100701, 'Gold Ship'], [100801, 'Vodka'],
  [100901, 'Daiwa Scarlet'], [101001, 'Taiki Shuttle'], [101301, 'Mejiro McQueen'],
  [101701, 'Symboli Rudolf'], [102401, 'Mayano Top Gun'], [103001, 'Rice Shower'],
  [103201, 'Agnes Tachyon'], [104101, 'Sakura Bakushin O'], [106101, 'King Halo']
] as const;
export const demoSkills = new Map([[200001, 'Corner Recovery ○'], [200002, 'Straightaway Adept'], [200003, 'Concentration'], [200004, 'Professor of Curvature'], [200005, 'Homestretch Haste'], [200006, 'Swinging Maestro']]);
export const demoMeetings = [
  { value: 'tokyo', label: 'Tokyo · Turf · 2,400m', distance: 2400, course: 10606 },
  { value: 'hanshin', label: 'Hanshin · Turf · 2,200m', distance: 2200, course: 10906 },
  { value: 'nakayama', label: 'Nakayama · Turf · 2,500m', distance: 2500, course: 10506 }
];

export function makeDemoRaces(count = 72, meeting = 'tokyo', simulated = false): ParsedRaceCapture[] {
  const course = demoMeetings.find(item => item.value === meeting) ?? demoMeetings[0]!;
  let seed = course.course + (simulated ? 713 : 0);
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: count }, (_, raceIndex) => {
    // Repeated lineups let the demo show team rates across multiple races.
    seed = course.course + (raceIndex % 12) * 193;
    const choices = [...demoCharacters];
    for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [choices[i], choices[j]] = [choices[j]!, choices[i]!]; }
    let outcomeSeed = course.course + raceIndex * 931 + (simulated ? 713 : 0);
    const outcome = () => { outcomeSeed = (Math.imul(outcomeSeed, 1664525) + 1013904223) >>> 0; return outcomeSeed / 4294967296; };
    const finishTimes = Array.from({ length: 9 }, (_, index) => course.distance / 20 + outcome() * 5 + index * .07);
    const runners = choices.slice(0, 9).map(([cardId, name], index) => ({
      index, cardId, name, trainerName: `Demo trainer ${1 + raceIndex % 12 + Math.floor(index / 3) * 12}`, isPlayer: index < 3,
      stats: { speed: 1000 + Math.floor(random() * 200), stamina: 700 + Math.floor(random() * 400), power: 900 + Math.floor(random() * 300), guts: 400 + Math.floor(random() * 300), wit: 700 + Math.floor(random() * 450) },
      aptitudes: { surface: 7, distance: random() > .5 ? 8 : 7, style: 7 },
      skillIds: [...demoSkills.keys()].filter(() => random() > .25), raw: { team_id: 1 + Math.floor(index / 3), rank_score: 13000 + Math.floor(random() * 6000) },
      result: { finishOrder: finishTimes.filter(time => time < finishTimes[index]!).length + 1, finishTime: finishTimes[index]!, finishDiffTime: finishTimes[index]! - Math.min(...finishTimes), startDelayTime: random() * .15, lastSpurtStartDistance: course.distance * (.65 + random() * .1), runningStyle: 1 + Math.floor(random() * 4) }
    }));
    const duration = Math.max(...finishTimes);
    const frames = Array.from({ length: 101 }, (_, frameIndex) => ({
      time: duration * frameIndex / 100,
      horses: runners.map((runner, index) => {
        const progress = Math.min(1, duration * frameIndex / 100 / finishTimes[index]!);
        return { distance: course.distance * progress, lanePosition: 400 + index * 520 + Math.sin(frameIndex / 13 + index) * 180, speed: progress >= 1 ? 0 : 100 * (course.distance / finishTimes[index]! + Math.sin(frameIndex / 9 + index) * .7), hp: Math.max(0, runner.stats.stamina * (1 - progress * (1.02 - index * .015))), temptationMode: 0, blockFrontHorseIndex: -1 };
      })
    }));
    const events = runners.flatMap(runner => runner.skillIds.filter(() => random() > .15).map(skill => ({ frameTime: duration * (.15 + random() * .75), type: 3, params: [runner.index, skill] }))).sort((a, b) => a.frameTime - b.frameTime);
    return { source: 'api', fileName: `Demo race ${raceIndex + 1}`, courseId: course.course, raceDistance: course.distance, raceType: 'Champions Meeting', randomSeed: raceIndex + 1, track: { condition: 'Firm', weather: 'Sunny', season: 'Spring' }, runners, frames, events };
  });
}

