import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlan } from '@/lib/carat-planner/carat-planner';
import { appHttp } from '@/services/http/app-http';
import { decodePlannerCloudState, plannerCloudRepository } from './planner-cloud-repository';

afterEach(() => vi.restoreAllMocks());

describe('planner cloud response validation', () => {
  it('retains a valid empty state and numeric legacy revisions', () => {
    expect(decodePlannerCloudState({ revision: '0', collection: null })).toEqual({
      revision: 0,
      collection: null,
      updated_at: null,
      needs_compaction: false
    });
  });

  it.each([
    null,
    [],
    {},
    { revision: null, collection: null },
    { revision: false, collection: null },
    { revision: 'invalid', collection: null },
    { revision: 1, collection: [] }
  ])('rejects malformed cloud state: %j', (value) =>
    expect(() => decodePlannerCloudState(value)).toThrow(/Invalid planner cloud/)
  );

  it('validates share metadata before accepting the local fallback', async () => {
    vi.spyOn(appHttp, 'request').mockResolvedValue({ share_id: 'share-1', plan_id: 'plan-1' });
    await expect(plannerCloudRepository.createShare(createPlan())).rejects.toThrow(
      'Invalid planner share response.'
    );
  });

  it('keeps the existing local-plan fallback for valid share metadata', async () => {
    const plan = createPlan();
    vi.spyOn(appHttp, 'request').mockResolvedValue({
      share_id: 'share-1',
      plan_id: plan.id,
      plan_name: plan.name,
      updated_at: '2026-01-01'
    });

    expect((await plannerCloudRepository.createShare(plan)).plan).toBe(plan);
  });
});
