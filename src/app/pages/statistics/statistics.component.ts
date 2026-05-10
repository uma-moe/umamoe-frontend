import { Component, OnInit, OnDestroy, AfterViewInit, HostListener, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatBottomSheetModule, MatBottomSheet } from '@angular/material/bottom-sheet';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Meta, Title } from '@angular/platform-browser';
import { Subject, takeUntil, BehaviorSubject, forkJoin, of, combineLatest, take } from 'rxjs';
import { map, debounceTime, distinctUntilChanged, startWith, catchError, filter } from 'rxjs/operators';
import { StatisticsService } from '../../services/statistics.service';
import { SKILLS, getSkillById, getSkillBySkillId } from '../../data/skills.data';
import { getSupportCardById } from '../../data/support-cards.data';
import { StatisticsChartComponent, ChartDataPoint } from '../../components/statistics-chart/statistics-chart.component';
import { ClassFilterComponent, ClassFilterState, DistanceChangeEvent } from '../../components/class-filter/class-filter.component';
import { TeamClassBottomSheetComponent, BottomSheetData } from '../../components/team-class-bottom-sheet/team-class-bottom-sheet.component';
import { ColorsService } from '../../services/colors.service';
import { CharacterService } from '../../services/character.service';
import { SupportCardType } from '../../models/support-card.model';
import {
  STATISTICS_DISTANCES,
  getStatisticsDistanceColor,
  getStatisticsDistanceIcon,
  getStatisticsDistanceLabel,
  getStatisticsScenarioName,
  isIdsStatisticsFormat,
  resolveStatisticsDistance,
  toStatisticsDistanceOption
} from '../../data/statistics-lookup.data';
interface ResolvedSupportCard {
  id: string | null;
  name: string;
  type: string | null;
  imageUrl?: string;
}
interface ResolvedSkill {
  id: string | number | null;
  name: string;
  icon: string | null;
  imageUrl: string;
}
@Component({
  selector: 'app-statistics',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatBottomSheetModule,
    MatExpansionModule,
    MatGridListModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatCheckboxModule,
    ReactiveFormsModule,
    StatisticsChartComponent,
    ClassFilterComponent
  ],
  templateUrl: './statistics.component.html',
  styleUrl: './statistics.component.scss'
})
export class StatisticsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('classFilter') classFilter!: ClassFilterComponent;
  private destroy$ = new Subject<void>();
  // Dataset management
  availableDatasets$ = new BehaviorSubject<any[]>([]);
  selectedDataset$ = new BehaviorSubject<any>(null);
  // Loading states
  globalLoading = true;
  distanceLoading = false;
  characterLoading = false;
  // Data
  globalStats: any = null;
  distanceStats: any = {};
  characterStats: any = {};
  rawData: any = null;
  private supportCardInfoCache = new Map<string, ResolvedSupportCard>();
  // UI State
  isMobile = false;
  isSmallScreen = false;
  isBottomSheetMode = window.innerWidth < 1200; // Initialize immediately
  selectedDistance = new BehaviorSubject<string | null>(null);
  distanceFilters: { [key: string]: boolean } = {};
  selectedCharacterDetail: string | null = null;
  // Distance selector visibility is now determined by selectedCharacterDetail or selectedDistance
  // Search
  characterSearchControl = new FormControl('');
  filteredCharacters$ = new BehaviorSubject<{ id: string, name: string }[]>([]);
  // Filters
  classFilters: ClassFilterState = {
    '1': true,
    '2': true,
    '3': true,
    '4': true,
    '5': true,
    '6': true
  };
  
  scenarioFilters: { [key: string]: boolean } = {
    '1': true, // URA
    '2': true, // Aoharu
    '3': true, // Climax
    '4': true, // Grand Masters
    '5': true  // UAF
  };
  
  scenarioNames: { [key: string]: string } = {
    '1': 'URA',
    '2': 'Aoharu',
    '3': 'MANT',
    '4': 'MANT',
    '5': 'UAF'
  };
  // Available distances
  availableDistances = ['sprint', 'mile', 'medium', 'long', 'dirt'];
  // Add debounce timer for character updates to prevent stuttering
  private characterUpdateTimer: any = null;
  private distanceUpdateTimer: any = null;
  private chartDataUpdateTimer: any = null;
  private readonly chartDataUpdateDebounceMs = 100;
  private reactiveUpdatesInitialized = false;
  private pendingCharacterUpdates = {
    distance: null as string | null,
    characterId: null as string | null
  };
  // Cache for computed chart data
  private chartDataCache = new Map<string, any>();
  private cacheKeys = {
    globalStats: '',
    classFilters: '',
    selectedDistance: '',
    selectedCharacter: ''
  };
  // Performance optimization properties
  private lastActiveClasses: string = '1,2,3,4,5,6'; // Initialize to match the default classFilters state
  private filteredTotalCache: number = 0;
  // Scroll tracking properties
  private lastScrollY = 0;
  private headerOriginalTop = 0;
  private headerStickyActive = false;
  private classFilterOriginalTop = 0;
  private classFilterStickyActive = false;
  // Sticky logic for distance selectors removed
  private scrollThrottleTimer: any = null;
  // Standard chart configurations for consistency
  readonly CHART_CONFIGS = {
    // Standard single bar chart
    BAR_STANDARD: { type: 'bar' as const, title: '', height: 320, showLegend: false, colors: [] },
    // Bar chart with legend for multi-series
    BAR_WITH_LEGEND: { type: 'bar' as const, title: '', height: 320, showLegend: true, stacked: false },
    // Stacked bar chart
    BAR_STACKED: { type: 'bar' as const, title: '', height: 360, showLegend: true, stacked: true },
    // Large stacked bar chart
    BAR_STACKED_LARGE: { type: 'bar' as const, title: '', height: 500, showLegend: true, stacked: true },
    // Horizontal bar chart
    BAR_HORIZONTAL: { type: 'horizontalBar' as const, title: '', height: 400, showLegend: false },
    // Doughnut chart with center text showing total by default
    DOUGHNUT_STANDARD: { type: 'doughnut' as const, title: '', height: 350, showLegend: true, centerText: '' },
    // Doughnut with center text (legacy - now same as DOUGHNUT_STANDARD)
    DOUGHNUT_WITH_CENTER: { type: 'doughnut' as const, title: '', height: 320, showLegend: true, centerText: '' },
    // Image list view for cards and characters
    IMAGE_LIST: { type: 'bar' as const, title: '', height: 400, showImages: true, imageSize: 48, showLegend: false },
    // Vertical bar chart with character images at the bottom
    VERTICAL_IMAGE_BAR: { type: 'bar' as const, title: '', height: 500, showLegend: false, showImages: true, imageSize: 64, verticalImages: true },
    // Horizontal bar chart with stat symbols for compositions
    STAT_SYMBOL_BAR: { type: 'horizontalBar' as const, title: '', height: 400, showLegend: false, showStatSymbols: true }
  };
  // Template compatibility
  get distances() {
    return this.availableDistances;
  }
  private isIdsFormat(): boolean {
    return isIdsStatisticsFormat(this.selectedDataset$.value);
  }
  private configureDistancesForDataset(dataset: any): void {
    const idsFormat = isIdsStatisticsFormat(dataset);
    const rawDistances = dataset?.index?.distances?.length
      ? dataset.index.distances
      : STATISTICS_DISTANCES.map(distance => distance.slug);
    const nextDistances = rawDistances
      .map((distance: string | number) => toStatisticsDistanceOption(distance, idsFormat))
      .filter((distance: string, index: number, distances: string[]) => distance && distances.indexOf(distance) === index);
    this.availableDistances = nextDistances.length
      ? nextDistances
      : STATISTICS_DISTANCES.map(distance => idsFormat ? distance.id : distance.slug);
    const previousFilters = this.distanceFilters;
    const hadPreviousFilters = Object.keys(previousFilters).length > 0;
    this.distanceFilters = this.availableDistances.reduce((filters, distance) => {
      const distanceInfo = resolveStatisticsDistance(distance);
      const previousKeys = [distance, distanceInfo?.id, distanceInfo?.slug].filter(Boolean) as string[];
      const previousValue = previousKeys
        .map(key => previousFilters[key])
        .find(value => value !== undefined);
      filters[distance] = hadPreviousFilters ? previousValue !== false : true;
      return filters;
    }, {} as { [key: string]: boolean });
    this.syncPrimarySelectedDistance();
  }
  private syncPrimarySelectedDistance(): void {
    const nextDistance = this.getActiveDistanceIds()[0] ?? null;
    if (this.selectedDistance.value !== nextDistance) {
      this.selectedDistance.next(nextDistance);
    }
  }
  private getDistanceOptionForCurrentDataset(distance: string | number): string {
    return toStatisticsDistanceOption(distance, this.isIdsFormat());
  }
  private resolveCharacterId(key: string, data?: any): string | null {
    const rawId = data?.character_id ?? data?.id ?? data?.uma_id ?? data?.chara_id;
    if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
      return String(rawId);
    }
    if (/^\d+$/.test(key)) {
      return key;
    }
    return this.statisticsService.getCharacterIdFromName(key);
  }
  private resolveCharacterName(key: string, data?: any): string {
    const characterId = this.resolveCharacterId(key, data);
    if (characterId) {
      return this.getCharacterNameById(characterId) || data?.name || `Unknown Uma ${characterId}`;
    }
    return data?.name || key;
  }
  private findCharacterDistributionData(distribution: any, key: string, characterId?: string | null): any {
    if (!distribution) {
      return null;
    }
    if (distribution[key]) {
      return distribution[key];
    }
    if (characterId && distribution[characterId]) {
      return distribution[characterId];
    }
    if (!characterId) {
      return null;
    }
    const entry = Object.entries(distribution).find(([entryKey, entryData]: [string, any]) =>
      this.resolveCharacterId(entryKey, entryData) === characterId
    );
    return entry ? entry[1] : null;
  }
  private resolveSupportCardInfo(key: string | number, data?: any): ResolvedSupportCard {
    const rawKey = String(key);
    const rawId = data?.id
      ?? data?.support_card_id
      ?? (/^\d+$/.test(rawKey) ? rawKey : this.statisticsService.getSupportCardIdFromName(data?.name || rawKey));
    const cacheKey = [
      rawKey,
      data?.id ?? '',
      data?.support_card_id ?? '',
      data?.name ?? '',
      data?.type ?? ''
    ].join('|');
    const cached = this.supportCardInfoCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const id = rawId !== undefined && rawId !== null && String(rawId).trim() !== '' ? String(rawId) : null;
    const card = id ? getSupportCardById(id) : undefined;
    const name = data?.name || card?.name || (id ? `Unknown Support ${id}` : rawKey);
    const type = this.normalizeSupportCardType(data?.type ?? card?.type);
    const resolvedCard = {
      id,
      name,
      type,
      imageUrl: id ? this.getSupportCardImageUrl(id) : undefined
    };
    this.supportCardInfoCache.set(cacheKey, resolvedCard);
    return resolvedCard;
  }
  private normalizeSupportCardType(type: any): string | null {
    if (type === undefined || type === null || type === '') {
      return null;
    }
    const numericType = typeof type === 'number' ? type : Number.NaN;
    if (Number.isFinite(numericType)) {
      switch (numericType) {
        case SupportCardType.SPEED: return 'Speed';
        case SupportCardType.STAMINA: return 'Stamina';
        case SupportCardType.POWER: return 'Power';
        case SupportCardType.GUTS: return 'Guts';
        case SupportCardType.WISDOM: return 'Intelligence';
        case SupportCardType.FRIEND: return 'Friend';
      }
    }
    const normalized = String(type).trim().toLowerCase();
    const typeMap: { [key: string]: string } = {
      '0': 'Speed',
      '1': 'Stamina',
      '2': 'Power',
      '3': 'Guts',
      '4': 'Intelligence',
      '6': 'Friend',
      speed: 'Speed',
      stamina: 'Stamina',
      power: 'Power',
      guts: 'Guts',
      intelligence: 'Intelligence',
      wisdom: 'Intelligence',
      wiz: 'Intelligence',
      wit: 'Intelligence',
      friend: 'Friend',
      group: 'Group'
    };
    return typeMap[normalized] || normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  private resolveSkillInfo(key: string | number, data?: any): ResolvedSkill {
    const rawKey = String(key);
    const rawId = data?.id ?? data?.skill_id ?? rawKey;
    const skill = getSkillById(String(rawId))
      || (/^\d+$/.test(String(rawId)) ? getSkillBySkillId(Number(rawId)) : undefined)
      || (/^\d+$/.test(rawKey) ? getSkillBySkillId(Number(rawKey)) : undefined)
      || SKILLS.find(skillEntry => skillEntry.name === data?.name || skillEntry.name === rawKey);
    const name = data?.name || skill?.name || `Unknown Skill ${rawId}`;
    const icon = data?.icon || skill?.icon || null;
    return {
      id: skill?.id || skill?.skill_id || rawId || null,
      name,
      icon,
      imageUrl: icon ? `/assets/images/skills/${icon}` : this.getSkillIconUrl(name)
    };
  }
  private getEntryCount(data: any): number {
    if (typeof data === 'number') {
      return data;
    }
    return data?.total ?? data?.count ?? data?.usage_count ?? data?.total_usage ?? data?.total_count ?? 0;
  }
  private isMetricEntry(key: string, data: any): boolean {
    return key !== 'overall'
      && key !== 'by_team_class'
      && key !== 'by_scenario'
      && !key.startsWith('total_')
      && this.getEntryCount(data) > 0;
  }
  private getGlobalMetricMaps(metric: 'support_cards' | 'skills' | 'support_card_combinations'): any[] {
    const distanceMetricMaps = this.getLoadedActiveDistanceStats()
      .flatMap(distanceData => this.getDistanceMetricMaps(distanceData, metric))
      .filter(metricMap => this.hasNonEmptyMetricData(metricMap));
    if (distanceMetricMaps.length > 0) {
      return distanceMetricMaps;
    }

    const metricData = this.globalStats?.[metric];
    if (!metricData) {
      return [];
    }

    const activeClasses = this.getActiveClassIds();
    const activeScenarios = this.getActiveScenarioIds();
    const allClassCount = Object.keys(this.classFilters).length;
    const allScenarioCount = Object.keys(this.scenarioFilters).length;
    const isAllClassesActive = activeClasses.length === allClassCount;
    const isAllScenariosActive = activeScenarios.length === allScenarioCount;

    if (isAllClassesActive && !isAllScenariosActive && metricData.by_scenario) {
      return activeScenarios
        .map(scenarioId => metricData.by_scenario?.[scenarioId])
        .filter(Boolean);
    }

    if (metricData.by_team_class) {
      return activeClasses
        .flatMap(classId => this.getMetricData(metric, classId))
        .filter(Boolean);
    }

    if (!isAllScenariosActive && metricData.by_scenario) {
      return activeScenarios
        .map(scenarioId => metricData.by_scenario?.[scenarioId])
        .filter(Boolean);
    }

    return metricData.overall ? [metricData.overall] : [];
  }
  private getDistanceMetricMaps(distanceData: any, metric: 'support_cards' | 'skills' | 'support_card_combinations'): any[] {
    if (!distanceData) {
      return [];
    }

    if (distanceData.by_team_class) {
      return this.getActiveClassIds()
        .flatMap(classId => this.getMetricData('', classId, distanceData))
        .map(classData => classData?.[metric])
        .filter(Boolean);
    }

    if (distanceData.overall?.[metric]) {
      return [distanceData.overall[metric]];
    }

    return distanceData[metric] ? [distanceData[metric]] : [];
  }
  private getSupportCardAnalysisMetricMaps(metric: 'support_cards' | 'support_card_combinations'): any[] {
    const distanceMetricMaps = this.getLoadedActiveDistanceStats()
      .flatMap(distanceData => this.getDistanceMetricMaps(distanceData, metric))
      .filter(metricMap => this.hasNonEmptyMetricData(metricMap));

    if (distanceMetricMaps.length > 0) {
      return distanceMetricMaps;
    }

    return this.getGlobalMetricMaps(metric);
  }
  private getGlobalTotalUmasTrained(): number {
    if (!this.globalStats) {
      return 0;
    }

    const distanceTotal = this.getLoadedActiveDistanceStats()
      .reduce((total, distanceData) => total + this.getDistanceTotalUmasTrained(distanceData), 0);
    if (distanceTotal > 0) {
      return distanceTotal;
    }

    const activeClasses = this.getActiveClassIds();
    const activeScenarios = this.getActiveScenarioIds();
    const allClassCount = Object.keys(this.classFilters).length;
    const allScenarioCount = Object.keys(this.scenarioFilters).length;
    const isAllClassesActive = activeClasses.length === allClassCount;
    const isAllScenariosActive = activeScenarios.length === allScenarioCount;

    if (isAllClassesActive && !isAllScenariosActive && this.globalStats.scenario_distribution) {
      const scenarioTotal = activeScenarios.reduce((total, scenarioId) => {
        return total + this.getEntryCount(this.globalStats?.scenario_distribution?.[scenarioId]);
      }, 0);
      if (scenarioTotal > 0) {
        return scenarioTotal;
      }
    }

    const classTotal = activeClasses.reduce((total, classId) => {
      const classData = this.globalStats?.team_class_distribution?.[classId];
      if (typeof classData === 'number') {
        return total + classData;
      }
      return total + (classData?.trained_umas ?? classData?.total_trained_umas ?? this.getEntryCount(classData));
    }, 0);
    if (classTotal > 0) {
      return classTotal;
    }

    if (!this.globalStats.uma_distribution) {
      return 0;
    }

    return Object.entries(this.globalStats.uma_distribution)
      .filter(([key]) => key !== 'by_team_class')
      .reduce((total, [, data]) => total + this.getEntryCount(data), 0);
  }
  private getDistanceTotalUmasTrained(distanceData: any): number {
    if (!distanceData) {
      return 0;
    }

    if (distanceData.by_team_class) {
      const total = this.getActiveClassIds().reduce((sum, classId) => {
        return sum + this.getMetricData('', classId, distanceData).reduce((classSum, classData) => {
          return classSum + (classData?.total_trained_umas ?? classData?.total_entries ?? classData?.trainer_count ?? this.getEntryCount(classData));
        }, 0);
      }, 0);
      if (total > 0) {
        return total;
      }
    }

    const overall = distanceData.overall ?? distanceData;
    return overall?.total_trained_umas
      ?? overall?.total_entries
      ?? overall?.trainer_count
      ?? distanceData.metadata?.total_trained_umas
      ?? distanceData.metadata?.total_entries
      ?? 0;
  }
  private buildSupportCardImageData(cardMaps: any[], totalUmasTrained: number): ChartDataPoint[] {
    const aggregatedCards = new Map<string, { total: number; cardData: any; name: string; type: string | null }>();

    cardMaps.forEach(cardMap => {
      Object.entries(cardMap || {}).forEach(([cardId, cardData]: [string, any]) => {
        if (!this.isMetricEntry(cardId, cardData)) {
          return;
        }

        const resolvedCard = this.resolveSupportCardInfo(cardId, cardData);
        const actualCardId = resolvedCard.id || cardId;
        const sourceData = typeof cardData === 'object' && cardData !== null ? cardData : {};
        const existing = aggregatedCards.get(actualCardId);
        const count = this.getEntryCount(cardData);

        if (existing) {
          existing.total += count;
          existing.cardData = { ...existing.cardData, ...sourceData, type: resolvedCard.type || existing.type };
        } else {
          aggregatedCards.set(actualCardId, {
            total: count,
            cardData: { ...sourceData, id: resolvedCard.id, type: resolvedCard.type },
            name: resolvedCard.name,
            type: resolvedCard.type
          });
        }
      });
    });

    return Array.from(aggregatedCards.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 50)
      .map(([cardId, data]) => {
        const resolvedCard = this.resolveSupportCardInfo(cardId, data.cardData);
        const cardType = data.cardData?.type || data.type || resolvedCard.type;
        return {
          label: data.name || resolvedCard.name,
          value: data.total,
          percentage: totalUmasTrained > 0 ? (data.total / totalUmasTrained) * 100 : 0,
          imageUrl: resolvedCard.imageUrl,
          id: resolvedCard.id || cardId,
          type: cardType,
          color: cardType ? this.colorsService.getStatColor(cardType.toLowerCase()) : undefined
        };
      });
  }
  private buildSkillImageData(skillMaps: any[], totalUmasTrained: number): ChartDataPoint[] {
    const aggregatedSkills = new Map<string, any>();

    skillMaps.forEach(skillMap => {
      Object.entries(skillMap || {}).forEach(([skillId, skillData]: [string, any]) => {
        if (!this.isMetricEntry(skillId, skillData)) {
          return;
        }

        const resolvedSkill = this.resolveSkillInfo(skillId, skillData);
        const skillKey = String(resolvedSkill.id || skillId);
        const count = this.getEntryCount(skillData);
        const sourceData = typeof skillData === 'object' && skillData !== null ? skillData : {};
        const existing = aggregatedSkills.get(skillKey);

        if (existing) {
          existing.total += count;
          existing.count += count;
        } else {
          aggregatedSkills.set(skillKey, {
            ...sourceData,
            id: resolvedSkill.id,
            name: resolvedSkill.name,
            icon: resolvedSkill.icon,
            total: count,
            count
          });
        }
      });
    });

    return Array.from(aggregatedSkills.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 50)
      .map(([skillKey, data]) => {
        const resolvedSkill = this.resolveSkillInfo(skillKey, data);
        return {
          label: resolvedSkill.name,
          value: data.total,
          percentage: totalUmasTrained > 0 ? (data.total / totalUmasTrained) * 100 : 0,
          imageUrl: resolvedSkill.imageUrl,
          id: resolvedSkill.id || skillKey,
          icon: resolvedSkill.icon
        };
      });
  }
  private getSupportCardIdsFromCombination(data: any): string[] {
    const cardIds = data?.support_card_ids ?? data?.card_ids ?? data?.support_cards;
    return Array.isArray(cardIds) ? cardIds.map(cardId => String(cardId)) : [];
  }
  private getSupportCardCombinationExactKey(rawKey: string, data: any): string {
    const cardIds = this.getSupportCardIdsFromCombination(data);
    return cardIds.length ? [...cardIds].sort().join(',') : rawKey;
  }
  private getSupportCardCombinationExactLabel(rawKey: string, data: any): string {
    const cardIds = this.getSupportCardIdsFromCombination(data);
    if (!cardIds.length) {
      return rawKey;
    }

    return cardIds.map(cardId => this.resolveSupportCardInfo(cardId).name).join(' / ');
  }
  private getOrderedSupportCardCompositionEntries(composition?: { [cardType: string]: number }): Array<[string, number]> {
    if (!composition) {
      return [];
    }

    const typeOrder = ['Speed', 'Stamina', 'Power', 'Guts', 'Intelligence', 'Friend', 'Group', 'Other'];
    return Object.entries(composition)
      .filter(([, count]) => Number(count) > 0)
      .sort(([leftType], [rightType]) => {
        const leftIndex = typeOrder.indexOf(leftType);
        const rightIndex = typeOrder.indexOf(rightType);
        const normalizedLeftIndex = leftIndex === -1 ? typeOrder.length : leftIndex;
        const normalizedRightIndex = rightIndex === -1 ? typeOrder.length : rightIndex;
        if (normalizedLeftIndex !== normalizedRightIndex) {
          return normalizedLeftIndex - normalizedRightIndex;
        }
        return leftType.localeCompare(rightType);
      });
  }
  private getSupportCardCombinationKey(rawKey: string, data: any): string {
    const composition = this.getSupportCardCombinationComposition(data);
    if (composition) {
      return this.getOrderedSupportCardCompositionEntries(composition)
        .map(([cardType, count]) => `${cardType}:${count}`)
        .join('|');
    }

    const cardIds = this.getSupportCardIdsFromCombination(data);
    return cardIds.length ? [...cardIds].sort().join(',') : rawKey;
  }
  private getSupportCardCombinationLabel(rawKey: string, data: any): string {
    const composition = this.getSupportCardCombinationComposition(data);
    if (composition) {
      return this.getOrderedSupportCardCompositionEntries(composition)
        .map(([cardType, count]) => `${count}x ${cardType}`)
        .join(' / ');
    }

    return this.getSupportCardCombinationExactLabel(rawKey, data);
  }
  private getSupportCardCombinationComposition(data: any): { [cardType: string]: number } | undefined {
    if (data?.composition && typeof data.composition === 'object') {
      const normalizedComposition = Object.entries(data.composition).reduce((composition, [rawType, rawCount]) => {
        const cardType = this.normalizeSupportCardType(rawType) || String(rawType);
        const count = Number(rawCount) || 0;
        if (count > 0) {
          composition[cardType] = (composition[cardType] || 0) + count;
        }
        return composition;
      }, {} as { [cardType: string]: number });
      return Object.keys(normalizedComposition).length > 0 ? normalizedComposition : undefined;
    }

    const cardIds = this.getSupportCardIdsFromCombination(data);
    if (!cardIds.length) {
      return undefined;
    }
    return cardIds.reduce((composition, cardId) => {
      const type = this.resolveSupportCardInfo(cardId).type || 'Other';
      composition[type] = (composition[type] || 0) + 1;
      return composition;
    }, {} as { [cardType: string]: number });
  }
  private mergeSupportCardCombination(
    combinations: Map<string, { count: number; label: string; exactLabel: string; composition?: { [cardType: string]: number }; exactKeys: Set<string> }>,
    rawKey: string,
    data: any
  ): void {
    const key = this.getSupportCardCombinationKey(rawKey, data);
    const current = combinations.get(key) || {
      count: 0,
      label: this.getSupportCardCombinationLabel(rawKey, data),
      exactLabel: this.getSupportCardCombinationExactLabel(rawKey, data),
      composition: this.getSupportCardCombinationComposition(data),
      exactKeys: new Set<string>()
    };

    current.count += this.getEntryCount(data);
    current.composition = this.getSupportCardCombinationComposition(data) || current.composition;
    current.exactKeys.add(this.getSupportCardCombinationExactKey(rawKey, data));
    combinations.set(key, current);
  }
  private getSupportCardCombinationDisplayLabel(data: { label: string; exactLabel: string; exactKeys: Set<string> }): string {
    if (data.exactKeys.size <= 1 && data.exactLabel) {
      return data.exactLabel;
    }

    if (data.exactKeys.size > 1 && data.label) {
      return `${data.label} (${data.exactKeys.size} decks)`;
    }

    return data.label || data.exactLabel;
  }
  // Add computed properties for chart data
  classStats$ = new BehaviorSubject<{ [key: string]: { count: number; percentage: number } }>({});
  teamClassChartData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  totalTrainers$ = new BehaviorSubject<number>(0);
  supportCardCombinationsData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  statDistributionData$ = new BehaviorSubject<{ [key: string]: any[] }>({});
  statAveragesByClassData$ = new BehaviorSubject<any[]>([]);
  supportCardUsageData$ = new BehaviorSubject<any[]>([]);
  supportCardTypeDistribution$ = new BehaviorSubject<ChartDataPoint[]>([]);
  topSupportCardsWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  skillsUsageData$ = new BehaviorSubject<any[]>([]);
  overallStatComparison$ = new BehaviorSubject<ChartDataPoint[]>([]);
  umaDistributionStackedData$ = new BehaviorSubject<any[]>([]);
  sampleSizeText$ = new BehaviorSubject<string>('');
  // New image-based chart data
  topUmasWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  topSkillsWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Distance-specific observables
  distanceSkillsData$ = new BehaviorSubject<any[]>([]);
  distanceCardTypeDistribution$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceUmaStackedData$ = new BehaviorSubject<any[]>([]);
  distanceStatDistributionData$ = new BehaviorSubject<any[]>([]);
  distanceSupportCardData$ = new BehaviorSubject<any[]>([]);
  distanceSupportCardCombinationsData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceStatHistogramSpeed$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceStatHistogramPower$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceStatHistogramStamina$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceStatHistogramWiz$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceStatHistogramGuts$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Distance-specific image data
  distanceSupportCardsWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceSkillsWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  distanceUmasWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Character-specific observables
  characterDistanceData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterClassData$ = new BehaviorSubject<any[]>([]);
  characterStatHistogramSpeed$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterStatHistogramPower$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterStatHistogramStamina$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterStatHistogramWiz$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterStatHistogramGuts$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterStatComparisonData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterSupportCardCombinationsData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterOverallCardTypeDistribution$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Character distance-specific data observables
  characterDistanceClassData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatHistogramSpeed$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatHistogramPower$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatHistogramStamina$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatHistogramWiz$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatHistogramGuts$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceSupportCardData$ = new BehaviorSubject<any[]>([]);
  characterDistanceSupportCardCombinationsData$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Missing observables for character distance analysis
  characterDistanceStatsByClassData$ = new BehaviorSubject<any[]>([]);
  characterDistanceUmasWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceTopSupportCards$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceSkillsWithImages$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceStatDistributionData$ = new BehaviorSubject<any[]>([]);
  characterDistanceCardTypeDistribution$ = new BehaviorSubject<ChartDataPoint[]>([]);
  characterDistanceDeckCompositions$ = new BehaviorSubject<ChartDataPoint[]>([]);
  // Selected character distance for distance-specific analysis
  selectedCharacterDistance: string | null = null;
  constructor(
    private statisticsService: StatisticsService,
    private meta: Meta,
    private title: Title,
    private colorsService: ColorsService,
    private characterService: CharacterService,
    private cdr: ChangeDetectorRef,
    private bottomSheet: MatBottomSheet
  ) {
    // Initialization moved to ngOnInit
  }
  @HostListener('window:resize', ['$event'])
  onResize() {
    this.checkScreenSize();
    // Recalculate sticky positions if they're active
    if (this.classFilterStickyActive) {
      this.updateClassFilterPosition();
    }
    if (this.headerStickyActive) {
      this.updateCharacterHeaderPosition();
    }
  }
  private updateClassFilterPosition() {
    const sidebarContent = document.querySelector('.sidebar-content') as HTMLElement;
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    if (sidebarContent && sidebar && this.classFilterStickyActive) {
      const sidebarRect = sidebar.getBoundingClientRect();
      sidebarContent.style.left = `${sidebarRect.left}px`;
      sidebarContent.style.width = `${sidebarRect.width}px`;
    }
  }
  private updateCharacterHeaderPosition() {
    const header = document.querySelector('.character-details-header') as HTMLElement;
    const contentArea = document.querySelector('.content-area') as HTMLElement;
    if (header && contentArea && this.headerStickyActive) {
      const contentAreaRect = contentArea.getBoundingClientRect();
      header.style.left = `${contentAreaRect.left}px`;
      header.style.width = `${contentAreaRect.width}px`;
    }
  }
  @HostListener('window:scroll', ['$event'])
  onScroll() {
    // Use requestAnimationFrame for smoother updates
    if (this.scrollThrottleTimer) {
      return;
    }
    this.scrollThrottleTimer = requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      this.handleClassFilterSticky(currentScrollY);
      this.handleCharacterHeaderSticky(currentScrollY);
      this.lastScrollY = currentScrollY;
      this.scrollThrottleTimer = null;
    });
  }
  private handleClassFilterSticky(currentScrollY: number) {
    // Don't make class filter sticky on mobile when sidebar is hidden
    if (this.isMobile) return;
    const sidebarContent = document.querySelector('.sidebar-content') as HTMLElement;
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    if (!sidebarContent || !sidebar) return;
    // Get sidebar's position relative to viewport
    const sidebarRect = sidebar.getBoundingClientRect();
    
    // Make sticky when sidebar top goes above the sticky threshold (80px from top)
    const stickyThreshold = 80;
    const shouldBeSticky = sidebarRect.top < stickyThreshold;
    if (shouldBeSticky !== this.classFilterStickyActive) {
      this.classFilterStickyActive = shouldBeSticky;
      
      if (shouldBeSticky) {
        sidebarContent.classList.add('sticky-mode');
        sidebarContent.style.left = `${sidebarRect.left}px`;
        sidebarContent.style.width = `${sidebarRect.width}px`;
      } else {
        sidebarContent.classList.remove('sticky-mode');
        sidebarContent.style.left = '';
        sidebarContent.style.width = '';
      }
    } else if (shouldBeSticky) {
      // Update position while sticky (in case of horizontal scroll or resize)
      sidebarContent.style.left = `${sidebarRect.left}px`;
      sidebarContent.style.width = `${sidebarRect.width}px`;
    }
  }
  private handleCharacterHeaderSticky(currentScrollY: number) {
    const header = document.querySelector('.character-details-header') as HTMLElement;
    const contentArea = document.querySelector('.content-area') as HTMLElement;
    if (!header || !this.selectedCharacterDetail || !contentArea) return;
    // Get header's original position if not set
    if (this.headerOriginalTop === 0) {
      const rect = header.getBoundingClientRect();
      this.headerOriginalTop = rect.top + currentScrollY;
    }
    // Add a buffer to prevent flickering - same hysteresis logic as class filter
    const buffer = 10; // Small buffer to prevent instant snapping
    // Character header becomes sticky when past original position + buffer
    // and unsticks when scrolling back above original position - buffer
    let shouldBeSticky: boolean;
    if (this.headerStickyActive) {
      // If already sticky, only unstick when we scroll well above the original position
      shouldBeSticky = currentScrollY > (this.headerOriginalTop - buffer);
    } else {
      // If not sticky, become sticky when we scroll past the original position plus buffer
      shouldBeSticky = currentScrollY > (this.headerOriginalTop + buffer);
    }
    if (shouldBeSticky !== this.headerStickyActive) {
      this.headerStickyActive = shouldBeSticky;
      if (shouldBeSticky) {
        // Calculate the content area's position to match it exactly
        const contentAreaRect = contentArea.getBoundingClientRect();
        header.classList.add('sticky-active');
        header.style.left = `${contentAreaRect.left}px`;
        header.style.width = `${contentAreaRect.width}px`;
      } else {
        header.classList.remove('sticky-active');
        header.style.left = '';
        header.style.width = '';
      }
    }
  }
  // Distance selector sticky methods removed
  // Distance selector visibility method removed to prevent performance issues
  // Distance selector is now shown by default in relevant sections
  ngOnInit() {
    // Initialize screen size detection
    this.checkScreenSize();
    this.setupMetaTags();
    // Subscribe to available datasets
    this.statisticsService.getAvailableDatasets()
      .pipe(takeUntil(this.destroy$))
      .subscribe(datasets => {
        this.availableDatasets$.next(datasets);
      });
    // Subscribe to selected dataset changes
    this.statisticsService.getSelectedDataset()
      .pipe(takeUntil(this.destroy$))
      .subscribe(dataset => {
        this.selectedDataset$.next(dataset);
        if (dataset) {
          this.configureDistancesForDataset(dataset);
        }
      });
    // Wait for a dataset to be available before loading statistics
    this.statisticsService.getSelectedDataset()
      .pipe(
        takeUntil(this.destroy$),
        filter(dataset => dataset !== null) // Wait for a dataset to be selected
      )
      .subscribe(() => {
        this.loadGlobalStats();
        this.setupCharacterSearch();
      });
    // Set up reactive updates
    this.setupReactiveUpdates();
  }
  ngAfterViewInit() {
    // Initialize scroll tracking after view is ready
    setTimeout(() => {
      this.initializeScrollTracking();
    }, 100);
  }
  private initializeScrollTracking() {
    // Reset scroll positions for accurate tracking
    this.classFilterOriginalTop = 0;
    this.headerOriginalTop = 0;
    this.lastScrollY = window.scrollY;
  }
  ngOnDestroy() {
    // Clear cache and subscriptions
    this.chartDataCache.clear();
    this.filteredTotalCache = 0;
    // Clear any pending timers
    if (this.characterUpdateTimer) {
      clearTimeout(this.characterUpdateTimer);
      this.characterUpdateTimer = null;
    }
    if (this.distanceUpdateTimer) {
      clearTimeout(this.distanceUpdateTimer);
      this.distanceUpdateTimer = null;
    }
    if (this.chartDataUpdateTimer) {
      clearTimeout(this.chartDataUpdateTimer);
      this.chartDataUpdateTimer = null;
    }
    if (this.scrollThrottleTimer) {
      clearTimeout(this.scrollThrottleTimer);
      this.scrollThrottleTimer = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
  private setupReactiveUpdates() {
    // Only set up reactive updates after global stats are loaded
    if (!this.globalStats || this.reactiveUpdatesInitialized) {
      return;
    }
    this.reactiveUpdatesInitialized = true;
    // Keep the legacy single-distance value in sync for character detail views.
    this.selectedDistance.pipe(
      takeUntil(this.destroy$),
      distinctUntilChanged(),
      filter(distance => distance !== null)
    ).subscribe(distance => {
      if (this.selectedCharacterDetail) {
        this.selectedCharacterDistance = distance;
        this.updateCharacterDistanceData();
      }
    });
  }
  private setupMetaTags() {
    this.title.setTitle('Statistics - Umamusume Support Card Tierlist');
    this.meta.updateTag({
      name: 'description',
      content: 'View comprehensive statistics and analytics for Umamusume training data, including team class distributions, character usage, and support card trends.'
    });
  }
  private checkScreenSize() {
    const width = window.innerWidth;
    this.isMobile = width < 768;
    this.isSmallScreen = width < 1200; // For compact distance selector
    this.isBottomSheetMode = width < 1200; // Bottom sheet mode for filters when screen is smaller
  }
  // Temp debug method - remove this later
  getWindowWidth(): number {
    return window.innerWidth;
  }
  private initializeScenarioFilters() {
    if (this.globalStats?.scenario_distribution) {
      const availableScenarios = Object.keys(this.globalStats.scenario_distribution).sort();
      
      // Reset filters and names
      this.scenarioFilters = {};
      this.scenarioNames = {};
      availableScenarios.forEach(id => {
        // Skip total_entries or any non-numeric ID that shouldn't be a filter
        if (id === 'total_entries' || id === 'total' || id === 'unknown') {
          return;
        }
        // Enable all by default
        this.scenarioFilters[id] = true;
        
        // Set name
        this.scenarioNames[id] = getStatisticsScenarioName(id, this.globalStats.scenario_distribution[id]);
      });
    }
  }
  private loadGlobalStats() {
    this.globalLoading = true;
    this.statisticsService.getGlobalStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (globalData) => {
          this.globalStats = globalData;
          this.rawData = globalData;
          // Initialize scenario filters based on available data
          this.initializeScenarioFilters();
          // Update all chart data once
          this.updateAllChartData();
          // Set up reactive updates now that we have data
          this.setupReactiveUpdates();
          // Load selected distance files so the general charts can merge them in.
          this.loadActiveDistanceStats();
          // Load character stats
          this.loadCharacterStats();
          this.globalLoading = false;
        },
        error: (error) => {
          this.globalLoading = false;
        }
      });
  }
  private loadDistanceStats() {
    this.distanceLoading = true;
    this.loadActiveDistanceStats();
  }
  private loadActiveDistanceStats(): void {
    const activeDistances = this.getActiveDistanceIds();
    const missingDistances = activeDistances.filter(distance => !this.distanceStats[distance]);

    if (missingDistances.length === 0) {
      this.distanceLoading = false;
      this.filteredTotalCache = 0;
      this.invalidateCache('selectedDistance');
      this.updateAllChartData();
      return;
    }

    this.distanceLoading = true;
    forkJoin(missingDistances.map(distance =>
      this.statisticsService.getDistanceStatistics(distance).pipe(
        map(stats => ({ distance, stats })),
        catchError(() => of({ distance, stats: null }))
      )
    ))
      .pipe(takeUntil(this.destroy$))
      .subscribe(results => {
        results.forEach(result => {
          if (result.stats) {
            this.distanceStats[result.distance] = result.stats;
          }
        });
        this.distanceLoading = false;
        this.filteredTotalCache = 0;
        this.invalidateCache('selectedDistance');
        this.updateAllChartData();
      });
  }
  private loadSingleDistanceStats(distance: string) {
    if (this.distanceStats[distance]) {
      // Already loaded, no need to fetch again
      this.distanceLoading = false;
      return;
    }
    this.distanceLoading = true;
    this.statisticsService.getDistanceStatistics(distance).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        return of(null);
      })
    ).subscribe(stats => {
      if (stats) {
        this.distanceStats[distance] = stats;
        // Update distance chart data now that it's loaded
        this.updateDistanceChartData(distance);
      }
      this.distanceLoading = false;
    });
  }
  private loadCharacterStats() {
    this.characterLoading = true;
    // Check if statistics data is loaded
    if (!this.statisticsService.isCharacterDataLoaded()) {
      setTimeout(() => this.loadCharacterStats(), 50);
      return;
    }
    // Use character IDs from the current dataset index instead of uma_distribution
    this.statisticsService.getSelectedDataset().pipe(take(1)).subscribe(dataset => {
      if (!dataset?.index?.character_ids) {
        this.characterLoading = false;
        return;
      }
      // Don't preload any character data - just set up the infrastructure
      // Setup character search since we have the character list
      this.setupCharacterSearch();
      this.characterLoading = false;
    });
  }
  private setupCharacterSearch() {
    // Get character IDs from the dataset index
    this.statisticsService.getSelectedDataset().pipe(take(1)).subscribe(dataset => {
      if (!dataset?.index?.character_ids) {
        return;
      }
      // Get character names from the character service using the IDs
      const characters = dataset.index.character_ids.map((characterId: string) => {
        // Get proper character name from character service
        const characterName = this.getCharacterNameById(characterId);
        return {
          id: characterId,
          name: characterName || `Character ${characterId}`, // Fallback if name not found
          displayName: characterName || `Character ${characterId}`,
          characterId: characterId
        };
      });
      // Check for duplicate names and add ID suffixes
      const nameCount = new Map<string, number>();
      const nameToIds = new Map<string, string[]>();
      characters.forEach(char => {
        const count = nameCount.get(char.name) || 0;
        nameCount.set(char.name, count + 1);
        const ids = nameToIds.get(char.name) || [];
        ids.push(char.id);
        nameToIds.set(char.name, ids);
      });
      // Update display names for duplicates
      characters.forEach(char => {
        if (nameCount.get(char.name)! > 1) {
          char.displayName = `${char.name} (${char.characterId})`;
        }
      });
      // Sort by display name
      const sortedCharacters = characters
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
      this.filteredCharacters$.next(sortedCharacters.map(char => ({
        id: char.id,
        name: char.displayName
      })));
      // Setup search filtering
      this.characterSearchControl.valueChanges
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
          startWith(''),
          takeUntil(this.destroy$)
        )
        .subscribe(searchTerm => {
          const filtered = sortedCharacters
            .filter(char =>
              char.displayName.toLowerCase().includes((searchTerm || '').toLowerCase()) ||
              char.characterId.includes((searchTerm || ''))
            )
            .map(char => ({
              id: char.id,
              name: char.displayName
            }));
          this.filteredCharacters$.next(filtered);
        });
    });
  }
  // Helper method to get character name by ID from character service
  private getCharacterNameById(characterId: string): string | null {
    // Get character from the character service synchronously
    // Since characters are loaded immediately in the constructor, we can access them directly
    let characterName: string | null = null;
    this.characterService.getCharacterById(characterId).pipe(take(1)).subscribe(character => {
      characterName = character?.name || null;
    });
    return characterName;
  }
  // Filter methods
  onClassFiltersChanged(filters: ClassFilterState): void {
    const startTime = performance.now();
    // Create a cache key from the filters
    const activeClasses = Object.keys(filters).filter(key => filters[key as keyof ClassFilterState]).sort();
    const cacheKey = activeClasses.join(',');
    // Check if we already processed this combination
    if (cacheKey === this.lastActiveClasses) {
      return;
    }
    this.lastActiveClasses = cacheKey;
    this.classFilters = { ...filters };
    // Clear filtered total cache
    this.filteredTotalCache = 0;
    // Clear cache that depends on class filters
    this.invalidateCache('classFilters');
    // Use requestAnimationFrame for smooth UI updates
    requestAnimationFrame(() => {
      this.updateAllChartData();
      // Also update distance-specific charts if a distance is selected
      const currentDistance = this.selectedDistance.value;
      if (currentDistance && this.distanceStats[currentDistance]) {
        this.updateDistanceChartData(currentDistance);
      }
      // Update character overall distance preference and recalculate default distance if a character is selected
      // This will also trigger updateCharacterDistanceData() through setCharacterDefaultDistance -> selectCharacterDistance
      if (this.selectedCharacterDetail) {
        // Use debounced update for character distance recalculation
        this.debouncedCharacterUpdate(this.selectedCharacterDetail);
        // Also update all character-specific charts with new class filter data
        this.updateAllCharacterCharts();
      }
    });
    const filterTime = performance.now() - startTime;
  }
  // Scenario filter methods
  onScenarioFilterChanged(scenarioId: string): void {
    this.scenarioFilters[scenarioId] = !this.scenarioFilters[scenarioId];
    
    // Clear cache that depends on scenario filters
    this.invalidateCache('scenarioFilters');
    
    // Update all charts with new scenario filter
    requestAnimationFrame(() => {
      this.updateAllChartData();
      // Also update distance-specific charts if a distance is selected
      const currentDistance = this.selectedDistance.value;
      if (currentDistance && this.distanceStats[currentDistance]) {
        this.updateDistanceChartData(currentDistance);
      }
      // Update character charts if a character is selected
      if (this.selectedCharacterDetail) {
        this.debouncedCharacterUpdate(this.selectedCharacterDetail);
        this.updateAllCharacterCharts();
      }
    });
  }
  
  toggleAllScenarios(): void {
    const allEnabled = Object.values(this.scenarioFilters).every(v => v);
    const newValue = !allEnabled;
    
    Object.keys(this.scenarioFilters).forEach(key => {
      this.scenarioFilters[key] = newValue;
    });
    
    this.onScenarioFilterChanged(''); // Trigger update
  }
  areAllScenariosSelected(): boolean {
    return Object.values(this.scenarioFilters).length > 0 && Object.values(this.scenarioFilters).every(v => v);
  }
  isScenarioIndeterminate(): boolean {
    const values = Object.values(this.scenarioFilters);
    if (values.length === 0) return false;
    const someSelected = values.some(v => v);
    const allSelected = values.every(v => v);
    return someSelected && !allSelected;
  }
  
  getActiveScenarios(): string[] {
    return Object.keys(this.scenarioFilters).filter(key => this.scenarioFilters[key]);
  }
  // Distance event handler from class-filter component
  onDistanceChanged(event: DistanceChangeEvent): void {
    if (event.allSelected !== undefined) {
      this.setAllDistanceFilters(event.allSelected);
      return;
    }
    if (event.distance) {
      this.onDistanceSelect(event.distance, event.selected);
    }
  }
  // Distance methods
  onDistanceSelect(distance: string, selected?: boolean) {
    this.distanceFilters = {
      ...this.distanceFilters,
      [distance]: selected ?? !this.distanceFilters[distance]
    };
    this.syncPrimarySelectedDistance();
    this.filteredTotalCache = 0;
    this.invalidateCache('selectedDistance');
    this.loadActiveDistanceStats();
    if (this.selectedCharacterDetail) {
      this.updateAllCharacterCharts();
    }
  }
  private setAllDistanceFilters(selected: boolean): void {
    this.distanceFilters = this.availableDistances.reduce((filters, distance) => {
      filters[distance] = selected;
      return filters;
    }, {} as { [key: string]: boolean });
    this.syncPrimarySelectedDistance();
    this.filteredTotalCache = 0;
    this.invalidateCache('selectedDistance');
    this.loadActiveDistanceStats();
    if (this.selectedCharacterDetail) {
      this.updateAllCharacterCharts();
    }
  }
  // Dataset selection method
  onDatasetChange(datasetId: string): void {
    const datasets = this.availableDatasets$.value;
    const selectedDataset = datasets.find(d => d.id === datasetId);
    
    if (selectedDataset) {
      // Clear all cached data
      this.globalStats = null;
      this.distanceStats = {};
      this.characterStats = {};
      this.invalidateCache('all');
      
      // Reset character selection
      this.selectedCharacterDetail = null;
      this.selectedCharacterDistance = null;
      
      // Update the service's selected dataset. The selected dataset subscription reloads statistics.
      this.statisticsService.selectDataset(selectedDataset);
    }
  }
  // Character methods
  onCharacterSelect(characterId: string) {
    this.selectedCharacterDetail = characterId;
    // Find the character from the filtered characters list
    const currentCharacters = this.filteredCharacters$.value;
    const selectedCharacter = currentCharacters.find(char => char.id === characterId);
    if (!selectedCharacter) {
      return;
    }
    // Extract the character name (removing ID suffix if present)
    const displayName = selectedCharacter.name;
    const characterName = displayName.includes(' (')
      ? displayName.substring(0, displayName.lastIndexOf(' ('))
      : displayName;
    // Invalidate character-specific cache
    this.invalidateCache('selectedCharacter');
    // Store pending update
    this.pendingCharacterUpdates.characterId = characterId;
    // Load character statistics using the character ID (not name)
    if (!this.characterStats[characterId]) {
      this.loadSingleCharacterStats(characterId);
    } else {
      // Use debounced update instead of direct call
      this.debouncedCharacterUpdate(characterId);
    }
    // Reset scroll tracking when selecting a new character
    this.resetHeaderScrollTracking();
  }
  private resetHeaderScrollTracking() {
    this.headerOriginalTop = 0;
    this.headerStickyActive = false;
    this.classFilterOriginalTop = 0;
    this.classFilterStickyActive = false;
    this.lastScrollY = window.scrollY;
    // Remove sticky class from header and reset positioning
    const header = document.querySelector('.character-details-header') as HTMLElement;
    if (header) {
      header.classList.remove('sticky-active');
      header.style.left = '';
      header.style.width = '';
    }
    // Reset class filter positioning
    const classFilter = document.querySelector('app-class-filter') as HTMLElement;
    if (classFilter) {
      classFilter.classList.remove('sticky-mode');
      classFilter.style.left = '';
      classFilter.style.width = '';
    }
  }
  // New debounced update method to prevent stuttering
  private debouncedCharacterUpdate(characterId: string): void {
    // Clear any pending timer
    if (this.characterUpdateTimer) {
      clearTimeout(this.characterUpdateTimer);
    }
    // Set a new timer to batch updates
    this.characterUpdateTimer = setTimeout(() => {
      // Update character overall data first (distance preferences and card type distribution)
      this.updateCharacterOverallData();
      // Update all character charts with current class filters
      this.updateAllCharacterCharts();
      // Set character default distance (this will trigger global distance chart updates)
      this.setCharacterDefaultDistance(characterId);
      // Clear pending updates
      this.pendingCharacterUpdates.characterId = null;
      this.pendingCharacterUpdates.distance = null;
      this.characterUpdateTimer = null;
    }, 50); // 50ms debounce
  }
  // Debounced distance update to prevent duplicate calls
  private debouncedDistanceUpdate(distance: string): void {
    // Clear any existing distance update timer
    if (this.distanceUpdateTimer) {
      clearTimeout(this.distanceUpdateTimer);
    }
    // Set a new timer for distance updates
    this.distanceUpdateTimer = setTimeout(() => {
      this.selectCharacterDistance(distance);
      this.distanceUpdateTimer = null;
    }, 30); // Shorter delay for distance updates
  }
  // New method to load single character stats
  private loadSingleCharacterStats(characterId: string) {
    // Use the character ID to load statistics directly
    this.statisticsService.getCharacterStatistics(characterId).pipe(
      takeUntil(this.destroy$),
      catchError(error => {
        console.error(`❌ Failed to load character statistics for ID ${characterId}:`, error);
        return of(null);
      })
    ).subscribe((stats: any) => {
      if (stats) {
        this.characterStats[characterId] = stats;
        // Use debounced update instead of direct call
        this.debouncedCharacterUpdate(characterId);
      } else {
        console.error(`❌ No statistics data received for character ID: ${characterId}`);
      }
    });
  }
  // Character helper methods
  selectCharacter(characterId: string) {
    this.onCharacterSelect(characterId);
  }
  backToCharacterSelection() {
    this.selectedCharacterDetail = null;
    this.selectedCharacterDistance = null;
    this.invalidateCache('selectedCharacter');
    // Clear character distance preference data and card type distribution
    this.updateCharacterOverallData();
    // Reset scroll tracking
    this.resetHeaderScrollTracking();
  }
  hasCharacterStats(): boolean {
    return this.selectedCharacterDetail !== null &&
      this.characterStats[this.selectedCharacterDetail] !== undefined;
  }
  shouldShowDistanceSelector(): boolean {
    return this.selectedCharacterDetail !== null;
  }
  getSelectedCharacterName(): string | null {
    if (!this.selectedCharacterDetail) return null;
    const currentCharacters = this.filteredCharacters$.value;
    const selectedCharacter = currentCharacters.find(char => char.id === this.selectedCharacterDetail);
    if (selectedCharacter) {
      // Extract just the name part (without ID suffix)
      const displayName = selectedCharacter.name;
      return displayName.includes(' (')
        ? displayName.substring(0, displayName.lastIndexOf(' ('))
        : displayName;
    }
    return this.selectedCharacterDetail;
  }
  // Character distance selection
  selectCharacterDistance(distance: string): void {
    // Prevent duplicate updates if the distance is already selected
    if (this.selectedCharacterDistance === distance) {
      return;
    }
    // Store the pending distance update
    this.pendingCharacterUpdates.distance = distance;
    // Clear any pending timer to prevent duplicate updates
    if (this.characterUpdateTimer) {
      clearTimeout(this.characterUpdateTimer);
    }
    // Use requestAnimationFrame for smooth update
    requestAnimationFrame(() => {
      this.selectedCharacterDistance = distance;
      // Batch both updates together
      this.updateCharacterDistanceData();
      this.updateCharacterOverallData();
      // Clear pending updates
      this.pendingCharacterUpdates.distance = null;
    });
  }
  // Character default distance setter
  setCharacterDefaultDistance(characterId: string): void {
    if (!this.characterStats[characterId]?.by_distance) return;
    const characterData = this.characterStats[characterId];
    const activeClasses = this.getActiveClassIds();
    let mostPopularDistance = '';
    let maxCount = 0;
    // Calculate aggregated counts for each distance based on active class filters
    this.getFilteredCharacterDistanceEntries(characterData).forEach(([distance, distanceInfo]: [string, any]) => {
      let totalCount = 0;
      if (distanceInfo.by_team_class) {
        // Sum counts from all active team classes for this distance
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceInfo);
          dataList.forEach(classData => {
            const count = classData.total || classData.count || classData.total_trained_umas || 0;
            totalCount += count;
          });
        });
      } else {
        // Fallback to direct count if no by_team_class structure
        totalCount = distanceInfo.total || distanceInfo.count || 0;
      }
      if (totalCount > maxCount) {
        maxCount = totalCount;
        mostPopularDistance = distance;
      }
    });
    if (mostPopularDistance) {
      const normalizedDistance = this.getDistanceOptionForCurrentDataset(mostPopularDistance);
      const availableMatch = this.availableDistances.find(availableDistance => availableDistance === normalizedDistance);
      const distanceToSelect = availableMatch || normalizedDistance;
      // Update both the main selectedDistance and the character distance to keep them in sync
      this.selectedDistance.next(distanceToSelect);
      // Use debounced distance update to prevent duplicate calls
      this.debouncedDistanceUpdate(distanceToSelect);
    } else {
      this.selectedCharacterDistance = null;
      this.updateCharacterDistanceData();
      // Update character overall distance preference data even if no popular distance found
      this.updateCharacterOverallData();
    }
  }
  // Calculate character distance preference data
  private updateCharacterOverallData(): void {
    if (!this.selectedCharacterDetail) {
      this.characterDistanceData$.next([]);
      // Also clear card type distribution data
      this.updateCharacterOverallCardTypeDistribution();
      return;
    }
    const characterData = this.characterStats[this.selectedCharacterDetail];
    if (!characterData?.by_distance) {
      this.characterDistanceData$.next([]);
      return;
    }
    // Get active class IDs to merge data from selected team classes
    const activeClasses = this.getActiveClassIds();
    // Calculate distance preference data by merging active team classes
    const distanceData: ChartDataPoint[] = [];
    this.getFilteredCharacterDistanceEntries(characterData).forEach(([distance, distanceInfo]: [string, any]) => {
      // Sum counts from all active team classes for this distance
      let totalCount = 0;
      if (distanceInfo.by_team_class) {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceInfo);
          dataList.forEach(classData => {
            const count = classData.total || classData.count || classData.total_trained_umas || 0;
            totalCount += count;
          });
        });
      } else {
        // Fallback to direct count if no by_team_class structure
        totalCount = distanceInfo.total || distanceInfo.count || 0;
      }
      if (totalCount > 0) {
        const normalizedDistance = this.getDistanceOptionForCurrentDataset(distance);
        const distanceLabel = this.getDistanceLabel(normalizedDistance);
        const distanceColor = this.getDistanceColor(normalizedDistance);
        distanceData.push({
          label: distanceLabel,
          value: totalCount,
          color: distanceColor
        });
      }
    });
    // Sort by usage count (descending)
    distanceData.sort((a, b) => b.value - a.value);
    this.characterDistanceData$.next(distanceData);
    // Also update character overall support card type distribution
    this.updateCharacterOverallCardTypeDistribution();
  }
  // Calculate character overall support card type distribution
  private updateCharacterOverallCardTypeDistribution(): void {
    if (!this.selectedCharacterDetail) {
      this.characterOverallCardTypeDistribution$.next([]);
      return;
    }
    const characterData = this.characterStats[this.selectedCharacterDetail];
    if (!characterData?.by_distance) {
      this.characterOverallCardTypeDistribution$.next([]);
      return;
    }
    // Get active class IDs to merge data from selected team classes
    const activeClasses = this.getActiveClassIds();
    const cardTypes = new Map<string, number>();
    // Aggregate card type data across all distances and active team classes
    this.getFilteredCharacterDistanceEntries(characterData).forEach(([, distanceData]: [string, any]) => {
      if (distanceData.by_team_class) {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          dataList.forEach(classData => {
            if (classData?.common_support_cards) {
              Object.entries(classData.common_support_cards).forEach(([cardId, data]: [string, any]) => {
                const cardType = this.resolveSupportCardInfo(cardId, data).type || 'Other';
                const current = cardTypes.get(cardType) || 0;
                const count = this.getEntryCount(data);
                cardTypes.set(cardType, current + count);
            });
          }
        });
        });
      }
    });
    const cardTypeData = Array.from(cardTypes.entries())
      .map(([type, count]) => ({
        label: type,
        value: count,
        color: this.getCardTypeColor(type)
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
    this.characterOverallCardTypeDistribution$.next(cardTypeData);
  }
  private updateCharacterOverallChartData(): void {
    if (!this.selectedCharacterDetail || !this.characterStats[this.selectedCharacterDetail]) {
      this.characterClassData$.next([]);
      this.characterStatHistogramSpeed$.next([]);
      this.characterStatHistogramStamina$.next([]);
      this.characterStatHistogramPower$.next([]);
      this.characterStatHistogramGuts$.next([]);
      this.characterStatHistogramWiz$.next([]);
      this.characterStatComparisonData$.next([]);
      this.characterSupportCardCombinationsData$.next([]);
      return;
    }

    const characterId = this.selectedCharacterDetail;
    this.characterClassData$.next(this.computeCharacterClassStackedData(characterId));
    this.characterStatHistogramSpeed$.next(this.computeCharacterStatHistogramData(characterId, 'speed'));
    this.characterStatHistogramStamina$.next(this.computeCharacterStatHistogramData(characterId, 'stamina'));
    this.characterStatHistogramPower$.next(this.computeCharacterStatHistogramData(characterId, 'power'));
    this.characterStatHistogramGuts$.next(this.computeCharacterStatHistogramData(characterId, 'guts'));
    this.characterStatHistogramWiz$.next(this.computeCharacterStatHistogramData(characterId, 'wiz'));
    this.characterStatComparisonData$.next(this.computeCharacterStatComparisonData(characterId));
    this.characterSupportCardCombinationsData$.next(this.computeCharacterSupportCardCombinations(characterId));
  }
  // Update all character charts when class filters change
  private updateAllCharacterCharts(): void {
    this.invalidateCache('selectedCharacter');
    this.updateCharacterOverallChartData();
    if (!this.selectedCharacterDetail) {
      this.cdr.markForCheck();
      return;
    }
    // Update character overall data (distance preferences)
    this.updateCharacterOverallData();
    // Update character overall card type distribution
    this.updateCharacterOverallCardTypeDistribution();
    // Update character distance data if a distance is selected
    if (this.selectedCharacterDistance) {
      this.updateCharacterDistanceData();
    }
    // Trigger change detection to update template methods
    this.cdr.markForCheck();
  }
  // Character data update methods
  private updateCharacterDistanceData(): void {
    if (!this.selectedCharacterDetail || !this.selectedCharacterDistance) {
      // Clear all distance-specific data
      this.characterDistanceClassData$.next([]);
      this.characterDistanceStatHistogramSpeed$.next([]);
      this.characterDistanceStatHistogramPower$.next([]);
      this.characterDistanceStatHistogramStamina$.next([]);
      this.characterDistanceStatHistogramWiz$.next([]);
      this.characterDistanceStatHistogramGuts$.next([]);
      this.characterDistanceSupportCardData$.next([]);
      this.characterDistanceSupportCardCombinationsData$.next([]);
      // Clear missing observables
      this.characterDistanceStatsByClassData$.next([]);
      this.characterDistanceUmasWithImages$.next([]);
      this.characterDistanceTopSupportCards$.next([]);
      this.characterDistanceSkillsWithImages$.next([]);
      this.characterDistanceStatDistributionData$.next([]);
      this.characterDistanceCardTypeDistribution$.next([]);
      this.characterDistanceDeckCompositions$.next([]);
      return;
    }
    // Use character ID instead of name
    const characterId = this.selectedCharacterDetail;
    if (!this.characterStats[characterId]) {
      // Try to load the character on demand
      this.loadSingleCharacterStats(characterId);
      return;
    }
    const characterData = this.characterStats[characterId];
    // Find the correct distance key (case-insensitive)
    let actualDistanceKey = this.selectedCharacterDistance;
    if (!characterData.by_distance || !characterData.by_distance[this.selectedCharacterDistance]) {
      // Try to find a case-insensitive match
      const availableDistances = characterData.by_distance ? Object.keys(characterData.by_distance) : [];
      const selectedDistanceLower = this.selectedCharacterDistance?.toLowerCase();
      const foundDistance = availableDistances.find(dist =>
        dist.toLowerCase() === selectedDistanceLower
      );
      if (!foundDistance) {
        return;
      } else {
        actualDistanceKey = foundDistance;
      }
    }
    const distanceData = characterData.by_distance[actualDistanceKey];
    // Update stat histograms for this character at this distance
    this.updateCharacterDistanceStatHistograms(distanceData);
    // Update support card data for this character at this distance
    this.updateCharacterDistanceSupportCardData(distanceData);
    // Update team class data for this character at this distance
    if (distanceData.by_team_class) {
      this.updateCharacterDistanceClassData(distanceData);
    }
    // Update the missing observables for character distance analysis
    this.updateCharacterDistanceMissingObservables(distanceData);
  }
  private updateCharacterDistanceStatHistograms(distanceData: any): void {
    // Get active class IDs to merge data from all selected team classes
    const activeClasses = this.getActiveClassIds();
    const stats = ['speed', 'power', 'stamina', 'wiz', 'guts'];
    stats.forEach(stat => {
      // Merge histogram data from all active team classes
      const aggregatedHistogram = new Map<string, number>();
      let totalCount = 0;
      let classesProcessed = 0;
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          const statData = classData?.stat_averages?.[stat];
          if (statData?.histogram) {
            classesProcessed++;
            Object.entries(statData.histogram).forEach(([bucket, count]: [string, any]) => {
              const currentCount = aggregatedHistogram.get(bucket) || 0;
              const newCount = currentCount + (typeof count === 'number' ? count : count.count || 0);
              aggregatedHistogram.set(bucket, newCount);
              totalCount += (typeof count === 'number' ? count : count.count || 0);
            });
          }
        });
      });
      let chartData: ChartDataPoint[] = [];
      if (aggregatedHistogram.size > 0 && totalCount > 0) {
        // Convert aggregated data to simple ChartDataPoint format
        chartData = Array.from(aggregatedHistogram.entries())
          .map(([bucket, count]) => ({
            label: this.formatStatBucketLabel(bucket),
            value: count, // Use raw count instead of percentage
            color: this.colorsService.getStatColor(stat)
          }))
          .sort((a, b) => this.extractBucketValue(a.label) - this.extractBucketValue(b.label));
      }
      // Update the appropriate observable
      switch (stat) {
        case 'speed':
          this.characterDistanceStatHistogramSpeed$.next(chartData);
          break;
        case 'power':
          this.characterDistanceStatHistogramPower$.next(chartData);
          break;
        case 'stamina':
          this.characterDistanceStatHistogramStamina$.next(chartData);
          break;
        case 'wiz':
          this.characterDistanceStatHistogramWiz$.next(chartData);
          break;
        case 'guts':
          this.characterDistanceStatHistogramGuts$.next(chartData);
          break;
      }
    });
  }
  private updateCharacterDistanceSupportCardData(distanceData: any): void {
    // Get active class IDs to merge data from all selected team classes
    const activeClasses = this.getActiveClassIds();
    // Merge support card data from all active team classes with full metadata - BY ID
    const mergedSupportCards = new Map<string, any>();
    let totalEntries = 0;
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.common_support_cards) {
          totalEntries += classData.total_entries || 0;
          Object.entries(classData.common_support_cards).forEach(([cardId, data]: [string, any]) => {
            const count = this.getEntryCount(data);
            const resolvedCard = this.resolveSupportCardInfo(cardId, data);
            const cardKey = resolvedCard.id || cardId.toString();
            const existing = mergedSupportCards.get(cardKey);
            if (existing) {
              mergedSupportCards.set(cardKey, {
                ...existing,
                count: existing.count + count
              });
            } else {
              mergedSupportCards.set(cardKey, {
                count: count,
                id: resolvedCard.id,
                name: resolvedCard.name,
                type: resolvedCard.type,
                avg_level: data.avg_level || 0,
                by_level: data.by_level || {}
              });
            }
          });
        }
      });
    });
    if (mergedSupportCards.size === 0) {
      this.characterDistanceSupportCardData$.next([]);
      return;
    }
    const supportCardData = Array.from(mergedSupportCards.entries())
      .map(([cardKey, data]) => ({
        label: data.name || this.resolveSupportCardInfo(cardKey).name,
        value: data.count,
        percentage: totalEntries ? (data.count / totalEntries) * 100 : 0,
        id: data.id || cardKey,
        type: data.type,
        imageUrl: data.id ? this.getSupportCardImageUrl(data.id) : this.resolveSupportCardInfo(cardKey).imageUrl,
        color: data.type ? this.colorsService.getStatColor(data.type.toLowerCase()) : '#666666'
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 50);
    this.characterDistanceSupportCardData$.next(supportCardData);
  }
  private updateCharacterDistanceClassData(distanceData: any): void {
    const activeClasses = this.getActiveClassIds();
    // Create team class distribution chart data (usage counts per class) - ONLY for active classes
    const chartData = activeClasses
      .map(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        let count = 0;
        dataList.forEach(data => {
          if (typeof data === 'number') {
            count += data;
          } else if (data) {
            count += (data.total_trained_umas || data.count || data.total_entries || 0);
          }
        });
        return {
          label: `Class ${classId}`,
          value: count,
          color: this.colorsService.getClassColor(classId)
        };
      })
      .sort((a, b) => parseInt(a.label.split(' ')[1]) - parseInt(b.label.split(' ')[1]))
      .filter(item => item.value > 0); // Only include classes with data
    // Calculate total for center text
    const totalTrainers = chartData.reduce((sum, item) => sum + item.value, 0);
    // Add center text to the chart data format expected by the chart component
    const chartDataWithCenter: any[] = chartData.map(item => ({
      ...item,
      centerText: this.formatTotalTrainers(totalTrainers)
    }));
    this.characterDistanceClassData$.next(chartDataWithCenter);
    // Create stats by class data for the right-side chart - now handled in updateCharacterDistanceMissingObservables
  }
  private updateCharacterDistanceMissingObservables(distanceData: any): void {
    // Get active class IDs to merge data from all selected team classes
    const activeClasses = this.getActiveClassIds();
    // Update stats by class data - format to match global statistics
    if (distanceData.by_team_class) {
      const stats = [
        { key: 'speed', name: 'Speed' },
        { key: 'stamina', name: 'Stamina' },
        { key: 'power', name: 'Power' },
        { key: 'guts', name: 'Guts' },
        { key: 'wiz', name: 'Wit' }
      ];
      // OPTION 1: Each STAT as a series (same as global) - this is what the image shows
      const statsByClassData = stats.map(stat => {
        const data = activeClasses.map(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          
          let weightedSum = 0;
          let totalCount = 0;
          
          dataList.forEach(classData => {
            // Try multiple possible locations for stat data
            let statValue = 0;
            // Check if stat_averages exists and has our stat
            if (classData?.stat_averages?.[stat.key]) {
              const statData = classData.stat_averages[stat.key];
              statValue = Math.round(statData.average || statData.mean || statData.value || 0);
            }
            // Check if there's a direct stat field
            else if (classData?.[stat.key + '_average'] !== undefined) {
              statValue = Math.round(classData[stat.key + '_average']);
            }
            // Check if there's stat data in a stats object
            else if (classData?.stats?.[stat.key]) {
              const statData = classData.stats[stat.key];
              statValue = Math.round(statData.average || statData.mean || statData.value || statData || 0);
            }
            // Check if there's average stats
            else if (classData?.average_stats?.[stat.key]) {
              statValue = Math.round(classData.average_stats[stat.key]);
            }
            // If no specific stat data, try to compute from histogram if available
            else if (classData?.stat_histograms?.[stat.key] || classData?.histograms?.[stat.key]) {
              const histogram = classData.stat_histograms?.[stat.key] || classData.histograms?.[stat.key];
              if (histogram) {
                let totalValue = 0;
                let histCount = 0;
                Object.entries(histogram).forEach(([bucket, count]: [string, any]) => {
                  const bucketValue = parseInt(bucket.split('-')[0]);
                  const bucketCount = typeof count === 'number' ? count : count.count || 0;
                  totalValue += bucketValue * bucketCount;
                  histCount += bucketCount;
                });
                statValue = histCount > 0 ? Math.round(totalValue / histCount) : 0;
              }
            }
            
            if (statValue > 0) {
              const count = classData?.total_entries || classData?.count || 1;
              weightedSum += statValue * count;
              totalCount += count;
            }
          });
          
          const finalStatValue = totalCount > 0 ? Math.round(weightedSum / totalCount) : 0;
          return {
            x: `Class ${classId}`,
            y: finalStatValue
          };
        });
        return {
          name: stat.name,
          data,
          backgroundColor: this.colorsService.getStatColor(stat.key) + 'CC',
          borderColor: this.colorsService.getStatColor(stat.key),
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false
        };
      }).filter(statData => statData.data.some((point: any) => point.y > 0));
      this.characterDistanceStatsByClassData$.next(statsByClassData);
    } else {
      this.characterDistanceStatsByClassData$.next([]);
    }
    // Merge uma distribution data from all active team classes
    const mergedUmaDistribution = new Map<string, { count: number; name: string; characterId: string | null; character_color?: string }>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.uma_distribution) {
          Object.entries(classData.uma_distribution).forEach(([name, data]: [string, any]) => {
            const count = this.getEntryCount(data);
            const characterId = this.resolveCharacterId(name, data);
            const characterName = this.resolveCharacterName(name, data);
            const key = characterId || name;
            const existing = mergedUmaDistribution.get(key) || { count: 0, name: characterName, characterId, character_color: data?.character_color };
            mergedUmaDistribution.set(key, {
              count: existing.count + count,
              name: existing.name,
              characterId: characterId || existing.characterId,
              character_color: data?.character_color || existing.character_color
            });
          });
        }
      });
    });
    if (mergedUmaDistribution.size > 0) {
      const umasWithImages = Array.from(mergedUmaDistribution.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([key, data]) => ({
          label: data.name,
          value: data.count,
          imageUrl: this.getCharacterImageUrl(data.characterId || key),
          id: data.characterId || key,
          character_color: data.character_color
        }));
      this.characterDistanceUmasWithImages$.next(umasWithImages);
    } else {
      this.characterDistanceUmasWithImages$.next([]);
    }
    // Merge support cards data from all active team classes - BY ID
    const mergedSupportCards = new Map<string, any>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.common_support_cards) {
          Object.entries(classData.common_support_cards).forEach(([cardId, data]: [string, any]) => {
            const count = this.getEntryCount(data);
            const resolvedCard = this.resolveSupportCardInfo(cardId, data);
            const cardKey = resolvedCard.id || cardId.toString();
            const existing = mergedSupportCards.get(cardKey);
            if (existing) {
              mergedSupportCards.set(cardKey, {
                ...existing,
                count: existing.count + count
              });
            } else {
              mergedSupportCards.set(cardKey, {
                count: count,
                id: resolvedCard.id,
                name: resolvedCard.name,
                type: resolvedCard.type,
                avg_level: data.avg_level || 0,
                by_level: data.by_level || {}
              });
            }
          });
        }
      });
    });
    if (mergedSupportCards.size > 0) {
      // Calculate total trained Uma Musume for this character/distance combination
      let totalTrainedUmas = 0;
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        dataList.forEach(classData => {
          if (classData) {
            totalTrainedUmas += classData.uma_count || classData.total_entries || classData.count || 0;
          }
        });
      });
      const topSupportCards = Array.from(mergedSupportCards.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50)
        .map(([cardKey, data]) => {
          const resolvedCard = this.resolveSupportCardInfo(cardKey, data);
          const cardId = data.id || resolvedCard.id;
          const cardName = data.name || resolvedCard.name;
          const imageUrl = cardId ? this.getSupportCardImageUrl(cardId) : resolvedCard.imageUrl;
          const percentage = totalTrainedUmas > 0 ? (data.count / totalTrainedUmas) * 100 : 0;
          const cardType = data.type || resolvedCard.type;
          const color = cardType ? this.colorsService.getStatColor(cardType.toLowerCase()) : '#666666';
          return {
            label: cardName,
            value: data.count,
            percentage: percentage,
            imageUrl: imageUrl,
            id: cardId || cardKey,
            type: cardType,
            color: color
          };
        });
      this.characterDistanceTopSupportCards$.next(topSupportCards);
    } else {
      this.characterDistanceTopSupportCards$.next([]);
    }
    // Merge skills data from all active team classes
    const mergedSkills = new Map<string, any>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.common_skills) {
          Object.entries(classData.common_skills).forEach(([skillId, data]: [string, any]) => {
            const count = this.getEntryCount(data);
            const resolvedSkill = this.resolveSkillInfo(skillId, data);
            const skillKey = skillId.toString();
            const existing = mergedSkills.get(skillKey);
            if (existing) {
              mergedSkills.set(skillKey, {
                ...existing,
                count: existing.count + count
              });
            } else {
              mergedSkills.set(skillKey, {
                count: count,
                id: resolvedSkill.id || skillId,
                name: resolvedSkill.name,
                icon: resolvedSkill.icon,
                avg_level: data.avg_level || 0,
                by_level: data.by_level || {}
              });
            }
          });
        }
      });
    });
    if (mergedSkills.size > 0) {
      // Calculate total trained Uma Musume for this character/distance combination
      let totalTrainedUmas = 0;
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        dataList.forEach(classData => {
          if (classData) {
            totalTrainedUmas += classData.uma_count || classData.total_entries || classData.count || 0;
          }
        });
      });
      const skillsWithImages = Array.from(mergedSkills.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50)
        .map(([skillKey, data]) => {
          const resolvedSkill = this.resolveSkillInfo(skillKey, data);
          const percentage = totalTrainedUmas > 0 ? (data.count / totalTrainedUmas) * 100 : 0;
          return {
            label: resolvedSkill.name,
            value: data.count,
            percentage: percentage,
            imageUrl: resolvedSkill.imageUrl,
            id: resolvedSkill.id || skillKey,
            icon: resolvedSkill.icon
          };
        });
      this.characterDistanceSkillsWithImages$.next(skillsWithImages);
    } else {
      this.characterDistanceSkillsWithImages$.next([]);
    }
    const stats = [
      { key: 'speed', name: 'Speed' },
      { key: 'stamina', name: 'Stamina' },
      { key: 'power', name: 'Power' },
      { key: 'guts', name: 'Guts' },
      { key: 'wiz', name: 'Wit' }
    ];
    const statDistributionData = stats.map(stat => {
      let totalValue = 0;
      let classCount = 0;
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          if (classData?.stat_averages?.[stat.key]?.mean !== undefined) {
            totalValue += classData.stat_averages[stat.key].mean;
            classCount++;
          }
        });
      });
      return {
        label: stat.name,
        value: Math.round(classCount > 0 ? totalValue / classCount : 0),
        color: this.colorsService.getStatColor(stat.key)
      };
    });
    this.characterDistanceStatDistributionData$.next(statDistributionData);
    // Merge card type distribution from all active team classes
    const mergedCardTypes = new Map<string, number>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.support_card_type_distribution && Object.keys(classData.support_card_type_distribution).length > 0) {
          Object.entries(classData.support_card_type_distribution).forEach(([type, data]: [string, any]) => {
            const cardType = this.normalizeSupportCardType(type) || type;
            const count = this.getEntryCount(data);
            const current = mergedCardTypes.get(cardType) || 0;
            mergedCardTypes.set(cardType, current + count);
          });
        } else if (classData?.common_support_cards) {
          Object.entries(classData.common_support_cards).forEach(([cardId, data]: [string, any]) => {
            const cardType = this.resolveSupportCardInfo(cardId, data).type || 'Other';
            const count = this.getEntryCount(data);
            const current = mergedCardTypes.get(cardType) || 0;
            mergedCardTypes.set(cardType, current + count);
          });
        }
      });
    });
    if (mergedCardTypes.size > 0) {
      const cardTypeData = Array.from(mergedCardTypes.entries()).map(([type, count]) => ({
        label: type,
        value: count
      }));
      this.characterDistanceCardTypeDistribution$.next(cardTypeData);
    } else {
      this.characterDistanceCardTypeDistribution$.next([]);
    }
    // Merge deck compositions from all active team classes
    const mergedDeckCompositions = new Map<string, { count: number; label: string; composition?: { [cardType: string]: number } }>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      dataList.forEach(classData => {
        if (classData?.support_card_combinations) {
          Object.entries(classData.support_card_combinations).forEach(([compositionKey, data]: [string, any]) => {
            const count = this.getEntryCount(data);
            const key = this.getSupportCardCombinationKey(compositionKey, data);
            const existing = mergedDeckCompositions.get(key) || {
              count: 0,
              label: this.getSupportCardCombinationLabel(compositionKey, data),
              composition: this.getSupportCardCombinationComposition(data)
            };
            existing.count += count;
            existing.composition = this.getSupportCardCombinationComposition(data) || existing.composition;
            mergedDeckCompositions.set(key, existing);
          });
        }
      });
    });
    if (mergedDeckCompositions.size > 0) {
      const deckCompositions = Array.from(mergedDeckCompositions.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50)
        .map(([compositionKey, data], index) => ({
          label: data.label || compositionKey,
          value: data.count,
          color: this.getStableColor(compositionKey, index),
          composition: data.composition
        }));
      this.characterDistanceDeckCompositions$.next(deckCompositions);
      // Update support card combinations data for consistency
      this.characterDistanceSupportCardCombinationsData$.next(deckCompositions);
    } else {
      this.characterDistanceDeckCompositions$.next([]);
      this.characterDistanceSupportCardCombinationsData$.next([]);
    }
  }
  // Cache management methods
  private generateCacheKey(baseKey: string, ...params: any[]): string {
    const paramsStr = params.map(p => JSON.stringify(p)).join('|');
    return `${baseKey}|${paramsStr}`;
  }
  private getCachedData<T>(cacheKey: string, computeFn: () => T): T {
    if (this.chartDataCache.has(cacheKey)) {
      return this.chartDataCache.get(cacheKey);
    }
    const startTime = performance.now();
    const data = computeFn();
    const computeTime = performance.now() - startTime;
    this.chartDataCache.set(cacheKey, data);
    return data;
  }
  private invalidateCache(type: 'globalStats' | 'classFilters' | 'scenarioFilters' | 'selectedDistance' | 'selectedCharacter' | 'all') {
    if (type === 'all') {
      this.chartDataCache.clear();
      return;
    }
    // Remove cache entries that depend on the changed data
    const keysToRemove = Array.from(this.chartDataCache.keys()).filter(key => {
      switch (type) {
        case 'globalStats':
          return key.includes('global') || key.includes('team') || key.includes('support') || key.includes('skill');
        case 'classFilters':
          return key.includes('class') || key.includes('stat') || key.includes('distribution');
        case 'scenarioFilters':
          return key.includes('scenario') || key.includes('stat') || key.includes('distribution');
        case 'selectedDistance':
          return key.includes('distance');
        case 'selectedCharacter':
          return key.includes('character');
        default:
          return false;
      }
    });
    keysToRemove.forEach(key => this.chartDataCache.delete(key));
  }
  openMobileFilters() {
    // Open the Material bottom sheet for mobile filters
    if (this.isBottomSheetMode) {
      // Determine which distance to show in the filter
      // If a character is selected, show the character's distance; otherwise show the main distance
      const currentDistance = this.selectedCharacterDetail && this.selectedCharacterDistance
        ? this.selectedCharacterDistance
        : this.selectedDistance.value;
      const bottomSheetRef = this.bottomSheet.open(TeamClassBottomSheetComponent, {
        data: {
          selectedClasses: this.classFilters,
          classStats: this.classStats$.value,
          selectedDistance: currentDistance,
          selectedDistances: this.distanceFilters,
          distances: this.distances,
          scenarioFilters: this.scenarioFilters,
          scenarioNames: this.scenarioNames,
          scenarioStats: this.globalStats?.scenario_distribution || {}
        },
        panelClass: 'team-class-bottom-sheet-panel'
      });
      bottomSheetRef.afterDismissed().subscribe((result) => {
        if (result) {
          let changed = false;
          if (result.classFilters) {
            this.classFilters = result.classFilters;
            this.invalidateCache('classFilters');
            changed = true;
          }
          if (result.scenarioFilters) {
            this.scenarioFilters = result.scenarioFilters;
            this.invalidateCache('scenarioFilters');
            changed = true;
          }
          if (result.distanceFilters) {
            this.distanceFilters = { ...result.distanceFilters };
            this.syncPrimarySelectedDistance();
            this.invalidateCache('selectedDistance');
            changed = true;
          }
          
          if (changed) {
            this.filteredTotalCache = 0;
            this.updateAllChartData();
            this.loadActiveDistanceStats();
            
            // Also update distance-specific charts if a distance is selected
            const currentDistance = this.selectedDistance.value;
            if (currentDistance && this.distanceStats[currentDistance]) {
              this.updateDistanceChartData(currentDistance);
            }
            // Update character charts if a character is selected
            if (this.selectedCharacterDetail) {
              this.debouncedCharacterUpdate(this.selectedCharacterDetail);
              this.updateAllCharacterCharts();
            }
          }
          if (result.distance && !result.distanceFilters) {
            this.onDistanceSelect(result.distance);
          }
        }
      });
    }
  }
  // Chart data methods
  // Helper to handle new data format (overall/by_scenario) vs old format
  private getMetricData(metric: string, classId: string, sourceData: any = null): any[] {
    let classData;
    
    if (sourceData) {
      // For character stats or other sources
      classData = sourceData.by_team_class?.[classId];
    } else {
      if (this.hasNoActiveDistanceFilters()) {
        return [];
      }

      const distanceMetricData = this.getLoadedActiveDistanceStats()
        .flatMap(distanceData => this.getMetricData('', classId, distanceData))
        .map(distanceClassData => metric ? distanceClassData?.[metric] : distanceClassData)
        .filter(data => this.hasNonEmptyMetricData(data));
      if (distanceMetricData.length > 0) {
        return distanceMetricData;
      }

      // For global stats
      classData = this.globalStats?.[metric]?.by_team_class?.[classId];
    }
    if (!classData) return [];
    // Check if it's the new format (has 'overall' key)
    if (classData.overall) {
      const activeScenarios = this.getActiveScenarioIds();
      const allScenarioCount = Object.keys(this.scenarioFilters).length;
      
      // If all scenarios are active OR by_scenario is missing (removed in backend), use overall
      if (activeScenarios.length === allScenarioCount || !classData.by_scenario) {
        return [classData.overall];
      }
      
      // Otherwise, return data for active scenarios
      return activeScenarios
        .map(id => classData.by_scenario?.[id])
        .filter(d => d);
    }
    
    // Old format - return the classData itself as the only item
    return [classData];
  }
  private computeTeamClassChartData(): ChartDataPoint[] {
    if (!this.globalStats?.team_class_distribution) {
      return [];
    }
    const activeClasses = this.getActiveClassIds();
    const activeScenarios = this.getActiveScenarioIds();
    // Always aggregate from by_scenario when it exists so the "all scenarios"
    // state uses the same source as filtered scenario states.
    if (this.globalStats.team_class_distribution.by_scenario) {
      const aggregatedData = new Map<string, number>();

      activeScenarios.forEach(scenarioId => {
        const scenarioData = this.globalStats!.team_class_distribution.by_scenario[scenarioId];
        if (scenarioData) {
          activeClasses.forEach(classId => {
            const classData = scenarioData[classId];
            if (classData) {
              // Sum counts (trainers)
              const val = classData.count || 0;
              aggregatedData.set(classId, (aggregatedData.get(classId) || 0) + val);
            }
          });
        }
      });
      
      return activeClasses.map(classId => ({
        label: `Class ${classId}`,
        value: aggregatedData.get(classId) || 0,
        color: this.colorsService.getClassColor(classId)
      })).filter(item => item.value > 0);
    }

    const result = activeClasses
      .map((classId: string) => {
        const data = this.globalStats!.team_class_distribution[classId];
        // Try multiple possible field names for the count
        let value = 0;
        if (typeof data === 'number') {
          value = data;
        } else if (data && typeof data === 'object') {
          value = data.count || data.total || data.value || data.percentage || data.trainer_count || 0;
        }
        return {
          label: `Class ${classId}`,
          value: value,
          color: this.colorsService.getClassColor(classId)
        };
      })
      .filter(item => item.value > 0); // Filter out zero values
    return result;
  }
  private computeSupportCardCombinationsData(): ChartDataPoint[] {
    const combinations = new Map<string, { count: number; label: string; exactLabel: string; composition?: { [cardType: string]: number }; exactKeys: Set<string> }>();

    this.getSupportCardAnalysisMetricMaps('support_card_combinations').forEach(combinationMap => {
      Object.entries(combinationMap || {}).forEach(([combination, data]: [string, any]) => {
        if (!this.isMetricEntry(combination, data)) {
          return;
        }

        this.mergeSupportCardCombination(combinations, combination, data);
      });
    });

    const result = Array.from(combinations.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50)
      .map(([combination, data], index) => ({
        label: this.getSupportCardCombinationDisplayLabel(data) || combination,
        value: data.count,
        color: this.getStableColor(combination, index),
        composition: data.composition
      }));
    return result;
  }
  private computeStatAveragesByClassData(): any[] {
    if (!this.globalStats?.stat_averages?.by_team_class && !this.hasLoadedActiveDistanceStats()) return [];
    // Use correct stat order: Speed, Stamina, Power, Guts, Wit
    const stats = [
      { key: 'speed', name: 'Speed' },
      { key: 'stamina', name: 'Stamina' },
      { key: 'power', name: 'Power' },
      { key: 'guts', name: 'Guts' },
      { key: 'wiz', name: 'Wit' }
    ];
    // Use ALL active classes (merge all)
    const activeClasses = this.getActiveClassIds();
    return stats.map(stat => {
      const data = activeClasses.map((classId: string) => {
        const dataList = this.getMetricData('stat_averages', classId);
        
        let weightedSum = 0;
        let totalCount = 0;
        
        dataList.forEach(data => {
          const statData = data?.[stat.key];
          if (statData) {
            const n = statData.count || 1;
            weightedSum += (statData.mean || 0) * n;
            totalCount += n;
          }
        });
        
        const mean = totalCount > 0 ? weightedSum / totalCount : 0;
        return {
          x: `Class ${classId}`,
          y: Math.round(mean)
        };
      });
      return {
        name: stat.name,
        data,
        backgroundColor: this.colorsService.getStatColor(stat.key) + 'CC',
        borderColor: this.colorsService.getStatColor(stat.key),
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false
      };
    });
  }
  private computeSupportCardUsageData(): any[] {
    const activeClasses = this.getActiveClassIds();
    // Get all support cards from ACTIVE classes only and find top cards - BY ID
    const allCards = new Map<string, { count: number, name: string, id?: string | number }>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('support_cards', classId);
      
      dataList.forEach(classData => {
        if (classData) {
          Object.entries(classData).forEach(([cardName, data]: [string, any]) => {
            const resolvedCard = this.resolveSupportCardInfo(cardName, data);
            const cardKey = (resolvedCard.id || cardName).toString();
            const current = allCards.get(cardKey);
            const count = this.getEntryCount(data);
            if (current) {
              current.count += count;
            } else {
              allCards.set(cardKey, {
                count: count,
                name: resolvedCard.name,
                id: resolvedCard.id || undefined
              });
            }
          });
        }
      });
    });
    const topCards = Array.from(allCards.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50)
      .map(([cardKey, cardData]) => ({ key: cardKey, name: cardData.name, id: cardData.id }));
    // Create stacked data for each active class
    // Use ALL active classes (merge all)
    return activeClasses.map((classId: string) => {
      const dataList = this.getMetricData('support_cards', classId);
      
      // Aggregate data for this class
      const classData: any = {};
      dataList.forEach(data => {
        if (data) {
          Object.entries(data).forEach(([key, val]: [string, any]) => {
            const resolvedCard = this.resolveSupportCardInfo(key, val);
            const normalizedKey = resolvedCard.id || key;
            if (classData[normalizedKey]) {
              classData[normalizedKey].total = (classData[normalizedKey].total || 0) + this.getEntryCount(val);
            } else {
              classData[normalizedKey] = {
                ...(typeof val === 'object' ? val : {}),
                id: resolvedCard.id,
                name: resolvedCard.name,
                type: resolvedCard.type,
                total: this.getEntryCount(val)
              };
              if (classData[normalizedKey].total === undefined) {
                classData[normalizedKey].total = this.getEntryCount(val);
              }
            }
          });
        }
      });
      const data = topCards.map(cardInfo => {
        // Find the card data by looking for matching ID or name
        let foundCardData: any = null;
        const cardKey = cardInfo.key;
        let cardName = cardInfo.name || this.resolveSupportCardInfo(cardKey).name;
        // Try to find by ID first, then by name
        if (cardInfo.id) {
          foundCardData = Object.values(classData || {}).find((data: any) => data.id === cardInfo.id);
        }
        if (!foundCardData) {
          foundCardData = classData?.[cardKey];
        }
        
        // Use the name from foundCardData if available, otherwise keep original
        if (foundCardData?.name) {
          cardName = foundCardData.name;
        }
        const truncatedName = cardName.length > 20 ? cardName.substring(0, 17) + '...' : cardName;
        // Use support card ID from the data object
        const cardId = cardInfo.id || foundCardData?.id || this.resolveSupportCardInfo(cardKey).id;
        const imageUrl = cardId ? this.getSupportCardImageUrl(cardId) : undefined;
        return {
          x: truncatedName,
          y: foundCardData?.total || foundCardData?.count || 0,
          imageUrl: imageUrl,
          id: cardId,
          originalName: cardName,
          type: foundCardData?.type || this.resolveSupportCardInfo(cardKey).type
        };
      });
      return {
        name: `Class ${classId}`,
        data,
        backgroundColor: this.getClassColor(classId) + 'CC',
        borderColor: this.getClassColor(classId),
        borderWidth: 0,
        borderRadius: 4,
        borderSkipped: false
      };
    });
  }
  private computeSupportCardTypeDistribution(): ChartDataPoint[] {
    const cardTypes = new Map<string, number>();

    this.getSupportCardAnalysisMetricMaps('support_cards').forEach(cardMap => {
      Object.entries(cardMap || {}).forEach(([cardId, data]: [string, any]) => {
        if (!this.isMetricEntry(cardId, data)) {
          return;
        }

        const cardType = this.resolveSupportCardInfo(cardId, data).type || 'Other';
        const count = this.getEntryCount(data);
        const current = cardTypes.get(cardType) || 0;
        cardTypes.set(cardType, current + count);
      });
    });

    if (cardTypes.size === 0) {
      return [];
    }
    return Array.from(cardTypes.entries())
      .map(([type, count]) => ({
        label: type,
        value: count,
        color: this.getCardTypeColor(type),
        imageUrl: this.getStatIconUrl(type) // Add stat icons for support card types
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  private computeSkillsUsageData(): any[] {
    const activeClasses = this.getActiveClassIds();
    // Get top 15 skills from ACTIVE classes only
    const allSkills = new Map<string, number>();
    activeClasses.forEach(classId => {
      const dataList = this.getMetricData('skills', classId);
      
      dataList.forEach(classData => {
        if (classData) {
          Object.entries(classData).forEach(([skillName, data]: [string, any]) => {
            const resolvedSkill = this.resolveSkillInfo(skillName, data);
            const skillKey = String(resolvedSkill.id || skillName);
            const current = allSkills.get(skillKey) || 0;
            allSkills.set(skillKey, current + this.getEntryCount(data));
          });
        }
      });
    });
    const topSkills = Array.from(allSkills.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name]) => name);
    // Create stacked data for each active class
    // Use ALL active classes (merge all)
    return activeClasses.map((classId: string) => {
      const dataList = this.getMetricData('skills', classId);
      
      // Aggregate data for this class
      const classData: any = {};
      dataList.forEach(data => {
        if (data) {
          Object.entries(data).forEach(([key, val]: [string, any]) => {
            const resolvedSkill = this.resolveSkillInfo(key, val);
            const normalizedKey = String(resolvedSkill.id || key);
            if (classData[normalizedKey]) {
              classData[normalizedKey].total = (classData[normalizedKey].total || 0) + this.getEntryCount(val);
            } else {
              classData[normalizedKey] = {
                ...(typeof val === 'object' ? val : {}),
                id: resolvedSkill.id,
                name: resolvedSkill.name,
                icon: resolvedSkill.icon,
                total: this.getEntryCount(val)
              };
            }
          });
        }
      });
      const data = topSkills.map(skillKey => {
        const skillData = classData?.[skillKey];
        const skillName = skillData?.name || this.resolveSkillInfo(skillKey).name;
        return {
          x: skillName.length > 25 ? skillName.substring(0, 22) + '...' : skillName,
          y: skillData?.total || skillData?.count || 0
        };
      });
      return {
        name: `Class ${classId}`,
        data,
        backgroundColor: this.getClassColor(classId) + 'CC',
        borderColor: this.getClassColor(classId),
        borderWidth: 0,
        borderRadius: 4,
        borderSkipped: false
      };
    });
  }
  private computeOverallStatComparison(): ChartDataPoint[] {
    if (!this.globalStats?.stat_averages?.by_team_class && !this.hasLoadedActiveDistanceStats()) return [];
    const activeClasses = this.getActiveClassIds();
    // Use correct stat order: Speed, Stamina, Power, Guts, Wit
    const stats = [
      { key: 'speed', name: 'Speed' },
      { key: 'stamina', name: 'Stamina' },
      { key: 'power', name: 'Power' },
      { key: 'guts', name: 'Guts' },
      { key: 'wiz', name: 'Wit' }
    ];
    return stats.map(stat => {
      // Calculate weighted average from active classes
      let totalWeightedValue = 0;
      let totalWeight = 0;
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('stat_averages', classId);
        
        dataList.forEach(data => {
          const statData = data?.[stat.key];
          if (statData?.mean !== undefined && statData.count > 0) {
            totalWeightedValue += statData.mean * statData.count;
            totalWeight += statData.count;
          }
        });
      });
      const averageValue = totalWeight > 0 ? totalWeightedValue / totalWeight : 0;
      return {
        label: stat.name,
        value: Math.round(averageValue),
        color: this.colorsService.getStatColor(stat.key)
      };
    });
  }
  private computeUmaDistributionStackedData(): any[] {
    if (!this.globalStats?.uma_distribution) return [];
    // Get top 15 uma musume from global distribution
    const topUmas = Object.entries(this.globalStats.uma_distribution)
      .filter(([key]) => key !== 'by_team_class')
      .map(([key, data]: [string, any]) => ({
        key,
        id: this.resolveCharacterId(key, data),
        name: this.resolveCharacterName(key, data),
        count: this.getEntryCount(data),
        data
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map(uma => uma);
    // Create stacked data for each class
    // Use ALL active classes (merge all)
    const classIds = this.getActiveClassIds();
    const series = classIds.map((classId: string) => {
      const data = topUmas.map(uma => {
        // Use uma distribution from global stats as approximation for class distribution
        const umaData = uma.data;
        const id = uma.id;
        
        let classCount = 0;
        // Check if we have granular data (new format)
        if (this.globalStats!.uma_distribution.by_team_class) {
          const dataList = this.getMetricData('uma_distribution', classId);
          dataList.forEach(classUmaDistribution => {
            const classUmaData = this.findCharacterDistributionData(classUmaDistribution, uma.key, id);
            if (classUmaData) {
              classCount += this.getEntryCount(classUmaData);
            }
          });
        } else {
          // Old format approximation
          const classPercentage = this.globalStats!.team_class_distribution[classId]?.percentage || 0;
          // Calculate approximate count for this class
          const totalCount = umaData?.count || 0;
          classCount = Math.round(totalCount * (classPercentage / 100));
        }
        // Get character ID for image URL
        const imageUrl = id ? this.getCharacterImageUrl(id) : undefined;
        return {
          x: uma.name,
          y: classCount,
          imageUrl: imageUrl,
          id: id,
          originalName: uma.name
        };
      });
      return {
        name: `Class ${classId}`,
        data,
        backgroundColor: this.getClassColor(classId) + 'CC', // Add transparency
        borderColor: this.getClassColor(classId),
        borderWidth: 0, // Remove borders for smoother look
        borderRadius: 4, // Add rounded corners
        borderSkipped: false
      };
    });
    return series;
  }
  private updateAllChartData() {
    if (this.chartDataUpdateTimer) {
      clearTimeout(this.chartDataUpdateTimer);
    }

    this.chartDataUpdateTimer = setTimeout(() => {
      this.chartDataUpdateTimer = null;
      this.updateAllChartDataNow();
    }, this.chartDataUpdateDebounceMs);
  }
  private updateAllChartDataNow() {
    if (!this.globalStats) return;
    const activeClasses = this.getActiveClassIds();
    const activeScenarios = this.getActiveScenarioIds();
    const activeDistances = this.getActiveDistanceIds();
    const loadedDistances = activeDistances.filter(distance => this.distanceStats[distance]);
    const cacheKey = `global_${activeClasses.join('_')}_${activeScenarios.join('_')}_${activeDistances.join('_')}_${loadedDistances.join('_')}`;
    // Check cache first
    if (this.chartDataCache.has(cacheKey)) {
      const cached = this.chartDataCache.get(cacheKey);
      this.applyChartData(cached);
      return;
    }
    // Calculate new data
    const chartData = this.calculateChartData();
    // Cache the results
    this.chartDataCache.set(cacheKey, chartData);
    // Apply the data
    this.applyChartData(chartData);
  }
  private calculateChartData(): any {
    if (!this.globalStats) {
      return {
        teamClass: [],
        totalTrainers: 0,
        supportCardCombinations: [],
        statAveragesByClass: [],
        supportCardUsage: [],
        supportCardTypes: [],
        topSupportCards: [],
        skillsUsage: [],
        overallStatComparison: [],
        umaDistributionStacked: [],
        sampleSizeText: this.getSampleSizeText(),
        topUmas: [],
        topSkills: [],
        statDistribution: { speed: [], stamina: [], power: [], guts: [], wiz: [] },
        filteredTotal: 0
      };
    }

    const filteredTotal = this.calculateFilteredTotal();
    const teamClass = this.computeTeamClassChartData();
    return {
      teamClass,
      totalTrainers: this.calculateTotalTrainers(teamClass),
      supportCardCombinations: this.computeSupportCardCombinationsData(),
      statAveragesByClass: this.computeStatAveragesByClassData(),
      supportCardUsage: this.computeSupportCardUsageData(),
      supportCardTypes: this.computeSupportCardTypeDistribution(),
      topSupportCards: this.computeTopSupportCardsWithImages(),
      skillsUsage: this.computeSkillsUsageData(),
      overallStatComparison: this.computeOverallStatComparison(),
      umaDistributionStacked: this.computeUmaDistributionStackedData(),
      sampleSizeText: this.getSampleSizeText(),
      topUmas: this.computeTopUmasWithImages(),
      topSkills: this.computeTopSkillsWithImages(),
      statDistribution: this.calculateStatDistribution(),
      filteredTotal
    };
  }
  private applyChartData(data: any): void {
    // Update all observables at once
    this.classStats$.next(this.buildClassStats(data.teamClass, data.totalTrainers));
    this.teamClassChartData$.next(data.teamClass);
    this.totalTrainers$.next(data.totalTrainers);
    this.supportCardCombinationsData$.next(data.supportCardCombinations);
    this.statAveragesByClassData$.next(data.statAveragesByClass);
    this.supportCardUsageData$.next(data.supportCardUsage);
    this.supportCardTypeDistribution$.next(data.supportCardTypes);
    this.topSupportCardsWithImages$.next(data.topSupportCards);
    this.skillsUsageData$.next(data.skillsUsage);
    this.overallStatComparison$.next(data.overallStatComparison);
    this.umaDistributionStackedData$.next(data.umaDistributionStacked);
    this.sampleSizeText$.next(data.sampleSizeText);
    this.topUmasWithImages$.next(data.topUmas);
    this.topSkillsWithImages$.next(data.topSkills);
    this.statDistributionData$.next(data.statDistribution);
    // Update the filtered total for charts
    this.filteredTotalCache = data.filteredTotal;
  }
  private buildClassStats(teamClassData: ChartDataPoint[], totalTrainers: number): { [key: string]: { count: number; percentage: number } } {
    return teamClassData.reduce((stats, entry) => {
      const match = entry.label?.match(/Class\s+(\d+)/i);
      const classId = match?.[1];
      if (!classId) {
        return stats;
      }

      stats[classId] = {
        count: entry.value || 0,
        percentage: totalTrainers > 0 ? ((entry.value || 0) / totalTrainers) * 100 : 0
      };
      return stats;
    }, {} as { [key: string]: { count: number; percentage: number } });
  }
  private calculateStatDistribution(): { [key: string]: any[] } {
    const statDistData: { [key: string]: any[] } = {};
    ['speed', 'stamina', 'power', 'guts', 'wiz'].forEach(stat => {
      statDistData[stat] = this.getStatDistributionMultiSeries(stat);
    });
    return statDistData;
  }
  private calculateFilteredTotal(): number {
    if (this.filteredTotalCache > 0) {
      return this.filteredTotalCache;
    }
    const activeClasses = this.getActiveClassIds();
    // For support cards, we need to count the total NUMBER OF TEAMS/ENTRIES
    // not the sum of all card usages
    // Each team has 6 support cards, so we need to get the total team count
    const distanceTotal = this.hasLoadedActiveDistanceStats() ? this.getGlobalTotalUmasTrained() : 0;
    if (distanceTotal > 0) {
      this.filteredTotalCache = distanceTotal * 6;
      return this.filteredTotalCache;
    }
    let totalTeams = 0;
    activeClasses.forEach(classId => {
      const classDistribution = this.globalStats?.team_class_distribution?.[classId];
      if (classDistribution) {
        // Get the count of teams for this class
        let teamCount = 0;
        if (typeof classDistribution === 'number') {
          teamCount = classDistribution;
        } else if (classDistribution && typeof classDistribution === 'object') {
          teamCount = classDistribution.count || classDistribution.total || classDistribution.value || 0;
        }
        totalTeams += teamCount;
      }
    });
    // Each team has 6 support cards, so total support card slots = teams * 6
    const totalSupportCardSlots = totalTeams * 6;
    this.filteredTotalCache = totalSupportCardSlots;
    return totalSupportCardSlots;
  }
  // Multi-series stat distribution showing aggregated data from all selected classes
  getStatDistributionMultiSeries(statName: string): any[] {
    const cacheKey = this.generateCacheKey('statDistribution', statName, this.classFilters, this.scenarioFilters, this.distanceFilters, this.getActiveDistanceIds().filter(distance => this.distanceStats[distance]));
    return this.getCachedData(cacheKey, () => {
      if (!this.globalStats?.stat_averages?.by_team_class) {
        if (!this.hasLoadedActiveDistanceStats()) {
          return [];
        }
      }
      // Get ALL active classes (merge all)
      const activeClasses = this.getActiveClassIds();
      const aggregatedHistogram = new Map<string, number>();
      let totalCount = 0;
      let classesProcessed = 0;
      // Aggregate histogram data from ALL selected classes
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('stat_averages', classId);
        
        dataList.forEach(classData => {
          const statData = classData?.[statName];
          if (statData?.histogram) {
            classesProcessed++;
            Object.entries(statData.histogram).forEach(([bucket, count]) => {
              const currentCount = aggregatedHistogram.get(bucket) || 0;
              const newCount = currentCount + (count as number);
              aggregatedHistogram.set(bucket, newCount);
              totalCount += (count as number);
            });
          }
        });
      });
      if (aggregatedHistogram.size === 0) {
        return [];
      }
      // Convert aggregated data to raw counts
      const histogramData = Array.from(aggregatedHistogram.entries())
        .map(([bucket, count]) => ({
          x: this.formatStatBucketLabel(bucket),
          y: count // Use raw count instead of percentage
        }))
        .sort((a, b) => this.extractBucketValue(a.x) - this.extractBucketValue(b.x));
      const statColor = this.colorsService.getStatColor(statName);
      const series = [{
        name: `${this.formatStatName(statName)} Distribution (All Classes)`,
        data: histogramData,
        backgroundColor: statColor + '66',
        borderColor: statColor,
        borderWidth: 2,
        borderRadius: 4,
        fill: false
      }];
      return series;
    });
  }
  private updateDistanceChartData(distance: string) {
    if (!this.distanceStats[distance]) {
      // Load data if not cached
      this.loadSingleDistanceStats(distance);
      return;
    }
    // Update distance-specific chart data
    this.distanceSkillsData$.next(this.computeDistanceSkillsData(distance));
    this.distanceCardTypeDistribution$.next(this.computeDistanceCardTypeDistribution(distance));
    this.distanceUmaStackedData$.next(this.computeDistanceUmaStackedData(distance));
    this.distanceStatDistributionData$.next(this.computeDistanceStatDistributionData(distance));
    this.distanceSupportCardData$.next(this.computeDistanceSupportCardData(distance));
    this.distanceSupportCardCombinationsData$.next(this.getDistanceSupportCardCombinations(distance));
    // Update distance-specific image data
    this.distanceSupportCardsWithImages$.next(this.computeDistanceSupportCardsWithImages(distance));
    this.distanceSkillsWithImages$.next(this.computeDistanceSkillsWithImages(distance));
    this.distanceUmasWithImages$.next(this.computeDistanceUmasWithImages(distance));
    // Update histogram data for each stat
    this.distanceStatHistogramSpeed$.next(this.getDistanceStatHistogramData(distance, 'speed'));
    this.distanceStatHistogramPower$.next(this.getDistanceStatHistogramData(distance, 'power'));
    this.distanceStatHistogramStamina$.next(this.getDistanceStatHistogramData(distance, 'stamina'));
    this.distanceStatHistogramWiz$.next(this.getDistanceStatHistogramData(distance, 'wiz'));
    this.distanceStatHistogramGuts$.next(this.getDistanceStatHistogramData(distance, 'guts'));
  }
  // Convert existing methods to compute methods (rename with "compute" prefix)
  private computeDistanceSkillsData(distance: string): any[] {
    const cacheKey = this.generateCacheKey('distanceSkills', distance, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      if (!distanceData?.by_team_class) return [];
      const activeClasses = this.getActiveClassIds().filter((id: string) => id !== 'overall');
      // Get top 15 skills for this distance from ACTIVE classes only
      const allSkills = new Map<string, number>();
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        dataList.forEach(classData => {
          if (classData?.skills) {
            Object.entries(classData.skills).forEach(([skillId, data]: [string, any]) => {
              const resolvedSkill = this.resolveSkillInfo(skillId, data);
              const skillKey = String(resolvedSkill.id || skillId);
              const current = allSkills.get(skillKey) || 0;
              allSkills.set(skillKey, current + this.getEntryCount(data));
            });
          }
        });
      });
      const topSkills = Array.from(allSkills.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([skillKey]) => skillKey);
      // Create stacked data for each active class
      const result = activeClasses.map((classId: string) => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        // Aggregate skill data for this class
        const aggregatedSkills = new Map<string, { name: string, count: number }>();
        dataList.forEach(classData => {
          if (classData?.skills) {
            Object.entries(classData.skills).forEach(([skillKey, skillData]: [string, any]) => {
              const resolvedSkill = this.resolveSkillInfo(skillKey, skillData);
              const normalizedKey = String(resolvedSkill.id || skillKey);
              const current = aggregatedSkills.get(normalizedKey) || { name: resolvedSkill.name, count: 0 };
              current.count += this.getEntryCount(skillData);
              aggregatedSkills.set(normalizedKey, current);
            });
          }
        });
        const data = topSkills.map(skillKey => {
          const skillData = aggregatedSkills.get(skillKey);
          const skillName = skillData?.name || this.resolveSkillInfo(skillKey).name;
          return {
            x: skillName.length > 25 ? skillName.substring(0, 22) + '...' : skillName,
            y: skillData?.count || 0
          };
        });
        return {
          name: `Class ${classId}`,
          data,
          backgroundColor: this.getClassColor(classId) + 'CC',
          borderColor: this.getClassColor(classId),
          borderWidth: 0,
          borderRadius: 4,
          borderSkipped: false
        };
      });
      return result;
    });
  }
  private computeDistanceCardTypeDistribution(distance: string): ChartDataPoint[] {
    const distanceData = this.distanceStats[distance];
    if (!distanceData?.by_team_class) return [];
    const cardTypes = new Map<string, number>();
    const activeClasses = this.getActiveClassIds().filter((id: string) => id !== 'overall');
    activeClasses.forEach(classId => {
      if ((this.classFilters as any)[classId]) {
        const dataList = this.getMetricData('', classId, distanceData);
        dataList.forEach(classData => {
          if (classData?.support_cards) {
            Object.entries(classData.support_cards).forEach(([cardId, data]: [string, any]) => {
            const cardType = this.resolveSupportCardInfo(cardId, data).type || 'Other';
            const current = cardTypes.get(cardType) || 0;
            cardTypes.set(cardType, current + this.getEntryCount(data));
          });
        }
        });
      }
    });
    return Array.from(cardTypes.entries())
      .map(([type, count]) => ({
        label: type,
        value: count,
        color: this.getCardTypeColor(type)
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  private computeDistanceUmaStackedData(distance: string): any[] {
    const distanceData = this.distanceStats[distance];
    if (!distanceData?.by_team_class) return [];
    const classIds = this.getActiveClassIds();
    // Get top 10 umas for this distance based on total count from ACTIVE classes only
    const allUmas = new Map<string, { count: number; name: string; characterId: string | null }>();
    classIds.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      dataList.forEach(classData => {
        if (classData?.uma_distribution) {
          Object.entries(classData.uma_distribution).forEach(([umaName, data]: [string, any]) => {
            const characterId = this.resolveCharacterId(umaName, data);
            const key = characterId || umaName;
            const current = allUmas.get(key) || { count: 0, name: this.resolveCharacterName(umaName, data), characterId };
            allUmas.set(key, {
              ...current,
              count: current.count + this.getEntryCount(data),
              characterId: characterId || current.characterId
            });
          });
        }
      });
    });
    const topUmas = Array.from(allUmas.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, data]) => ({ key, ...data }));
    // Create stacked data for each class
    // Use ALL active classes (merge all)
    const series = classIds.map((classId: string) => {
      const dataList = this.getMetricData('', classId, distanceData);
      
      const data = topUmas.map(uma => {
        let count = 0;
        dataList.forEach(classData => {
          const umaData = this.findCharacterDistributionData(classData?.uma_distribution, uma.key, uma.characterId);
          count += this.getEntryCount(umaData);
        });
        
        return {
          x: uma.name,
          y: count  // Use actual count
        };
      });
      return {
        name: `Class ${classId}`,
        data,
        backgroundColor: this.getClassColor(classId),
        borderColor: this.getClassColor(classId),
        borderWidth: 1
      };
    });
    return series;
  }
  private computeDistanceStatDistributionData(distance: string): ChartDataPoint[] {
    const distanceData = this.distanceStats[distance];
    if (!distanceData?.by_team_class) return [];
    // Use correct stat order: Speed, Stamina, Power, Guts, Wit
    const stats = [
      { key: 'speed', name: 'Speed' },
      { key: 'stamina', name: 'Stamina' },
      { key: 'power', name: 'Power' },
      { key: 'guts', name: 'Guts' },
      { key: 'wiz', name: 'Wit' }
    ];
    // Get ALL active classes (merge all)
    const activeClasses = this.getActiveClassIds();
    // Calculate average stats across all selected classes for this distance
    return stats.map(stat => {
      let totalMean = 0;
      let classesWithData = 0;
      // Aggregate mean values from ALL selected classes for this distance
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          const statData = classData?.stat_averages?.[stat.key];
          if (statData?.mean !== undefined) {
            totalMean += statData.mean;
            classesWithData++;
          }
        });
      });
      const averageMean = classesWithData > 0 ? totalMean / classesWithData : 0;
      return {
        label: stat.name,
        value: Math.round(averageMean),
        color: this.colorsService.getStatColor(stat.key)
      };
    });
  }
  private computeDistanceSupportCardData(distance: string): any[] {
    const distanceData = this.distanceStats[distance];
    if (!distanceData?.by_team_class) return [];
    const classIds = this.getActiveClassIds();
    // Get top 12 support cards for this distance based on count from ACTIVE classes only
    const allCards = new Map<string, { count: number, name: string, data: any }>();
    classIds.forEach(classId => {
      const dataList = this.getMetricData('', classId, distanceData);
      dataList.forEach(classData => {
        if (classData?.support_cards) {
          Object.entries(classData.support_cards).forEach(([cardId, data]: [string, any]) => {
            const resolvedCard = this.resolveSupportCardInfo(cardId, data);
            const actualCardId = resolvedCard.id || cardId;
            const current = allCards.get(actualCardId) || { count: 0, name: resolvedCard.name, data: data };
            // Support both count and total properties
            allCards.set(actualCardId, {
              count: current.count + this.getEntryCount(data),
              name: resolvedCard.name,
              data: data
            });
          });
        }
      });
    });
    if (allCards.size === 0) return [];
    const topCards = Array.from(allCards.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 50)
      .map(([cardId, data]) => ({ cardId, name: data.name }));
    // Create stacked data for each active class
    // Use ALL active classes (merge all)
    const series = classIds.map((classId: string) => {
      const dataList = this.getMetricData('', classId, distanceData);
      const data = topCards.map(card => {
        let cardData: any = null;
        dataList.forEach(classData => {
          if (!cardData) {
            cardData = classData?.support_cards?.[card.cardId]
              || Object.entries(classData?.support_cards || {}).find(([entryKey, entryData]: [string, any]) =>
                this.resolveSupportCardInfo(entryKey, entryData).id === card.cardId
              )?.[1];
          }
        });
        return {
          x: card.name.length > 25 ? card.name.substring(0, 22) + '...' : card.name,
          y: this.getEntryCount(cardData)
        };
      });
      return {
        name: `Class ${classId}`,
        data,
        backgroundColor: this.getClassColor(classId) + 'CC', // Semi-transparent
        borderColor: this.getClassColor(classId),
        borderWidth: 0, // No border for cleaner stacked look
        borderRadius: 4,
        borderSkipped: false
      };
    });
    return series;
  }
  // Distance-specific support cards with images (for image list display)
  private computeDistanceSupportCardsWithImages(distance: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('distanceSupportCardsWithImages', distance, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      return this.buildSupportCardImageData(
        this.getDistanceMetricMaps(distanceData, 'support_cards'),
        this.getDistanceTotalUmasTrained(distanceData)
      );
    });
  }
  // Character-specific chart data methods
  private computeCharacterStatComparisonData(characterId: string): ChartDataPoint[] {
    const character = this.characterStats[characterId];
    if (!character?.by_distance) return [];
    const distanceEntries = this.getFilteredCharacterDistanceEntries(character);
    if (distanceEntries.length === 0) return [];
    // Use correct stat order: Speed, Stamina, Power, Guts, Wit
    const stats = [
      { key: 'speed', name: 'Speed' },
      { key: 'stamina', name: 'Stamina' },
      { key: 'power', name: 'Power' },
      { key: 'guts', name: 'Guts' },
      { key: 'wiz', name: 'Wit' }
    ];
    // Aggregate stats across all distances for this character from ACTIVE classes only
    return stats.map(stat => {
      let totalStat = 0;
      let count = 0;
      const activeClasses = this.getActiveClassIds();
      distanceEntries.forEach(([, distanceData]) => {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          dataList.forEach(classData => {
            if (classData?.stat_averages?.[stat.key]?.mean !== undefined) {
              totalStat += classData.stat_averages[stat.key].mean;
              count++;
            }
          });
        });
      });
      return {
        label: stat.name,
        value: Math.round(count > 0 ? totalStat / count : 0),
        color: this.colorsService.getStatColor(stat.key)
      };
    });
  }
  // Individual stat distribution methods for distance with histogram data
  getDistanceStatHistogramData(distance: string, stat: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('distanceStatHistogram', distance, stat, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      if (!distanceData?.by_team_class) {
        return [];
      }
      // Use ALL active classes (merge all)
      const activeClasses = this.getActiveClassIds();
      const histogramCombined = new Map<string, number>();
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        dataList.forEach(classData => {
          const statData = classData?.stat_averages?.[stat];
          if (statData?.histogram) {
            Object.entries(statData.histogram).forEach(([bucket, count]) => {
              const current = histogramCombined.get(bucket) || 0;
              histogramCombined.set(bucket, current + (count as number));
            });
          }
        });
      });
      const result = Array.from(histogramCombined.entries())
        .map(([bucket, count]) => ({
          label: this.formatStatBucketLabel(bucket),
          value: count,
          color: this.getStatColor(stat)
        }))
        .sort((a, b) => this.extractBucketValue(a.label) - this.extractBucketValue(b.label));
      return result;
    });
  }
  // Distance support card combinations with icon formatting
  getDistanceSupportCardCombinations(distance: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('distanceSupportCardCombinations', distance, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      if (!distanceData?.by_team_class) return [];
      const combinations = new Map<string, { count: number; label: string; exactLabel: string; composition?: { [cardType: string]: number }; exactKeys: Set<string> }>();
      // Use ALL active classes (merge all)
      const activeClasses = this.getActiveClassIds();
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          if (classData?.support_card_combinations) {
            Object.entries(classData.support_card_combinations).forEach(([combination, data]: [string, any]) => {
              this.mergeSupportCardCombination(combinations, combination, data);
            });
          }
        });
      });
      const result = Array.from(combinations.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50)
        .map(([combination, data], index) => ({
          label: this.getSupportCardCombinationDisplayLabel(data) || combination,
          value: data.count,
          color: this.getStableColor(combination, index),
          composition: data.composition
        }));
      return result;
    });
  }
  // Character stat histogram methods
  private computeCharacterStatHistogramData(characterId: string, stat: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('characterStatHistogram', characterId, stat, this.classFilters, this.scenarioFilters, this.distanceFilters);
    return this.getCachedData(cacheKey, () => {
      const character = this.characterStats[characterId];
      if (!character?.by_distance) return [];
      const histogramCombined = new Map<string, number>();
      const activeClasses = this.getActiveClassIds();
      this.getFilteredCharacterDistanceEntries(character).forEach(([, distanceData]: [string, any]) => {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          dataList.forEach(classData => {
            const statData = classData?.stat_averages?.[stat];
            if (statData?.histogram) {
              Object.entries(statData.histogram).forEach(([bucket, count]) => {
                const current = histogramCombined.get(bucket) || 0;
                histogramCombined.set(bucket, current + (count as number));
              });
            }
          });
        });
      });
      return Array.from(histogramCombined.entries())
        .map(([bucket, count]) => ({
          label: bucket,
          value: count,
          color: this.getStatColor(stat)
        }))
        .sort((a, b) => parseInt(a.label) - parseInt(b.label));
    });
  }
  // Character support card combinations
  private computeCharacterSupportCardCombinations(characterId: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('characterSupportCardCombinations', characterId, this.classFilters, this.scenarioFilters, this.distanceFilters);
    return this.getCachedData(cacheKey, () => {
      const character = this.characterStats[characterId];
      if (!character?.by_distance) return [];
      const combinations = new Map<string, { count: number; label: string; exactLabel: string; composition?: { [cardType: string]: number }; exactKeys: Set<string> }>();
      const activeClasses = this.getActiveClassIds();
      this.getFilteredCharacterDistanceEntries(character).forEach(([, distanceData]: [string, any]) => {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          dataList.forEach(classData => {
            if (classData?.support_card_combinations) {
              Object.entries(classData.support_card_combinations).forEach(([combination, data]: [string, any]) => {
                this.mergeSupportCardCombination(combinations, combination, data);
              });
            }
          });
        });
      });
      return Array.from(combinations.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 50)
        .map(([combination, data], index) => ({
          label: this.getSupportCardCombinationDisplayLabel(data) || combination,
          value: data.count,
          color: this.getStableColor(combination, index),
          composition: data.composition
        }));
    });
  }
  // Utility methods
  getActiveClassIds(): string[] {
    const activeIds = Object.keys(this.classFilters).filter((classId: string) =>
      (this.classFilters as any)[classId] !== false
    );
    return activeIds;
  }

  getActiveDistanceIds(): string[] {
    return this.availableDistances.filter(distance => this.distanceFilters[distance] !== false);
  }

  private hasNoActiveDistanceFilters(): boolean {
    return this.availableDistances.length > 0
      && Object.keys(this.distanceFilters).length > 0
      && this.getActiveDistanceIds().length === 0;
  }

  private getLoadedActiveDistanceStats(): any[] {
    return this.getActiveDistanceIds()
      .map(distance => this.distanceStats[distance])
      .filter(Boolean);
  }

  private hasLoadedActiveDistanceStats(): boolean {
    return this.getLoadedActiveDistanceStats().length > 0;
  }

  private hasNonEmptyMetricData(data: any): boolean {
    if (!data) {
      return false;
    }
    if (typeof data !== 'object') {
      return true;
    }
    return Object.entries(data).some(([key, value]: [string, any]) => this.isMetricEntry(key, value));
  }

  private isSameStatisticsDistance(left: string | number, right: string | number): boolean {
    const leftInfo = resolveStatisticsDistance(left);
    const rightInfo = resolveStatisticsDistance(right);
    if (leftInfo && rightInfo) {
      return leftInfo.id === rightInfo.id;
    }
    return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
  }

  private getFilteredCharacterDistanceEntries(characterData: any): [string, any][] {
    if (!characterData?.by_distance) {
      return [];
    }

    const activeDistances = this.getActiveDistanceIds();
    if (activeDistances.length === 0) {
      return [];
    }

    return Object.entries(characterData.by_distance)
      .filter(([distance]) => activeDistances.some(activeDistance => this.isSameStatisticsDistance(activeDistance, distance))) as [string, any][];
  }
  
  getActiveScenarioIds(): string[] {
    const activeIds = Object.keys(this.scenarioFilters).filter((scenarioId: string) =>
      this.scenarioFilters[scenarioId] !== false
    );
    return activeIds;
  }
  private getCardTypeColor(cardType: string): string {
    // Use proper stat colors from colors service
    const typeMap: { [key: string]: string } = {
      'Speed': 'speed',
      'Power': 'power',
      'Stamina': 'stamina',
      'Intelligence': 'wiz',
      'Wiz': 'wiz',
      'Wit': 'wiz',
      'Guts': 'guts',
      'Friend': '#e67e22',     // Dark orange for friend cards
      'Group': '#34495e',      // Dark gray for group cards
      'Other': '#7f8c8d'       // Gray for other
    };
    const statName = typeMap[cardType];
    if (statName && ['speed', 'power', 'stamina', 'wiz', 'guts'].includes(statName)) {
      return this.colorsService.getStatColor(statName);
    }
    // For non-stat types, return the color directly
    return typeMap[cardType] || typeMap['Other'];
  }
  private getClassColor(classId: string): string {
    return this.colorsService.getClassColor(classId);
  }
  private getStatColor(stat: string): string {
    return this.colorsService.getStatColor(stat);
  }
  private getDistanceColor(distance: string | null | undefined): string {
    return getStatisticsDistanceColor(distance);
  }
  getSupportCardValue(data: any, prop: 'total' | 'count' | 'percentage' | 'avg_level'): number {
    if (!data) return 0;
    if (typeof data === 'number') {
      return prop === 'total' || prop === 'count' ? data : 0;
    }
    return data[prop] || 0;
  }
  // UI Utility methods
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }
  getSampleSizeText(): string {
    if (!this.globalStats?.metadata?.total_entries) return 'Loading...';
    return `${this.globalStats.metadata.total_entries.toLocaleString()} training samples`;
  }
  getCharacterImageUrl(characterNameOrId: string): string {
    // If it's already a numeric ID, use it directly
    if (/^\d+$/.test(characterNameOrId)) {
      return `/assets/images/character_stand/chara_stand_${characterNameOrId}.png`;
    }
    // If it's a name, try to get the character ID from statistics data first
    if (this.globalStats?.uma_distribution) {
      const umaData = Object.values(this.globalStats.uma_distribution).find((data: any) =>
        data.name === characterNameOrId || Object.keys(this.globalStats!.uma_distribution).includes(characterNameOrId)
      );
      const characterId = (umaData as any)?.character_id || (umaData as any)?.id;
      if (characterId) {
        return `/assets/images/character_stand/chara_stand_${characterId}.png`;
      }
    }
    // Otherwise, get character ID from the service mapping
    const characterId = this.statisticsService.getCharacterIdFromName(characterNameOrId) || characterNameOrId;
    return `/assets/images/character_stand/chara_stand_${characterId}.png`;
  }
  // Helper method for template to check if character has image
  hasCharacterImage(characterNameOrId: string): boolean {
    if (!characterNameOrId) return false;
    try {
      // If it's numeric, we have an ID
      if (/^\d+$/.test(characterNameOrId)) {
        return true;
      }
      // Try to get from statistics data first
      if (this.globalStats?.uma_distribution) {
        const hasInUmaDistribution = Object.values(this.globalStats.uma_distribution).some((data: any) =>
          data.name === characterNameOrId || Object.keys(this.globalStats!.uma_distribution).includes(characterNameOrId)
        );
        if (hasInUmaDistribution) return true;
      }
      // Fall back to service mapping
      const characterId = this.statisticsService.getCharacterIdFromName(characterNameOrId);
      return characterId !== null && characterId !== undefined && characterId !== '';
    } catch (error) {
      console.warn(`Error checking character image for ${characterNameOrId}:`, error);
      return false;
    }
  }
  // TrackBy function for character list performance
  trackByCharacter(index: number, character: { id: string, name: string }): string {
    return character.id;
  }
  // Handle image loading errors
  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
    }
  }
  getSupportCardImageUrl(cardId: string | number): string {
    return `/assets/images/support_card/half/support_card_s_${cardId}.png`;
  }
  getStatIconUrl(statName: string): string {
    // Normalize stat name to match file names
    const statMap: { [key: string]: string } = {
      'speed': 'speed',
      'power': 'power',
      'stamina': 'stamina',
      'guts': 'guts',
      'wiz': 'wit',
      'wit': 'wit',
      'wisdom': 'wit',
      'intelligence': 'wit',
      'rank_score': 'speed' // Use speed icon as fallback for rank score
    };
    const fileName = statMap[statName.toLowerCase()] || 'speed';
    return `/assets/images/icon/stats/${fileName}.png`;
  }
  handleImageError(event: any): void {
    event.target.style.display = 'none';
  }
  // Missing methods that need to be added for template compatibility
  getDistanceIcon(distance: string | null | undefined): string {
    return getStatisticsDistanceIcon(distance);
  }
  getDistanceLabel(distance: string | null | undefined): string {
    return getStatisticsDistanceLabel(distance);
  }
  // Temporary methods - these will be replaced by observables
  getStatAveragesByClassData(): any[] {
    return [];
  }
  getUmaDistributionStackedChartData(): any[] {
    return [];
  }
  getSupportCardTypeDistribution(): ChartDataPoint[] {
    return [];
  }
  getSupportCardUsageData(): any[] {
    return [];
  }
  getSkillsUsageData(): any[] {
    return [];
  }
  getOverallStatComparison(): ChartDataPoint[] {
    return [];
  }
  getDistanceUmaStackedData(distance: string): any[] {
    return [];
  }
  getDistanceSupportCardData(distance: string): any[] {
    return [];
  }
  getDistanceSkillsData(distance: string): any[] {
    return [];
  }
  getDistanceStatDistributionData(distance: string): any[] {
    return [];
  }
  getDistanceCardTypeDistribution(distance: string): ChartDataPoint[] {
    return [];
  }
  // Helper method to format stat names
  private formatStatName(statName: string): string {
    const statNames: { [key: string]: string } = {
      'speed': 'Speed',
      'stamina': 'Stamina',
      'power': 'Power',
      'guts': 'Guts',
      'wiz': 'Wit',
      'wisdom': 'Wit',
      'int': 'Wit'
    };
    return statNames[statName.toLowerCase()] || statName;
  }
  // Calculate total trainers for donut chart center
  private calculateTotalTrainers(teamClassData?: ChartDataPoint[]): number {
    if (teamClassData) {
      return teamClassData.reduce((total, entry) => total + (entry.value || 0), 0);
    }
    if (!this.globalStats?.team_class_distribution) return 0;
    return this.computeTeamClassChartData().reduce((total, entry) => total + (entry.value || 0), 0);
  }
  // Format total trainers for display with dynamic abbreviations (always one decimal place)
  formatTotalTrainers(total: number | null): string {
    if (!total) return '';
    if (total >= 1000000) {
      // For millions, always show one decimal place
      const millions = total / 1000000;
      return millions.toFixed(1) + 'M';
    } else if (total >= 1000) {
      // For thousands, always show one decimal place
      const thousands = total / 1000;
      return thousands.toFixed(1) + 'k';
    }
    return total.toString();
  }
  // Helper methods for chart configurations
  getTeamClassDoughnutConfig() {
    return {
      ...this.CHART_CONFIGS.DOUGHNUT_STANDARD,
      animationDuration: 140,
      animationEasing: 'easeOutCubic',
      centerText: this.formatTotalTrainers(this.totalTrainers$.value)
    };
  }
  getTeamClassDoughnutConfigWithTotal(total: number | null) {
    return {
      ...this.CHART_CONFIGS.DOUGHNUT_STANDARD,
      animationDuration: 140,
      animationEasing: 'easeOutCubic',
      centerText: this.formatTotalTrainers(total)
    };
  }
  getStandardBarConfig() {
    return this.CHART_CONFIGS.BAR_STANDARD;
  }
  getBarWithLegendConfig() {
    return this.CHART_CONFIGS.BAR_WITH_LEGEND;
  }
  getStackedBarConfig() {
    return this.CHART_CONFIGS.BAR_STACKED;
  }
  getLargeStackedBarConfig() {
    return this.CHART_CONFIGS.BAR_STACKED_LARGE;
  }
  getHorizontalBarConfig() {
    return this.CHART_CONFIGS.BAR_HORIZONTAL;
  }
  getDoughnutConfig(data?: ChartDataPoint[]) {
    // Calculate total from data if provided
    const total = data ? data.reduce((sum, item) => sum + (item.value || 0), 0) : 0;
    const centerText = total > 0 ? this.formatTotalTrainers(total) : '';
    return {
      ...this.CHART_CONFIGS.DOUGHNUT_STANDARD,
      centerText
    };
  }
  getImageListConfig() {
    return {
      ...this.CHART_CONFIGS.IMAGE_LIST
    };
  }
  getVerticalImageBarConfig() {
    return {
      ...this.CHART_CONFIGS.VERTICAL_IMAGE_BAR
    };
  }
  getStatSymbolBarConfig() {
    return {
      ...this.CHART_CONFIGS.STAT_SYMBOL_BAR
    };
  }
  // Helper method to enhance chart data with stat icons
  addStatIconsToChartData(data: ChartDataPoint[]): ChartDataPoint[] {
    return data.map(item => ({
      ...item,
      imageUrl: this.getStatIconUrl(item.label)
    }));
  }
  // ...existing code...
  private computeTopSupportCardsWithImages(): ChartDataPoint[] {
    return this.buildSupportCardImageData(
      this.getGlobalMetricMaps('support_cards'),
      this.getGlobalTotalUmasTrained()
    );
  }
  // Generate single-series Uma Musume data with images (for image list display)
  private computeTopUmasWithImages(): ChartDataPoint[] {
    if (!this.globalStats?.uma_distribution) return [];
    // Calculate total Uma Musume trained only from selected/active classes
    const activeClasses = this.getActiveClassIds();
    let totalUmasTrained = 0;
    // Use team_class_distribution to get trained_umas only from active classes
    activeClasses.forEach(classId => {
      const classData = this.globalStats?.team_class_distribution?.[classId];
      if (classData && typeof classData === 'object' && classData.trained_umas) {
        totalUmasTrained += classData.trained_umas;
      }
    });
    // If no trained_umas data available, fallback to uma_distribution approach
    if (totalUmasTrained === 0) {
      if (this.globalStats?.uma_distribution) {
        Object.values(this.globalStats.uma_distribution).forEach((data: any) => {
          const count = data.count || data.total || 0;
          totalUmasTrained += count;
        });
      }
    }
    // Aggregate uma distribution data
    const allUmas = new Map<string, any>();
    // Check if per-class uma distribution data is available
    if (this.globalStats?.uma_distribution?.by_team_class) {
      // Aggregate from per-class data (only from active classes)
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('uma_distribution', classId);
        
        dataList.forEach(classUmaData => {
          if (classUmaData) {
            Object.entries(classUmaData).forEach(([umaName, data]: [string, any]) => {
              const count = this.getEntryCount(data);
              const characterId = this.resolveCharacterId(umaName, data);
              const key = characterId || umaName;
              const existing = allUmas.get(key) || {
                count: 0,
                name: this.resolveCharacterName(umaName, data),
                character_id: characterId,
                character_color: data?.character_color
              };
              allUmas.set(key, {
                count: existing.count + count,
                name: existing.name,
                character_id: characterId || existing.character_id,
                character_color: data?.character_color || existing.character_color
              });
            });
          }
        });
      });
    } else {
      // Fallback to global uma distribution (legacy behavior)
      Object.entries(this.globalStats.uma_distribution).forEach(([umaName, data]: [string, any]) => {
        if (umaName === 'by_team_class') {
          return;
        }
        const characterId = this.resolveCharacterId(umaName, data);
        const key = characterId || umaName;
        const count = this.getEntryCount(data);
        allUmas.set(key, {
          count,
          name: this.resolveCharacterName(umaName, data),
          character_id: characterId,
          character_color: data?.character_color
        });
      });
    }
    // Convert to ChartDataPoint with images and sort to get top 20
    if (this.hasLoadedActiveDistanceStats() && allUmas.size > 0) {
      totalUmasTrained = Array.from(allUmas.values())
        .reduce((total, data: any) => total + (data.count || 0), 0);
    }
    const result = Array.from(allUmas.entries())
      .map(([umaName, data]) => {
        const imageUrl = this.getCharacterImageUrl(data.character_id || umaName);
        // Calculate percentage: what percentage of trained Uma Musume were this character
        const percentage = totalUmasTrained > 0 ? (data.count / totalUmasTrained) * 100 : 0;
        return {
          label: data.name || this.resolveCharacterName(umaName, data),
          value: data.count,
          percentage: percentage,
          imageUrl: imageUrl,
          id: data.character_id || umaName,
          character_color: data.character_color
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
    return result;
  }
  // Generate single-series Skills data with images (for image list display)
  private computeTopSkillsWithImages(): ChartDataPoint[] {
    return this.buildSkillImageData(
      this.getGlobalMetricMaps('skills'),
      this.getGlobalTotalUmasTrained()
    );
  }
  // Helper method to get skill icon URL
  private getSkillIconUrl(skillName: string): string {
    // Try to find the skill by name in the SKILLS data
    let exactMatch = SKILLS.find(skill => skill.name === skillName);
    if (exactMatch?.icon) {
      return `/assets/images/skills/${exactMatch.icon}`;
    }
    // Handle inherited skills by stripping "(Inherited)" suffix and looking for base skill
    if (skillName.includes('(Inherited)')) {
      const baseSkillName = skillName.replace(/\s*\(Inherited\)$/, '').trim();
      const baseSkillMatch = SKILLS.find(skill => skill.name === baseSkillName);
      if (baseSkillMatch?.icon) {
        return `/assets/images/skills/${baseSkillMatch.icon}`;
      }
    }
    // Fallback approach: use normalized name-based pattern
    const normalizedName = skillName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    return `/assets/images/skills/${normalizedName}.png`;
  }
  private getSkillIconFromName(skillName: string): string {
    return this.getSkillIconUrl(skillName);
  }
  // Utility methods for missing functionality
  private getRandomColor(): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  private getStableColor(input: string, index?: number): string {
    const color = this.colorsService.getHashBasedColor(input);
    return color || this.getRandomColor();
  }
  private formatStatBucketLabel(bucket: string): string {
    // Format stat bucket labels (e.g., "500-600" -> "500-600")
    return bucket;
  }
  private extractBucketValue(label: string): number {
    // Extract numeric value from bucket label for sorting
    const match = label.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }
  private computeCharacterClassStackedData(characterId: string): any[] {
    const cacheKey = this.generateCacheKey('characterClassStacked', characterId, this.classFilters, this.scenarioFilters, this.distanceFilters);
    return this.getCachedData(cacheKey, () => {
      const character = this.characterStats[characterId];
      if (!character?.by_distance) return [];
      const activeClasses = this.getActiveClassIds();
      const classData = new Map<string, number>();
      this.getFilteredCharacterDistanceEntries(character).forEach(([, distanceData]: [string, any]) => {
        if (distanceData.by_team_class) {
          activeClasses.forEach(classId => {
            const dataList = this.getMetricData('', classId, distanceData);
            dataList.forEach(data => {
              if (data) {
                const current = classData.get(classId) || 0;
                const count = data.total_entries || data.count || data.total || 0;
                classData.set(classId, current + count);
              }
            });
          });
        }
      });
      if (classData.size === 0) return [];
      return Array.from(classData.entries())
        .map(([classId, count]) => ({
          name: `Class ${classId}`,
          data: [{
            x: this.getSelectedCharacterName() || 'Character',
            y: count
          }],
          backgroundColor: this.colorsService.getClassColor(classId) + 'CC',
          borderColor: this.colorsService.getClassColor(classId),
          borderWidth: 2,
          borderRadius: 4,
          borderSkipped: false
        }))
        .sort((a, b) => parseInt(a.name.split(' ')[1]) - parseInt(b.name.split(' ')[1]));
    });
  }
  // Template methods for character charts
  getCharacterClassStackedData(): any[] {
    return this.characterClassData$.value;
  }
  getCharacterStatComparisonData(): any[] {
    return this.characterStatComparisonData$.value;
  }
  getCharacterStatHistogramData(stat: string): ChartDataPoint[] {
    switch (stat) {
      case 'speed':
        return this.characterStatHistogramSpeed$.value;
      case 'stamina':
        return this.characterStatHistogramStamina$.value;
      case 'power':
        return this.characterStatHistogramPower$.value;
      case 'guts':
        return this.characterStatHistogramGuts$.value;
      case 'wiz':
        return this.characterStatHistogramWiz$.value;
      default:
        return [];
    }
  }
  getCharacterSupportCardCombinations(): ChartDataPoint[] {
    return this.characterSupportCardCombinationsData$.value;
  }
  // Character-specific methods for template
  getCharacterCardTypeDistribution(): ChartDataPoint[] {
    if (!this.selectedCharacterDetail || !this.characterStats[this.selectedCharacterDetail]) return [];
    const character = this.characterStats[this.selectedCharacterDetail];
    const cardTypes = new Map<string, number>();
    const activeClasses = this.getActiveClassIds();
    // Aggregate card type data across all distances for this character from ACTIVE classes only
    if (character.by_distance) {
      this.getFilteredCharacterDistanceEntries(character).forEach(([, distanceData]: [string, any]) => {
        activeClasses.forEach(classId => {
          const dataList = this.getMetricData('', classId, distanceData);
          dataList.forEach(classData => {
            if (classData?.support_cards) {
              Object.entries(classData.support_cards).forEach(([cardId, data]: [string, any]) => {
                const cardType = this.resolveSupportCardInfo(cardId, data).type || 'Other';
                const current = cardTypes.get(cardType) || 0;
                cardTypes.set(cardType, current + this.getEntryCount(data));
              });
            }
          });
        });
      });
    }
    return Array.from(cardTypes.entries())
      .map(([type, count]) => ({
        label: type,
        value: count,
        color: this.getCardTypeColor(type)
      }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }
  // Distance-specific image list methods
  private computeDistanceUmasWithImages(distance: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('distanceUmasWithImages', distance, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      if (!distanceData?.by_team_class) return [];
      // Calculate total Uma Musume trained only from selected/active classes for this distance
      const activeClasses = this.getActiveClassIds();
      let totalUmasTrained = 0;
      // Use the correct field names from distance data structure (same as support cards method)
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          if (classData?.total_trained_umas !== undefined) {
            totalUmasTrained += classData.total_trained_umas;
          } else if (classData?.total_entries !== undefined) {
            totalUmasTrained += classData.total_entries;
          } else if (classData?.trainer_count !== undefined) {
            totalUmasTrained += classData.trainer_count;
          }
        });
      });
      // Aggregate Uma data from distance classes
      const allUmas = new Map<string, any>();
      // Aggregate Uma data from active classes in by_team_class structure
      activeClasses.forEach(classId => {
        const dataList = this.getMetricData('', classId, distanceData);
        
        dataList.forEach(classData => {
          if (classData?.uma_distribution) {
            Object.entries(classData.uma_distribution).forEach(([umaName, data]: [string, any]) => {
              const count = this.getEntryCount(data);
              const characterId = this.resolveCharacterId(umaName, data);
              const key = characterId || umaName;
              const existing = allUmas.get(key) || {
                count: 0,
                name: this.resolveCharacterName(umaName, data),
                character_id: characterId,
                character_color: data?.character_color
              };
              allUmas.set(key, {
                count: existing.count + count,
                name: existing.name,
                character_id: characterId || existing.character_id,
                character_color: data?.character_color || existing.character_color
              });
            });
          }
        });
      });
      // Convert to ChartDataPoint with images and sort to get top 20
      const result = Array.from(allUmas.entries())
        .map(([umaName, data]) => {
          const imageUrl = this.getCharacterImageUrl(data.character_id || umaName);
          // Calculate percentage: what percentage of trained Uma Musume were this character
          const percentage = totalUmasTrained > 0 ? (data.count / totalUmasTrained) * 100 : 0;
          return {
            label: data.name || this.resolveCharacterName(umaName, data),
            value: data.count,
            percentage: percentage,
            imageUrl: imageUrl,
            id: data.character_id || umaName,
            character_color: data.character_color
          };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 20);
      return result;
    }); // Close the getCachedData callback
  }
  private computeDistanceSkillsWithImages(distance: string): ChartDataPoint[] {
    const cacheKey = this.generateCacheKey('distanceSkillsWithImages', distance, this.classFilters, this.scenarioFilters);
    return this.getCachedData(cacheKey, () => {
      const distanceData = this.distanceStats[distance];
      return this.buildSkillImageData(
        this.getDistanceMetricMaps(distanceData, 'skills'),
        this.getDistanceTotalUmasTrained(distanceData)
      );
    }); // Close the getCachedData callback
  }
  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
