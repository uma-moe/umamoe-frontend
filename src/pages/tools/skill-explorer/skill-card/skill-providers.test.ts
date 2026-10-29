import { expect, it } from 'vitest';
import { normalizeSupportCards } from '@/lib/game-data/support-cards/support-card-details';
import { parseProviderCatalog, skillProviders } from './skill-providers';

it('keeps trainee outfits and support cards separate even when the character is the same', () => {
  const catalog = parseProviderCatalog({
    umas: [
      { card: 105101, path: '105101-nishino-flower', skills: [200361, 200361] },
      { card: 105102, path: '105102-nishino-flower', skills: [200361] }
    ],
    supports: [{ card: 30018, path: '30018-nishino-flower', skills: [200361] }]
  });
  const supports = normalizeSupportCards([
    { id: 30018, name: 'Nishino Flower', rarity: 3, type: 'speed', isReleased_en: true }
  ]);

  const sources = skillProviders({
    catalog,
    names: { '1051': { name: 'Nishino Flower', skins: { '01': 'Original' } } },
    released: new Set([105101]),
    supports
  }).get(200361);

  expect(sources?.umas.map((uma) => uma.id)).toEqual([105101]);
  expect(sources?.supports.map((card) => card.id)).toEqual([30018]);
  expect(sources?.umas[0]?.href).toBe(
    'https://gametora.com/umamusume/characters/105101-nishino-flower'
  );
  expect(sources?.supports[0]?.href).toBe(
    'https://gametora.com/umamusume/supports/30018-nishino-flower'
  );
});

it('includes event sources while filtering unreleased supports and showing SSR cards first', () => {
  const catalog = parseProviderCatalog({
    umas: [],
    supports: [
      { card: 10001, path: '10001-special-week', skills: [200361] },
      { card: 30018, path: '30018-nishino-flower', skills: [200361] },
      { card: 30069, path: '30069-narita-brian', skills: [200361] },
      { card: 30152, path: '30152-tokai-teio', skills: [200361] }
    ]
  });
  const supports = normalizeSupportCards([
    { id: 10001, name: 'Special Week', rarity: 1, type: 'guts', isReleased_en: true },
    { id: 30018, name: 'Nishino Flower', rarity: 3, type: 'speed', isReleased_en: true },
    { id: 30069, name: 'Narita Brian', rarity: 3, type: 'stamina', isReleased_en: true },
    { id: 30152, name: 'Tokai Teio', rarity: 3, type: 'speed', isReleased_en: false }
  ]);

  const sources = skillProviders({ catalog, names: {}, released: new Set(), supports }).get(200361);

  expect(sources?.umas).toEqual([]);
  expect(sources?.supports.map((card) => card.id)).toEqual([30069, 30018, 10001]);
  expect(sources?.supports[0]?.detail).toContain('SSR · Stamina');
});

it('rejects unsafe or mismatched provider paths', () => {
  for (const path of ['javascript:alert(1)', '30018-nishino-flower', '105101-../../other']) {
    expect(() =>
      parseProviderCatalog({ umas: [{ card: 105101, path, skills: [200361] }], supports: [] })
    ).toThrow('page');
  }
});
