import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { SECTIONS, SKILL_KINDS, type SkillFacts, type SkillPoint } from './skill-explorer-data';
import {
  DEFAULT_SKILL_RARITIES,
  SKILL_RARITIES,
  gateFeeders,
  toggleType,
  plotView,
  skillPurchaseCost,
  type PlotOptions
} from './skill-explorer-view';
import { valueAxis, valuePercent } from './scatter/scatter-scale';

function skill(skillId: number, name: string, extra: Partial<SkillData> = {}): SkillData {
  return { skill_id: skillId, name, rarity: 1, icon: 'utx_ico_skill_10011.webp', ...extra };
}

function point(skillId: number, win: number, mean: number): SkillPoint {
  return {
    skillId,
    win,
    winAlone: win / 2,
    expected: win,
    rate: 1,
    mean,
    courses: 1,
    sections: new Array<number>(SECTIONS).fill(0),
    forced: 0
  };
}

const skills = new Map<number, SkillData>([
  [200011, skill(200011, 'Right-Handed ◎', { baseCost: 110 })],
  [200012, skill(200012, 'Right-Handed ○', { baseCost: 90 })],
  [200341, skill(200341, 'Corner Connoisseur', { rarity: 2, baseCost: 180 })],
  [200013, skill(200013, 'Right-Handed ×', { icon: 'utx_ico_skill_10014.webp' })],
  [200151, skill(200151, 'Firm Conditions ◎', { conditions: 'ground_condition==1' })],
  [202231, skill(202231, 'Night Races ◎', { conditions: 'time==4' })],
  [900011, skill(900011, 'Inherited')]
]);

const facts = new Map<number, SkillFacts>([
  [200011, { kind: 'stat' }],
  [200012, { kind: 'stat' }],
  [200341, { kind: 'speed' }],
  [200013, { kind: 'stat' }],
  [200151, { kind: 'stat' }],
  [202231, { kind: 'stat' }],
  [900011, { kind: 'speed', card: 100101 }]
]);

const points = [
  point(200011, 0.5, 0),
  point(200012, 0.3, 0),
  point(200341, 0.8, 0.6),
  point(200013, -0.3, 0),
  point(200151, 0.9, 0),
  { ...point(202231, 0.7, 0), forced: 1 },
  point(900011, 0.1, 0.9)
];

function view(overrides: Partial<PlotOptions> = {}) {
  return plotView({
    points,
    skills,
    facts,
    xMode: 'position',
    yMode: 'value',
    rarities: new Set(SKILL_RARITIES),
    kinds: new Set(SKILL_KINDS),
    search: '',
    showDayBound: false,
    procScaled: false,
    bestOfFamily: false,
    ...overrides
  });
}

function shownIds(options: Partial<PlotOptions> = {}): number[] {
  return view(options).plotted.map((plotted) => plotted.skillId);
}

