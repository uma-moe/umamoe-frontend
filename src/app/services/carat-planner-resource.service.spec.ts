import { CaratPlannerDataBundle } from '../models/carat-planner.model';
import { CaratPlannerResourceService, CaratPlannerResourceState } from './carat-planner-resource.service';

describe('CaratPlannerResourceService banner detail failures', () => {
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
