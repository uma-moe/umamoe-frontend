import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable } from 'rxjs';
import {
  CharacterNameMap,
  RawCharacterData,
  getAllCharacters,
  getCharacterNameEntries,
  getRawCharacterData,
  replaceCharacterMasterData
} from '../data/character.data';
import {
  RawSupportCardData,
  getAllSupportCards,
  getRawSupportCardsData,
  replaceSupportCardsData
} from '../data/support-cards.data';
import { getRaceSaddleData, replaceRaceSaddleData } from '../data/race-saddle.data';
import { Character } from '../models/character.model';
import { SupportCardShort } from '../models/support-card.model';
import { NON_BANNER_RESOURCE_NAMES, ResourceDataService, ResourceLoadError } from './resource-data.service';
import type { Factor } from './factor.service';

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private readonly backgroundPreloadResourceNames = NON_BANNER_RESOURCE_NAMES
    .filter(resourceName => resourceName !== 'skills');
  private characterSupportInitialized = false;
  private supplementalResourcesInitialized = false;
  private remainingResourcesPreloaded = false;
  private remainingResourcesPreloadScheduled = false;

  private charactersSubject = new BehaviorSubject<Character[]>(getAllCharacters());
  readonly characters$ = this.charactersSubject.asObservable();

  private supportCardsSubject = new BehaviorSubject<SupportCardShort[]>(getAllSupportCards());
  readonly supportCards$ = this.supportCardsSubject.asObservable();

  private factorsSubject = new BehaviorSubject<Factor[]>([]);
  readonly factors$ = this.factorsSubject.asObservable();

  private raceSaddleDataSubject = new BehaviorSubject(getRaceSaddleData());
  readonly raceSaddleData$ = this.raceSaddleDataSubject.asObservable();

  readonly charactersPending$: Observable<boolean>;
  readonly supportCardsPending$: Observable<boolean>;
  readonly factorsPending$: Observable<boolean>;
  readonly charactersError$: Observable<ResourceLoadError | null>;
  readonly supportCardsError$: Observable<ResourceLoadError | null>;
  readonly factorsError$: Observable<ResourceLoadError | null>;
  readonly charactersUsingCachedData$: Observable<boolean>;
  readonly supportCardsUsingCachedData$: Observable<boolean>;
  readonly factorsUsingCachedData$: Observable<boolean>;

  constructor(private resourceData: ResourceDataService) {
    this.charactersPending$ = combineLatest([
      this.resourceData.resourcePending('character'),
      this.resourceData.resourcePending('character_names')
    ]).pipe(map(([charactersPending, namesPending]) => charactersPending || namesPending));
    this.supportCardsPending$ = this.resourceData.resourcePending('support-cards-db');
    this.factorsPending$ = this.resourceData.resourcePending('factors');
    this.charactersError$ = combineLatest([
      this.resourceData.resourceError('character'),
      this.resourceData.resourceError('character_names')
    ]).pipe(map(([charactersError, namesError]) => charactersError || namesError));
    this.supportCardsError$ = this.resourceData.resourceError('support-cards-db');
    this.factorsError$ = this.resourceData.resourceError('factors');
    this.charactersUsingCachedData$ = combineLatest([
      this.resourceData.resourceUsingCachedData('character'),
      this.resourceData.resourceUsingCachedData('character_names')
    ]).pipe(map(([charactersCached, namesCached]) => charactersCached || namesCached));
    this.supportCardsUsingCachedData$ = this.resourceData.resourceUsingCachedData('support-cards-db');
    this.factorsUsingCachedData$ = this.resourceData.resourceUsingCachedData('factors');
  }

  init(): void {
    this.initCharacterSupportResources();
    this.initSupplementalResources();
    this.scheduleRemainingResourcePreload();
  }

  initCharacterSupportResources(): void {
    if (this.characterSupportInitialized) {
      return;
    }

    this.characterSupportInitialized = true;
    void this.loadCharacterSupportResources();
  }

  initSupplementalResources(): void {
    if (this.supplementalResourcesInitialized) {
      return;
    }

    this.supplementalResourcesInitialized = true;
    void this.loadSupplementalResources();
  }

  private async loadCharacterSupportResources(): Promise<void> {
    const [characters, names, supportCards] = await Promise.all([
      this.loadStaticFallback<RawCharacterData[]>('/assets/data/character.json', getRawCharacterData()),
      this.loadStaticFallback<CharacterNameMap>('/assets/data/character_names.json', getCharacterNameEntries()),
      this.loadStaticFallback<RawSupportCardData[]>('/assets/data/support-cards-db.json', getRawSupportCardsData()),
    ]);

    this.charactersSubject.next([...replaceCharacterMasterData(characters, names)]);
    this.supportCardsSubject.next([...replaceSupportCardsData(supportCards)]);

    combineLatest([
      this.resourceData.watchResource<RawCharacterData[]>('character', characters),
      this.resourceData.watchResource<CharacterNameMap>('character_names', names),
    ]).subscribe(([nextCharacters, nextNames]) => {
      this.charactersSubject.next([...replaceCharacterMasterData(nextCharacters, nextNames)]);
    });

    this.resourceData.watchResource<RawSupportCardData[]>('support-cards-db', supportCards)
      .subscribe(cards => this.supportCardsSubject.next([...replaceSupportCardsData(cards)]));
  }

  private async loadSupplementalResources(): Promise<void> {
    const [factors, raceSaddleData] = await Promise.all([
      this.loadStaticFallback<Factor[]>('/assets/data/factors.json', this.factorsSubject.value),
      this.loadStaticFallback('/assets/data/race_to_saddle_mapping.json', getRaceSaddleData()),
    ]);

    this.factorsSubject.next(this.normalizeArray<Factor>(factors));
    this.raceSaddleDataSubject.next(replaceRaceSaddleData(raceSaddleData));

    this.resourceData.watchResource<Factor[]>('factors', this.factorsSubject.value)
      .subscribe(nextFactors => this.factorsSubject.next(this.normalizeArray<Factor>(nextFactors)));
    this.resourceData.watchResource('race_to_saddle_mapping', getRaceSaddleData())
      .subscribe(data => this.raceSaddleDataSubject.next(replaceRaceSaddleData(data)));
  }

  private async loadStaticFallback<T>(url: string, emptyFallback: T): Promise<T> {
    try {
      return await this.resourceData.loadStaticJson<T>(url);
    } catch (error) {
      console.warn(`Unable to load static master-data fallback ${url}.`, error);
      return emptyFallback;
    }
  }

  /**
   * Warm non-critical datasets only when the browser has spare time. Starting
   * every JSON download and parse during route startup caused avoidable CPU,
   * memory, and network contention on slower devices.
   */
  private scheduleRemainingResourcePreload(): void {
    if (this.remainingResourcesPreloaded || this.remainingResourcesPreloadScheduled) {
      return;
    }
    if (this.shouldAvoidNonCriticalPreload()) {
      // These datasets still load normally when a feature explicitly requests
      // one. Avoid warming unrelated routes on constrained devices or data
      // saver connections.
      this.remainingResourcesPreloaded = true;
      return;
    }
    this.remainingResourcesPreloadScheduled = true;
    let index = 0;
    const preloadNext = () => {
      if (index >= this.backgroundPreloadResourceNames.length) {
        this.remainingResourcesPreloadScheduled = false;
        this.remainingResourcesPreloaded = true;
        return;
      }

      // One resource per idle turn keeps download completion/JSON parsing from
      // bunching into a single long task.
      this.resourceData.preloadResource(this.backgroundPreloadResourceNames[index++]);
      scheduleNext();
    };
    const scheduleNext = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        window.requestIdleCallback(preloadNext, { timeout: 4000 });
      } else {
        setTimeout(preloadNext, 750);
      }
    };
    scheduleNext();
  }

  private shouldAvoidNonCriticalPreload(): boolean {
    if (typeof navigator === 'undefined') return false;
    const constrainedNavigator = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const effectiveType = constrainedNavigator.connection?.effectiveType;
    return constrainedNavigator.connection?.saveData === true
      || effectiveType === 'slow-2g'
      || effectiveType === '2g'
      || (typeof constrainedNavigator.deviceMemory === 'number' && constrainedNavigator.deviceMemory <= 4)
      || (typeof constrainedNavigator.hardwareConcurrency === 'number' && constrainedNavigator.hardwareConcurrency <= 4);
  }

  private normalizeArray<T>(data: unknown): T[] {
    if (Array.isArray(data)) {
      return data as T[];
    }

    const defaultData = (data as any)?.default;
    return Array.isArray(defaultData) ? defaultData as T[] : [];
  }
}
