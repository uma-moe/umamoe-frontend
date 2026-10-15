import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InheritanceRecord } from '@/lib/inheritance/search/inheritance-search';
import { borrowContext, trackBorrowCopy } from './borrow-interactions';
import { inheritanceRepository } from './inheritance-repository';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

function record(): InheritanceRecord {
  return {
    id: 1,
    accountId: '123',
    trainerName: 'Trainer',
    borrowViews: 0,
    borrowCopies: 0,
    mainParentId: 1001,
    leftParentId: 1002,
    rightParentId: 1003,
    rankScore: 29000,
    rarity: 5,
    blueSparks: [1013],
    pinkSparks: [],
    greenSparks: [],
    whiteSparks: [20012],
    mainWhite: [],
    leftWhite: [],
    rightWhite: [],
    winCount: 8,
    whiteCount: 12,
    affinity: 83,
    mainWinSaddles: [100],
    leftWinSaddles: [],
    rightWinSaddles: [],
    raceResults: []
  };
}

describe('Angular borrow interaction compatibility', () => {
  it('builds a stable snapshot context for bookmarks, views, and copies', () => {
    const first = borrowContext(record());
    const second = borrowContext({ ...record() });
    expect(first.borrow_key).toMatch(/^bk1:[0-9a-f]{16}$/);
    expect(second).toEqual(first);
    expect(first.inheritance_id).toBe(1);
  });

  it('reconciles accepted, duplicate, and failed copies without inventing counts', async () => {
    const request = vi.spyOn(inheritanceRepository, 'trackBorrowCopy');
    for (const [response, expected] of [
      [{ success: true, accepted: true, copy_count: 12 }, 12],
      [{ success: true, accepted: true, copy_count: 3 }, 8],
      [{ success: true, accepted: false, copy_count: 3 }, 7],
      [{ success: true, accepted: false, total_count: 15 }, 15],
      [{ success: false, accepted: false, copy_count: 0 }, 7]
    ] as const) {
      sessionStorage.clear();
      request.mockResolvedValueOnce({ ...response, trainer_id: '123' });
      expect(await trackBorrowCopy({ ...record(), borrowCopies: 7 })).toBe(expected);
    }

    sessionStorage.clear();
    request.mockRejectedValueOnce(new Error('Unavailable'));
    expect(await trackBorrowCopy({ ...record(), borrowCopies: 7 })).toBe(7);
  });

  it('keeps the Angular session cooldown and isolates different snapshots', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const request = vi
      .spyOn(inheritanceRepository, 'trackBorrowCopy')
      .mockResolvedValue({ success: true, accepted: true, trainer_id: '123', copy_count: 1 });

    await trackBorrowCopy(record());
    expect(trackBorrowCopy(record())).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    await trackBorrowCopy({ ...record(), supportCardId: 30189 });
    expect(request).toHaveBeenCalledTimes(2);
    now += 30_000;
    await trackBorrowCopy(record());
    expect(request).toHaveBeenCalledTimes(3);
  });
});
