import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable } from 'rxjs';
import factorsData from '../../data/factors.json';
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
import { SKILLS, replaceSkillsData } from '../data/skills.data';
import {
  getAllCampaigns,
  getAllChampionsMeetings,
  getAllLegendRaces,
  getAllStoryEvents,
  replaceCampaignsData,
  replaceChampionsMeetingsData,
  replaceLegendRacesData,
  replaceStoryEventsData
} from '../data/timeline-data';
import { getRaceSaddleData, replaceRaceSaddleData } from '../data/race-saddle.data';
import { Character } from '../models/character.model';
import { Skill } from '../models/skill.model';
import { SupportCardShort } from '../models/support-card.model';
import { Campaign, ChampionsMeeting, LegendRace, StoryEvent } from '../models/timeline.model';
import { NON_BANNER_RESOURCE_NAMES, ResourceDataService, ResourceLoadError } from './resource-data.service';
import type { Factor } from './factor.service';

@Injectable({ providedIn: 'root' })
export class MasterDataService {
  private initialized = false;

  private charactersSubject = new BehaviorSubject<Character[]>(getAllCharacters());
  readonly characters$ = this.charactersSubject.asObservable();

  private supportCardsSubject = new BehaviorSubject<SupportCardShort[]>(getAllSupportCards());
  readonly supportCards$ = this.supportCardsSubject.asObservable();

  private skillsSubject = new BehaviorSubject<Skill[]>(SKILLS);
  readonly skills$ = this.skillsSubject.asObservable();

  private factorsSubject = new BehaviorSubject<Factor[]>(this.normalizeArray<Factor>(factorsData));
  readonly factors$ = this.factorsSubject.asObservable();

  private raceSaddleDataSubject = new BehaviorSubject(getRaceSaddleData());
  readonly raceSaddleData$ = this.raceSaddleDataSubject.asObservable();

  private timelineRefreshSubject = new BehaviorSubject<void>(undefined);
  readonly timelineRefresh$ = this.timelineRefreshSubject.asObservable();

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
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.loadCoreResources();
    this.preloadRemainingNonBannerResources();
  }

  private loadCoreResources(): void {
    combineLatest([
      this.resourceData.watchResource<RawCharacterData[]>('character', getRawCharacterData()),
      this.resourceData.watchResource<CharacterNameMap>('character_names', getCharacterNameEntries())
    ]).subscribe(([characters, names]) => {
      this.charactersSubject.next([...replaceCharacterMasterData(characters, names)]);
    });

    this.resourceData.watchResource<RawSupportCardData[]>('support-cards-db', getRawSupportCardsData())
      .subscribe(cards => {
        this.supportCardsSubject.next([...replaceSupportCardsData(cards)]);
      });

    this.resourceData.watchResource<Skill[]>('skills', SKILLS)
      .subscribe(skills => {
        this.skillsSubject.next([...replaceSkillsData(skills)]);
      });

    this.resourceData.watchResource<Factor[]>('factors', this.factorsSubject.value)
      .subscribe(factors => {
        this.factorsSubject.next(this.normalizeArray<Factor>(factors));
      });

    this.resourceData.watchResource('race_to_saddle_mapping', getRaceSaddleData())
      .subscribe(data => {
        this.raceSaddleDataSubject.next(replaceRaceSaddleData(data));
      });

    this.watchTimelineResource<StoryEvent>('story_events', getAllStoryEvents(), replaceStoryEventsData);
    this.watchTimelineResource<ChampionsMeeting>('champions_meeting', getAllChampionsMeetings(), replaceChampionsMeetingsData);
    this.watchTimelineResource<LegendRace>('legend_races', getAllLegendRaces(), replaceLegendRacesData);
    this.watchTimelineResource<Campaign>('campaigns', getAllCampaigns(), replaceCampaignsData);
  }

  private watchTimelineResource<T>(
    resourceName: string,
    fallback: T[],
    replaceFn: (data: unknown) => T[]
  ): void {
    this.resourceData.watchResource<T[]>(resourceName, fallback)
      .subscribe(data => {
        replaceFn(data);
        this.timelineRefreshSubject.next();
      });
  }

  private preloadRemainingNonBannerResources(): void {
    for (const resourceName of NON_BANNER_RESOURCE_NAMES) {
      this.resourceData.preloadResource(resourceName);
    }
  }

  private normalizeArray<T>(data: unknown): T[] {
    if (Array.isArray(data)) {
      return data as T[];
    }

    const defaultData = (data as any)?.default;
    return Array.isArray(defaultData) ? defaultData as T[] : [];
  }
}
