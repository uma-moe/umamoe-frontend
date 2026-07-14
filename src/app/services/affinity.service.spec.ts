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
