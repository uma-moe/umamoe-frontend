/**
 * The game's seating: it deals the gates from the race seed, and in Champions Meeting, Team Trials and room matches
 * with random moods the moods too. Each draw is the next xorshift32 state of `random_seed`. Career moods do not come
 * from the seed. The simulator seats estimates by the same rules.
 */

/**
 * How the game dealt a race's moods from its seed: Champions Meeting's team deal, or each runner its own mood as in
 * Team Trials and room matches with random moods.
 */
export type MoodDeal = 'championsMeeting' | 'perRunner';

const AWFUL = 1;
const BAD = 2;
const GREAT = 5;
const MOOD_LEVELS = GREAT - AWFUL + 1;
const MOODS = [2, 3, 4, 5];
const TEAM_MOOD_TOTAL = { min: 8, max: 11 };
/** A mood pick takes its draw's remainder in buckets of 2,500, which keeps the choices near uniform. */
const MOOD_BUCKET = 2500;

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new RangeError(`No entry ${index} of ${items.length}.`);

  return item;
}

/** The seed's first `count` draws: successive xorshift32 states of its 32 bits. */
function draws(seed: number, count: number): number[] {
  const result: number[] = [];
  let state = seed >>> 0;

  for (let draw = 0; draw < count; draw++) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    result.push(state);
  }

  return result;
}

/**
 * Gates in list order, as the game seats `count` runners on `seed`: draw `i` picks runner `i`'s gate from the gates
 * left, and the last gate left takes the picked one's place.
 */
export function seededGates(seed: number, count: number): number[] {
  const left = Array.from({ length: count }, (_, index) => index + 1);

  return draws(seed, count).map((draw, runner) => {
    const remaining = count - runner;
    const pick = draw % remaining;
    const gate = at(left, pick);

    left[pick] = at(left, remaining - 1);
    return gate;
  });
}

/**
 * Moods in list order, as Team Trials and room matches with random moods deal them to `count` runners on `seed`: the
 * draw that seats runner `i` also gives its mood, Awful to Great by the draw's remainder over five.
 */
export function seededRunnerMoods(seed: number, count: number): number[] {
  return draws(seed, count).map((draw) => AWFUL + (draw % MOOD_LEVELS));
}

/**
 * Moods by slot, as Champions Meeting deals them on `seed` to three teams of three in slots 0–2, 3–5 and 6–8. Team `t`
 * draws three moods from draws `3t` to `3t + 2`, each from Bad to Great and still able to bring the team's total to
 * 8–11. The members receive their team's draws in one order for every team, dealt like three gates.
 */
export function seededTeamMoods(seed: number): number[] {
  const seedDraws = draws(seed, 9);
  const receivers = seededGates(seed, 3);
  const moods = Array.from({ length: 9 }, () => 0);

  for (let team = 0; team < 3; team++) {
    let total = 0;

    receivers.forEach((member, drawIndex) => {
      const stillToDraw = 2 - drawIndex;
      const allowed = MOODS.filter(
        (mood) =>
          total + mood + BAD * stillToDraw <= TEAM_MOOD_TOTAL.max &&
          total + mood + GREAT * stillToDraw >= TEAM_MOOD_TOTAL.min
      );
      const draw = at(seedDraws, 3 * team + drawIndex);
      const mood = at(allowed, Math.floor((draw % (MOOD_BUCKET * allowed.length)) / MOOD_BUCKET));

      moods[3 * team + member - 1] = mood;
      total += mood;
    });
  }

  return moods;
}

/** The three teams in the order each is first listed, as list positions; undefined unless three teams of three. */
function cmTeams(teamIds: readonly number[]): number[][] | undefined {
  if (teamIds.length !== 9 || teamIds.some((team) => team === 0)) return undefined;

  const teams = new Map<number, number[]>();
  teamIds.forEach((team, position) => teams.set(team, [...(teams.get(team) ?? []), position]));

  const members = [...teams.values()];
  const threeTeamsOfThree = members.length === 3 && members.every((team) => team.length === 3);
  return threeTeamsOfThree ? members : undefined;
}

/**
 * Each runner's mood by list position, as the simulator deals Champions Meeting's moods on `seed` (`moodDeal`
 * `championsMeeting`): the first team listed takes the first team's draws, its members in list order. Undefined unless
 * three teams of three.
 */
export function seededCmMoods(teamIds: readonly number[], seed: number): number[] | undefined {
  const teams = cmTeams(teamIds);
  if (!teams) return undefined;

  const dealt = seededTeamMoods(seed);
  const moods = Array.from({ length: teamIds.length }, () => 0);
  teams.forEach((members, team) =>
    members.forEach((position, member) => (moods[position] = at(dealt, 3 * team + member)))
  );

  return moods;
}

function sameMoods(recorded: readonly (number | undefined)[], dealt: readonly number[]): boolean {
  return recorded.length === dealt.length && recorded.every((mood, slot) => mood === dealt[slot]);
}

/**
 * Which deal gave a race its moods from its own seed, given each runner's recorded gate and mood in any order: the
 * gates put the runners back in the game's slots. Undefined when neither did, as for a room that set one mood for all
 * or a career race.
 */
export function recordedMoodDeal(
  seed: number,
  runners: readonly { gate: number; mood: number }[]
): MoodDeal | undefined {
  const moodAtGate = new Map(runners.map((runner) => [runner.gate, runner.mood]));
  const slotMoods = seededGates(seed, runners.length).map((gate) => moodAtGate.get(gate));

  if (sameMoods(slotMoods, seededRunnerMoods(seed, runners.length))) return 'perRunner';

  const nineRunners = runners.length === 9;
  if (nineRunners && sameMoods(slotMoods, seededTeamMoods(seed))) return 'championsMeeting';

  return undefined;
}
