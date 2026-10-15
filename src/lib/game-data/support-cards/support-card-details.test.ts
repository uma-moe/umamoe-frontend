import { describe, expect, it } from 'vitest';
import {
  matchesSupportSearch,
  normalizeSupportCards,
  releasedSupportCards,
  supportCardDisplay,
  supportTypeName,
  type SupportCardData
} from './support-card-details';

const kitasanCard = {
  id: 2,
  name: 'Raw',
  character_name: 'Kitasan Black',
  support_card_full_name: '[Fire at My Heels] Kitasan Black',
  type: 'speed',
  rarity: 3,
  release_date: '2026-01-01',
  isReleased_en: true
};

const fineMotionCard = {
  id: 3,
  name: 'Fine Motion',
  cardTitle: 'Wave of Gratitude',
  type: 'wisdom',
  rarity: 3,
  release_date: '2026-01-01',
  isReleased_en: true
};

function requireCard(cards: SupportCardData[], id: string): SupportCardData {
  const card = cards.find((card) => card.id === id);
  if (card === undefined) throw new Error('Expected normalized fixture card ' + id);
  return card;
}

describe('support-card resource normalization', () => {
  it('accepts a default-exported map and preserves legacy Angular title aliases', () => {
    const cards = normalizeSupportCards({ default: { 2: kitasanCard } });
    const card = requireCard(cards, '2');

    expect(card).toMatchObject({
      id: '2',
      name: 'Kitasan Black',
      cardFullName: '[Fire at My Heels] Kitasan Black'
    });
  });

  it('rejects an error envelope instead of treating it as a card', () => {
    const normalizeErrorEnvelope = () => normalizeSupportCards({ error: 'Unavailable' });

    expect(normalizeErrorEnvelope).toThrow('Invalid support-card record');
  });
});

describe('support-card display', () => {
  it.each([
    { source: kitasanCard, character: 'Kitasan Black', title: '[Fire at My Heels]' },
    { source: fineMotionCard, character: 'Fine Motion', title: '[Wave of Gratitude]' }
  ])('formats the title and character for $character', ({ source, character, title }) => {
    const cards = normalizeSupportCards([source]);
    const card = requireCard(cards, String(source.id));
    const display = supportCardDisplay(card);

    expect(display).toMatchObject({ title, character });
  });
});

describe('support-card search', () => {
  it.each([
    { query: 'BLACK, FIRE', matches: true },
    { query: 'Kitasan-Heels', matches: true },
    { query: '2', matches: true },
    { query: 'Kitasan Grass', matches: false }
  ])('matches "$query": $matches', ({ query, matches }) => {
    const cards = normalizeSupportCards([kitasanCard]);
    const card = requireCard(cards, '2');
    const display = supportCardDisplay(card);

    const matchesQuery = matchesSupportSearch(display.searchText, query);

    expect(matchesQuery).toBe(matches);
  });
});

describe('released support cards', () => {
  it('requires an explicit English release flag', () => {
    const cards = normalizeSupportCards([
      kitasanCard,
      {
        id: 4,
        name: 'Unreleased',
        type: 'group',
        rarity: 3,
        release_date: '2026-02-01',
        isReleased_en: false
      },
      { id: 5, name: 'No release flag', type: 'guts', rarity: 1, release_date: '2026-03-01' }
    ]);

    const released = releasedSupportCards(cards);
    const releasedIds = released.map((card) => card.id);

    expect(releasedIds).toEqual(['2']);
  });

  it('orders newest releases first and breaks matching dates by descending card ID', () => {
    const cards = normalizeSupportCards([
      { ...kitasanCard, id: 1, release_date: '2025-12-31' },
      kitasanCard,
      fineMotionCard
    ]);

    const released = releasedSupportCards(cards);
    const releasedIds = released.map((card) => card.id);

    expect(releasedIds).toEqual(['3', '2', '1']);
  });
});

describe('support-card type labels', () => {
  it.each([
    { type: 'intelligence', label: 'Wit' },
    { type: 'wisdom', label: 'Wit' },
    { type: 'group', label: 'Friend' },
    { type: 'unknown', label: 'Speed' }
  ])('displays $type as $label', ({ type, label }) => {
    const displayName = supportTypeName(type);

    expect(displayName).toBe(label);
  });
});
