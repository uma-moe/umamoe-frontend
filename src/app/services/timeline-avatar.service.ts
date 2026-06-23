import { Injectable } from '@angular/core';
import { combineLatest } from 'rxjs';
import { getCharacterNameEntry } from '../data/character.data';
import { Character } from '../models/character.model';
import { SupportCardShort, SupportCardType } from '../models/support-card.model';
import { EventType, TimelineEvent } from '../models/timeline.model';
import { MasterDataService } from './master-data.service';

export interface TimelineAvatar {
  key: string;
  kind: 'character' | 'support';
  name: string;
  displayName: string;
  subLabel: string;
  variantName?: string;
  searchTerms?: string[];
  imageUrl: string;
  gametoraUrl: string;
}

@Injectable({ providedIn: 'root' })
export class TimelineAvatarService {
  private lookupRevision = 0;
  private characterById = new Map<number, Character>();
  private charactersByName = new Map<string, Character[]>();
  private supportCardById = new Map<string, SupportCardShort>();
  private supportCardsByName = new Map<string, SupportCardShort[]>();
  private characterAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();
  private supportAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();

  constructor(private masterData: MasterDataService) {
    combineLatest([
      this.masterData.characters$,
      this.masterData.supportCards$
    ]).subscribe(([characters, supportCards]) => {
      this.updateLookups(characters, supportCards);
    });

    this.masterData.initCharacterSupportResources();
  }

  get revision(): number {
    return this.lookupRevision;
  }

  getCharacterAvatars(event?: TimelineEvent): TimelineAvatar[] {
    if (!event?.relatedCharacters?.length || event.type === EventType.LEGEND_RACE) {
      return [];
    }

    const cached = this.characterAvatarCache.get(event);
    if (cached) {
      return cached;
    }

    const avatars = this.buildCharacterAvatars(event);
    this.characterAvatarCache.set(event, avatars);
    return avatars;
  }

  getSupportAvatars(event?: TimelineEvent): TimelineAvatar[] {
    if (!event?.relatedSupportCards?.length) {
      return [];
    }

    const cached = this.supportAvatarCache.get(event);
    if (cached) {
      return cached;
    }

    const avatars = this.buildSupportAvatars(event);
    this.supportAvatarCache.set(event, avatars);
    return avatars;
  }

  eventMatchesSearch(event: TimelineEvent | undefined, query: string): boolean {
    const searchKey = this.normalizeLookupKey(query);
    if (!event || !searchKey) {
      return true;
    }

    return this.getEventSearchValues(event).some(value =>
      this.normalizeLookupKey(value).includes(searchKey)
    );
  }

  private updateLookups(characters: Character[], supportCards: SupportCardShort[]): void {
    this.characterById = new Map(characters.map(character => [character.id, character]));
    this.charactersByName = this.groupByName(characters);
    this.supportCardById = new Map(supportCards.map(card => [card.id, card]));
    this.supportCardsByName = this.groupByName(supportCards);
    this.characterAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();
    this.supportAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();
    this.lookupRevision++;
  }

  private groupByName<T extends { name: string }>(items: T[]): Map<string, T[]> {
    const index = new Map<string, T[]>();

    items.forEach(item => {
      const key = this.normalizeLookupKey(item.name);
      const group = index.get(key);
      if (group) {
        group.push(item);
      } else {
        index.set(key, [item]);
      }
    });

    return index;
  }

  private buildCharacterAvatars(event: TimelineEvent): TimelineAvatar[] {
    const names = event.relatedCharacters ?? [];
    const ids = event.pickupCardIds ?? [];
    const count = Math.max(names.length, ids.length);
    const avatars: TimelineAvatar[] = [];

    for (let index = 0; index < count; index++) {
      const avatar = this.resolveCharacterAvatar(ids[index], names[index]);
      if (avatar) {
        avatars.push(avatar);
      }
    }

    return avatars;
  }

  private buildSupportAvatars(event: TimelineEvent): TimelineAvatar[] {
    const names = event.relatedSupportCards ?? [];
    const ids = event.pickupCardIds ?? [];
    const count = Math.max(names.length, ids.length);
    const avatars: TimelineAvatar[] = [];

    for (let index = 0; index < count; index++) {
      const avatar = this.resolveSupportAvatar(ids[index], names[index]);
      if (avatar) {
        avatars.push(avatar);
      }
    }

    return avatars;
  }

