import { describe, expect, it } from 'vitest';
import { runtimeConfig } from '@/services/runtime-config';
import type { CharacterData } from '@/lib/game-data/characters';
import type { SupportCardData } from '@/lib/game-data/support-cards/support-card-details';
import { gachaItemDisplay } from './gacha-display';

const art = (key: string) => `${runtimeConfig.assetOrigin}/en/art/${key}`;

function supportCard(overrides: Partial<SupportCardData>): SupportCardData {
  return {
    id: '30001',
    name: 'Agnes Tachyon',
    rarity: 1,
    type: 'speed',
    release_date: '2021-03-01',
    cardFullName: '[tach-nology] Agnes Tachyon',
    ...overrides
  };
}

function supportDisplay(overrides: Partial<SupportCardData>) {
  const card = supportCard(overrides);
  return gachaItemDisplay(Number(card.id), 'support', {
    characters: new Map(),
    supports: new Map([[Number(card.id), card]])
  });
}

function character(id: number, name: string, subtitle: string): [number, CharacterData] {
  return [id, { id: String(id), name, image: '', subtitle }];
}

describe('gacha item display', () => {
  it('files a support card under its title, character and type', () => {
    expect(supportDisplay({})).toMatchObject({
      name: 'Agnes Tachyon [tach-nology]',
      subName: 'tach-nology',
      ownerName: 'Agnes Tachyon',
      typeLabel: 'Speed',
      typeIcon: art('ui/stats/speed.webp')
    });
  });

  it('names a Group card by its group and its own type', () => {
    const display = supportDisplay({
      name: 'Team Sirius',
      cardFullName: '[Winning Dream] Team Sirius',
      type: 'group'
    });

    expect(display).toMatchObject({
      subName: 'Winning Dream',
      ownerName: 'Team Sirius',
      typeLabel: 'Group',
      typeIcon: art('ui/stats/group.webp')
    });
  });

  it('reads the game name of a Wit card', () => {
    expect(supportDisplay({ type: 'wisdom' })).toMatchObject({
      typeLabel: 'Wit',
      typeIcon: art('ui/stats/wit.webp')
    });
  });

  it('keeps an outfit variation as a trainee sub name, and drops the plain one', () => {
    const characters = new Map([
      character(100101, 'Special Week', 'Harey Days'),
      character(100102, 'Special Week', 'Original')
    ]);
    const catalog = { characters, supports: new Map() };

    expect(gachaItemDisplay(100101, 'character', catalog)).toMatchObject({
      subName: 'Harey Days',
      ownerName: 'Special Week',
      typeLabel: 'Trainee'
    });
    expect(gachaItemDisplay(100102, 'character', catalog)).toMatchObject({
      name: 'Special Week',
      subName: undefined
    });
  });
});
