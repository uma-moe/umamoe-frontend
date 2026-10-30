import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { SECTIONS, SKILL_KINDS, type SkillFacts, type SkillPoint } from './skill-explorer-data';
import { SKILL_RARITIES, toggleType, plotView, type PlotOptions } from './skill-explorer-view';
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
    const uniques = shownIds({ rarities: new Set(['unique']) });

    expect(goldSpeed).toEqual([200341]);
    expect(uniques).toEqual([900011]);
  });

  it('shows a unique by its character', () => {
    const unique = view().plotted.find((plotted) => plotted.skillId === 900011)!;

    expect(unique.image).toContain('100101');
  });

  it('places skills by proc point in metres on a single course', () => {
    const metres = view({ courseDistance: 2000 });

    const connoisseur = metres.plotted.find((plotted) => plotted.skillId === 200341)!;
    expect(connoisseur.xLabel).toBe('1200 m');
    expect(metres.xUnit).toEqual({ scale: 2000, suffix: ' m' });
  });

  it('leaves out skills without an SP cost on the cost axis', () => {
    expect(view({ xMode: 'cost' }).plotted.map((plotted) => plotted.x)).toEqual([180, 110, 90]);
  });
});

describe('value axis', () => {
  it('spans the shown values without forcing zero in', () => {
    const axis = valueAxis([0.2, 0.6]);

    expect(axis.ticks).not.toContain(0);
    expect(valuePercent(0.6, axis)).toBeGreaterThan(0);
    expect(valuePercent(0.2, axis)).toBeLessThan(100);
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
    const selected = new Set(['white', 'gold', 'unique']);

    expect([...toggleType(selected, 'gold')]).toEqual(['white', 'unique']);
    expect(selected.size).toBe(3);
  });

  it('allows the last type to be unchecked, then checked again', () => {
    const empty = toggleType(new Set(['gold']), 'gold');

    expect(empty.size).toBe(0);
    expect([...toggleType(empty, 'unique')]).toEqual(['unique']);
  });
});
