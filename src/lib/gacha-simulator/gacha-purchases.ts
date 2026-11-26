import type { GachaPurchase } from './gacha-budget';

export type GachaPurchaseId = 'single-paid' | 'ten-tickets' | 'ten-carats';

export interface GachaPurchaseOffer extends GachaPurchase {
  id: GachaPurchaseId;
  /** The button's face: the count and what it costs, in the currency it spends. */
  label: string;
  /** What the pull history calls it. */
  historyLabel: string;
  /** The carat ten-draw pays its guarantee; a ticket ten-draw buys none, and neither does a single. */
  guaranteed: boolean;
}

const numberFormat = new Intl.NumberFormat();

/** What a single discounted draw costs in paid Carats. */
const SINGLE_PAID_COST = 50;

/** The purchases a banner offers, with the carat ten-draw priced from its per-draw cost. */
export function gachaPurchaseOffers(costPerDraw: number): readonly GachaPurchaseOffer[] {
  const caratTenCost = numberFormat.format(costPerDraw * 10);

  return [
    {
      id: 'single-paid',
      count: 1,
      cost: SINGLE_PAID_COST,
      payWith: ['paidCarats'],
      guaranteed: false,
      label: '1 Draw · 50 paid Carats',
      historyLabel: '1 draw · paid Carats'
    },
    {
      id: 'ten-tickets',
      count: 10,
      cost: 10,
      payWith: ['tickets'],
      guaranteed: false,
      label: '10 Draws · 10 tickets',
      historyLabel: '10 draws · tickets'
    },
    {
      id: 'ten-carats',
      count: 10,
      cost: costPerDraw * 10,
      payWith: ['freeCarats', 'paidCarats'],
      guaranteed: true,
      label: `10 Draws · ${caratTenCost} Carats`,
      historyLabel: '10 draws · Carats'
    }
  ];
}
