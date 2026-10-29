import { expect, it } from 'vitest';
import { buildProviderCatalog } from './build-skill-explorer-providers';

it('includes both Global Beeline Burst event supports and keeps trainee sources separate', () => {
  const skill = {
    id: 200361,
    rarity: 2,
    char: [101601, 105101, 106902],
    sup_e: [[30018, 30069, 30152], []],
    loc: { en: { char: [101601, 105101], sup_e: [[30018, 30069], []] } }
  };
  const umas = [101601, 105101, 106902].map((card_id) => ({
    card_id,
    url_name: `${card_id}-trainee`
  }));
  const supports = [30018, 30069, 30152].map((support_id) => ({
    support_id,
    url_name: `${support_id}-support`
  }));

  const sources = buildProviderCatalog([skill], umas, supports);

  expect(sources.umas.map((card) => card.card)).toEqual([101601, 105101]);
  expect(sources.supports).toEqual([
    { card: 30018, path: '30018-support', skills: [200361] },
    { card: 30069, path: '30069-support', skills: [200361] }
  ]);
});

it('merges trainee events, support events and hints without duplicates or JP fallback', () => {
  const skills = [
    {
      id: 200012,
      rarity: 1,
      sup_hint: [[30002], []],
      loc: {
        en: { char: [100101], char_e: [100101], sup_e: [[30001], []], sup_hint: [[30001], []] }
      }
    },
    { id: 202601, rarity: 2, char: [100101], sup_e: [[30001], []] },
    { id: 110011, rarity: 5, char: [100101], gene_version: { id: 900011 } }
  ];

  const sources = buildProviderCatalog(
    skills,
    [{ card_id: 100101, url_name: '100101-special-week' }],
    [
      { support_id: 30001, url_name: '30001-special-week' },
      { support_id: 30002, url_name: '30002-silence-suzuka' }
    ]
  );

  expect(sources.umas[0]?.skills).toEqual([200012, 110011, 900011]);
  expect(sources.supports).toEqual([{ card: 30001, path: '30001-special-week', skills: [200012] }]);
});
