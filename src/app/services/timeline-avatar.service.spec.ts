import { EventType, TimelineEvent } from '../models/timeline.model';
import { TimelineAvatarService } from './timeline-avatar.service';
import characterData from '../../data/character.json';
import characterNames from '../../data/character_names.json';
import supportCardsData from '../../data/support-cards-db.json';
import { replaceCharacterMasterData } from '../data/character.data';
import { replaceSupportCardsData } from '../data/support-cards.data';

describe('TimelineAvatarService', () => {
  beforeEach(() => {
    replaceCharacterMasterData([], {});
    replaceSupportCardsData([]);
  });
  function createCharacterBanner(
    pickupCardIds: number[],
    relatedCharacters: string[] = [],
    title = 'Character banner',
  ): TimelineEvent {
    return {
      id: 'character-banner-test',
      type: EventType.CHARACTER_BANNER,
      title,
      jpReleaseDate: new Date('2022-07-29T03:00:00Z'),
      isConfirmed: false,
      pickupCardIds,
      relatedCharacters,
    };
  }

  it('builds character portraits and links only from public timeline fields', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner(
      [100702, 101303],
      ['Gold Ship (Summer)', 'Mejiro McQueen (Summer)'],
    );

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual([
      'Gold Ship (Summer)',
      'Mejiro McQueen (Summer)',
    ]);
    expect(avatars.map(avatar => avatar.variantName)).toEqual(['Summer', 'Summer']);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/character_stand/chara_stand_100702.webp',
      '/assets/images/character_stand/chara_stand_101303.webp',
    ]);
    expect(avatars.map(avatar => avatar.gametoraUrl)).toEqual([
      'https://gametora.com/umamusume/characters/100702-gold-ship',
      'https://gametora.com/umamusume/characters/101303-mejiro-mcqueen',
    ]);
  });

  it('keeps every pickup for compact two-portrait plus-N rendering', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner(
      [100101, 100201, 100301, 100401],
      ['Special Week', 'Silence Suzuka', 'Tokai Teio', 'Maruzensky'],
      'Special Week + 3 more',
    );

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.length).toBe(4);
    expect(avatars.slice(0, 2).map(avatar => avatar.displayName)).toEqual(['Special Week', 'Silence Suzuka']);
    expect(service.getEventDisplayTitle(event)).toBe('Special Week + 3 more');
  });

  it('uses friendly deterministic fallbacks when public names are absent or unknown', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner([100702, 101303], ['Unknown_100702']);

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual(['Character 100702', 'Character 101303']);
    expect(avatars[0].gametoraUrl).toBe('https://gametora.com/umamusume/characters/100702-character-100702');
  });

  it('classifies support IDs and builds support assets without master data', () => {
    const service = new TimelineAvatarService();
    const event: TimelineEvent = {
      id: 'support-banner-test',
      type: EventType.SUPPORT_CARD_BANNER,
      title: 'Fine Motion + 1 more',
      jpReleaseDate: new Date('2022-07-29T03:00:00Z'),
      isConfirmed: false,
      pickupCardIds: [30001, 30002],
      relatedSupportCards: ['Fine Motion'],
    };

    const avatars = service.getSupportAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual(['Fine Motion', 'Support 30002']);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/support_card/half/support_card_s_30001.webp',
      '/assets/images/support_card/half/support_card_s_30002.webp',
    ]);
    expect(avatars[0].gametoraUrl).toBe('https://gametora.com/umamusume/supports/30001-fine-motion');
    expect(service.getCharacterAvatars(event)).toEqual([]);
  });

  it('hydrates future pickup IDs from bundled character and support masters', () => {
    replaceCharacterMasterData(characterData, characterNames);
    replaceSupportCardsData(supportCardsData);
    const service = new TimelineAvatarService();

    const character = service.getPickupAvatarByKind('character', 113202);
    const support = service.getPickupAvatarByKind('support', 30289);

    expect(character?.displayName).toBe('Loves Only You');
    expect(character?.fallbackImageUrl)
      .toBe('/assets/images/character_stand/chara_stand_113201.webp');
    expect(support?.displayName).toBe('Forever Young');
    expect(support?.subLabel).toContain('Wisdom Support');
  });

  it('uses public related names for timeline search', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner([100702], ['Gold Ship']);

    expect(service.eventMatchesSearch(event, 'gold ship')).toBeTrue();
    expect(service.eventMatchesSearch(event, 'summer')).toBeFalse();
  });

  it('keeps every Legend Race participant exposed by the public timeline', () => {
    const service = new TimelineAvatarService();
    const event: TimelineEvent = {
      id: 'legend-race-test',
      type: EventType.LEGEND_RACE,
      title: 'Japan Cup Legend Race',
      jpReleaseDate: new Date('2021-03-16T03:00:00Z'),
      isConfirmed: true,
      relatedCharacters: [
        'assets/images/legend/boss/chara_stand_101401.webp',
        'assets/images/legend/boss/chara_stand_100101.webp',
        'assets/images/legend/boss/chara_stand_101701.webp'
      ]
    };

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.length).toBe(3);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/legend/boss/chara_stand_101401.webp',
      '/assets/images/legend/boss/chara_stand_100101.webp',
      '/assets/images/legend/boss/chara_stand_101701.webp'
    ]);
    expect(avatars.every(avatar => avatar.subLabel === 'Legend Race participant')).toBeTrue();
  });

  it('uses aligned public names and participant IDs from the current Legend Race schema', () => {
    const service = new TimelineAvatarService();
    const event: TimelineEvent = {
      id: 'legend-race-current-schema',
      type: EventType.LEGEND_RACE,
      title: 'Japan Cup Legend Race',
      jpReleaseDate: new Date('2021-03-16T03:00:00Z'),
      isConfirmed: true,
      pickupCardIds: [101401, 100101, 101701],
      relatedCharacters: ['Grass Wonder', 'Special Week', 'Symboli Rudolf']
    };

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual([
      'Grass Wonder',
      'Special Week',
      'Symboli Rudolf'
    ]);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/character_stand/chara_stand_101401.webp',
      '/assets/images/character_stand/chara_stand_100101.webp',
      '/assets/images/character_stand/chara_stand_101701.webp'
    ]);
  });
});
