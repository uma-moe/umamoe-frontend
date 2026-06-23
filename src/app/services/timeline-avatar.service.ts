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

interface CharacterCardIdentity {
  baseName: string;
  variantName?: string;
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
    if (!event || event.type === EventType.LEGEND_RACE) {
      return [];
    }

    if (!event.relatedCharacters?.length && this.getCharacterPickupIds(event).length === 0) {
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
    if (!event) {
      return [];
    }

    if (!event.relatedSupportCards?.length && this.getSupportPickupIds(event).length === 0) {
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

    const searchValues = this.getEventSearchValues(event)
      .map(value => this.normalizeLookupKey(value))
      .filter(value => value.length > 0);
    const combinedSearchKey = searchValues.join('');
    const queryTokens = this.getSearchTokens(query);

    return searchValues.some(value => value.includes(searchKey))
      || combinedSearchKey.includes(searchKey)
      || queryTokens.every(token => searchValues.some(value => value.includes(token)));
  }

  getEventDisplayTitle(event: TimelineEvent | undefined): string {
    if (!event) {
      return '';
    }

    const titleAvatars = this.getTitleAvatars(event);
    if (titleAvatars.length === 0) {
      return event.title;
    }

    const extraCount = Math.max(
      titleAvatars.length - 1,
      this.extractExistingMoreCount(event.title) ?? 0
    );

    return extraCount > 0
      ? `${titleAvatars[0].displayName} + ${extraCount} more`
      : titleAvatars[0].displayName;
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
    const ids = this.getCharacterPickupIds(event);
    const avatars: TimelineAvatar[] = [];
    const usedKeys = new Set<string>();

    for (const id of ids) {
      const avatar = this.resolveCharacterAvatar(id);
      if (avatar) {
        avatars.push(avatar);
        usedKeys.add(avatar.key);
      }
    }

    if (ids.length === 0) {
      names.forEach(name => {
        const avatar = this.resolveCharacterAvatar(undefined, name);
        if (avatar && !usedKeys.has(avatar.key)) {
          avatars.push(avatar);
          usedKeys.add(avatar.key);
        }
      });
    }

    return avatars;
  }

  private buildSupportAvatars(event: TimelineEvent): TimelineAvatar[] {
    const names = event.relatedSupportCards ?? [];
    const ids = this.getSupportPickupIds(event);
    const avatars: TimelineAvatar[] = [];
    const usedKeys = new Set<string>();

    for (let index = 0; index < ids.length; index++) {
      const avatar = this.resolveSupportAvatar(ids[index], names[index]);
      if (avatar) {
        avatars.push(avatar);
        usedKeys.add(avatar.key);
      }
    }

    if (ids.length === 0) {
      names.forEach(name => {
        const avatar = this.resolveSupportAvatar(undefined, name);
        if (avatar && !usedKeys.has(avatar.key)) {
          avatars.push(avatar);
          usedKeys.add(avatar.key);
        }
      });
    }

    return avatars;
  }

  private getCharacterPickupIds(event: TimelineEvent): number[] {
    return (event.pickupCardIds ?? []).filter(id => this.isCharacterCardId(id));
  }

  private getSupportPickupIds(event: TimelineEvent): number[] {
    return (event.pickupCardIds ?? []).filter(id => this.isSupportCardId(id));
  }

  private isCharacterCardId(id: number): boolean {
    return this.characterById.has(id) || id >= 100000;
  }

  private isSupportCardId(id: number): boolean {
    return this.supportCardById.has(String(id)) || id < 100000;
  }

  private resolveCharacterAvatar(cardId?: number, displayName?: string): TimelineAvatar | null {
    const character = typeof cardId === 'number'
      ? this.characterById.get(cardId)
      : undefined;
    const matchedCharacter = character ?? this.findCharacterByName(displayName);

    if (!matchedCharacter && typeof cardId !== 'number') {
      return null;
    }

    const id = cardId ?? matchedCharacter!.id;
    const cardIdentity = this.resolveCharacterCardIdentity(id);
    const baseName = cardIdentity?.baseName || matchedCharacter?.name || displayName || `Character ${id}`;
    const variantName = cardIdentity?.variantName;
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
      searchTerms: variantName ? [variantName, `${baseName} ${variantName}`] : [],
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
      this.getEventDisplayTitle(event),
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

  private getTitleAvatars(event: TimelineEvent): TimelineAvatar[] {
    switch (event.type) {
      case EventType.CHARACTER_BANNER:
        return this.getCharacterAvatars(event);
      case EventType.SUPPORT_CARD_BANNER:
        return this.getSupportAvatars(event);
      case EventType.PAID_BANNER: {
        const characterAvatars = this.getCharacterAvatars(event);
        return characterAvatars.length > 0 ? characterAvatars : this.getSupportAvatars(event);
      }
      default:
        return [];
    }
  }

  private extractExistingMoreCount(title: string): number | undefined {
    const match = title.match(/\+\s*(\d+)\s+more/i);
    return match ? Number(match[1]) : undefined;
  }

  private resolveCharacterCardIdentity(id: number): CharacterCardIdentity | undefined {
    const characterId = Math.floor(id / 100);
    const skinId = String(id % 100).padStart(2, '0');
    const entry = getCharacterNameEntry(characterId);
    if (!entry?.name) {
      return undefined;
    }

    const skinName = entry.skins?.[skinId];
    const variantName = skinName && skinName.toLowerCase() !== 'original'
      ? skinName
      : undefined;
    return {
      baseName: entry.name,
      variantName
    };
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

  private getSearchTokens(value: string): string[] {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/g)
      .map(token => this.normalizeLookupKey(token))
      .filter(token => token.length > 0);
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
