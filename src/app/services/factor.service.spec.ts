import { of } from 'rxjs';
import { FactorService, SparkInfo } from './factor.service';
import { MasterDataService } from './master-data.service';

describe('FactorService scenario artwork', () => {
  let service: FactorService;

  beforeEach(() => {
    const masterData = {
      init: () => undefined,
      factors$: of([]),
      skills$: of([]),
      raceSaddleData$: of({ races: [] }),
    } as unknown as MasterDataService;

    service = new FactorService(masterData);
  });

  function scenarioSpark(factorId: string): SparkInfo {
    return {
      factorId,
      level: 1,
      name: 'Scenario factor',
      type: 4,
    };
  }

  it('maps the original scenario factors to their zero-based scenario IDs', () => {
    const ura = scenarioSpark('300010');
    const unity = scenarioSpark('300020');
    const trackblazer = scenarioSpark('300030');
    const grandConcert = scenarioSpark('300040');
    const grandMasters = scenarioSpark('300050');

    expect(service.getFactorImageUrl(ura)).toBe('/assets/images/scenario/ura_finals_logo.png');
    expect(service.getScenarioDisplayName(ura)).toBe('URA Finals');

    expect(service.getFactorImageUrl(unity)).toBe('/assets/images/scenario/scenario_logo_002.png');
    expect(service.getScenarioDisplayName(unity)).toBe('Unity Cup');

    expect(service.getFactorImageUrl(trackblazer)).toBe('/assets/images/scenario/scenario_logo_004.png');
    expect(service.getScenarioDisplayName(trackblazer)).toBe('Trackblazer');

    expect(service.getFactorImageUrl(grandConcert)).toBe('/assets/images/scenario/grand_concert_logo.png');
    expect(service.getScenarioDisplayName(grandConcert)).toBe('Grand Concert');

    expect(service.getFactorImageUrl(grandMasters)).toBe('/assets/images/scenario/scenario_logo_005.png');
    expect(service.getScenarioDisplayName(grandMasters)).toBe('Grand Masters');
  });

  it('resolves API scenario IDs without inferring them from white factors', () => {
    expect(service.getScenarioLogoUrl(0)).toBe('/assets/images/scenario/ura_finals_logo.png');
    expect(service.getScenarioName(0)).toBe('URA Finals');
    expect(service.getScenarioLogoUrl(1)).toBe('/assets/images/scenario/scenario_logo_002.png');
    expect(service.getScenarioName(1)).toBe('Unity Cup');
    expect(service.getScenarioLogoUrl(2)).toBe('/assets/images/scenario/scenario_logo_004.png');
    expect(service.getScenarioName(2)).toBe('Trackblazer');
    expect(service.getScenarioLogoUrl(3)).toBe('/assets/images/scenario/scenario_logo_004.png');
    expect(service.getScenarioName(3)).toBe('Trackblazer');
    expect(service.getScenarioLogoUrl(4)).toBe('/assets/images/scenario/grand_concert_logo.png');
    expect(service.getScenarioName(4)).toBe('Grand Concert');
  });

  it('resolves the newer Global dirt race factors even before the saddle mapping catches up', () => {
    const raceFactor = (factorId: string, name: string): SparkInfo => ({
      factorId,
      level: 1,
      name,
      type: 2,
    });

    expect(service.getFactorImageUrl(raceFactor('100340', 'Kawasaki Kinen')))
      .toBe('/assets/images/race-thumbnails/thum_race_rt_000_1107_00.webp');
    expect(service.getFactorImageUrl(raceFactor('100330', 'Zen-Nippon Junior Yushun')))
      .toBe('/assets/images/race-thumbnails/thum_race_rt_000_1108_00.webp');
    expect(service.getFactorImageUrl(raceFactor('100320', 'Kashiwa Kinen')))
      .toBe('/assets/images/race-thumbnails/thum_race_rt_000_1109_00.webp');
    expect(service.getFactorImageUrl(raceFactor('100310', 'M.C. Nambu Hai')))
      .toBe('/assets/images/race-thumbnails/thum_race_rt_000_1110_00.webp');
  });
});
