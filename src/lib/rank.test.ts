import { describe, expect, it } from 'vitest';
import { getRankInfo, getRankInfoFromLabel, getRankInfoFromScore, getStatRankInfo } from './rank';

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

  it('maps basic stat values to their in-game ranks', () => {
    expect(getStatRankInfo(0).label).toBe('G');
    expect(getStatRankInfo(50).label).toBe('G');
    expect(getStatRankInfo(51).label).toBe('G+');
    expect(getStatRankInfo(800).label).toBe('A');
    expect(getStatRankInfo(900).label).toBe('A+');
    expect(getStatRankInfo(1000).label).toBe('S');
    expect(getStatRankInfo(1149).label).toBe('SS');
    expect(getStatRankInfo(1150).label).toBe('SS+');
    expect(getStatRankInfo(1200).label).toBe('SS+');
  });

  it('moves to ultra stat ranks past the cap', () => {
    expect(getStatRankInfo(1201).label).toBe('UG0');
    expect(getStatRankInfo(1300).label).toBe('UG9');
    expect(getStatRankInfo(1301).label).toBe('UF0');
    expect(getStatRankInfo(2000).label).toBe('US9');
    expect(getStatRankInfo(2500).label).toBe('US9');
  });
});