describe('Skill Explorer plot view', () => {
  it('plots a gated skill at its best point in the Optimal view, and marks a setup that buys skills', () => {
    const gated = {
      ...point(200341, 1.6, 0.4),
      expected: 0.64,
      rate: 0.4,
      gated: {
        forced: { win: 5.2, expected: 4.7, rate: 0.9, mean: 0.02 },
        setup: { feeders: [200011], sp: 110, at: 0.1 }
      }
    };
    const plotted = (yMode: PlotOptions['yMode'], procScaled = false) =>
      view({ points: [gated], yMode, procScaled }).plotted[0]!;

    expect(plotted('forced')).toMatchObject({
      y: 5.2,
      x: 0.02,
      forced: false,
      optimal: true,
      setUp: false
    });
    expect(plotted('forced', true).y).toBeCloseTo(4.7);
    expect(plotted('value')).toMatchObject({
      y: 1.6,
      x: 0.4,
      forced: false,
      optimal: false,
      setUp: true
    });
    expect(plotted('alone')).toMatchObject({ y: 0.8, setUp: false });
    // Her build opening it as it is buys nothing.
    const asBuilt = { ...gated, gated: { ...gated.gated, setup: { feeders: [], sp: 0, at: 0.1 } } };
    expect(view({ points: [asBuilt], yMode: 'value' }).plotted[0]!.setUp).toBe(false);
    // Any other skill reads the same in build and if forced.
    expect(view({ yMode: 'forced' }).plotted).toEqual(view({ yMode: 'value' }).plotted);
  });

  it('shows an exported skill only once its ID is in the loaded Global skill resources', () => {
    const upcomingId = 999991;
    const exported = [...points, point(upcomingId, 20, 0.5)];
    const exportedFacts = new Map<number, SkillFacts>([
      ...facts,
      [upcomingId, { kind: 'speed', card: 199901 }]
    ]);

    expect(shownIds({ points: exported, facts: exportedFacts })).not.toContain(upcomingId);

    const releasedSkills = new Map(skills);
    releasedSkills.set(upcomingId, skill(upcomingId, 'Newly released unique'));

    expect(shownIds({ points: exported, facts: exportedFacts, skills: releasedSkills })).toContain(
      upcomingId
    );
  });

  it('leaves out negative skills and, unless asked, day-bound ones', () => {
    expect(shownIds()).toEqual([200341, 200011, 200012, 900011]);
    expect(shownIds({ showDayBound: true })).toEqual(expect.arrayContaining([200151, 202231]));
  });

  it('on a CM shows a day-bound skill only where its day holds, and not as forced', () => {
    const firmDay = { season: 1, weather: 1, ground: 1, time: 2 };
    const heavyDay = { season: 1, weather: 3, ground: 4, time: 2 };
    const forcedFirm = { ...point(200151, 0.9, 0), forced: 1 };
    const onDay = view({ points: [forcedFirm, points[5]!], day: firmDay }).plotted;

    expect(onDay.map((p) => [p.skillId, p.forced])).toEqual([[200151, false]]);
    expect(shownIds({ day: heavyDay, showDayBound: true })).not.toContain(200151);
    expect(shownIds({ day: { ...firmDay, time: 4 } })).toContain(202231);
  });

  it('scales by proc rate when asked: a skill forced to proc by its forced rate, on her own too', () => {
    const rare = { ...point(200341, 0.8, 0.6), expected: 0.08, rate: 0.1 };
    const forced = { ...point(200011, 0.5, 0), expected: 0, rate: 0.9, forced: 1 };
    const scaled = (yMode: PlotOptions['yMode']) =>
      view({ points: [rare, forced], procScaled: true, yMode }).plotted.map((p) => [
        p.skillId,
        p.y
      ]);

    expect(view({ points: [rare, forced] }).plotted.map((p) => p.y)).toEqual([0.8, 0.5]);
    expect(scaled('value')).toEqual([
      [200011, 0.45],
      [200341, 0.08]
    ]);
    expect(scaled('alone')).toEqual([
      [200011, 0.225],
      [200341, 0.04]
    ]);
  });

  it('marks a skill forced to proc on at least half the courses it is valued on', () => {
    const forced = { ...point(200011, 0.5, 0), forced: 1 };
    const half = { ...point(200012, 0.4, 0), courses: 4, forced: 2 };
    const once = { ...point(900011, 0.3, 0), courses: 4, forced: 1 };
    const plotted = view({ points: [point(200341, 0.8, 0.6), forced, half, once] }).plotted;

    expect(plotted.map((p) => [p.skillId, p.forced])).toEqual([
      [200341, false],
      [200011, true],
      [200012, true],
      [900011, false]
    ]);
  });

  it('keeps only the best version of a family when asked', () => {
    expect(shownIds({ bestOfFamily: true })).toEqual([200341, 200011, 900011]);
  });

  it('shows the most valuable skills, plus search matches beyond the limit', () => {
    expect(shownIds({ limit: 2 })).toEqual([200341, 200011]);
    expect(shownIds({ limit: 2, search: 'inherited' })).toEqual([200341, 200011, 900011]);
  });

  it('keeps compared skills beyond the limit after the search changes', () => {
    const comparedSkillIds = new Set([900011, 200012]);
    const plotted = view({ limit: 1, search: 'corner', comparedSkillIds }).plotted;

    expect(plotted.map((p) => p.skillId)).toEqual([200341, 200012, 900011]);
    expect(plotted.find((p) => p.skillId === 200341)?.searchMatch).toBe(true);
    expect(plotted.find((p) => p.skillId === 900011)?.searchMatch).toBe(false);
  });

  it('keeps a compared version beside the best of its family', () => {
    expect(shownIds({ bestOfFamily: true, comparedSkillIds: new Set([200012]) })).toContain(200012);
  });

  it('keeps compared skills when their rarity and effect types are switched off', () => {
    const comparedSkillIds = new Set([200011, 200341]);
    const hiddenTypes = { rarities: new Set<never>(), kinds: new Set<never>() };

    expect(shownIds({ comparedSkillIds, ...hiddenTypes })).toEqual([200341, 200011]);
    expect(shownIds(hiddenTypes)).toEqual([]);
  });

  it('does not reintroduce unavailable or negative skills through comparison', () => {
    const comparedSkillIds = new Set([999991, 200013, 200151]);
    const shown = shownIds({
      comparedSkillIds,
      day: { season: 1, weather: 3, ground: 4, time: 2 }
    });

    expect(shown).not.toContain(999991);
    expect(shown).not.toContain(200013);
    expect(shown).not.toContain(200151);
  });

  it('keeps a compared day-bound skill when its display option is switched off', () => {
    expect(shownIds({ comparedSkillIds: new Set([200151]), showDayBound: false })).toContain(
      200151
    );
  });

  it('marks a name search independently from an Uma highlight', () => {
    const plotted = view({ limit: 1, search: 'inherited', umaSkillIds: new Set([200012]) }).plotted;

    expect(plotted.find((p) => p.skillId === 900011)).toMatchObject({
      searchMatch: true,
      matches: false
    });
    expect(view().plotted.every((p) => !p.searchMatch)).toBe(true);
  });

  it('matches the skills of a picked uma, beyond the limit', () => {
    const picked = view({ limit: 1, umaSkillIds: new Set([200012, 900011]) });

    const matchedIds = picked.plotted
      .filter((plotted) => plotted.matches)
      .map((plotted) => plotted.skillId);
    expect(matchedIds).toEqual([200012, 900011]);
  });

  it('narrows the skills of a picked uma by the search', () => {
    const picked = view({ search: 'right', umaSkillIds: new Set([200012, 900011]) });

    const matchedIds = picked.plotted
      .filter((plotted) => plotted.matches)
      .map((plotted) => plotted.skillId);
    expect(matchedIds).toEqual([200012]);
  });

  it('splits strong from weaker at the median shown skill', () => {
    expect(view().ySplit).toBeCloseTo(0.4);
  });

  it('reads the value alone when asked', () => {
    expect(view({ yMode: 'alone' }).plotted[0]!.y).toBeCloseTo(0.4);
  });

  it('shows only the chosen rarities and kinds, so the best gold speed skill stands alone', () => {
    const goldSpeed = shownIds({ rarities: new Set(['gold']), kinds: new Set(['speed']) });
    const uniques = shownIds({ rarities: new Set(['inherited']) });

    expect(goldSpeed).toEqual([200341]);
    expect(uniques).toEqual([900011]);
  });

  it("files a runner's own unique apart from the inherited ones", () => {
    const personal = skill(100011, 'Personal', { rarity: 4, unique: true });
    const shown = (rarity: 'inherited' | 'personal') =>
      plotView({
        points: [...points, point(100011, 0.6, 0.5)],
        skills: new Map([...skills, [100011, personal]]),
        facts,
        xMode: 'position',
        yMode: 'value',
        rarities: new Set([rarity]),
        kinds: new Set(SKILL_KINDS),
        search: '',
        showDayBound: false,
        procScaled: false,
        bestOfFamily: false
      }).plotted.map((plotted) => [plotted.skillId, plotted.tier]);

    expect(shown('personal')).toEqual([[100011, 'personal']]);
    expect(shown('inherited')).toEqual([[900011, 'inherited']]);
  });

  it('shows one version of each unique at a time, unless compared', () => {
    const own = skill(100011, 'Own', { rarity: 4, unique: true });
    const both = {
      points: [...points, point(100011, 0.6, 0.5)],
      skills: new Map([...skills, [100011, own]])
    };

    expect(shownIds({ ...both, uniqueVersion: 'own' })).toContain(100011);
    expect(shownIds({ ...both, uniqueVersion: 'own' })).not.toContain(900011);
    expect(shownIds({ ...both, uniqueVersion: 'inherited' })).not.toContain(100011);
    expect(
      shownIds({ ...both, uniqueVersion: 'inherited', comparedSkillIds: new Set([100011]) })
    ).toContain(100011);
  });

  it('shows a unique by its character', () => {
    const unique = view().plotted.find((plotted) => plotted.skillId === 900011)!;

    expect(unique.image).toContain('100101');
  });

  it('classifies evolved skills apart from inherited uniques and uses skill icons even when mapped to a card', () => {
    const charEvo = skill(100101111, 'Gluttonous Ruler', { rarity: 6 });
    const scenarioEvo = skill(407011, 'Scenario Evo', { rarity: 6 });
    const evoSkills = new Map([...skills, [100101111, charEvo], [407011, scenarioEvo]]);
    const evoFacts = new Map<number, SkillFacts>([
      ...facts,
      [100101111, { kind: 'recovery', card: 100101 }],
      [407011, { kind: 'speed' }]
    ]);
    const evoPoints = [...points, point(100101111, 1.2, 0.4), point(407011, 1.1, 0.5)];

    const plotted = view({
      points: evoPoints,
      skills: evoSkills,
      facts: evoFacts,
      uniqueVersion: 'own',
      rarities: new Set(['evolved'])
    }).plotted;

    expect(plotted.map((item) => [item.skillId, item.tier])).toEqual([
      [100101111, 'evolved'],
      [407011, 'evolved']
    ]);
    expect(plotted[0]!.image).toContain('skills/icons/10011');
    expect(plotted[1]!.image).toContain('skills/icons/10011');
    // Character evos are not hidden by the uniqueVersion toggle or confused with inherited uniques.
    expect(
      view({
        points: evoPoints,
        skills: evoSkills,
        facts: evoFacts,
        uniqueVersion: 'inherited',
        rarities: new Set(['inherited'])
      }).plotted.map((item) => item.skillId)
    ).toEqual([900011]);
  });

  it('hides evos by default but surfaces and highlights them via base-skill search, Display evo, or Uma highlight', () => {
    const evo = skill(100101111, 'Tail Nine', { rarity: 6 });
    const evoSkills = new Map([...skills, [100101111, evo]]);
    const evoFacts = new Map<number, SkillFacts>([
      ...facts,
      [100101111, { kind: 'speed', card: 100101 }]
    ]);
    const evoPoints = [...points, point(100101111, 2.5, 0.5)];
    const evolvesFrom = new Map([[100101111, 200341]]);
    const defaults = {
      points: evoPoints,
      skills: evoSkills,
      facts: evoFacts,
      rarities: new Set(DEFAULT_SKILL_RARITIES),
      evolvesFrom
    };

    // Hidden by default so evos never crowd Top 100.
    expect(shownIds(defaults)).not.toContain(100101111);

    // Searching the base gold ("Corner Connoisseur") surfaces and highlights its evo too.
    const searched = view({ ...defaults, limit: 1, search: 'corner' }).plotted;
    expect(searched.find((item) => item.skillId === 100101111)).toMatchObject({
      searchMatch: true,
      matches: true
    });

    // Clicking "Display evo" reveals the evo even beyond the plot limit.
    expect(shownIds({ ...defaults, limit: 1, revealedEvoIds: new Set([100101111]) })).toContain(
      100101111
    );

    // Selecting the owning Uma surfaces her evo too.
    expect(shownIds({ ...defaults, umaSkillIds: new Set([100101111, 200341]) })).toContain(
      100101111
    );
  });

  it('places skills by proc point in metres on a single course', () => {
    const metres = view({ courseDistance: 2000 });

    const connoisseur = metres.plotted.find((plotted) => plotted.skillId === 200341)!;
    expect(connoisseur.xLabel).toBe('1200 m');
    expect(metres.xUnit).toEqual({ scale: 2000, suffix: ' m' });
  });

  it('scales per-skill 95% CI half-width with procScaled and omits it in alone mode', () => {
    const withCi = points.map((p) =>
      p.skillId === 200341 ? { ...p, rate: 0.5, ci95: 1.2, raced: true } : p
    );

    const overall = view({ points: withCi, procScaled: true }).plotted.find(
      (item) => item.skillId === 200341
    )!;
    const perProc = view({ points: withCi, procScaled: false }).plotted.find(
      (item) => item.skillId === 200341
    )!;
    const alone = view({ points: withCi, yMode: 'alone', procScaled: true }).plotted.find(
      (item) => item.skillId === 200341
    )!;

    expect(overall.yError).toBeCloseTo(1.2);
    expect(overall.raced).toBe(true);
    expect(perProc.yError).toBeCloseTo(2.4);
    expect(alone.yError).toBeUndefined();
  });

  it('tints the race phases and marks where the final spurt can begin on the proc point axis only', () => {
    const position = view();

    expect(position.bands.map((band) => [band.from, band.to])).toEqual([
      [0, 1 / 6],
      [1 / 6, 2 / 3],
      [2 / 3, 1]
    ]);
    expect(position.marks.map((mark) => mark.at)).toEqual([2 / 3]);
    expect(view({ xMode: 'cost' })).toMatchObject({ bands: [], marks: [] });
  });

  it('places skills by WR-weighted activation point in wrPosition mode when sectionWins exist', () => {
    const secs = new Array<number>(SECTIONS).fill(0);
    secs[6] = 0.5;
    secs[16] = 0.25;
    const secWins = new Array<number>(SECTIONS).fill(0);
    secWins[6] = 0.4;
    secWins[16] = 16.0;
    const connoisseur = { ...point(200341, 4.0, 0.4), sections: secs, sectionWins: secWins };

    const wrPlot = view({ points: [connoisseur], xMode: 'wrPosition', courseDistance: 2000 });
    const plotted = wrPlot.plotted[0]!;

    expect(plotted.x).toBeGreaterThan(0.65);
    expect(wrPlot.xTitle).toBe('Avg WR activation point (metres)');
    expect(wrPlot.marks.map((mark) => mark.at)).toEqual([2 / 3]);
  });

  it('computes full SP purchase costs including 2-tier and 3-tier prerequisites and evo base skills, omitting own uniques', () => {
    const pricedSkills = new Map<number, SkillData>([
      ...skills,
      [200014, skill(200014, 'Right-Handed Demon', { rarity: 2, baseCost: 130 })],
      [200342, skill(200342, 'Corner Acceleration ○', { rarity: 1, baseCost: 180 })],
      [201102, skill(201102, 'Medium Straightaways ○', { rarity: 1, baseCost: 100 })],
      [201101, skill(201101, 'Medium Straightaways ◎', { rarity: 1, baseCost: 110 })],
      [201103, skill(201103, 'Flash Forward', { rarity: 2, baseCost: 150 })],
      [100101111, skill(100101111, 'Moonlight Sommelier', { rarity: 6 })],
      [100011, skill(100011, 'Own Unique', { rarity: 4, unique: true, baseCost: 200 })]
    ]);
    const evolvesFrom = new Map([[100101111, 200341]]);

    expect(skillPurchaseCost(pricedSkills.get(200012)!, pricedSkills)).toEqual({
      total: 90,
      direct: 90,
      prerequisite: 0
    });
    expect(skillPurchaseCost(pricedSkills.get(200011)!, pricedSkills)).toEqual({
      total: 200,
      direct: 110,
      prerequisite: 90
    });
    // 3-tier gold green: adds both ○ (90) and ◎ (110), skipping negative × (200013).
    expect(skillPurchaseCost(pricedSkills.get(200014)!, pricedSkills)).toEqual({
      total: 330,
      direct: 130,
      prerequisite: 200
    });
    // 3-tier gold speed: adds ○ (100) + ◎ (110) + gold (150) = 360.
    expect(skillPurchaseCost(pricedSkills.get(201103)!, pricedSkills)).toEqual({
      total: 360,
      direct: 150,
      prerequisite: 210
    });
    expect(skillPurchaseCost(pricedSkills.get(200341)!, pricedSkills)).toEqual({
      total: 360,
      direct: 180,
      prerequisite: 180
    });
    expect(skillPurchaseCost(pricedSkills.get(100101111)!, pricedSkills, evolvesFrom)).toEqual({
      total: 360,
      direct: 180,
      prerequisite: 180,
      fromBase: true
    });
    expect(skillPurchaseCost(pricedSkills.get(100011)!, pricedSkills)).toBeUndefined();
  });

  it('plots WR per 100 SP against trimmed total SP cost in SP efficiency mode and omits unpriced skills', () => {
    const withCi = points.map((p) => (p.skillId === 200011 ? { ...p, ci95: 0.4, raced: true } : p));
    const efficiency = view({ points: withCi, xMode: 'cost' });

    // Sorted by WR / 100 SP: 200341 (0.8 / 1.8 = 0.444), 200012 (0.3 / 0.9 = 0.333), 200011 (0.5 / 2.0 = 0.25)
    expect(efficiency.plotted.map((plotted) => [plotted.skillId, plotted.x])).toEqual([
      [200341, 180],
      [200012, 90],
      [200011, 200]
    ]);
    expect(efficiency.plotted[0]!.y).toBeCloseTo(0.8 * (100 / 180));
    expect(efficiency.plotted[1]!.y).toBeCloseTo(0.3 * (100 / 90));
    expect(efficiency.plotted[2]!.y).toBeCloseTo(0.5 * (100 / 200));
    expect(efficiency.plotted[2]!.yError).toBeCloseTo(0.2);
    expect(efficiency.xAxis.min).toBeGreaterThan(0);
    expect(efficiency.yUnitSuffix).toBe('/ 100 SP');
  });
});

