import { describe, expect, it } from 'vitest';
import type { SupportCardData } from '@/lib/game-data/support-cards/support-card-details';
import { englishSupportRecord } from './jp-gacha-catalog';

const jpRecord = (overrides: Record<string, unknown>) =>
  englishSupportRecord(
    {
      id: '30067',
      name: 'シンボリルドルフ',
      rarity: 3,
      type: 'group',
      release_date: '2023-02-24',
      character_name: 'シンボリルドルフ',
      card_name: '玉座に集いし者たち',
      card_title: '[尊敬と敬愛]',
      card_full_name: '[尊敬と敬愛] 玉座に集いし者たち',
      title_en: '[Esteemed and Adored]',
      ...overrides
    },
    overrides.english as SupportCardData | undefined
  );

const globalCard: SupportCardData = {
  id: '30067',
  name: 'Symboli Rudolf',
  rarity: 3,
  type: 'group',
  release_date: '2023-02-24',
  cardName: 'Heirs to the Throne',
  cardTitle: '[Esteemed and Adored]'
};

describe('JP support card in English', () => {
  it('takes a Group card name from the global set, not the Japanese master text', () => {
    expect(jpRecord({ english: globalCard })).toMatchObject({
      character_name: 'Symboli Rudolf',
      card_name: 'Heirs to the Throne',
      card_title: '[Esteemed and Adored]',
      card_full_name: '[Esteemed and Adored] Heirs to the Throne'
    });
  });

  it('reads the English character and title for a card the global set does not have', () => {
    expect(
      jpRecord({ name_en: 'Nishino Flower', title_en: '[Little Cupcakes, Big Emotion]' })
    ).toMatchObject({
      character_name: 'Nishino Flower',
      card_name: 'Nishino Flower',
      card_title: '[Little Cupcakes, Big Emotion]'
    });
  });

  it('falls back to the English character when the card name has no translation', () => {
    expect(jpRecord({ name_en: 'Symboli Rudolf', title_en: undefined })).toMatchObject({
      character_name: 'Symboli Rudolf',
      card_name: 'Symboli Rudolf'
    });
  });

  it('keeps the master name when nothing is translated yet', () => {
    expect(jpRecord({ title_en: undefined })).toMatchObject({
      character_name: 'シンボリルドルフ',
      card_name: 'シンボリルドルフ',
      card_title: '[尊敬と敬愛]'
    });
  });
});
