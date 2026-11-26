import { describe, expect, it } from 'vitest';
import {
  appendPullBatch,
  EMPTY_SESSION,
  type PullBatch,
  type SessionResult
} from './gacha-session';

function batch(id: number, count: PullBatch['count'], topCount = 0, middleCount = 1): PullBatch {
  const results = Array.from({ length: count }, (_, index): SessionResult => ({
    cardId: 1000 + index,
    rarity: 1,
    odds: 1,
    featured: false,
    guaranteed: false,
    name: `Card ${index}`,
    image: '',
    thumbImage: '',
    typeLabel: 'Trainee',
    drawIndex: index + 1
  }));

  return {
    id,
    count,
    purchase: '10 draws · Carats',
    guaranteed: true,
    results,
    topNames: topCount ? ['Top card'] : [],
    topCount,
    middleCount,
    lowCount: count - topCount - middleCount,
    featuredCount: 0,
    spend: { tickets: 0, freeCarats: count * 150, paidCarats: 0 }
  };
}

describe('gacha session', () => {
  it('puts the newest pull first and adds its counts to the totals', () => {
    const first = appendPullBatch(EMPTY_SESSION, batch(1, 10, 1, 3));
    const second = appendPullBatch(first, batch(2, 1, 0, 1));

    expect(second.pulls).toBe(2);
    expect(second.batches.map((entry) => entry.id)).toEqual([2, 1]);
    expect(second.draws).toBe(11);
    expect(second.top).toBe(1);
    expect(second.middle).toBe(4);
  });

  it('drops the oldest pulls once the session holds its limit, keeping the totals', () => {
    let session = EMPTY_SESSION;
    for (let id = 1; id <= 55; id++) session = appendPullBatch(session, batch(id, 10));

    expect(session.batches).toHaveLength(50);
    expect(session.batches[0]?.id).toBe(55);
    expect(session.batches.at(-1)?.id).toBe(6);
    expect(session.pulls).toBe(55);
    expect(session.draws).toBe(550);
  });
});
