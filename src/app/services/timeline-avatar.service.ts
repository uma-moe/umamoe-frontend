import { Injectable } from '@angular/core';
import { EventType, TimelineEvent } from '../models/timeline.model';
import { getAllCharacters, getCharacterById, getCharacterNameEntry } from '../data/character.data';
import { getSupportCardById } from '../data/support-cards.data';
import { Rarity, SupportCardType } from '../models/support-card.model';

export interface TimelineAvatar {
  key: string;
  kind: 'character' | 'support';
  name: string;
  displayName: string;
  subLabel: string;
  variantName?: string;
  searchTerms?: string[];
  imageUrl: string;
  fallbackImageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class TimelineAvatarService {
  private characterAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();
  private supportAvatarCache = new WeakMap<TimelineEvent, TimelineAvatar[]>();

  get revision(): number {
    return 0;
  }

  getCharacterAvatars(event?: TimelineEvent): TimelineAvatar[] {
    if (!event) {
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

  getPickupAvatar(event: TimelineEvent, pickupId: number, displayName?: string): TimelineAvatar | null {
    return event.type === EventType.SUPPORT_CARD_BANNER || this.isSupportCardId(pickupId)
      ? this.resolveSupportAvatar(pickupId, displayName, event.imagePath)
      : this.resolveCharacterAvatar(pickupId, displayName, event.imagePath);
  }

  getPickupAvatarByKind(
    kind: 'character' | 'support',
    pickupId: number,
    displayName?: string,
    officialImageUrl?: string,
  ): TimelineAvatar | null {
    return kind === 'support'
      ? this.resolveSupportAvatar(pickupId, displayName, officialImageUrl)
      : this.resolveCharacterAvatar(pickupId, displayName, officialImageUrl);
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

  private buildCharacterAvatars(event: TimelineEvent): TimelineAvatar[] {
    if (event.type === EventType.LEGEND_RACE) {
      return this.buildLegendRaceAvatars(event);
    }

    const names = event.relatedCharacters ?? [];
    const ids = this.getCharacterPickupIds(event);
    const avatars: TimelineAvatar[] = [];
    const usedKeys = new Set<string>();

    for (let index = 0; index < ids.length; index++) {
      const avatar = this.resolveCharacterAvatar(ids[index], names[index], event.imagePath);
      if (avatar && !usedKeys.has(avatar.key)) {
        avatars.push(avatar);
        usedKeys.add(avatar.key);
      }
    }

    return avatars;
  }

  private buildLegendRaceAvatars(event: TimelineEvent): TimelineAvatar[] {
    const avatars: TimelineAvatar[] = [];
    const usedIds = new Set<number>();
    const relatedCharacters = event.relatedCharacters ?? [];
    const explicitIds = (event.pickupCardIds ?? []).filter(id => this.isCharacterCardId(id));

    const participants: Array<{ cardId: number; relatedCharacter?: string }> = explicitIds.map((cardId, index) => ({
      cardId,
      relatedCharacter: relatedCharacters[index]
    }));

    for (const relatedCharacter of relatedCharacters) {
      const legacyCardId = this.extractCharacterCardId(relatedCharacter);
      if (legacyCardId !== undefined && !participants.some(participant => participant.cardId === legacyCardId)) {
        participants.push({ cardId: legacyCardId, relatedCharacter });
      }
    }

    for (const participant of participants) {
      if (usedIds.has(participant.cardId)) continue;

      const assetPath = participant.relatedCharacter
        ? this.normalizePublicAssetPath(participant.relatedCharacter)
        : undefined;
      const publicName = participant.relatedCharacter && !assetPath
        ? participant.relatedCharacter
        : undefined;

      const avatar = this.resolveCharacterAvatar(participant.cardId, publicName);
      if (!avatar) continue;

      avatars.push({
        ...avatar,
        imageUrl: assetPath ?? avatar.imageUrl,
        subLabel: 'Legend Race participant'
      });
      usedIds.add(participant.cardId);
    }

    return avatars;
  }

  private buildSupportAvatars(event: TimelineEvent): TimelineAvatar[] {
    const names = event.relatedSupportCards ?? [];
    const ids = this.getSupportPickupIds(event);
    const avatars: TimelineAvatar[] = [];
    const usedKeys = new Set<string>();

    for (let index = 0; index < ids.length; index++) {
      const avatar = this.resolveSupportAvatar(ids[index], names[index], event.imagePath);
      if (avatar && !usedKeys.has(avatar.key)) {
        avatars.push(avatar);
        usedKeys.add(avatar.key);
      }
    }

    return avatars;
  }

  private getCharacterPickupIds(event: TimelineEvent): number[] {
    const pickupIds = (event.pickupCardIds ?? []).filter(id => this.isCharacterCardId(id));
    if (event.type !== EventType.LEGEND_RACE) return pickupIds;

    return [
      ...pickupIds,
      ...(event.relatedCharacters ?? [])
        .map(value => this.extractCharacterCardId(value))
        .filter((id): id is number => id !== undefined)
    ];
  }

  private getSupportPickupIds(event: TimelineEvent): number[] {
    return (event.pickupCardIds ?? []).filter(id => this.isSupportCardId(id));
  }

  private isCharacterCardId(id: number): boolean {
    return Number.isFinite(id) && id >= 100000;
  }

  private isSupportCardId(id: number): boolean {
    return Number.isFinite(id) && id > 0 && id < 100000;
  }

  private extractCharacterCardId(value: string): number | undefined {
    const match = /chara_stand_(\d+)\.webp(?:$|[?#])/i.exec(value);
    if (!match) return undefined;

    const id = Number(match[1]);
    return this.isCharacterCardId(id) ? id : undefined;
  }

  private normalizePublicAssetPath(value: string): string | undefined {
    const normalized = value.trim().replace(/\\/g, '/');
    if (!normalized || !/chara_stand_\d+\.webp(?:$|[?#])/i.test(normalized)) return undefined;
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }

  private resolveCharacterAvatar(
    cardId?: number,
    displayName?: string,
    officialImageUrl?: string,
  ): TimelineAvatar | null {
    if (typeof cardId !== 'number') {
      return null;
    }

    const id = Math.trunc(cardId);
    const characterNameEntry = getCharacterNameEntry(Math.floor(id / 100));
    const characterCard = getCharacterById(id);
    const publicName = this.cleanPublicName(displayName, characterNameEntry?.name ?? `Character ${id}`);
    const identity = this.parseCharacterName(publicName);
    const baseName = characterNameEntry?.name ?? identity.baseName;
    const skinCode = String(id).padStart(6, '0').slice(-2);
    const masterVariant = characterNameEntry?.skins?.[skinCode];
    const variantName = identity.variantName
      ?? (masterVariant && !/^original$/i.test(masterVariant) ? masterVariant : undefined);
    const displayNameWithVariant = variantName ? `${baseName} [${variantName}]` : baseName;
    const fallbackCharacter = getAllCharacters().find(character =>
      character.id !== id
      && Math.floor(character.id / 100) === Math.floor(id / 100)
      && character.id % 100 === 1
    ) ?? getAllCharacters().find(character =>
      character.id !== id && Math.floor(character.id / 100) === Math.floor(id / 100)
    );

    return {
      key: `character-${id}-${displayNameWithVariant}`,
      kind: 'character',
      name: baseName,
      displayName: displayNameWithVariant,
      subLabel: variantName ? `${variantName} variant` : 'Character',
      variantName,
      searchTerms: variantName ? [variantName, `${baseName} ${variantName}`] : [],
      imageUrl: characterCard
        ? `/assets/images/character_stand/chara_stand_${id}.webp`
        : officialImageUrl ?? `/assets/images/character_stand/chara_stand_${id}.webp`,
      fallbackImageUrl: fallbackCharacter
        ? `/assets/images/character_stand/chara_stand_${fallbackCharacter.id}.webp`
        : undefined,
    };
  }

  private resolveSupportAvatar(
    cardId?: number,
    displayName?: string,
    officialImageUrl?: string,
  ): TimelineAvatar | null {
    if (typeof cardId !== 'number') {
      return null;
    }

    const cardIdValue = String(Math.trunc(cardId));
    const supportCard = getSupportCardById(cardIdValue);
    const name = this.cleanPublicName(displayName, supportCard?.name ?? `Support ${cardIdValue}`);
    const supportType = supportCard ? this.supportTypeLabel(supportCard.type) : null;
    const rarity = supportCard ? this.supportRarityLabel(supportCard.rarity) : null;

    return {
      key: `support-${cardIdValue}-${name}`,
      kind: 'support',
      name,
      displayName: name,
      subLabel: [rarity, supportType ? `${supportType} Support` : 'Support card'].filter(Boolean).join(' · '),
      searchTerms: ['support', ...(supportType ? [supportType] : [])],
      imageUrl: supportCard
        ? `/assets/images/support_card/half/support_card_s_${cardIdValue}.webp`
        : officialImageUrl ?? `/assets/images/support_card/half/support_card_s_${cardIdValue}.webp`,
    };
  }

  private cleanPublicName(value: string | undefined, fallback: string): string {
    const name = value?.trim();
    return name
      && !/^unknown[_\s-]*\d+$/i.test(name)
      && !/^(?:support card|umamusume|character)\s+\d+$/i.test(name)
      ? name
      : fallback;
  }

  private parseCharacterName(displayName: string): { baseName: string; variantName?: string } {
    const match = /^(.*?)\s*(?:\(([^()]+)\)|\[([^\[\]]+)\])\s*$/.exec(displayName);
    const variantName = match?.[2] ?? match?.[3];
    if (!match || !match[1].trim() || !variantName?.trim()) {
      return { baseName: displayName };
    }
    return { baseName: match[1].trim(), variantName: variantName.trim() };
  }

  private supportTypeLabel(type: SupportCardType): string {
    switch (type) {
      case SupportCardType.SPEED: return 'Speed';
      case SupportCardType.STAMINA: return 'Stamina';
      case SupportCardType.POWER: return 'Power';
      case SupportCardType.GUTS: return 'Guts';
      case SupportCardType.WISDOM: return 'Wisdom';
      case SupportCardType.FRIEND: return 'Friend';
      default: return '';
    }
  }

  private supportRarityLabel(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.SSR: return 'SSR';
      case Rarity.SR: return 'SR';
      case Rarity.R: return 'R';
      default: return '';
    }
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

}
