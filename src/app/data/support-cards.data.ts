// Support card master data
// This file contains all support card information bundled with the application
// Data is imported at build time, so it doesn't appear in network requests
import supportCardsData from '../../data/support-cards-db.json';
import { SupportCardShort, SupportCardType } from '../models/support-card.model';
// Raw card data interface to match JSON structure
export interface RawSupportCardData {
    id: string;
    name: string;
    rarity: number;
    type: string;
    release_date: string;
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
    return Array.isArray(defaultData) ? defaultData as RawSupportCardData[] : [];
}

function buildSupportCards(rawData: RawSupportCardData[]): SupportCardShort[] {
    return rawData.map(card => ({
        id: card.id,
        name: card.name,
        type: mapStringTypeToEnum(card.type),
        rarity: card.rarity,
        release_date: card.release_date,
        limitBreak: 0, // Default limit break
        imageUrl: `/assets/images/support_card/half/support_card_s_${card.id}.png`,
    }));
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
    const lowercaseQuery = query.toLowerCase();
    return SUPPORT_CARDS.filter(card =>
        card.name.toLowerCase().includes(lowercaseQuery) ||
        card.id.toString().includes(query)
    );
}
