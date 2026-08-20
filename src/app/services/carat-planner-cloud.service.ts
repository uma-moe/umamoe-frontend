import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { User } from '../models/auth.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';
import {
  compactPlannerCollectionForCloud,
  compactPlannerPlanForCloudShare,
  expandPlannerCollectionFromCloud,
  expandPlannerPlanFromCloudShare,
  isCompactPlannerCollectionForCloud,
} from '../utils/carat-planner-cloud-codec';
import { AuthService } from './auth.service';
import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';

export type PlannerCloudStatusKind = 'local' | 'loading' | 'saving' | 'synced' | 'offline' | 'reverted';

export interface PlannerCloudStatus {
  kind: PlannerCloudStatusKind;
  loggedIn: boolean;
  label: string;
}

export interface PlannerCloudStateResponse {
  revision: number;
  collection: CaratPlanCollection | null;
  updated_at: string | null;
  needs_compaction?: boolean;
}

interface PlannerCloudWireStateResponse {
  revision: number;
  collection: unknown | null;
  updated_at: string | null;
}

export interface PlannerShareResponse {
  share_id: string;
  plan_id: string;
  plan_name: string;
  plan: CaratPlan;
  updated_at: string;
}

interface PlannerShareWireResponse extends Omit<PlannerShareResponse, 'plan'> {
  plan: unknown;
}

interface PlannerCloudMeta {
  userId: string;
  revision: number;
  updatedAt: string | null;
  verifiedHash?: string | null;
}

const CLOUD_META_KEY = 'carat-planner-cloud-meta-v1';
const SAVE_DEBOUNCE_MS = 700;
const RETRY_DELAY_MS = 5000;

@Injectable({ providedIn: 'root' })
export class CaratPlannerCloudService {
  private readonly statusSubject = new BehaviorSubject<PlannerCloudStatus>({
    kind: 'local',
    loggedIn: false,
    label: 'Saved on this device',
  });
  private authSubscription?: Subscription;
  private collectionSubscription?: Subscription;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private activeUserId: string | null = null;
  private revision = 0;
  private remoteUpdatedAt: string | null = null;
  private verifiedHash: string | null = null;
  private hasVerifiedState = false;
  private pendingCollection: CaratPlanCollection | null = null;
  private saving = false;
  private applyingRemote = false;
  private started = false;

