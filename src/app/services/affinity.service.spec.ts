import { getRaceSaddleData, replaceRaceSaddleData } from '../data/race-saddle.data';
import { AffinityService } from './affinity.service';
import { ResourceDataService } from './resource-data.service';

describe('AffinityService race saddle groups', () => {
  let originalRaceSaddleData: unknown;
  let service: AffinityService;

  beforeEach(() => {
    originalRaceSaddleData = JSON.parse(JSON.stringify(getRaceSaddleData()));
    replaceRaceSaddleData({
      races: [
        {
          grade: 100,
          win_saddles: [
            { saddle_id: 14, group_id: 24, win_saddle_type: 3 },
            { saddle_id: 147, group_id: 24, win_saddle_type: 3 },
            { saddle_id: 39, group_id: 41, win_saddle_type: 3 },
            { saddle_id: 156, group_id: 41, win_saddle_type: 3 },
            { saddle_id: 159, group_id: 41, win_saddle_type: 3 },
            { saddle_id: 165, group_id: 151, win_saddle_type: 3 },
            { saddle_id: 1, group_id: 1, win_saddle_type: 0 },
          ],
        },
      ],
    });
    service = new AffinityService({} as ResourceDataService);
  });

  afterEach(() => {
    replaceRaceSaddleData(originalRaceSaddleData);
  });

  it('matches old and new saddle IDs through their shared group', () => {
    expect(service.countSharedG1RaceWins([14, 39, 165], [147, 156, 165])).toBe(3);
    expect(service.getRaceAffinityBonusBetween([14, 39, 165], [147, 156, 165])).toBe(9);
  });

  it('deduplicates aliases when counting G1 wins', () => {
    expect(service.countG1RaceWins([14, 147, 39, 156, 159, 165, 1])).toBe(3);
  });

  it('counts the P1-P2 race overlap once in the tree total', () => {
    const race = service.calculateRaceAffinityBreakdown({
      p1: [14, 39],
      p2: [147, 165],
      'p1-1': [156],
      'p1-2': [147],
      'p2-1': [165],
      'p2-2': [14],
    });

    expect(race.parentPair).toBe(3);
    expect(race.p1Grandparent).toBe(6);
    expect(race.p2Grandparent).toBe(6);
    expect(race.p1Node).toBe(9);
    expect(race.p2Node).toBe(9);
    expect(race.total).toBe(15);
    expect(race.p1Node + race.p2Node - race.parentPair).toBe(race.total);
  });

  it('keeps race affinity for spark chance when a self-cested node has zero base affinity', () => {
    const result = {
      p1Breeding: { left: 0, right: 0, total: 0 },
      p2Breeding: { left: 0, right: 0, total: 0 },
      playerP1: { pair: 0, tripleLeft: 0, tripleRight: 0, total: 0 },
      playerP2: { pair: 0, tripleLeft: 0, tripleRight: 0, total: 0 },
      legacy: 0,
      relationTotal: 0,
      total: 48,
      race: {
        parentPair: 0,
        p1Left: 48,
        p1Right: 0,
        p2Left: 0,
        p2Right: 0,
        p1Grandparent: 48,
        p2Grandparent: 0,
        p1Node: 48,
        p2Node: 0,
        total: 48,
      },
    };

    expect(service.getTreeNodeBaseAffinity(result, 'p1-1')).toBeNull();
    expect(service.getTreeNodeTotalAffinity(result, 'p1-1')).toBe(48);
    expect(service.getTreeNodeTotalAffinity(result, 'p1-2')).toBeNull();
  });

  it('ranks races shared by both parents ahead of one-parent overlaps', () => {
    replaceRaceSaddleData({
      races: [
        {
          race_instance_id: 1001,
          name: 'Both Parents Cup',
          short_name: 'Both Cup',
          schedule: [{ turn_label: 'Apr Late' }],
          win_saddles: [{ saddle_id: 10, group_id: 100, win_saddle_type: 3 }],
        },
        {
          race_instance_id: 1002,
          name: 'P1 Cup',
          short_name: 'P1 Cup',
          schedule: [{ turn_label: 'May Early' }],
          win_saddles: [{ saddle_id: 20, group_id: 200, win_saddle_type: 3 }],
        },
        {
          race_instance_id: 1003,
          name: 'P2 Cup',
          short_name: 'P2 Cup',
          schedule: [{ turn_label: 'Jun Late' }],
          win_saddles: [{ saddle_id: 30, group_id: 300, win_saddle_type: 3 }],
        },
      ],
    });

    const recommendations = service.getOptimalRaceRecommendations([10, 20], [10, 30]);

    expect(recommendations.map(race => race.name)).toEqual([
      'Both Parents Cup',
      'P1 Cup',
      'P2 Cup',
    ]);
    expect(recommendations.map(race => race.affinityGain)).toEqual([6, 3, 3]);
    expect(recommendations[0].overlapsP1).toBeTrue();
    expect(recommendations[0].overlapsP2).toBeTrue();
    expect(recommendations[0].scheduleLabel).toBe('Apr Late');
  });

  it('rebuilds the saddle map when resource data is replaced', () => {
    expect(service.countSharedG1RaceWins([14], [147])).toBe(1);

    replaceRaceSaddleData({
      races: [
        {
          grade: 100,
          win_saddles: [
            { saddle_id: 165, group_id: 151, win_saddle_type: 3 },
            { saddle_id: 168, group_id: 154, win_saddle_type: 3 },
          ],
        },
      ],
    });

    expect(service.countSharedG1RaceWins([14], [147])).toBe(0);
    expect(service.countG1RaceWins([165, 168])).toBe(2);
  });
});
