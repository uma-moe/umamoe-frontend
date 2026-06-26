// Support card master data
// This file contains all support card information bundled with the application
// Data is imported at build time, so it doesn't appear in network requests
import supportCardsData from '../../data/support-cards-db.json';
import { SupportCardShort, SupportCardType } from '../models/support-card.model';
// Raw card data interface to match JSON structure
export interface RawSupportCardData {
    id: string;
    name: string;
    character_name?: string;
    characterName?: string;
    card_name?: string;
    cardName?: string;
    support_card_name?: string;
    supportCardName?: string;
    card_title?: string;
    cardTitle?: string;
    support_card_title?: string;
    supportCardTitle?: string;
    card_full_name?: string;
    cardFullName?: string;
    support_card_full_name?: string;
    supportCardFullName?: string;
    title?: string;
    rarity: number;
    type: string;
    release_date: string;
    isReleased_en?: boolean;
    isReleased_tw?: boolean | null;
    isReleased_cn?: boolean | null;
    isReleased_jp?: boolean | null;
}
// Helper function to map string type to enum
function mapStringTypeToEnum(type: string): SupportCardType {
    switch (type.toLowerCase()) {
        case 'speed': return SupportCardType.SPEED;
        case 'stamina': return SupportCardType.STAMINA;
        case 'power': return SupportCardType.POWER;
        case 'guts': return SupportCardType.GUTS;
        case 'wisdom': return SupportCardType.WISDOM;
        case 'intelligence': return SupportCardType.WISDOM;
        case 'friend': return SupportCardType.FRIEND;
        case 'group': return SupportCardType.FRIEND;
        default: return SupportCardType.SPEED;
    }
}
function normalizeSupportCardData(data: unknown): RawSupportCardData[] {
    if (Array.isArray(data)) {
        return data as RawSupportCardData[];
    }

    const defaultData = (data as any)?.default;
    if (Array.isArray(defaultData)) {
        return defaultData as RawSupportCardData[];
    }

    if (defaultData && typeof defaultData === 'object') {
        return Object.values(defaultData) as RawSupportCardData[];
    }

    if (data && typeof data === 'object') {
        return Object.values(data) as RawSupportCardData[];
    }

    return [];
}

