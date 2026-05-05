import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, of, firstValueFrom } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SparkInfo } from './factor.service';

export interface AffinityData {
  chars: number[];
  aff2: number[];
  aff3: number[];
}

interface MasterVersion {
  app_version: string;
  resource_version: string;
  updated_at: string;
}

interface AffinityCache {
  appVersion: string;
  resourceVersion: string;
  data: AffinityData;
}

export interface TreeSlots {
  target: number | null;
  p1: number | null;
  p2: number | null;
  gp1Left: number | null;
  gp1Right: number | null;
  gp2Left: number | null;
  gp2Right: number | null;
}

export type PlannerSlotPosition = 'target' | 'p1' | 'p2' | 'p1-1' | 'p1-2' | 'p2-1' | 'p2-2';
export type PlannerRaceWins = Partial<Record<PlannerSlotPosition, number[]>>;

export interface BreedingAffinity {
  left: number;
  right: number;
  total: number;
}

export interface PlayerSideAffinity {
  pair: number;
  tripleLeft: number;
  tripleRight: number;
  total: number;
}

export interface TreeAffinityResult {
  p1Breeding: BreedingAffinity;
  p2Breeding: BreedingAffinity;
  playerP1: PlayerSideAffinity;
  playerP2: PlayerSideAffinity;
  legacy: number;
  relationTotal: number;
  total: number;
}

export type SlotName = keyof TreeSlots;

export interface SparkDisplayMetrics {
  /** At-least-one probability as a percentage, e.g. 8.94 */
  procChancePct: number;
  /** Raw expected proc count (can exceed 1), e.g. 3.00 */
  expectedProcs: number;
  /** Formatted proc chance string, e.g. "8.94%" */
  procDisplay: string;
  /** Formatted expected procs string, e.g. "3.00x" */
  expectedDisplay: string;
  // Legacy fields kept for sorting
  type: 'probability' | 'multiple';
  rawValue: number;
}

export interface CandidateScore {
  charaId: number;
  totalAffinity: number;
  delta: number;
}

@Injectable({
  providedIn: 'root'
})
export class AffinityService {
  private static readonly PLANNER_POSITIONS: PlannerSlotPosition[] = ['target', 'p1', 'p2', 'p1-1', 'p1-2', 'p2-1', 'p2-2'];
  private data$ = new ReplaySubject<AffinityData | null>(1);
  private loaded = false;
  private charIndex = new Map<number, number>();
  private chars: number[] = [];
  private n = 0;
  private aff2: number[] = [];
  private aff3: number[] = [];

  private static readonly CACHE_KEY = 'affinity_cache_v2';
  private static readonly STALE_THRESHOLD_MS = 30 * 60 * 1000;

  constructor(private http: HttpClient) {}

  private initData(data: AffinityData): void {
    this.n = data.chars.length;
    this.chars = data.chars;
    this.aff2 = data.aff2;
    this.aff3 = data.aff3;
    this.charIndex.clear();
    for (let i = 0; i < data.chars.length; i++) {
      this.charIndex.set(data.chars[i], i);
    }
  }

  private getCachedData(): AffinityCache | null {
    try {
      const raw = localStorage.getItem(AffinityService.CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw) as AffinityCache;
      if (cache?.data?.chars?.length && cache?.data?.aff2?.length) return cache;
    } catch {}
    return null;
  }

