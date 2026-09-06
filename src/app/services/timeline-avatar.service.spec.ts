import { EventType, TimelineEvent } from '../models/timeline.model';
import { TimelineAvatarService } from './timeline-avatar.service';
import { getAllCharacters, replaceCharacterMasterData } from '../data/character.data';

describe('TimelineAvatarService', () => {
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

  it('builds character portraits from pickup IDs and normalizes variant names', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner(
      [100702, 101303],
      ['Gold Ship (Summer)', 'Mejiro McQueen (Summer)'],
    );

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual([
      'Gold Ship [Summer]',
      'Mejiro McQueen [Summer]',
    ]);
    expect(avatars.map(avatar => avatar.variantName)).toEqual(['Summer', 'Summer']);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/character_stand/chara_stand_100702.webp',
      '/assets/images/character_stand/chara_stand_101303.webp',
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

  it('uses master names when public names are absent or unknown', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner([100702, 101303], ['Unknown_100702']);

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual(['Gold Ship [Summer]', 'Mejiro McQueen [Summer]']);
  });

  it('classifies support IDs and fills missing names from master data', () => {
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

    expect(avatars.map(avatar => avatar.displayName)).toEqual(['Fine Motion', 'Silence Suzuka']);
    expect(avatars.map(avatar => avatar.imageUrl)).toEqual([
      '/assets/images/support_card/half/support_card_s_30001.webp',
      '/assets/images/support_card/half/support_card_s_30002.webp',
    ]);
    expect(service.getCharacterAvatars(event)).toEqual([]);
  });

  it('hydrates future pickup IDs from bundled character and support masters', () => {
    const service = new TimelineAvatarService();

    const character = service.getPickupAvatarByKind('character', 113202);
    const support = service.getPickupAvatarByKind('support', 30289);

    expect(character?.displayName).toBe('Loves Only You');
    expect(character?.fallbackImageUrl)
      .toBe('/assets/images/character_stand/chara_stand_113201.webp');
    expect(support?.displayName).toBe('Forever Young');
    expect(support?.subLabel).toContain('Wisdom Support');
  });

  it('derives pickup portraits automatically even for IDs absent from the masters', () => {
    const service = new TimelineAvatarService();
    const characterEvent = createCharacterBanner([199901], ['Future Uma']);
    characterEvent.imagePath = '/assets/timeline-images/gacha/character/39998.webp';
    const supportEvent: TimelineEvent = {
      ...createCharacterBanner([39999], ['Future Support']),
      type: EventType.SUPPORT_CARD_BANNER,
      imagePath: '/assets/timeline-images/gacha/support/39999.webp',
    };

    expect(service.getCharacterAvatars(characterEvent)[0].imageUrl)
      .toBe('/assets/images/character_stand/chara_stand_199901.webp');
    expect(service.getSupportAvatars(supportEvent)[0].imageUrl)
      .toBe('/assets/images/support_card/half/support_card_s_39999.webp');
    expect(service.getPickupAvatar(characterEvent, 199901)?.imageUrl)
      .toBe('/assets/images/character_stand/chara_stand_199901.webp');
    expect(service.getPickupAvatar(supportEvent, 39999)?.imageUrl)
      .toBe('/assets/images/support_card/half/support_card_s_39999.webp');
  });

  it('keeps Nakayama Festa portraits when loaded master data omits the pickup', () => {
    const characters = [...getAllCharacters()];
    try {
      replaceCharacterMasterData([]);
      const service = new TimelineAvatarService();
      const event = createCharacterBanner([104901], ['Nakayama Festa']);
      event.imagePath = '/assets/timeline-images/gacha/character/30128.webp';

      expect(service.getCharacterAvatars(event)[0].imageUrl)
        .toBe('/assets/images/character_stand/chara_stand_104901.webp');
      expect(service.getPickupAvatarByKind('character', 104901)?.imageUrl)
        .toBe('/assets/images/character_stand/chara_stand_104901.webp');
    } finally {
      replaceCharacterMasterData(characters);
    }
  });

  it('uses public related names and master variants for timeline search', () => {
    const service = new TimelineAvatarService();
    const event = createCharacterBanner([100702], ['Gold Ship']);

    expect(service.eventMatchesSearch(event, 'gold ship')).toBeTrue();
    expect(service.eventMatchesSearch(event, 'summer')).toBeTrue();
    expect(service.eventMatchesSearch(event, 'christmas')).toBeFalse();
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
      relatedCharacters: ['El Condor Pasa', 'Special Week', 'Symboli Rudolf']
    };

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual([
      'El Condor Pasa',
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
