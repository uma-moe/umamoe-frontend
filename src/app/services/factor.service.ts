import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { MasterDataService } from './master-data.service';
import { ResourceLoadError } from './resource-data.service';
import type { RaceSaddleMapping } from '../data/race-saddle.data';
import factorIconMappingData from '../../data/factor_icon_mapping.json';
import {
  getKnownRaceThumbnailId,
  getRaceThumbnailUrl,
  normalizeRaceName,
} from '../utils/race-image.util';
export interface Factor {
  id: string;
  text: string;
  type: number; // 0=blue, 1=pink, 2,3=white, 4=white scenario, 5=green/unique
}
export interface SparkInfo {
  factorId: string;
  level: number;
  name: string;
  type: number;
}
@Injectable({
  providedIn: 'root'
})
export class FactorService {
  private factors$ = new BehaviorSubject<Factor[]>([]);
  private factorsMap = new Map<string, Factor>();
  private readonly raceThumbnailByName = new Map<string, number>();
  private readonly scenarioNames: Record<number, string> = {
    0: 'URA Finals',
    1: 'Unity Cup',
    2: 'Trackblazer',
    3: 'Trackblazer',
    4: 'Grand Concert',
    5: 'Grand Masters',
    6: 'Project L’Arc',
    7: 'U.A.F.',
    8: 'Great Food Festival',
    9: 'Run! Mecha Umamusume',
    10: 'The Twinkle Legends',
    11: 'Design Your Island',
    12: 'The Everlasting Yukoma Hot Springs',
    13: 'Beyond Dreams',
  };
  private readonly scenarioLogoUrls: Record<number, string> = {
    0: '/assets/images/scenario/ura_finals_logo.png',
    1: '/assets/images/scenario/scenario_logo_002.png',
    2: '/assets/images/scenario/scenario_logo_004.png',
    3: '/assets/images/scenario/scenario_logo_004.png',
    4: '/assets/images/scenario/grand_concert_logo.png',
    5: '/assets/images/scenario/scenario_logo_005.png',
    6: '/assets/images/scenario/scenario_logo_006.png',
    7: '/assets/images/scenario/scenario_logo_007.png',
    8: '/assets/images/scenario/scenario_logo_008.png',
    9: '/assets/images/scenario/scenario_logo_009.png',
    10: '/assets/images/scenario/scenario_logo_010.png',
    11: '/assets/images/scenario/scenario_logo_011.png',
    12: '/assets/images/scenario/scenario_logo_012.png',
    13: '/assets/images/scenario/scenario_logo_013.png',
  };

  constructor(private masterData: MasterDataService) {
    this.masterData.initSupplementalResources();
    this.masterData.factors$.subscribe(factors => this.setFactors(factors));
    this.masterData.raceSaddleData$.subscribe(data => this.setRaceThumbnails(data));
  }

  get resourcesPending$(): Observable<boolean> {
    return this.masterData.factorsPending$;
  }

  get resourceError$(): Observable<ResourceLoadError | null> {
    return this.masterData.factorsError$;
  }

  get resourcesUsingCachedData$(): Observable<boolean> {
    return this.masterData.factorsUsingCachedData$;
  }

  private setFactors(factors: Factor[]): void {
    this.factors$.next(factors);
    // Create a map for quick lookups
    this.factorsMap.clear();
    factors.forEach((factor: Factor) => {
      this.factorsMap.set(factor.id, factor);
    });
  }

  private setRaceThumbnails(data: RaceSaddleMapping): void {
    this.raceThumbnailByName.clear();
    for (const race of data.races) {
      const thumbnailId = Number(race?.thumbnail_id);
      if (!Number.isFinite(thumbnailId) || thumbnailId <= 0) continue;

      for (const name of [race?.name, race?.short_name]) {
        const nameKey = this.normalizeLookupName(name);
        if (nameKey) this.raceThumbnailByName.set(nameKey, thumbnailId);
      }
    }
  }

  /**
   * Resolve the game artwork associated with a non-blue/pink factor.
   * Race factors use their race-title card; skill, unique, and special
   * factors use the icon of the skill applied by that factor.
   */
  getFactorImageUrl(spark: SparkInfo): string | null {
    if (spark.type === 2) {
      return this.getRaceFactorImageUrl(spark) ?? this.getMappedFactorIconUrl(spark);
    }

    if (spark.type === 4) {
      return this.getScenarioFactorImageUrl(spark) ?? this.getMappedFactorIconUrl(spark);
    }

    const mappedIconUrl = this.getMappedFactorIconUrl(spark);
    if (mappedIconUrl) return mappedIconUrl;

    if (spark.type === 3) {
      return spark.factorId === '202160'
          ? '/assets/images/skills/utx_ico_skill_10051.webp'
          : '/assets/images/skills/utx_ico_skill_10011.webp';
    }

    if (spark.type === 5) {
      return '/assets/images/skills/utx_ico_skill_20011.webp';
    }

    return null;
  }

  private getMappedFactorIconUrl(spark: SparkInfo): string | null {
    const filename = (factorIconMappingData as Record<string, string>)[spark.factorId];
    return filename ? this.skillIconUrl(filename) : null;
  }