  private resolveCharacterAvatar(cardId?: number, displayName?: string): TimelineAvatar | null {
    const character = typeof cardId === 'number'
      ? this.characterById.get(cardId)
      : undefined;
    const matchedCharacter = character ?? this.findCharacterByName(displayName);

    if (!matchedCharacter && typeof cardId !== 'number') {
      return null;
    }

    const id = matchedCharacter?.id ?? cardId!;
    const baseName = matchedCharacter?.name || displayName || `Character ${id}`;
    const variantName = this.getCharacterVariantName(id);
    const displayNameWithVariant = variantName ? `${baseName} (${variantName})` : baseName;
    const image = matchedCharacter
      ? this.getCharacterImageUrl(matchedCharacter)
      : `/assets/images/character_stand/chara_stand_${id}.webp`;

    return {
      key: `character-${id}-${displayNameWithVariant}`,
      kind: 'character',
      name: baseName,
      displayName: displayNameWithVariant,
      subLabel: variantName ? `${variantName} - Character` : 'Character',
      variantName,
      searchTerms: variantName ? [variantName] : [],
      imageUrl: image,
      gametoraUrl: this.characterGametoraUrl(id, baseName)
    };
  }

  private resolveSupportAvatar(cardId?: number, displayName?: string): TimelineAvatar | null {
    const id = typeof cardId === 'number' ? String(cardId) : undefined;
    const supportCard = id ? this.supportCardById.get(id) : undefined;
    const matchedCard = supportCard ?? this.findSupportCardByName(displayName);

    if (!matchedCard && !id) {
      return null;
    }

    const cardIdValue = matchedCard?.id ?? id!;
    const name = displayName || matchedCard?.name || `Support ${cardIdValue}`;
    const image = matchedCard?.imageUrl ?? `/assets/images/support_card/half/support_card_s_${cardIdValue}.webp`;
    const typeInfo = this.getSupportTypeInfo(matchedCard?.type);

    return {
      key: `support-${cardIdValue}-${name}`,
      kind: 'support',
      name,
      displayName: name,
      subLabel: typeInfo.label,
      searchTerms: typeInfo.searchTerms,
      imageUrl: image,
      gametoraUrl: `https://gametora.com/umamusume/supports/${cardIdValue}-${this.toGametoraSlug(name)}`
    };
  }

  private findCharacterByName(name?: string): Character | undefined {
    if (!name) {
      return undefined;
    }

    return this.charactersByName.get(this.normalizeLookupKey(name))?.[0];
  }

  private findSupportCardByName(name?: string): SupportCardShort | undefined {
    if (!name) {
      return undefined;
    }

    return this.supportCardsByName.get(this.normalizeLookupKey(name))?.[0];
  }

  private getCharacterImageUrl(character: Character): string {
    return `/assets/images/character_stand/${this.preferWebp(character.image)}`;
  }

  private getEventSearchValues(event: TimelineEvent): string[] {
    const characterAvatars = this.getCharacterAvatars(event);
    const supportAvatars = this.getSupportAvatars(event);

    return [
      event.title,
      event.description,
      ...(event.relatedCharacters ?? []),
      ...(event.relatedSupportCards ?? []),
      ...characterAvatars.map(avatar => avatar.name),
      ...characterAvatars.map(avatar => avatar.displayName),
      ...characterAvatars.map(avatar => avatar.subLabel),
      ...characterAvatars.flatMap(avatar => avatar.searchTerms ?? []),
      ...supportAvatars.map(avatar => avatar.name),
      ...supportAvatars.map(avatar => avatar.displayName),
      ...supportAvatars.map(avatar => avatar.subLabel),
      ...supportAvatars.flatMap(avatar => avatar.searchTerms ?? [])
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);
  }

  private getCharacterVariantName(id: number): string | undefined {
    const characterId = Math.floor(id / 100);
    const skinId = String(id % 100).padStart(2, '0');
    const skinName = getCharacterNameEntry(characterId)?.skins?.[skinId];

    if (!skinName || skinName.toLowerCase() === 'original') {
      return undefined;
    }

    return skinName;
  }

  private getSupportTypeInfo(type?: SupportCardType): { label: string; searchTerms: string[] } {
    switch (type) {
      case SupportCardType.SPEED:
        return { label: 'Speed', searchTerms: ['speed'] };
      case SupportCardType.STAMINA:
        return { label: 'Stamina', searchTerms: ['stamina'] };
      case SupportCardType.POWER:
        return { label: 'Power', searchTerms: ['power'] };
      case SupportCardType.GUTS:
        return { label: 'Guts', searchTerms: ['guts'] };
      case SupportCardType.WISDOM:
        return { label: 'Wit', searchTerms: ['wit', 'wisdom', 'intelligence'] };
      case SupportCardType.FRIEND:
        return { label: 'Friend', searchTerms: ['friend', 'group'] };
      default:
        return { label: 'Support', searchTerms: ['support'] };
    }
  }

  private preferWebp(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '.webp');
  }

  private normalizeLookupKey(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  private toGametoraSlug(value: string): string {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['.]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private characterGametoraUrl(id: number, name: string): string {
    return `https://gametora.com/umamusume/characters/${id}-${this.toGametoraSlug(name)}`;
  }
}
