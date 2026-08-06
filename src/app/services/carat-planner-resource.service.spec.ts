import { CaratPlannerDataBundle } from '../models/carat-planner.model';
import { CaratPlannerResourceService, CaratPlannerResourceState } from './carat-planner-resource.service';

describe('CaratPlannerResourceService banner detail failures', () => {
  it('creates standard-rate fallback data when a future ordinary banner has no gacha shard', async () => {
    const service = new CaratPlannerResourceService({} as never, 'browser' as unknown as object);
    const bundle: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [] },
    };
    (service as any).bundle = bundle;
    (service as any).initialPromise = Promise.resolve(bundle);

    const [gacha] = await service.loadGachasForEvents([{
      id: 'future-support',
      title: 'Future support',
      type: 'support_card_banner',
      globalReleaseDate: '2031-01-01',
      estimatedEndDate: '2031-01-10',
      pickupCardIds: [301001, 301002],
    }]);

    expect(gacha.event_id).toBe('future-support');
    expect(gacha.pickups?.map(pickup => pickup.rate)).toEqual([0.0075, 0.0075]);
    expect(gacha.rarity_rates).toContain(jasmine.objectContaining({ rarity: 3, rate: 0.03 }));
    expect(gacha.rates_confidence).toBe('inferred_standard');
  });

  it('publishes a visible error when a protected gacha shard fails', async () => {
    const service = new CaratPlannerResourceService({} as never, 'browser' as unknown as object);
    const bundle: CaratPlannerDataBundle = {
      core: { gacha_shard_by_event: { 'banner-a': '2031' } },
      income: { rules: [] },
      rewards: { rewards: [] },
    };
    (service as any).bundle = bundle;
    spyOn(service, 'loadInitial').and.resolveTo(bundle);
    spyOn(service, 'loadGachaShard').and.rejectWith(new Error('shard unavailable'));
    let state: CaratPlannerResourceState | undefined;
    const subscription = service.state$.subscribe(value => state = value);

    await expectAsync(service.loadGachasForEvents([{
      id: 'banner-a',
      title: 'Banner A',
      type: 'character_banner',
      globalReleaseDate: '2031-01-01',
      gachaId: 30100,
    }])).toBeRejectedWithError('shard unavailable');

    expect(state?.loading).toBeFalse();
    expect(state?.error).toContain('Banner rate data could not be loaded');
    expect(state?.error).toContain('shard unavailable');
    subscription.unsubscribe();
  });
});

describe('CaratPlannerResourceService reward precedence', () => {
  it('publishes the same Global-authoritative rewards to the timeline and planner bundle', async () => {
    const service = new CaratPlannerResourceService({} as never, 'browser' as unknown as object);
    spyOn<any>(service, 'loadArtifact').and.resolveTo({
      rewards: [
        { id: 'global', event_id: 'anniversary', label: 'Global reward', currency: 'free_jewels', amount: 1500, available_at: '2030-01-01', provenance: 'global_news' },
        { id: 'jp', event_id: 'anniversary', label: 'JP reward', currency: 'free_jewels', amount: 3000, available_at: '2030-01-01', provenance: 'jp_news' },
      ],
    });

    const rewards = await service.loadRewards();

    expect(rewards.rewards.map(reward => reward.id)).toEqual(['global']);
    expect(service.currentBundle.rewards).toBe(rewards);
  });
});
