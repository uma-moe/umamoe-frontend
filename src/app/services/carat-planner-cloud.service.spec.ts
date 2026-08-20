import { HttpClient } from '@angular/common/http';
import { fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { User } from '../models/auth.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';
import {
  compactPlannerCollectionForCloud,
  expandPlannerCollectionFromCloud,
  isCompactPlannerCollectionForCloud,
} from '../utils/carat-planner-cloud-codec';
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
    );

    expect(reconciled.plans.map(item => item.id)).toEqual(['retained-plan']);
  });

  it('keeps edits made during loading when the startup cache matches the server', () => {
    const cached = collection(plan('same-plan', 'Cached', '2026-08-18T10:00:00.000Z'));
    const edited = collection(plan('same-plan', 'Edited while loading', '2026-08-19T10:00:00.000Z'));

    const reconciled = reconcileInitialPlannerCollections(
      cached,
      edited,
      cached,
      '2026-08-18T12:00:00.000Z',
      true,
    );

    expect(reconciled).toBe(edited);
  });

  it('rejects edits made over a stale startup cache', () => {
    const cached = collection(plan('same-plan', 'Stale cache', '2026-08-17T10:00:00.000Z'));
    const edited = collection(plan('same-plan', 'Edited while loading', '2026-08-19T10:00:00.000Z'));
    const remote = collection(plan('same-plan', 'Newer account copy', '2026-08-18T10:00:00.000Z'));

    const reconciled = reconcileInitialPlannerCollections(
      cached,
      edited,
      remote,
      '2026-08-18T12:00:00.000Z',
      true,
    );

    expect(reconciled).toBe(remote);
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

  it('ignores resource-derived presentation and local row ids in the sync hash', () => {
    const originalPlan = plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z');
    originalPlan.enabledRewardEventIds = ['selector-event'];
    originalPlan.disabledEventIds = ['z-event', 'support-1', 'a-event'];
    originalPlan.customIncome = [{
      id: 'local-income-id',
      label: 'Bonus',
      currency: 'free_jewels',
      amount: 100,
      cadence: 'once',
      startDate: '2026-08-20',
    }];
    originalPlan.targets = [{
      id: 'local-target-id',
      eventId: 'support-1',
      gachaId: 30123,
      gachaIds: [30124, 30123, 30124],
      title: 'Resource title',
      bannerKind: 'support',
      imagePath: 'assets/banner.webp',
      bannerStart: '2026-08-20',
      bannerEnd: '2026-08-30',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      pickupId: 30123,
      pickupGoals: [{ pickupId: 30123, desiredCopies: 1 }],
      useTickets: true,
      allowPaidJewels: false,
    }];
    const restoredPlan = {
      ...originalPlan,
      enabledRewardEventIds: [],
      disabledEventIds: ['a-event', 'z-event', 'support-1'],
      resourceDefaultsApplied: true,
      customIncome: [{ ...originalPlan.customIncome[0], id: 'cloud-income-id' }],
      targets: [{
        ...originalPlan.targets[0],
        id: 'cloud-target-id',
        title: 'support-1',
        imagePath: undefined,
        bannerStart: undefined,
        bannerEnd: undefined,
        gachaIds: [30123, 30124],
      }],
    };

    expect(plannerCollectionHash(collection(restoredPlan))).toBe(
      plannerCollectionHash(collection(originalPlan)),
    );
  });
});