function firstString(...values: Array<string | undefined | null>): string | undefined {
    return values.find(value => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function buildSupportCards(rawData: RawSupportCardData[]): SupportCardShort[] {
    return rawData.map(card => {
        const characterName = firstString(card.character_name, card.characterName, card.name) ?? card.name;
        const cardName = firstString(
            card.card_name,
            card.cardName,
            card.support_card_name,
            card.supportCardName,
            card.title,
        );
        const cardTitle = firstString(
            card.card_title,
            card.cardTitle,
            card.support_card_title,
            card.supportCardTitle,
        );
        const cardFullName = firstString(
            card.card_full_name,
            card.cardFullName,
            card.support_card_full_name,
            card.supportCardFullName,
        );

        return {
            id: card.id,
            name: characterName,
            characterName,
            cardName,
            cardTitle,
            cardFullName,
            type: mapStringTypeToEnum(card.type),
            rarity: card.rarity,
            release_date: card.release_date,
            isReleased_en: card.isReleased_en,
            isReleased_tw: card.isReleased_tw,
            isReleased_cn: card.isReleased_cn,
            isReleased_jp: card.isReleased_jp,
            limitBreak: 0, // Default limit break
            imageUrl: `/assets/images/support_card/half/support_card_s_${card.id}.webp`,
        };
    });
}

let rawSupportCardsData: RawSupportCardData[] = normalizeSupportCardData(supportCardsData);
// Transform raw JSON data to SupportCardShort format
export const SUPPORT_CARDS: SupportCardShort[] = buildSupportCards(rawSupportCardsData);

export function replaceSupportCardsData(data: unknown): SupportCardShort[] {
    rawSupportCardsData = normalizeSupportCardData(data);
    SUPPORT_CARDS.splice(0, SUPPORT_CARDS.length, ...buildSupportCards(rawSupportCardsData));
    return SUPPORT_CARDS;
}

export function getRawSupportCardsData(): RawSupportCardData[] {
    return rawSupportCardsData;
}
// Export individual getters for convenience
export function getAllSupportCards(): SupportCardShort[] {
    return SUPPORT_CARDS;
}
export function getSupportCardById(id: string): SupportCardShort | undefined {
    return SUPPORT_CARDS.find(card => card.id === id);
}
export function getSupportCardsByIds(ids: string[]): Map<string, SupportCardShort> {
    return new Map(SUPPORT_CARDS.filter(card => ids.includes(card.id)).map(card => [card.id, card]));
}
export function getSupportCardsByType(type: SupportCardType): SupportCardShort[] {
    return SUPPORT_CARDS.filter(card => card.type === type);
}
export function searchSupportCards(query: string): SupportCardShort[] {
    return SUPPORT_CARDS.filter(card => matchesSupportCardSearch(card, query));
}

export function matchesSupportCardSearch(card: SupportCardShort, query: string): boolean {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return true;
    }

    const normalizedValues = getSupportCardSearchValues(card).map(normalizeSearchText);
    if (normalizedValues.some(value => value.includes(normalizedQuery))) {
        return true;
    }

    const queryTokens = tokenizeSearchText(query);
    if (queryTokens.length === 0) {
        return true;
    }

    const combinedValues = normalizedValues.join(' ');
    return queryTokens.every(token => combinedValues.includes(token));
}

export function getSupportCardSearchValues(card: SupportCardShort): string[] {
    const displayName = getSupportCardDisplayName(card);
    const displayTitle = getSupportCardDisplayTitle(card);
    const characterName = getSupportCardCharacterName(card);
    const values = [
        card.id,
        card.name,
        displayName,
        characterName,
        card.characterName,
        card.cardName,
        card.cardTitle,
        card.cardFullName,
        displayTitle,
    ];

    if (displayName && displayTitle) {
        values.push(`${displayTitle} ${displayName}`);
        values.push(`${displayName} ${displayTitle}`);
    }

    if (displayName && characterName) {
        values.push(`${displayName} ${characterName}`);
        values.push(`${characterName} ${displayName}`);
    }

    if (displayTitle && characterName) {
        values.push(`${displayTitle} ${characterName}`);
        values.push(`${characterName} ${displayTitle}`);
    }

    if (displayName && displayTitle && characterName) {
        values.push(`${displayTitle} ${displayName} ${characterName}`);
        values.push(`${characterName} ${displayTitle} ${displayName}`);
    }

    return values.filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function getSupportCardDisplayName(card: SupportCardShort): string {
    return firstString(stripTitleFromFullName(card.cardName), stripTitleFromFullName(card.cardFullName), getSupportCardCharacterName(card)) ?? card.name;
}

export function getSupportCardCharacterName(card: SupportCardShort): string | undefined {
    return firstString(card.characterName, card.name);
}

export function getSupportCardDisplayTitle(card: SupportCardShort): string | undefined {
    return firstString(formatCardTitle(card.cardTitle), extractTitleFromCardName(card.cardFullName), extractTitleFromCardName(card.cardName), getSupportCardCharacterName(card));
}

function extractTitleFromCardName(cardName: string | undefined): string | undefined {
    if (!cardName) {
        return undefined;
    }

    const match = cardName.trim().match(/^\[([^\]]+)\]/);
    return match ? `[${match[1].trim()}]` : undefined;
}

function formatCardTitle(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed : `[${trimmed}]`;
}

function stripTitleFromFullName(cardFullName: string | undefined): string | undefined {
    if (!cardFullName) {
        return undefined;
    }

    return cardFullName.trim().replace(/^\[[^\]]+\]\s*/, '').trim();
}

function tokenizeSearchText(value: string): string[] {
    return [
        ...new Set(
            normalizeSearchText(value)
                .split(' ')
                .filter(token => token.length > 0)
        )
    ];
}

function normalizeSearchText(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[\[\](),.!?'"`:_/\\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