describe('value axis', () => {
  it('spans the shown values without forcing zero in', () => {
    const axis = valueAxis([0.2, 0.6]);

    expect(axis.ticks).not.toContain(0);
    expect(valuePercent(0.6, axis)).toBeGreaterThan(0);
    expect(valuePercent(0.2, axis)).toBeLessThan(100);
  });

  it('reaches down to +1.0% on every track', () => {
    const axis = valueAxis([2, 8]);

    expect(valuePercent(1, axis)).toBeCloseTo(100);
    expect(axis.ticks[0]).toBe(1);
  });

  it('keeps more room below a skill under the floor than above the strongest', () => {
    const axis = valueAxis([0.2, 0.6]);

    expect(100 - valuePercent(0.2, axis)).toBeGreaterThan(valuePercent(0.6, axis) * 2);
  });

  it('spreads small values more than large ones', () => {
    const axis = valueAxis([0.1, 4]);

    expect(valuePercent(0.25, axis) - valuePercent(1, axis)).toBeGreaterThan(
      valuePercent(3, axis) - valuePercent(4, axis)
    );
  });
});

describe('toggleType', () => {
  it('unchecks only the chosen type when all are selected', () => {
    const selected = new Set(['white', 'gold', 'inherited']);

    expect([...toggleType(selected, 'gold')]).toEqual(['white', 'inherited']);
    expect(selected.size).toBe(3);
  });

  it('allows the last type to be unchecked, then checked again', () => {
    const empty = toggleType(new Set(['gold']), 'gold');

    expect(empty.size).toBe(0);
    expect([...toggleType(empty, 'inherited')]).toEqual(['inherited']);
  });
});

