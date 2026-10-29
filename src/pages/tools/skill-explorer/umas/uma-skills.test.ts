import { describe, expect, it } from 'vitest';
import type { CharacterNames } from '@/lib/game-data/characters';
import {
  explorerUmas,
  firstBanners,
  parseUmaSkills,
  skillsGivenBy,
  umaRelease,
  unvaluedSkills,
  type CharacterBanner
} from './uma-skills';

const NOW = Date.parse('2026-10-26T00:00:00Z');

function banner(date: string, pickupCardIds: number[], predicted = false): CharacterBanner {
  return { eventType: 'character_banner', date: new Date(date), predicted, pickupCardIds };
}

const names: CharacterNames = {
  '1001': { name: 'Special Week', skins: { '01': 'Original', '02': 'Summer' } },
  '1065': { name: 'Daitaku Helios', skins: { '01': 'Original', '02': 'Joyful Jamboree!' } }
};

const cards = parseUmaSkills({
  cards: [
    { card: 100101, unique: 900011, skills: [200512, 201352] },
    { card: 100102, unique: 910011, skills: [200512] },
    { card: 106501, unique: 900651, skills: [202502] },
    { card: 199901, skills: [] }
  ]
});

describe('uma skill data', () => {
  it('reads each card with its unique, and without one where the game data has none', () => {
    expect(cards[0]).toEqual({ cardId: 100101, unique: 900011, skills: [200512, 201352] });
    expect(cards[3]).toEqual({ cardId: 199901, skills: [] });
  });

  it('rejects a file without cards', () => {
    expect(() => parseUmaSkills({ generated: '' })).toThrow('uma data is invalid');
  });
});

describe('uma release', () => {
  const banners = firstBanners([
    banner('2026-11-03T22:00:00Z', [106501], true),
    banner('2025-06-26T00:30:00Z', [100101]),
    banner('2027-01-10T00:00:00Z', [106501]),
    {
      eventType: 'support_card_banner',
      date: new Date('2026-11-01T00:00:00Z'),
      pickupCardIds: [100102]
    }
  ]);

  it('keeps the first character banner of each card', () => {
    expect(banners.get(106501)).toEqual({
      date: new Date('2026-11-03T22:00:00Z'),
      estimated: true
    });
    expect(banners.has(100102)).toBe(false);
  });

  it('dates an uma whose first banner is still to come', () => {
    const release = umaRelease(106501, { released: new Set(), banners, now: NOW });

    expect(release).toEqual({
      kind: 'upcoming',
      date: new Date('2026-11-03T22:00:00Z'),
      estimated: true
    });
  });

  it('counts an uma as released by the character list or by a banner that already ran', () => {
    expect(umaRelease(100102, { released: new Set([100102]), banners, now: NOW }).kind).toBe(
      'released'
    );
    expect(umaRelease(100101, { released: new Set(), banners, now: NOW }).kind).toBe('released');
  });

  it('leaves an uma without a Global banner on JP only', () => {
    expect(umaRelease(199901, { released: new Set(), banners, now: NOW }).kind).toBe('jp');
  });
});

describe('uma picker', () => {
  const umas = explorerUmas({
    cards: [
      ...cards,
      { cardId: 100103, skills: [] },
      { cardId: 106502, unique: 910651, skills: [] }
    ],
    names,
    released: new Set([100101, 100102]),
    banners: firstBanners([
      banner('2027-08-16T00:00:00Z', [106502]),
      banner('2026-11-03T22:00:00Z', [106501])
    ]),
    now: NOW
  });

  it('offers every named card: released, then upcoming by banner date, then JP only', () => {
    const order = umas.map((uma) => [uma.cardId, uma.release.kind]);

    expect(order).toEqual([
      [100101, 'released'],
      [100102, 'released'],
      [106501, 'upcoming'],
      [106502, 'upcoming'],
      [100103, 'jp']
    ]);
  });

  it('names a card by its character and outfit', () => {
    const helios = umas.find((uma) => uma.cardId === 106502);

    expect(helios).toMatchObject({ name: 'Daitaku Helios', outfit: 'Joyful Jamboree!' });
  });

  it('gives her unique and her skills', () => {
    const given = skillsGivenBy(cards[0]!);

    expect([...given].sort()).toEqual([200512, 201352, 900011]);
  });

  it('counts what of hers has no value yet', () => {
    const valued = new Set([200512, 900011]);

    const unvalued = unvaluedSkills(cards[1]!, (skillId) => valued.has(skillId));
    const newer = unvaluedSkills(cards[2]!, (skillId) => valued.has(skillId));

    expect(unvalued).toEqual({ unique: true, skills: 0 });
    expect(newer).toEqual({ unique: true, skills: 1 });
  });
});
