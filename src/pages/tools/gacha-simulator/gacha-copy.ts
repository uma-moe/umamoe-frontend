import type { GachaBudget } from '@/lib/gacha-simulator/gacha-budget';

const numberFormat = new Intl.NumberFormat();

/** A spend as "5 tickets + 750"; the carat unit only where the reader needs it. */
export function spentLabel(spent: GachaBudget, { labelCarats = false } = {}): string {
  const parts: string[] = [];
  if (spent.tickets > 0)
    parts.push(
      `${numberFormat.format(spent.tickets)} ${spent.tickets === 1 ? 'ticket' : 'tickets'}`
    );

  const carats = spent.freeCarats + spent.paidCarats;
  if (carats > 0) {
    const unit = labelCarats ? (carats === 1 ? ' Carat' : ' Carats') : '';
    parts.push(`${numberFormat.format(carats)}${unit}`);
  }

  return parts.join(' + ') || 'nothing';
}
