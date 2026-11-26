import { describe, expect, it } from 'vitest';
import { englishSupportRecord } from './jp-gacha-catalog';

const record = (overrides: Record<string, unknown>) =>
  englishSupportRecord({
    id: '30137',
    name: 'Darley Arabian',
    rarity: 3,
    type: 'group',
    release_date: '2023-03-20',
    character_name: 'Darley Arabian',
    card_name: 'Progenitors and Guides',
    card_title: '[Chasing Eternal Glory]',
    card_full_name: '[Chasing Eternal Glory] Progenitors and Guides',
    ...overrides
  });

describe('JP support card in English', () => {
  it('keeps a Group card under its group, not its lead character', () => {
    expect(record({})).toMatchObject({
      character_name: 'Darley Arabian',
      card_name: 'Progenitors and Guides',
      card_title: '[Chasing Eternal Glory]',
      card_full_name: '[Chasing Eternal Glory] Progenitors and Guides'
    });
  });

  it('reads the English character name when the card name is only the character again', () => {
    expect(
      record({
        name_en: 'Nishino Flower',
        title_en: '[Little Cupcakes, Big Emotion]',
        character_name: 'ニシノフラワー',
        card_name: 'ニシノフラワー'
      })
    ).toMatchObject({
      character_name: 'Nishino Flower',
      card_name: 'Nishino Flower',
      card_title: '[Little Cupcakes, Big Emotion]'
    });
  });

  it('falls back to the character name for a card with no name of its own', () => {
    expect(record({ character_name: 'Kitasan Black', card_name: undefined })).toMatchObject({
      card_name: 'Kitasan Black'
    });
  });
});
