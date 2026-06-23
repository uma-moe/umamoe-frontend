import { BehaviorSubject } from 'rxjs';
import { Character } from '../models/character.model';
import { SupportCardShort } from '../models/support-card.model';
import { EventType, TimelineEvent } from '../models/timeline.model';
import { MasterDataService } from './master-data.service';
import { TimelineAvatarService } from './timeline-avatar.service';

describe('TimelineAvatarService', () => {
  function createService(characters: Character[] = [], supportCards: SupportCardShort[] = []): TimelineAvatarService {
    const masterData = {
      characters$: new BehaviorSubject<Character[]>(characters),
      supportCards$: new BehaviorSubject<SupportCardShort[]>(supportCards),
      initCharacterSupportResources: jasmine.createSpy('initCharacterSupportResources')
    } as unknown as MasterDataService;

    return new TimelineAvatarService(masterData);
  }

  function createCharacterBanner(pickupCardIds: number[], relatedCharacters: string[] = []): TimelineEvent {
    return {
      id: 'character-banner-test',
      type: EventType.CHARACTER_BANNER,
      title: 'Legacy title',
      jpReleaseDate: new Date('2022-07-29T03:00:00Z'),
      isConfirmed: false,
      pickupCardIds,
      relatedCharacters
    };
  }

  it('resolves character banner display names from pickup card ids and character_names', () => {
    const service = createService();
    const event = createCharacterBanner([100702, 101303], ['Wrong Gold Ship', 'Wrong McQueen']);

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.displayName)).toEqual([
      'Gold Ship (Summer)',
      'Mejiro McQueen (Summer)'
    ]);
    expect(avatars.map(avatar => avatar.variantName)).toEqual(['Summer', 'Summer']);
  });

  it('builds GameTora character URLs from the pickup card id and resource base name', () => {
    const service = createService();
    const event = createCharacterBanner([100702, 101303]);

    const avatars = service.getCharacterAvatars(event);

    expect(avatars.map(avatar => avatar.gametoraUrl)).toEqual([
      'https://gametora.com/umamusume/characters/100702-gold-ship',
      'https://gametora.com/umamusume/characters/101303-mejiro-mcqueen'
    ]);
  });
});