describe('CaratPlannerCloudService sync', () => {
  afterEach(() => localStorage.removeItem(CLOUD_META_KEY));

  it('rewrites an existing full JSON row into the compact wire format', fakeAsync(() => {
    const serverCollection = collection(plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z'));
    storeVerifiedMeta(serverCollection);
    const setup = createCloudService(serverCollection, serverCollection);
    setup.http.get.and.returnValue(of({
      revision: 1,
      collection: serverCollection,
      updated_at: '2026-08-18T12:00:00.000Z',
    }) as any);

    setup.service.start();
    tick();

    expect(setup.http.put).toHaveBeenCalledTimes(1);
    const body = setup.http.put.calls.mostRecent().args[1] as { collection: unknown };
    expect(expandPlannerCollectionFromCloud(body.collection)).toEqual(serverCollection);
  }));

  it('rewrites a full JSON row even when a stale local cache must be reverted', fakeAsync(() => {
    const staleLocal = collection(plan('same-plan', 'Stale local', '2026-08-17T10:00:00.000Z'));
    const remote = collection(plan('same-plan', 'Current account plan', '2026-08-18T10:00:00.000Z'));
    storeVerifiedMeta(staleLocal);
    const setup = createCloudService(staleLocal, remote);
    setup.http.get.and.returnValue(of({
      revision: 1,
      collection: remote,
      updated_at: '2026-08-18T12:00:00.000Z',
    }) as any);

    setup.service.start();
    tick();

    expect(setup.collectionSubject.value).toEqual(remote);
    expect(setup.http.put).toHaveBeenCalledTimes(1);
    const body = setup.http.put.calls.mostRecent().args[1] as { collection: unknown };
    expect(isCompactPlannerCollectionForCloud(body.collection)).toBeTrue();
    expect(expandPlannerCollectionFromCloud(body.collection)).toEqual(remote);
  }));

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

  it('debounces hundreds of plan emissions into one PUT and stays idle after success', fakeAsync(() => {
    const serverCollection = collection(plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z'));
    storeVerifiedMeta(serverCollection);
    const setup = createCloudService(serverCollection, serverCollection);

    setup.service.start();
    tick();
    setup.http.put.calls.reset();

    for (let index = 0; index < 500; index++) {
      const edited = structuredClone(serverCollection);
      edited.plans[0].name = `Edit ${index}`;
      setup.collectionSubject.next(edited);
    }

    tick(699);
    expect(setup.http.put).not.toHaveBeenCalled();
    tick(1);
    expect(setup.http.put).toHaveBeenCalledTimes(1);
    tick(60_000);
    expect(setup.http.put).toHaveBeenCalledTimes(1);
  }));

  it('keeps one trailing update while a PUT is in flight', fakeAsync(() => {
    const serverCollection = collection(plan('same-plan', 'Same', '2026-08-18T10:00:00.000Z'));
    storeVerifiedMeta(serverCollection);
    const setup = createCloudService(serverCollection, serverCollection);
    const firstResponse = new Subject<any>();
    setup.http.put.and.returnValue(firstResponse);

    setup.service.start();
    tick();
    setup.http.put.calls.reset();

    const firstEdit = structuredClone(serverCollection);
    firstEdit.plans[0].name = 'First edit';
    setup.collectionSubject.next(firstEdit);
    tick(700);
    expect(setup.http.put).toHaveBeenCalledTimes(1);

    for (let index = 0; index < 500; index++) {
      const edited = structuredClone(serverCollection);
      edited.plans[0].name = `Later edit ${index}`;
      setup.collectionSubject.next(edited);
    }

    const firstBody = setup.http.put.calls.mostRecent().args[1] as { collection: unknown };
    setup.http.put.and.callFake(((_url: string, body: { collection: unknown }) => of({
      revision: 3,
      collection: body.collection,
      updated_at: '2026-08-19T12:01:00.000Z',
    })) as any);
    firstResponse.next({
      revision: 2,
      collection: firstBody.collection,
      updated_at: '2026-08-19T12:00:00.000Z',
    });
    firstResponse.complete();

    tick(699);
    expect(setup.http.put).toHaveBeenCalledTimes(1);
    tick(1);
    expect(setup.http.put).toHaveBeenCalledTimes(2);
    tick(60_000);
    expect(setup.http.put).toHaveBeenCalledTimes(2);
  }));

  it('restores the server collection when the startup cache is already different', fakeAsync(() => {
    const retained = plan('retained-plan', 'Retained', '2026-08-18T10:00:00.000Z');
    const deleted = plan('deleted-plan', 'Deleted', '2026-08-18T11:00:00.000Z');
    const serverCollection: CaratPlanCollection = {
      version: 1,
      activePlanId: deleted.id,
      plans: [retained, deleted],
    };
    const localCollection = collection(retained);
    storeVerifiedMeta(serverCollection);
    const { service, http, collectionSubject } = createCloudService(localCollection, serverCollection);

    service.start();
    tick();

    expect(collectionSubject.value).toEqual(serverCollection);
    expect(http.put).not.toHaveBeenCalled();
  }));

  it('saves edits made while an identical server collection is loading', fakeAsync(() => {
    const cached = collection(plan('same-plan', 'Cached', '2026-08-18T10:00:00.000Z'));
    const edited = collection(plan('same-plan', 'Edited while loading', '2026-08-19T10:00:00.000Z'));
    storeVerifiedMeta(cached);
    const setup = createCloudService(cached, cached, true);

    setup.service.start();
    setup.collectionSubject.next(edited);
    setup.responseSubject.next(cloudResponse(cached));
    setup.responseSubject.complete();
    tick();

    expect(setup.collectionSubject.value).toEqual(edited);
    expect(setup.http.put).toHaveBeenCalledTimes(1);
    const body = setup.http.put.calls.mostRecent().args[1] as { collection: unknown };
    expect(expandPlannerCollectionFromCloud(body.collection)).toEqual(edited);
  }));

  it('restores the server collection and reports reverted edits when the startup cache is stale', fakeAsync(() => {
    const cached = collection(plan('same-plan', 'Stale cache', '2026-08-17T10:00:00.000Z'));
    const edited = collection(plan('same-plan', 'Edited while loading', '2026-08-19T10:00:00.000Z'));
    const remote = collection(plan('same-plan', 'Newer account copy', '2026-08-18T10:00:00.000Z'));
    storeVerifiedMeta(cached);
    const setup = createCloudService(cached, remote, true);
    const statuses: string[] = [];
    setup.service.status$.subscribe(status => statuses.push(`${status.kind}:${status.label}`));

    setup.service.start();
    setup.collectionSubject.next(edited);
    setup.responseSubject.next(cloudResponse(remote));
    setup.responseSubject.complete();
    tick();

    expect(setup.collectionSubject.value).toEqual(remote);
    expect(setup.http.put).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toContain('reverted:Changes were reverted because this device copy was out of date');
  }));
});

function createCloudService(
  localCollection: CaratPlanCollection,
  serverCollection: CaratPlanCollection,
  delayed = false,
): {
  service: CaratPlannerCloudService;
  http: jasmine.SpyObj<HttpClient>;
  collectionSubject: BehaviorSubject<CaratPlanCollection>;
  responseSubject: Subject<ReturnType<typeof cloudResponse>>;
} {
  const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['get', 'put', 'delete']);
  const responseSubject = new Subject<ReturnType<typeof cloudResponse>>();
  http.get.and.returnValue(delayed ? responseSubject : of(cloudResponse(serverCollection)));
  http.put.and.callFake(((_url: string, body: { collection: unknown }) => of({
    revision: 2,
    collection: body.collection,
    updated_at: '2026-08-19T12:00:00.000Z',
  })) as any);

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
    collectionSubject,
    responseSubject,
  };
}

function cloudResponse(value: CaratPlanCollection) {
  return {
    revision: 1,
    collection: compactPlannerCollectionForCloud(value),
    updated_at: '2026-08-18T12:00:00.000Z',
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
    disabledRewardIds: [],
    enabledRewardEventIds: [],
    disabledEventIds: [],
    scenarioSelections: {
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    },
    variableRewardSelections: {},
    freePullCampaignSelections: {},
    resourceDefaultsApplied: true,
    customIncome: [],
    targets: [],
  };
}
