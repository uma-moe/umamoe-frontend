import { HttpClient } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { User } from '../models/auth.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';
import { AuthService } from './auth.service';
import {
  CaratPlannerCloudService,
  mergeInitialPlannerCollections,
  mergePlannerCollections,
  plannerCollectionHash,
  reconcileInitialPlannerCollections,
} from './carat-planner-cloud.service';
import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';

const CLOUD_META_KEY = 'carat-planner-cloud-meta-v1';

describe('CaratPlannerCloudService merge', () => {
  it('keeps the newest copy of each plan and preserves changes to different plans', () => {
    const remotePlan = plan('shared-id', 'Remote', '2026-08-18T10:00:00.000Z');
    const localPlan = plan('shared-id', 'Local', '2026-08-19T10:00:00.000Z');
    const remoteOnly = plan('remote-only', 'Remote only', '2026-08-18T11:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(localPlan),
      { version: 1, activePlanId: remoteOnly.id, plans: [remotePlan, remoteOnly] },
      '2026-08-18T12:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id).sort()).toEqual(['remote-only', 'shared-id']);
    expect(merged.plans.find(item => item.id === 'shared-id')?.name).toBe('Local');
    expect(merged.activePlanId).toBe('shared-id');
  });

  it('does not resurrect a locally cached plan deleted by a newer remote collection', () => {
    const staleLocal = plan('deleted-plan', 'Deleted', '2026-08-17T10:00:00.000Z');
    const remotePlan = plan('remote-plan', 'Current', '2026-08-18T10:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(staleLocal),
      collection(remotePlan),
      '2026-08-19T10:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['remote-plan']);
    expect(merged.activePlanId).toBe('remote-plan');
  });

  it('keeps meaningful anonymous plans during the first account merge', () => {
    const anonymous = plan('anonymous-plan', 'Before login', '2026-08-17T10:00:00.000Z');
    const remote = plan('remote-plan', 'On account', '2026-08-19T10:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(anonymous),
      collection(remote),
      '2026-08-19T11:00:00.000Z',
      true,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['anonymous-plan', 'remote-plan']);
  });

  it('ignores a fresh empty device plan when account plans already exist', () => {
    const emptyLocal = plan('fresh-local', 'My plan', '2026-08-19T12:00:00.000Z');
    emptyLocal.scenarioSelections = {
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    };
    const remote = plan('remote-plan', 'My synced plan', '2026-08-18T10:00:00.000Z');

    const merged = mergeInitialPlannerCollections(
      collection(emptyLocal),
      collection(emptyLocal),
      collection(remote),
      '2026-08-18T11:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['remote-plan']);
    expect(merged.activePlanId).toBe('remote-plan');
  });

  it('treats a local deletion as the change when the server still matches the verified hash', () => {
    const retained = plan('retained-plan', 'Retained', '2026-08-18T10:00:00.000Z');
    const deleted = plan('deleted-plan', 'Deleted', '2026-08-18T11:00:00.000Z');
    const previouslyVerified = {
      version: 1 as const,
      activePlanId: deleted.id,
      plans: [retained, deleted],
    };
    const localAfterDeletion = collection(retained);

    const reconciled = reconcileInitialPlannerCollections(
      previouslyVerified,
      localAfterDeletion,
      previouslyVerified,
      '2026-08-18T12:00:00.000Z',
      true,
      plannerCollectionHash(previouslyVerified),
    );

    expect(reconciled.plans.map(item => item.id)).toEqual(['retained-plan']);
  });

  it('accepts a remote deletion when local state still matches the verified hash', () => {
    const retained = plan('retained-plan', 'Retained', '2026-08-18T10:00:00.000Z');
    const deleted = plan('deleted-plan', 'Deleted', '2026-08-18T11:00:00.000Z');
    const previouslyVerified = {
      version: 1 as const,
      activePlanId: deleted.id,
      plans: [retained, deleted],
    };
    const remoteAfterDeletion = collection(retained);

    const reconciled = reconcileInitialPlannerCollections(
      previouslyVerified,
      previouslyVerified,
      remoteAfterDeletion,
      '2026-08-19T12:00:00.000Z',
      true,
      plannerCollectionHash(previouslyVerified),
    );

    expect(reconciled.plans.map(item => item.id)).toEqual(['retained-plan']);
  });

  it('does not change the content hash for timestamp-only updates or object key order', () => {
    const original = collection(plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z'));
    const timestampOnly = collection({
      ...original.plans[0],
      updatedAt: '2026-08-19T10:00:00.000Z',
      balances: {
        supportTickets: 0,
        umaTickets: 0,
        paidJewels: 0,
        freeJewels: 0,
        goldCrystals: 0,
        rainbowCrystals: 0,
        goldFullCrystals: 0,
        rainbowFullCrystals: 0,
      },
    });

    expect(plannerCollectionHash(timestampOnly)).toBe(plannerCollectionHash(original));
  });
});

describe('CaratPlannerCloudService sync', () => {
  afterEach(() => localStorage.removeItem(CLOUD_META_KEY));

  it('does not PUT timestamp-only state changes after loading the verified server state', fakeAsync(() => {
    const serverCollection = collection(plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z'));
    const localCollection = collection({
      ...serverCollection.plans[0],
      updatedAt: '2026-08-19T10:00:00.000Z',
    });
    storeVerifiedMeta(serverCollection);
    const { service, http } = createCloudService(localCollection, serverCollection);

    service.start();
    tick();

    expect(http.put).not.toHaveBeenCalled();
  }));

  it('PUTs the collection without a locally deleted plan when the server matches the verified hash', fakeAsync(() => {
    const retained = plan('retained-plan', 'Retained', '2026-08-18T10:00:00.000Z');
    const deleted = plan('deleted-plan', 'Deleted', '2026-08-18T11:00:00.000Z');
    const serverCollection: CaratPlanCollection = {
      version: 1,
      activePlanId: deleted.id,
      plans: [retained, deleted],
    };
    const localCollection = collection(retained);
    storeVerifiedMeta(serverCollection);
    const { service, http } = createCloudService(localCollection, serverCollection);

    service.start();
    tick();

    expect(http.put).toHaveBeenCalledTimes(1);
    expect(http.put.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      collection: localCollection,
    }));
  }));
});

function createCloudService(
  localCollection: CaratPlanCollection,
  serverCollection: CaratPlanCollection,
): { service: CaratPlannerCloudService; http: jasmine.SpyObj<HttpClient> } {
  const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'put', 'delete']);
  http.get.and.returnValue(of({
    revision: 1,
    collection: serverCollection,
    updated_at: '2026-08-18T12:00:00.000Z',
  }));
  http.put.and.returnValue(of({
    revision: 2,
    collection: localCollection,
    updated_at: '2026-08-19T12:00:00.000Z',
  }) as any);

  const collectionSubject = new BehaviorSubject(localCollection);
  const persistence = {
    collection$: collectionSubject.asObservable(),
    compactSnapshot: () => structuredClone(collectionSubject.value),
    replaceCollection: (value: unknown) => {
      const collectionValue = structuredClone(value as CaratPlanCollection);
      collectionSubject.next(collectionValue);
      return collectionValue;
    },
    compactPlan: (value: CaratPlan) => structuredClone(value),
  } as unknown as CaratPlannerPersistenceService;
  const user: User = {
    id: 'user-1',
    display_name: 'Planner',
    created_at: '2026-08-01T00:00:00.000Z',
  };
  const auth = { user$: of(user) } as AuthService;
  return {
    service: new CaratPlannerCloudService(http, auth, persistence),
    http,
  };
}

function storeVerifiedMeta(value: CaratPlanCollection): void {
  localStorage.setItem(CLOUD_META_KEY, JSON.stringify({
    userId: 'user-1',
    revision: 1,
    updatedAt: '2026-08-18T12:00:00.000Z',
    verifiedHash: plannerCollectionHash(value),
  }));
}

function collection(value: CaratPlan): CaratPlanCollection {
  return { version: 1, activePlanId: value.id, plans: [value] };
}

function plan(id: string, name: string, updatedAt: string): CaratPlan {
  return {
    id,
    name,
    createdAt: updatedAt,
    updatedAt,
    projectionStartDate: '2026-08-19',
    balances: {
      freeJewels: 0,
      paidJewels: 0,
      umaTickets: 0,
      supportTickets: 0,
      rainbowCrystals: 0,
      goldCrystals: 0,
      rainbowFullCrystals: 0,
      goldFullCrystals: 0,
    },
    enabledIncomeRuleIds: [],
    enabledRewardIds: [],
    enabledRewardEventIds: [],
    scenarioSelections: {},
    customIncome: [],
    targets: [],
  };
}
