import { describe, expect, it } from 'vitest';
import {
  formatPercentage,
  formatRaceTime,
  runningStyleName,
  trackDetailName
} from './race-display';

describe('shared race display semantics', () => {
  it('uses one naming contract across Race Analysis, Multi-Race, and CM Logs', () => {
    expect(runningStyleName(3)).toBe('Late Surger');
    expect(runningStyleName(3, true)).toBe('Late');
  });

  it('labels numeric capture conditions while preserving named and unknown values', () => {
    expect(trackDetailName('condition', '1')).toBe('Firm');
    expect(trackDetailName('weather', '3')).toBe('Rainy');
    expect(trackDetailName('season', '5')).toBe('Spring');
    expect(trackDetailName('weather', 'Sunny')).toBe('Sunny');
    expect(trackDetailName('condition', 'Custom')).toBe('Custom');
    expect(trackDetailName('weather')).toBe('Unknown weather');
  });

  it('formats rates and race times consistently', () => {
    expect(formatPercentage(1, 4)).toBe('25.0%');
    expect(formatRaceTime(65.1234)).toBe('1:05.123');
    expect(formatRaceTime(15, 0)).toBe('0:15');
    expect(formatRaceTime(30, 0)).toBe('0:30');
    expect(formatRaceTime(60, 0)).toBe('1:00');
  });
});
