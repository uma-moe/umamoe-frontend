import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { User } from '../models/auth.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';
import { AuthService } from './auth.service';
import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';

export type PlannerCloudStatusKind = 'local' | 'loading' | 'saving' | 'synced' | 'offline';

export interface PlannerCloudStatus {
  kind: PlannerCloudStatusKind;
  loggedIn: boolean;
  label: string;
}

export interface PlannerCloudStateResponse {
  revision: number;
  collection: CaratPlanCollection | null;
  updated_at: string | null;
}

export interface PlannerShareResponse {
  share_id: string;
  plan_id: string;
  plan_name: string;
  plan: CaratPlan;
  updated_at: string;
}

interface PlannerCloudMeta {
  userId: string;
  revision: number;
  updatedAt: string | null;
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
    return this.http.post<PlannerShareResponse>(
      `${environment.apiUrl}/api/carat-planner/shares`,
      { plan: this.persistence.compactPlan(plan) },
    );
  }

  getSharedPlan(shareId: string): Observable<PlannerShareResponse> {
    return this.http.get<PlannerShareResponse>(
      `${environment.apiUrl}/api/carat-planner/shared/${encodeURIComponent(shareId)}`,
    );
  }

  private connect(user: User | null): void {
    this.stopCollectionSync();
    this.activeUserId = user?.id ?? null;
    this.revision = 0;
    this.remoteUpdatedAt = null;
    this.pendingCollection = null;
    this.saving = false;

    if (!user) {
      this.setStatus('local', false, 'Saved on this device');
      return;
    }

    const userId = user.id;
    const localAtConnect = this.persistence.compactSnapshot();
    this.setStatus('loading', true, 'Loading account plans');
    this.http.get<PlannerCloudStateResponse>(`${environment.apiUrl}/api/carat-planner/state`)
      .subscribe({
        next: response => {
          if (this.activeUserId !== userId) return;
          this.applyInitialState(userId, response, localAtConnect);
        },
        error: () => {
          if (this.activeUserId !== userId) return;
          this.setStatus('offline', true, 'Saved locally. Account sync will retry');
          this.saveTimer = setTimeout(() => {
            this.saveTimer = undefined;
            if (this.activeUserId === userId) this.connect(user);
          }, RETRY_DELAY_MS);
        },
      });
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

    if (!response.collection) {
      this.attachCollectionSync();
      this.queueSave(local, 0);
      return;
    }

    const merged = mergeInitialPlannerCollections(
      localAtConnect,
      local,
      response.collection,
      response.updated_at,
      meta?.userId === userId,
    );
    const differsFromLocal = !sameCollection(merged, local);
    const differsFromRemote = !sameCollection(merged, response.collection);
    if (differsFromLocal) this.applyRemoteCollection(merged);
    this.storeMeta(userId);
    this.attachCollectionSync();
    if (differsFromRemote) {
      this.queueSave(merged, 0);
    } else {
      this.setStatus('synced', true, 'Saved to your account');
    }
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
    this.pendingCollection = collection;
    if (!this.activeUserId || this.saving) return;
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
    this.pendingCollection = null;
    this.saving = true;
    this.setStatus('saving', true, 'Saving to your account');

    this.http.put<PlannerCloudStateResponse>(
      `${environment.apiUrl}/api/carat-planner/state`,
      { base_revision: this.revision, collection },
    ).subscribe({
      next: response => {
        if (this.activeUserId !== userId) return;
        this.saving = false;
        this.revision = response.revision;
        this.remoteUpdatedAt = response.updated_at;
        this.storeMeta(userId);
        this.setStatus('synced', true, 'Saved to your account');
        if (this.pendingCollection) this.queueSave(this.pendingCollection, 0);
      },
      error: (error: HttpErrorResponse) => {
        if (this.activeUserId !== userId) return;
        this.saving = false;
        if (error.status === 409 && isPlannerCloudStateResponse(error.error)) {
          this.resolveConflict(error.error);
          return;
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
    const local = this.persistence.compactSnapshot();
    const merged = remote.collection
      ? mergePlannerCollections(local, remote.collection, remote.updated_at, false)
      : local;
    if (!sameCollection(local, merged)) this.applyRemoteCollection(merged);
    this.pendingCollection = merged;
    this.queueSave(merged, 0);
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

function isPlannerCloudStateResponse(value: unknown): value is PlannerCloudStateResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlannerCloudStateResponse>;
  return Number.isFinite(Number(record.revision))
    && (record.collection === null || typeof record.collection === 'object');
}
