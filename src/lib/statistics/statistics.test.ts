import { describe, expect, it } from 'vitest';
import { aggregateMetric, aggregateStatDistributions, characterScopes, characterUsage, meanStats, compositionLabel, entryCount, histogram, metricMaps, supportTypeDistribution } from './statistics';

describe('statistics aggregation parity', () => {
  it('merges name-keyed legacy Uma data with ID-keyed data without losing character identity', () => {
    expect(aggregateMetric([{ 'Special Week': { character_id: '100101', count: 4 } }, { '100101': { id: '100101', count: 6 } }])).toEqual([
      { id: '100101', name: '100101', value: 10, percentage: 100 }
    ]);
  });
  it('matches Angular character scopes, distance aliases, class totals, and average-of-means charts', () => {
    const ura = { total_entries: 9, stat_averages: { speed: { count: 9, mean: 1000 } } };
    const aoharu = { total_entries: 1, stat_averages: { speed: { count: 1, mean: 1300 } } };
    const data = { by_distance: { sprint: { by_team_class: { '6': { overall: { total_entries: 10 }, by_scenario: { '1': ura, '2': aoharu } }, '5': ura } } } };
    const filters = { classIds: ['5', '6'], scenarioIds: ['1'], distanceIds: ['1'], allScenarioIds: ['1', '2'], allDistanceIds: ['1'] };
    expect(characterScopes(data, filters)).toEqual([ura, ura]);
    expect(characterUsage(data, filters).distances).toEqual([{ id: '1', name: '1', value: 18, percentage: 100 }]);
    expect(characterUsage(data, filters).classes.map(({ id, value }) => ({ id, value }))).toEqual([{ id: '5', value: 9 }, { id: '6', value: 9 }]);
    expect(characterScopes(data, { ...filters, classIds: [] })).toEqual([]);
    expect(characterUsage(data, { ...filters, distanceIds: [] }).distances).toEqual([]);
    expect(characterScopes(data, { ...filters, classIds: ['6'], scenarioIds: [] })).toEqual([]);
    expect(metricMaps(data, 'stat_averages', filters)).toEqual([ura.stat_averages, ura.stat_averages]);
    expect(meanStats([ura.stat_averages, aoharu.stat_averages])).toEqual({ speed: 1150 });
    expect(supportTypeDistribution([], [{ id: '1', name: 'Card', value: 8 }], () => 'Wit')[0]).toMatchObject({ id: 'wiz', name: 'Wit', value: 8 });
  });
  it('counts support types per deck slot and respects empty scenario/distance selections', () => {
    const decks = aggregateMetric([{ mixed: { count: 10, composition: { speed: 2, stamina: 1, power: 1, wisdom: 2 } } }]);
    const types = supportTypeDistribution(decks, [], () => 'other');
    expect(types.reduce((sum, item) => sum + item.value, 0)).toBe(60);
    expect(types.find((item) => item.id === 'wiz')?.value).toBe(20);
    const scope = { skills: { '42': { total: 10 } } };
    const data = { by_distance: { '1': { by_team_class: { '6': { overall: scope, by_scenario: { '1': scope } } } } } };
    const filters = { classIds: ['6'], scenarioIds: ['1'], distanceIds: ['1'], allScenarioIds: ['1'], allDistanceIds: ['1'] };
    expect(metricMaps(data, 'skills', filters)).toEqual([scope.skills]);
    expect(metricMaps(data, 'skills', { ...filters, scenarioIds: [] })).toEqual([]);
    expect(metricMaps(data, 'skills', { ...filters, distanceIds: [] })).toEqual([]);
    expect(entryCount({ usage_count: 3 })).toBe(3);
  });

  it('accepts both count and total metric formats and skips totals', () => {
    expect(entryCount({ total: 4 })).toBe(4);
    expect(aggregateMetric([{ a: { count: 2 }, b: { total: 3 }, total_entries: 99 }, { a: { total: 4 } }])).toEqual([
      { id: 'a', name: 'a', value: 6, percentage: 66.66666666666666 },
      { id: 'b', name: 'b', value: 3, percentage: 33.33333333333333 }
    ]);
  });

  it('combines histograms and weights means by sample count', () => {
    const result = aggregateStatDistributions([{ speed: { count: 2, mean: 100, histogram: { '0-60': 2 } } }, { speed: { count: 1, mean: 400, histogram: { '0-60': 1, '60-120': 1 } } }]);
    expect(result.speed!.mean).toBe(200);
    expect(result.speed!.histogram).toEqual({ '0-60': 3, '60-120': 1 });
    expect(histogram(result.speed).map((item) => item.name)).toEqual(['0-60', '60-120']);
  });

  it('uses the dataset composition instead of parsing a display string', () => {
    expect(compositionLabel({ composition: { speed: 2, wisdom: 3, friend: 0 } }, 'fallback')).toBe('2× speed · 3× wit');
  });
});
