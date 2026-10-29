import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';

// Synthetic fixtures, never presented as measured game or simulator results.
export const demoCharacters = [
  [100101, 'Special Week'],
  [100201, 'Silence Suzuka'],
  [100301, 'Tokai Teio'],
  [100601, 'Oguri Cap'],
  [100701, 'Gold Ship'],
  [100801, 'Vodka'],
  [100901, 'Daiwa Scarlet'],
  [101001, 'Taiki Shuttle'],
  [101301, 'Mejiro McQueen'],
  [101701, 'Symboli Rudolf'],
  [102401, 'Mayano Top Gun'],
  [103001, 'Rice Shower'],
  [103201, 'Agnes Tachyon'],
  [104101, 'Sakura Bakushin O'],
  [106101, 'King Halo']
] as const;

export const demoSkills = new Map([
  [200001, 'Corner Recovery ○'],
  [200002, 'Straightaway Adept'],
  [200003, 'Concentration'],
  [200004, 'Professor of Curvature'],
  [200005, 'Homestretch Haste'],
  [200006, 'Swinging Maestro']
]);

export const demoMeetings = [
  { value: 'tokyo', label: 'Tokyo · Turf · 2,400m', distance: 2400, course: 10606 },
  { value: 'hanshin', label: 'Hanshin · Turf · 2,200m', distance: 2200, course: 10906 },
  { value: 'nakayama', label: 'Nakayama · Turf · 2,500m', distance: 2500, course: 10506 }
];

export function makeDemoRaces(
  count = 72,
  meeting = 'tokyo',
  simulated = false
): ParsedRaceCapture[] {
  const course = demoMeetings.find((item) => item.value === meeting) ?? demoMeetings[0]!;
  let seed = course.course + (simulated ? 713 : 0);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  return Array.from({ length: count }, (_, raceIndex) => {
    // Repeated lineups let the demo show team rates across multiple races.
    seed = course.course + (raceIndex % 12) * 193;
    const choices = [...demoCharacters];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [choices[i], choices[j]] = [choices[j]!, choices[i]!];
    }

    let outcomeSeed = course.course + raceIndex * 931 + (simulated ? 713 : 0);
    const outcome = () => {
      outcomeSeed = (Math.imul(outcomeSeed, 1664525) + 1013904223) >>> 0;
      return outcomeSeed / 4294967296;
    };

    const finishTimes = Array.from(
      { length: 9 },
      (_, index) => course.distance / 20 + outcome() * 5 + index * 0.07
    );

    const runners = choices.slice(0, 9).map(([cardId, name], index) => ({
      index,
      cardId,
      name,
      trainerName: `Demo trainer ${1 + (raceIndex % 12) + Math.floor(index / 3) * 12}`,
      isPlayer: index < 3,
      stats: {
        speed: 1000 + Math.floor(random() * 200),
        stamina: 700 + Math.floor(random() * 400),
        power: 900 + Math.floor(random() * 300),
        guts: 400 + Math.floor(random() * 300),
        wit: 700 + Math.floor(random() * 450)
      },
      aptitudes: { surface: 7, distance: random() > 0.5 ? 8 : 7, style: 7 },
      skillIds: [...demoSkills.keys()].filter(() => random() > 0.25),
      raw: {
        team_id: 1 + Math.floor(index / 3),
        rank_score: 13000 + Math.floor(random() * 6000),
        // Normal to great, from the race and gate alone so the random sequence stays unchanged.
        motivation: 3 + ((raceIndex + index) % 3)
      },
      result: {
        finishOrder: finishTimes.filter((time) => time < finishTimes[index]!).length + 1,
        finishTime: finishTimes[index]!,
        finishDiffTime: finishTimes[index]! - Math.min(...finishTimes),
        startDelayTime: random() * 0.15,
        lastSpurtStartDistance: course.distance * (0.65 + random() * 0.1),
        runningStyle: 1 + Math.floor(random() * 4)
      }
    }));

    const duration = Math.max(...finishTimes);
    const frames = Array.from({ length: 101 }, (_, frameIndex) => ({
      time: (duration * frameIndex) / 100,
      horses: runners.map((runner, index) => {
        const progress = Math.min(1, (duration * frameIndex) / 100 / finishTimes[index]!);
        return {
          distance: course.distance * progress,
          lanePosition: 400 + index * 520 + Math.sin(frameIndex / 13 + index) * 180,
          speed:
            progress >= 1
              ? 0
              : 100 *
                (course.distance / finishTimes[index]! + Math.sin(frameIndex / 9 + index) * 0.7),
          hp: Math.max(0, runner.stats.stamina * (1 - progress * (1.02 - index * 0.015))),
          temptationMode: 0,
          blockFrontHorseIndex: -1
        };
      })
    }));

    // Two clearly synthetic blocking examples, with smooth entry and exit.
    for (const [start, end] of [
      [20, 27],
      [50, 56]
    ]) {
      const order = frames[start!]!.horses.map((horse, index) => ({ horse, index })).sort(
        (a, b) => a.horse.distance - b.horse.distance
      );

      const behind = order[4]!.index,
        ahead = order[5]!.index;

      for (let i = start! - 3; i <= end! + 3; i++) {
        const horse = frames[i]!.horses[behind]!,
          front = frames[i]!.horses[ahead]!;

        const blend = Math.max(0, Math.min(1, (i - start! + 3) / 3, (end! + 3 - i) / 3));
        horse.distance += (front.distance - 1.2 - horse.distance) * blend;
        horse.lanePosition += (front.lanePosition - horse.lanePosition) * blend;
        horse.speed += (front.speed - horse.speed) * blend;
        if (i >= start! && i < end!) horse.blockFrontHorseIndex = ahead;
      }
    }

    // Every third race, one runner is rushed for a stretch of the mid race.
    if (raceIndex % 3 === 0) {
      const rushed = (raceIndex * 5) % 9;
      for (let i = 15; i <= 25; i++) frames[i]!.horses[rushed]!.temptationMode = 1;
    }

    const frontRunners = runners.filter((runner) => runner.result.runningStyle === 1);
    const raceMarks = [
      // Two or more Front Runners fight for the lead early on.
      ...(frontRunners.length >= 2
        ? frontRunners.map((runner) => ({
            frameTime: duration * 0.12,
            type: 4,
            params: [runner.index]
          }))
        : []),
      // Every other race, the first two finishers duel down the final straight.
      ...(raceIndex % 2 === 0
        ? runners
            .filter((runner) => runner.result.finishOrder <= 2)
            .map((runner) => ({ frameTime: duration * 0.9, type: 5, params: [runner.index] }))
        : [])
    ];

    const events = runners
      .flatMap((runner) =>
        runner.skillIds
          .filter(() => random() > 0.15)
          .map((skill) => ({
            frameTime: duration * (0.15 + random() * 0.75),
            type: 3,
            params: [runner.index, skill]
          }))
      )
      .concat(raceMarks)
      .sort((a, b) => a.frameTime - b.frameTime);

    return {
      source: 'api',
      fileName: `Demo race ${raceIndex + 1}`,
      courseId: course.course,
      raceDistance: course.distance,
      raceType: 'Champions Meeting',
      randomSeed: raceIndex + 1,
      track: { condition: 'Firm', weather: 'Sunny', season: 'Spring' },
      runners,
      frames,
      events
    };
  });
}