  private getRaceFactorImageUrl(spark: SparkInfo): string | null {
    let nameKey = this.normalizeLookupName(spark.name);
    const raceNameAliases: Record<string, string> = {
      jdderby: 'japandirtderby',
      jbclclassic: 'jbcladiesclassic',
    };
    nameKey = raceNameAliases[nameKey] ?? nameKey;

    const thumbnailId = this.raceThumbnailByName.get(nameKey)
      ?? getKnownRaceThumbnailId(spark.name);
    return getRaceThumbnailUrl(thumbnailId);
  }

  private getScenarioFactorImageUrl(spark: SparkInfo): string | null {
    const scenarioId = this.getScenarioId(spark);
    return this.getScenarioLogoUrl(scenarioId);
  }

  getScenarioDisplayName(spark: SparkInfo): string {
    const scenarioId = this.getScenarioId(spark);
    return scenarioId === null ? spark.name : this.scenarioNames[scenarioId] ?? spark.name;
  }

  getScenarioLogoUrl(scenarioId: number | null | undefined): string | null {
    return scenarioId == null ? null : this.scenarioLogoUrls[scenarioId] ?? null;
  }

  getScenarioName(scenarioId: number | null | undefined): string {
    return scenarioId == null
      ? 'Unknown scenario'
      : this.scenarioNames[scenarioId] ?? `Scenario ${scenarioId}`;
  }

  private getScenarioId(spark: SparkInfo): number | null {
    const factorId = Number(spark.factorId);
    if (factorId === 300010) return 0;

    const originalScenarioIds: Record<number, number> = {
      300020: 1,
      300030: 3,
      300040: 4,
      300050: 5,
      300060: 6,
    };
    let scenarioId = originalScenarioIds[factorId] ?? null;
    if (factorId >= 310010 && factorId <= 310100) scenarioId = 6;
    else if (factorId >= 310110 && factorId <= 310140) scenarioId = 7;
    else if (factorId >= 310150 && factorId <= 310200) scenarioId = 8;
    else if (factorId >= 310210 && factorId <= 310250) scenarioId = 9;
    else if (factorId === 310260) scenarioId = 10;
    else if (factorId === 310270) scenarioId = 11;
    else if (factorId === 310280) scenarioId = 12;
    else if (factorId === 310290) scenarioId = 13;

    return scenarioId;
  }

  private skillIconUrl(icon: string): string | null {
    const filename = icon.split(/[\\/]/).pop()?.replace(/\.png$/i, '.webp');
    return filename?.startsWith('utx_ico_skill_')
      ? `/assets/images/skills/${filename}`
      : null;
  }

  private normalizeLookupName(value: unknown): string {
    return normalizeRaceName(value);
  }
  /**
   * Resolve a spark ID (factor ID + level) to meaningful information
   * @param sparkId - The spark ID (e.g., "101" for "Speed level 1")
   * @returns SparkInfo with factor name, level, and type
   */
  resolveSpark(sparkId: number): SparkInfo {
    const sparkIdStr = sparkId.toString();
    
    // Extract level (last digit) and base factor ID
    const level = parseInt(sparkIdStr.slice(-1));
    const baseFactorId = sparkIdStr.slice(0, -1);
    
    // Look up the factor in our map
    const factor = this.factorsMap.get(baseFactorId);
    
    if (factor) {
      return {
        factorId: baseFactorId,
        level: level,
        name: factor.text,
        type: factor.type
      };
    } else {
      // Fallback for unknown factors
      return {
        factorId: baseFactorId,
        level: level,
        name: `Unknown Factor ${baseFactorId}`,
        type: -1
      };
    }
  }
  /**
   * Resolve multiple spark IDs
   * @param sparkIds - Array of spark IDs
   * @returns Array of SparkInfo objects
   */
  resolveSparks(sparkIds: number[]): SparkInfo[] {
    // Create a copy before sorting to avoid mutating the original array
    const sortedIds = [...sparkIds].sort((a, b) => {
      const levelA = this.extractLevel(a);
      const levelB = this.extractLevel(b);
      return levelB - levelA;
    });
    return sortedIds.map(sparkId => this.resolveSpark(sparkId));
  }
  /**
   * Extract the level from a spark ID
   * @param sparkId - The spark ID
   * @returns The level number
   */
  private extractLevel(sparkId: number): number {
    const sparkIdStr = sparkId.toString();
    // For spark IDs, the level is typically the last 1-2 digits
    // We need to determine where the base factor ID ends and level begins
    
    // Try to find the factor with longest matching prefix
    let maxMatchLength = 0;
    let level = 1; // default level
    
    for (const factorId of this.factorsMap.keys()) {
      if (sparkIdStr.startsWith(factorId)) {
        if (factorId.length > maxMatchLength) {
          maxMatchLength = factorId.length;
          const levelStr = sparkIdStr.slice(factorId.length);
          level = levelStr ? parseInt(levelStr) : 1;
        }
      }
    }
    
    return level;
  }
  /**
   * Get all factors (for development/debugging)
   */
  getFactors(): Observable<Factor[]> {
    return this.factors$.asObservable();
  }
  /**
   * Check if factors are loaded
   */
  areFactorsLoaded(): boolean {
    return this.factorsMap.size > 0;
  }

  getAllFactors(): Factor[] {
    return this.factors$.getValue();
  }
}