describe('gateFeeders', () => {
  const midSections = () => {
    const secs = new Array<number>(SECTIONS).fill(0);
    secs[8] = 0.9;
    return secs;
  };
  const midPoint = (id: number, win: number): SkillPoint => ({
    ...point(id, win, 0.35),
    rate: 0.9,
    sections: midSections()
  });

  it('caps owned uniques at one per uma, excludes other-uma uniques/evos for character skills, and deduplicates families', () => {
    const feederSkills = new Map<number, SkillData>([
      [103401111, skill(103401111, "Firefighter's Ascent", { rarity: 6 })],
      [100011, skill(100011, 'Own Unique A', { rarity: 5, unique: true })],
      [100021, skill(100021, 'Own Unique B', { rarity: 5, unique: true })],
      [100031, skill(100031, 'Own Unique C', { rarity: 5, unique: true })],
      [100101111, skill(100101111, 'Other Evo', { rarity: 6 })],
      [900011, skill(900011, 'Inherited A', { rarity: 1, inherited: true })],
      [900041, skill(900041, 'Inherited D', { rarity: 1, inherited: true })],
      [900051, skill(900051, 'Inherited E', { rarity: 1, inherited: true })],
      [900061, skill(900061, 'Inherited F', { rarity: 1, inherited: true })],
      [200331, skill(200331, 'Professor of Curvature', { rarity: 2 })],
      [200332, skill(200332, 'Corner Adept ○', { rarity: 1 })],
      [201661, skill(201661, "Playtime's Over!", { rarity: 2 })],
      [201251, skill(201251, 'Medium Corners ◎', { rarity: 1 })]
    ]);
    const feederFacts = new Map<number, SkillFacts>([
      [103401111, { kind: 'speed', card: 103401 }],
      [100011, { kind: 'speed', card: 100101 }],
      [100021, { kind: 'speed', card: 100201 }],
      [100031, { kind: 'speed', card: 100301 }],
      [100101111, { kind: 'speed', card: 100101 }],
      [900011, { kind: 'speed', card: 100101 }],
      [900041, { kind: 'speed', card: 100401 }],
      [900051, { kind: 'speed', card: 100501 }],
      [900061, { kind: 'speed', card: 100601 }],
      [200331, { kind: 'speed' }],
      [200332, { kind: 'speed' }],
      [201661, { kind: 'speed' }],
      [201251, { kind: 'speed' }]
    ]);
    const feederPoints = [
      midPoint(100011, 10.0),
      midPoint(100021, 9.5),
      midPoint(100031, 9.0),
      midPoint(100101111, 8.8),
      midPoint(900011, 5.0),
      midPoint(900041, 4.8),
      midPoint(900051, 4.6),
      midPoint(900061, 4.4),
      midPoint(200331, 4.0),
      midPoint(200332, 3.8),
      midPoint(201661, 3.5),
      midPoint(201251, 3.2)
    ];
    const gate = {
      count: 3,
      counted: 'any' as const,
      sections: [4, 16] as [number, number],
      where: 'in the mid race'
    };

    // Generic skill: at most 1 owned unique (100011), skips its inherited twin (900011), at most 2 inherited (900041, 900051),
    // skips other-Uma evo (100101111), deduplicates 200331/200332 -> [100011, 900041, 900051, 200331, 201661].
    const generic = gateFeeders({
      skillId: 201611,
      gate,
      points: feederPoints,
      skills: feederSkills,
      facts: feederFacts
    });
    expect(generic.map((p) => p.skillId)).toEqual([100011, 900041, 900051, 200331, 201661]);

    // Character-locked evo (Inari One 103401): excludes all other Umas' own uniques and other Umas' evos.
    const charEvo = gateFeeders({
      skillId: 103401111,
      gate,
      points: feederPoints,
      skills: feederSkills,
      facts: feederFacts,
      ownerCardId: 103401
    });
    expect(charEvo.map((p) => p.skillId)).toEqual([900011, 900041, 200331, 201661, 201251]);
  });
});
