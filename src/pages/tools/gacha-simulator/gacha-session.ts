import type { GachaBudget } from '@/lib/gacha-simulator/gacha-budget';
import type { GachaDrawCount } from '@/lib/gacha-simulator/gacha-draw';
import type { GachaResultItem } from './GachaResultCard.svelte';

export interface SessionResult extends GachaResultItem {
  /** The draw's number across the banner, which is also the position it shows. */
  drawIndex: number;
}

/** One press of a draw button, kept so the history can name what it delivered. */
export interface PullBatch {
  /** 1-based pull number on the banner. */
  id: number;
  count: GachaDrawCount;
  /** What the purchase was called, so the history explains a missing SR+ badge. */
  purchase: string;
  /** Whether its tenth draw landed on the guaranteed rarity. */
  guaranteed: boolean;
  /** In the order the draw gave them. */
  results: SessionResult[];
  topNames: string[];
  topCount: number;
  middleCount: number;
  lowCount: number;
  featuredCount: number;
  spend: GachaBudget;
}

export interface GachaSession {
  /** Newest first; older pulls drop off whole once the cap is reached. */
  batches: PullBatch[];
  /** Every pull on the banner, including any whose cards have dropped off. */
  pulls: number;
  draws: number;
  top: number;
  middle: number;
  featured: number;
}

export const EMPTY_SESSION: GachaSession = {
  batches: [],
  pulls: 0,
  draws: 0,
  top: 0,
  middle: 0,
  featured: 0
};

/** The cards a session holds before its oldest pulls drop off, which bounds the images on screen. */
const SESSION_RESULT_LIMIT = 500;

/** Adds a pull to the front of the session and folds its counts into the banner's totals. */
export function appendPullBatch(session: GachaSession, batch: PullBatch): GachaSession {
  return {
    batches: keepNewest([batch, ...session.batches]),
    pulls: session.pulls + 1,
    draws: session.draws + batch.count,
    top: session.top + batch.topCount,
    middle: session.middle + batch.middleCount,
    featured: session.featured + batch.featuredCount
  };
}

function keepNewest(batches: PullBatch[]): PullBatch[] {
  const kept: PullBatch[] = [];
  let total = 0;

  for (const batch of batches) {
    // The newest pull stays even if it alone exceeds the cap.
    if (kept.length > 0 && total + batch.results.length > SESSION_RESULT_LIMIT) break;

    kept.push(batch);
    total += batch.results.length;
  }

  return kept;
}
