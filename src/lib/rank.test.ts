import { describe, expect, it } from 'vitest';
import { getRankInfo, getRankInfoFromLabel, getRankInfoFromScore } from './rank';

describe('rank parity helpers', () => {
  it('maps standard and ultra rarities', () => {
    expect(getRankInfo(1).label).toBe('G');
    expect(getRankInfo(18).label).toBe('SS+');
    expect(getRankInfo(19).label).toBe('UG0');
    expect(getRankInfo(98).label).toBe('US9');
    expect(getRankInfoFromLabel('UE1').iconIndex).toBe(39);
  });
  it('maps labels and score thresholds', () => {
    expect(getRankInfoFromLabel('UE1').label).toBe('UE1');
    expect(getRankInfoFromScore(28800).label).toBe('UE0');
    expect(getRankInfoFromScore(19200).label).toBe('SS+');
  });
});