  private saveCache(data: AffinityData, appVersion: string, resourceVersion: string): void {
    try {
      const cache: AffinityCache = { appVersion, resourceVersion, data };
      localStorage.setItem(AffinityService.CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }

  load(): Observable<AffinityData | null> {
    if (this.loaded) {
      return this.data$.asObservable();
    }
    this.loaded = true;

    const cache = this.getCachedData();
    if (cache) {
      this.initData(cache.data);
      this.data$.next(cache.data);
    }

    this.http.get<MasterVersion>(`${environment.apiUrl}/api/ver`).pipe(
      catchError(() => of(null))
    ).subscribe(async ver => {
      if (!ver) {
        if (!cache) this.fetchAndStore('', '');
        return;
      }

      if (cache && cache.appVersion === ver.app_version && cache.resourceVersion === ver.resource_version) {
        return;
      }

      const updatedAt = new Date(ver.updated_at).getTime();
      const age = Date.now() - updatedAt;
      if (age < AffinityService.STALE_THRESHOLD_MS) {
        if (!cache) this.fetchAndStore(ver.app_version, ver.resource_version);
        return;
      }

      this.fetchAndStore(ver.app_version, ver.resource_version);
    });

    return this.data$.asObservable();
  }

  private fetchAndStore(appVersion: string, resourceVersion: string): void {
    this.http.get<AffinityData>(`${environment.apiUrl}/api/v4/affinity/data`)
      .pipe(
        tap(data => {
          this.initData(data);
          this.saveCache(data, appVersion, resourceVersion);
        }),
        catchError(() => {
          this.loaded = false;
          return of(null);
        })
      )
      .subscribe(data => this.data$.next(data));
  }

  get isReady(): boolean {
    return this.n > 0;
  }

  get characterIds(): number[] {
    return this.chars;
  }

  getAff2(a: number, b: number): number {
    const i = this.charIndex.get(a);
    const j = this.charIndex.get(b);
    if (i == null || j == null) return 0;
    return this.aff2[i * this.n + j] ?? 0;
  }

  getAff3(a: number, b: number, c: number): number {
    const i = this.charIndex.get(a);
    const j = this.charIndex.get(b);
    const k = this.charIndex.get(c);
    if (i == null || j == null || k == null) return 0;
    return this.aff3[i * this.n * this.n + j * this.n + k] ?? 0;
  }

  calculateTree(slots: TreeSlots): TreeAffinityResult | null {
    const { target, p1, p2, gp1Left, gp1Right, gp2Left, gp2Right } = slots;
    if (!this.n) return null;

    const zero3: BreedingAffinity = { left: 0, right: 0, total: 0 };
    const zero4: PlayerSideAffinity = { pair: 0, tripleLeft: 0, tripleRight: 0, total: 0 };

    const p1Breeding = p1 ? this.calcBreeding(p1, gp1Left, gp1Right) : zero3;
    const p2Breeding = p2 ? this.calcBreeding(p2, gp2Left, gp2Right) : zero3;
    const playerP1 = (target && p1) ? this.calcPlayerSide(target, p1, gp1Left, gp1Right) : zero4;
    const playerP2 = (target && p2) ? this.calcPlayerSide(target, p2, gp2Left, gp2Right) : zero4;
    const legacy = (p1 && p2) ? this.getAff2(p1, p2) : 0;

    const relationTotal = playerP1.total + playerP2.total + legacy;

    return {
      p1Breeding,
      p2Breeding,
      playerP1,
      playerP2,
      legacy,
      relationTotal,
      total: relationTotal,
    };
  }

  scorePlannerSlot(
    slotPosition: PlannerSlotPosition,
    charaId: number,
    slots: TreeSlots,
    raceWinsByPosition: PlannerRaceWins = {},
  ): number {
    if (!this.n) return 0;

    const trialSlots: TreeSlots = { ...slots };
    switch (slotPosition) {
      case 'target':
        trialSlots.target = charaId;
        break;
      case 'p1':
        trialSlots.p1 = charaId;
        break;
      case 'p2':
        trialSlots.p2 = charaId;
        break;
      case 'p1-1':
        trialSlots.gp1Left = charaId;
        break;
      case 'p1-2':
        trialSlots.gp1Right = charaId;
        break;
      case 'p2-1':
        trialSlots.gp2Left = charaId;
        break;
      case 'p2-2':
        trialSlots.gp2Right = charaId;
        break;
    }

    const result = this.calculateTree(trialSlots);
    if (!result) return 0;

    const wins = this.buildPlannerTrialRaceWins(slotPosition, raceWinsByPosition);
    switch (slotPosition) {
      case 'target':
        return result.total + this.getPlannerTotalRaceAffinity(wins);
      case 'p1':
        return result.playerP1.total + this.getPlannerGPParentOverlap('p1', wins);
      case 'p2':
        return result.playerP2.total + this.getPlannerGPParentOverlap('p2', wins);
      case 'p1-1':
        return result.playerP1.tripleLeft + this.getPlannerGPRaceOverlap('p1-1', wins);
      case 'p1-2':
        return result.playerP1.tripleRight + this.getPlannerGPRaceOverlap('p1-2', wins);
      case 'p2-1':
        return result.playerP2.tripleLeft + this.getPlannerGPRaceOverlap('p2-1', wins);
      case 'p2-2':
        return result.playerP2.tripleRight + this.getPlannerGPRaceOverlap('p2-2', wins);
    }
  }

  private calcBreeding(
    parent: number,
    gpLeft: number | null,
    gpRight: number | null,
  ): BreedingAffinity {
    const left = gpLeft ? this.getAff2(parent, gpLeft) : 0;
    const right = gpRight ? this.getAff2(parent, gpRight) : 0;
    return { left, right, total: left + right };
  }

  private calcPlayerSide(
    target: number,
    parent: number,
    gpLeft: number | null,
    gpRight: number | null,
  ): PlayerSideAffinity {
    const pair = this.getAff2(target, parent);
    const tripleLeft = gpLeft ? this.getAff3(target, parent, gpLeft) : 0;
    const tripleRight = gpRight ? this.getAff3(target, parent, gpRight) : 0;
    return { pair, tripleLeft, tripleRight, total: pair + tripleLeft + tripleRight };
  }

  private buildPlannerTrialRaceWins(
    slotPosition: PlannerSlotPosition,
    raceWinsByPosition: PlannerRaceWins,
  ): Record<PlannerSlotPosition, number[]> {
    const trial = {} as Record<PlannerSlotPosition, number[]>;
    for (const key of AffinityService.PLANNER_POSITIONS) {
      trial[key] = [...(raceWinsByPosition[key] ?? [])];
    }
    // Picking a character only changes the chara identity for that slot.
    // Existing veteran/succession race wins should not carry over.
    trial[slotPosition] = [];
    return trial;
  }

  private overlapCount(a: readonly number[], b: readonly number[]): number {
    if (!a.length || !b.length) return 0;
    const bSet = new Set(b);
    let count = 0;
    for (const value of a) {
      if (bSet.has(value)) count++;
    }
    return count;
  }

  private getPlannerGPParentOverlap(
    parentPos: 'p1' | 'p2',
    wins: Record<PlannerSlotPosition, number[]>,
  ): number {
    const parentWins = wins[parentPos] ?? [];
    if (!parentWins.length) return 0;
    return this.overlapCount(parentWins, wins[`${parentPos}-1`])
      + this.overlapCount(parentWins, wins[`${parentPos}-2`]);
  }

  private getPlannerGPRaceOverlap(
    gpPos: 'p1-1' | 'p1-2' | 'p2-1' | 'p2-2',
    wins: Record<PlannerSlotPosition, number[]>,
  ): number {
    const parentPos = gpPos.substring(0, gpPos.lastIndexOf('-')) as 'p1' | 'p2';
    return this.overlapCount(wins[parentPos] ?? [], wins[gpPos] ?? []);
  }

  private getPlannerTotalRaceAffinity(wins: Record<PlannerSlotPosition, number[]>): number {
    return this.getPlannerGPParentOverlap('p1', wins)
      + this.getPlannerGPParentOverlap('p2', wins);
  }

  rankCandidatesForSlot(
    slot: SlotName,
    slots: TreeSlots,
    limit: number = 0,
  ): CandidateScore[] {
    if (!this.n) return [];

    const currentResult = this.calculateTree(slots);
    const baseline = currentResult?.total ?? 0;

    const scores: CandidateScore[] = [];

    for (const charaId of this.chars) {
      const trial = { ...slots, [slot]: charaId };
      const result = this.calculateTree(trial);
      const totalAffinity = result?.total ?? 0;

      scores.push({
        charaId,
        totalAffinity,
        delta: totalAffinity - baseline,
      });
    }

    scores.sort((a, b) => b.totalAffinity - a.totalAffinity);
    return limit > 0 ? scores.slice(0, limit) : scores;
  }

  scoreForSlot(charaId: number, slot: SlotName, slots: TreeSlots): number {
    const trial = { ...slots, [slot]: charaId };
    return this.calculateTree(trial)?.total ?? 0;
  }

  batchScoreForSlot(
    charaIds: number[],
    slot: SlotName,
    slots: TreeSlots,
  ): Map<number, number> {
    const result = new Map<number, number>();
    for (const id of charaIds) {
      result.set(id, this.scoreForSlot(id, slot, slots));
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Spark proc / display calculations
  // ---------------------------------------------------------------------------

  private static readonly SPARK_BASE_CHANCES: Record<number, number[]> = {
    0: [0, 70, 80, 90],   // Blue
    1: [0, 1, 3, 5],      // Pink/Red
    5: [0, 5, 10, 15],    // Green
    2: [0, 1, 2, 3],      // Race (white)
    3: [0, 3, 6, 9],      // Skill (white)
    4: [0, 3, 6, 9],      // Scenario (white)
  };

  /**
   * Display matrix used by the lineage planner odds table. Single source of
   * truth so the table and the per-source calculations cannot drift apart.
   */
  static readonly BASE_CHANCE_MATRIX: ReadonlyArray<{ type: string; label: string; sparkType: number; chances: number[] }> = [
    { type: 'stats',    label: 'Stats',     sparkType: 0, chances: AffinityService.SPARK_BASE_CHANCES[0].slice(1) },
    { type: 'aptitude', label: 'Aptitude',      sparkType: 1, chances: AffinityService.SPARK_BASE_CHANCES[1].slice(1) },
    { type: 'unique',   label: 'Unique',    sparkType: 5, chances: AffinityService.SPARK_BASE_CHANCES[5].slice(1) },
    { type: 'race',     label: 'Race',     sparkType: 2, chances: AffinityService.SPARK_BASE_CHANCES[2].slice(1) },
    { type: 'skill',    label: 'Skill',    sparkType: 3, chances: AffinityService.SPARK_BASE_CHANCES[3].slice(1) },
    { type: 'scenario', label: 'Scenario', sparkType: 4, chances: AffinityService.SPARK_BASE_CHANCES[4].slice(1) },
  ];

  static getSparkTypeLabel(type: number): string {
    const entry = this.BASE_CHANCE_MATRIX.find(m => m.sparkType === type);
    return entry ? entry.label : 'White';
  }

  sparkBaseChance(spark: SparkInfo): number {
    const chances = AffinityService.SPARK_BASE_CHANCES[spark.type] ?? [0, 3, 6, 9];
    const level = Math.min(spark.level, chances.length - 1);
    return chances[level] ?? 0;
  }

  /** Proc chance per inheritance (%), capped at 100. */
  sparkProcChance(spark: SparkInfo, affinity: number = 0): number {
    const base = this.sparkBaseChance(spark);
    return Math.round(Math.min(base * (1 + affinity / 100), 100) * 100) / 100;
  }

  /** Expected proc chance per training run (two independent attempts), capped at 100. */
  sparkRunChance(spark: SparkInfo, affinity: number = 0): number {
    const proc = this.sparkProcChance(spark, affinity) / 100;
    const run = 1 - Math.pow(1 - proc, 2);
    return Math.round(Math.min(run * 100, 100) * 100) / 100;
  }

  /** Choose between per-inheritance and per-run chance based on toggle. */
  sparkDisplayChance(spark: SparkInfo, affinity: number, perRun: boolean): number {
    return perRun ? this.sparkRunChance(spark, affinity) : this.sparkProcChance(spark, affinity);
  }

  /**
   * Smart combined display metric for multiple spark sources.
   *
   * – If the expected number of procs (E = Σ p·instances) is ≥ 1.0, returns
   *   a "multiple" result so the UI can show "1.60x" instead of a capped %.
   * – Otherwise returns the true "at-least-one" probability as a percentage,
   *   e.g. "4.90%".
   */
  getSparkMetrics(
    sources: { spark: SparkInfo; affinity: number }[],
    perRun: boolean,
  ): SparkDisplayMetrics {
    let expectedYield = 0;
    let probabilityOfNone = 1;

    for (const s of sources) {
      const base = this.sparkBaseChance(s.spark);
      const p = Math.min(base * (1 + s.affinity / 100), 100) / 100;
      const instances = perRun ? 2 : 1;
      expectedYield += p * instances;
      probabilityOfNone *= Math.pow(1 - p, instances);
    }

    const chanceAtLeastOne = 1 - probabilityOfNone;
    const procChancePct = Math.round(chanceAtLeastOne * 10000) / 100;
    const expectedProcs = Math.round(expectedYield * 100) / 100;

    return {
      procChancePct,
      expectedProcs,
      procDisplay: `${procChancePct.toFixed(2)}%`,
      expectedDisplay: `${expectedProcs.toFixed(2)}x`,
      type: expectedYield >= 1.0 ? 'multiple' : 'probability',
      rawValue: expectedYield >= 1.0 ? expectedProcs : procChancePct,
    };
  }

  /** Clamped affinity-scaled chance for any raw base value. */
  clampedChance(base: number, affinity: number): number {
    return Math.min(base * (1 + affinity / 100), 100);
  }

  /** White spark breakdown (learned / upgraded / gold) for a given affinity. */
  whiteSparkChances(affinity: number): { label: string; pct: number }[] {
    const calc = (base: number) => Math.round(Math.min(base * (1 + affinity / 100), 100) * 100) / 100;
    return [
      { label: 'Learned',  pct: calc(20) },
      { label: 'Upgraded', pct: calc(25) },
      { label: 'Gold',     pct: calc(40) },
    ];
  }
}