  readonly status$ = this.statusSubject.asObservable();
  readonly loggedIn$ = this.status$.pipe(
    map(status => status.loggedIn),
    distinctUntilChanged(),
  );

  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
    private readonly persistence: CaratPlannerPersistenceService,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.authSubscription = this.auth.user$
      .pipe(distinctUntilChanged((left, right) => left?.id === right?.id))
      .subscribe(user => this.connect(user));
  }

  createShare(plan: CaratPlan): Observable<PlannerShareResponse> {
    return this.http.post<PlannerShareWireResponse>(
      `${environment.apiUrl}/api/carat-planner/shares`,
      { plan: compactPlannerPlanForCloudShare(this.persistence.compactPlan(plan)) },
    ).pipe(map(decodePlannerShareResponse));
  }

  getSharedPlan(shareId: string): Observable<PlannerShareResponse> {
    return this.http.get<PlannerShareWireResponse>(
      `${environment.apiUrl}/api/carat-planner/shared/${encodeURIComponent(shareId)}`,
    ).pipe(map(decodePlannerShareResponse));
  }

  deleteShare(planId: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/api/carat-planner/shares/${encodeURIComponent(planId)}`,
    );
  }

  private connect(user: User | null): void {
    this.stopCollectionSync();
    this.activeUserId = user?.id ?? null;
    this.revision = 0;
    this.remoteUpdatedAt = null;
    this.verifiedHash = null;
    this.hasVerifiedState = false;
    this.pendingCollection = null;
    this.saving = false;

    if (!user) {
      this.setStatus('local', false, 'Saved on this device');
      return;
    }

    const userId = user.id;
    const localAtConnect = this.persistence.compactSnapshot();
    this.setStatus('loading', true, 'Loading account plans');
    void this.loadInitialState(user, localAtConnect);
  }

  private async loadInitialState(user: User, localAtConnect: CaratPlanCollection): Promise<void> {
    const userId = user.id;
    try {
      const response = await firstValueFrom(
        this.http.get<PlannerCloudWireStateResponse>(`${environment.apiUrl}/api/carat-planner/state`)
          .pipe(map(decodePlannerCloudStateResponse)),
      );
      if (this.activeUserId !== userId) return;
      this.applyInitialState(userId, response, localAtConnect);
    } catch {
      if (this.activeUserId !== userId) return;
      this.setStatus('offline', true, 'Saved locally. Account sync will retry');
      this.saveTimer = setTimeout(() => {
        this.saveTimer = undefined;
        if (this.activeUserId === userId) this.connect(user);
      }, RETRY_DELAY_MS);
    }
  }

  private applyInitialState(
    userId: string,
    response: PlannerCloudStateResponse,
    localAtConnect: CaratPlanCollection,
  ): void {
    this.revision = Math.max(0, Number(response.revision) || 0);
    this.remoteUpdatedAt = response.updated_at;
    const local = this.persistence.compactSnapshot();
    const meta = this.loadMeta();
    const knownAccount = meta?.userId === userId;

    this.verifiedHash = response.collection ? plannerCollectionHash(response.collection) : null;
    this.hasVerifiedState = true;
    this.storeMeta(userId);

    if (!response.collection) {
      this.attachCollectionSync();
      this.queueSave(local, 0);
      return;
    }

    const merged = reconcileInitialPlannerCollections(
      localAtConnect,
      local,
      response.collection,
      response.updated_at,
      knownAccount,
    );
    const localAtConnectHash = plannerCollectionHash(localAtConnect);
    const currentLocalHash = plannerCollectionHash(local);
    const remoteHash = plannerCollectionHash(response.collection);
    const revertedInFlightChanges = knownAccount
      && localAtConnectHash !== remoteHash
      && currentLocalHash !== localAtConnectHash
      && currentLocalHash !== remoteHash;
    const differsFromLocal = !sameCollection(merged, local);
    if (differsFromLocal) this.applyRemoteCollection(merged);
    this.attachCollectionSync();
    if (response.needs_compaction) this.verifiedHash = null;
    if (revertedInFlightChanges) {
      this.setStatus(
        'reverted',
        true,
        'Changes were reverted because this device copy was out of date. Your account plans are now current.',
      );
      if (response.needs_compaction) {
        this.queueSave(this.persistence.compactSnapshot(), 0);
      }
      return;
    }
    this.queueSave(this.persistence.compactSnapshot(), 0);
  }

  private attachCollectionSync(): void {
    this.collectionSubscription?.unsubscribe();
    let initial = true;
    this.collectionSubscription = this.persistence.collection$.subscribe(() => {
      if (initial) {
        initial = false;
        return;
      }
      if (this.applyingRemote || !this.activeUserId) return;
      this.queueSave(this.persistence.compactSnapshot());
    });
  }

  private stopCollectionSync(): void {
    this.collectionSubscription?.unsubscribe();
    this.collectionSubscription = undefined;
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
  }

  private queueSave(collection: CaratPlanCollection, delay = SAVE_DEBOUNCE_MS): void {
    if (!this.activeUserId) return;
    if (this.hasVerifiedState && plannerCollectionHash(collection) === this.verifiedHash) {
      if (this.saving) {
        this.pendingCollection = collection;
      } else {
        this.pendingCollection = null;
        if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
        this.saveTimer = undefined;
        this.setStatus('synced', true, 'Saved to your account');
      }
      return;
    }

    this.pendingCollection = collection;
    if (this.saving) return;
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      this.flushSave();
    }, delay);
  }

  private flushSave(): void {
    const userId = this.activeUserId;
    const collection = this.pendingCollection;
    if (!userId || !collection || this.saving) return;
    if (this.hasVerifiedState && plannerCollectionHash(collection) === this.verifiedHash) {
      this.pendingCollection = null;
      this.setStatus('synced', true, 'Saved to your account');
      return;
    }
    this.pendingCollection = null;
    this.saving = true;
    this.setStatus('saving', true, 'Saving to your account');

    this.http.put<PlannerCloudWireStateResponse>(
      `${environment.apiUrl}/api/carat-planner/state`,
      { base_revision: this.revision, collection: compactPlannerCollectionForCloud(collection) },
    ).pipe(map(decodePlannerCloudStateResponse)).subscribe({
      next: response => {
        if (this.activeUserId !== userId) return;
        this.saving = false;
        this.revision = response.revision;
        this.remoteUpdatedAt = response.updated_at;
        this.verifiedHash = response.collection
          ? plannerCollectionHash(response.collection)
          : plannerCollectionHash(collection);
        this.hasVerifiedState = true;
        this.storeMeta(userId);
        this.queueSave(this.persistence.compactSnapshot(), 0);
      },
      error: (error: HttpErrorResponse) => {
        if (this.activeUserId !== userId) return;
        this.saving = false;
        if (error.status === 409) {
          try {
            this.resolveConflict(decodePlannerCloudStateResponse(error.error));
            return;
          } catch {}
        }
        this.pendingCollection = this.persistence.compactSnapshot();
        this.setStatus('offline', true, 'Saved locally. Account sync will retry');
        this.queueSave(this.pendingCollection, RETRY_DELAY_MS);
      },
    });
  }

  private resolveConflict(remote: PlannerCloudStateResponse): void {
    this.revision = Math.max(0, Number(remote.revision) || 0);
    this.remoteUpdatedAt = remote.updated_at;
    this.verifiedHash = remote.collection ? plannerCollectionHash(remote.collection) : null;
    this.hasVerifiedState = true;
    if (this.activeUserId) this.storeMeta(this.activeUserId);
    const local = this.persistence.compactSnapshot();
    if (!remote.collection) {
      this.queueSave(local, 0);
      return;
    }
    if (plannerCollectionHash(local) === plannerCollectionHash(remote.collection)) {
      this.setStatus('synced', true, 'Saved to your account');
      return;
    }

    this.applyRemoteCollection(remote.collection);
    this.setStatus(
      'reverted',
      true,
      'Changes were reverted because your account changed elsewhere. Your local plans are now current.',
    );
  }

  private applyRemoteCollection(collection: CaratPlanCollection): void {
    this.applyingRemote = true;
    try {
      this.persistence.replaceCollection(collection);
    } finally {
      this.applyingRemote = false;
    }
  }

  private setStatus(kind: PlannerCloudStatusKind, loggedIn: boolean, label: string): void {
    this.statusSubject.next({ kind, loggedIn, label });
  }

  private loadMeta(): PlannerCloudMeta | null {
    try {
      const raw = localStorage.getItem(CLOUD_META_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PlannerCloudMeta>;
      return typeof parsed.userId === 'string' && Number.isFinite(parsed.revision)
        ? {
          userId: parsed.userId,
          revision: Math.max(0, Number(parsed.revision)),
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
          ...(Object.prototype.hasOwnProperty.call(parsed, 'verifiedHash')
            ? { verifiedHash: typeof parsed.verifiedHash === 'string' ? parsed.verifiedHash : null }
            : {}),
        }
        : null;
    } catch {
      return null;
    }
  }

  private storeMeta(userId: string): void {
    try {
      localStorage.setItem(CLOUD_META_KEY, JSON.stringify({
        userId,
        revision: this.revision,
        updatedAt: this.remoteUpdatedAt,
        verifiedHash: this.verifiedHash,
      } satisfies PlannerCloudMeta));
    } catch {}
  }
}

export function mergePlannerCollections(
  local: CaratPlanCollection,
  remote: CaratPlanCollection,
  remoteUpdatedAt: string | null,
  preserveUntrackedLocalPlans: boolean,
): CaratPlanCollection {
  const plans = new Map(remote.plans.map(plan => [plan.id, plan]));
  const remoteUpdatedTime = dateTime(remoteUpdatedAt);
  let localWon = false;

  for (const localPlan of local.plans) {
    const remotePlan = plans.get(localPlan.id);
    if (remotePlan) {
      if (dateTime(localPlan.updatedAt) > dateTime(remotePlan.updatedAt)) {
        plans.set(localPlan.id, localPlan);
        localWon = true;
      }
      continue;
    }
    if (preserveUntrackedLocalPlans || dateTime(localPlan.updatedAt) > remoteUpdatedTime) {
      plans.set(localPlan.id, localPlan);
      localWon = true;
    }
  }

  const mergedPlans = [...plans.values()]
    .sort((left, right) => dateTime(left.createdAt) - dateTime(right.createdAt))
    .slice(0, 50);
  const preferredActiveId = localWon ? local.activePlanId : remote.activePlanId;
  return {
    version: 1,
    activePlanId: mergedPlans.some(plan => plan.id === preferredActiveId)
      ? preferredActiveId
      : mergedPlans[0]?.id ?? '',
    plans: mergedPlans,
  };
}

export function mergeInitialPlannerCollections(
  localAtConnect: CaratPlanCollection,
  currentLocal: CaratPlanCollection,
  remote: CaratPlanCollection,
  remoteUpdatedAt: string | null,
  knownAccount: boolean,
): CaratPlanCollection {
  const meaningfulAnonymousData = !knownAccount && hasMeaningfulPlannerData(localAtConnect);
  if (!knownAccount && !meaningfulAnonymousData) return remote;
  return mergePlannerCollections(
    currentLocal,
    remote,
    remoteUpdatedAt,
    meaningfulAnonymousData,
  );
}

export function reconcileInitialPlannerCollections(
  localAtConnect: CaratPlanCollection,
  currentLocal: CaratPlanCollection,
  remote: CaratPlanCollection,
  remoteUpdatedAt: string | null,
  knownAccount: boolean,
): CaratPlanCollection {
  if (knownAccount) {
    // The local collection is rendered immediately while this request is in flight.
    // Edits made during the request are safe only when the cache was the exact server
    // state at request start. A stale cache must never be merged back over newer data.
    return plannerCollectionHash(localAtConnect) === plannerCollectionHash(remote)
      ? currentLocal
      : remote;
  }

  return mergeInitialPlannerCollections(
    localAtConnect,
    currentLocal,
    remote,
    remoteUpdatedAt,
    knownAccount,
  );
}

export function plannerCollectionHash(collection: CaratPlanCollection): string {
  const canonical = canonicalJson(plannerCollectionSemanticState(collection));
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;

  for (let index = 0; index < canonical.length; index++) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 2_654_435_761);
    second = Math.imul(second ^ code, 1_597_334_677);
  }

  first = Math.imul(first ^ (first >>> 16), 2_246_822_507)
    ^ Math.imul(second ^ (second >>> 13), 3_266_489_909);
  second = Math.imul(second ^ (second >>> 16), 2_246_822_507)
    ^ Math.imul(first ^ (first >>> 13), 3_266_489_909);

  return `v1-${canonical.length.toString(36)}-${(second >>> 0).toString(16).padStart(8, '0')}${(first >>> 0).toString(16).padStart(8, '0')}`;
}

function plannerCollectionSemanticState(collection: CaratPlanCollection): unknown {
  return {
    ...collection,
    plans: collection.plans.map(plan => ({
      ...plan,
      enabledRewardEventIds: [],
      resourceDefaultsApplied: undefined,
      variableRewardSelections: Object.fromEntries(
        Object.entries(plan.variableRewardSelections ?? {}).map(([eventId, selection]) => [eventId, {
          ...selection,
          label: undefined,
        }]),
      ),
      customIncome: plan.customIncome.map(({ id: _id, ...income }) => income),
      targets: plan.targets.map(({
        id: _id,
        title: _title,
        imagePath: _imagePath,
        bannerStart: _bannerStart,
        bannerEnd: _bannerEnd,
        desiredCopies: _desiredCopies,
        pickupId: _pickupId,
        ...target
      }) => target),
    })),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter(key => key !== 'updatedAt' && record[key] !== undefined)
    .sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function hasMeaningfulPlannerData(collection: CaratPlanCollection): boolean {
  if (collection.plans.length > 1) return true;
  const plan = collection.plans[0];
  if (!plan) return false;
  if (plan.name !== 'My plan' || plan.targets.length > 0 || plan.customIncome.length > 0) return true;
  if (Object.values(plan.balances).some(value => Number(value) > 0)) return true;
  if ((plan.disabledRewardIds?.length ?? 0) > 0 || (plan.disabledEventIds?.length ?? 0) > 0) return true;
  if (Object.keys(plan.variableRewardSelections ?? {}).length > 0) return true;
  if (plan.enabledIncomeRuleIds.length > 0) return true;

  const expectedScenarios: Record<string, string> = {
    speculative_income: 'include',
    ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
  };
  return Object.entries(plan.scenarioSelections).some(([key, value]) => expectedScenarios[key] !== value)
    || Object.keys(expectedScenarios).some(key => plan.scenarioSelections[key] !== expectedScenarios[key]);
}

function sameCollection(left: CaratPlanCollection, right: CaratPlanCollection): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function dateTime(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPlannerCloudWireStateResponse(value: unknown): value is PlannerCloudWireStateResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlannerCloudWireStateResponse>;
  return Number.isFinite(Number(record.revision))
    && (record.collection === null || typeof record.collection === 'object');
}

function decodePlannerCloudStateResponse(value: unknown): PlannerCloudStateResponse {
  if (!isPlannerCloudWireStateResponse(value)) throw new Error('Invalid planner cloud response.');
  const collection = value.collection === null
    ? null
    : expandPlannerCollectionFromCloud(value.collection);
  if (value.collection !== null && !collection) throw new Error('Invalid planner cloud collection.');
  return {
    revision: Math.max(0, Number(value.revision) || 0),
    collection,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : null,
    needs_compaction: value.collection !== null
      && !isCompactPlannerCollectionForCloud(value.collection),
  };
}

function decodePlannerShareResponse(value: PlannerShareWireResponse): PlannerShareResponse {
  const plan = expandPlannerPlanFromCloudShare(value.plan);
  if (!plan) throw new Error('Invalid shared planner data.');
  return { ...value, plan };
}
