import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin, of, from } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { 
  StatisticsDataset, 
  StatisticsIndex, 
  GlobalStatistics, 
  DistanceStatistics, 
  CharacterStatistics 
} from '../models/statistics.model';
import * as characterData from '../../data/character.json';
import characterNamesData from '../../data/character_names.json';
import { getAllSupportCards } from '../data/support-cards.data';
import { isIdsStatisticsFormat, isStatisticsV4Format, resolveStatisticsDistance, toStatisticsDistanceFileName } from '../data/statistics-lookup.data';
@Injectable({
  providedIn: 'root'
})
export class StatisticsService {
  private availableDatasets$ = new BehaviorSubject<StatisticsDataset[]>([]);
  private selectedDataset$ = new BehaviorSubject<StatisticsDataset | null>(null);
  private characterNameToIdMap: Map<string, string> = new Map();
  private supportCardNameToIdMap: Map<string, string> = new Map();
  private characterDataLoaded = false;
  private supportCardDataLoaded = false;
  constructor(private http: HttpClient) {
    this.loadAvailableDatasets();
    this.loadCharacterNameMapping();
    this.loadSupportCardNameMapping();
  }
  getAvailableDatasets(): Observable<StatisticsDataset[]> {
    return this.availableDatasets$.asObservable();
  }
  getSelectedDataset(): Observable<StatisticsDataset | null> {
    return this.selectedDataset$.asObservable();
  }
  selectDataset(dataset: StatisticsDataset): void {
    this.selectedDataset$.next(dataset);
  }
  private loadAvailableDatasets(): void {
    // Load the master datasets.json which contains all available datasets
    this.http.get<{ datasets: StatisticsDataset[], last_updated: string }>('assets/statistics/datasets.json')
      .pipe(
        map(response => {
          // Sort datasets by date (newest first)
          const sortedDatasets = response.datasets.sort((a, b) => {
            const dateA = new Date(a.date || (a.index && a.index.generated_at) || 0);
            const dateB = new Date(b.date || (b.index && b.index.generated_at) || 0);
            return dateB.getTime() - dateA.getTime();
          });
          
          return sortedDatasets;
        }),
        catchError(error => {
          console.error('Failed to load statistics datasets:', error);
          return of([]);
        })
      )
      .subscribe(datasets => {
        this.availableDatasets$.next(datasets);
        // Select the newest dataset (first in sorted array)
        if (datasets.length > 0) {
          this.selectedDataset$.next(datasets[0]);
        }
      });
  }
  getGlobalStatistics(dataset?: StatisticsDataset): Observable<GlobalStatistics> {
    const datasetToUse = dataset || this.selectedDataset$.value;
    if (!datasetToUse) {
      throw new Error('No dataset selected');
    }
    const useCompressedAsset = isStatisticsV4Format(datasetToUse);
    const url = `${datasetToUse.basePath}/global/global.json${useCompressedAsset ? '.gz' : ''}`;
    
    
    return this.getJsonAsset<GlobalStatistics>(url, useCompressedAsset).pipe(
      catchError(error => {
        console.error('❌ Failed to load global statistics:', error);
        throw error;
      })
    );
  }
  private getJsonAsset<T>(url: string, compressed: boolean): Observable<T> {
    if (!compressed) {
      return this.http.get<T>(url);
    }

    return this.http.get(url, { responseType: 'arraybuffer' }).pipe(
      switchMap(buffer => from(this.parseJsonBuffer<T>(buffer, url)))
    );
  }
  private async parseJsonBuffer<T>(buffer: ArrayBuffer, url: string): Promise<T> {
    const text = await this.decodeJsonBuffer(buffer, url);
    return JSON.parse(text) as T;
  }
  private async decodeJsonBuffer(buffer: ArrayBuffer, url: string): Promise<string> {
    const bytes = new Uint8Array(buffer);
    const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

    if (!isGzip) {
      return new TextDecoder('utf-8').decode(buffer);
    }

    const DecompressionStreamConstructor = (globalThis as any).DecompressionStream;
    if (!DecompressionStreamConstructor) {
      throw new Error(`This browser cannot decode gzip statistics asset: ${url}`);
    }

    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStreamConstructor('gzip'));
    return new Response(stream).text();
  }
  getDistanceStatistics(distance: string, dataset?: StatisticsDataset): Observable<DistanceStatistics> {
    const datasetToUse = dataset || this.selectedDataset$.value;
    if (!datasetToUse) {
      throw new Error('No dataset selected');
    }

    if (isStatisticsV4Format(datasetToUse)) {
      return this.getGlobalStatistics(datasetToUse).pipe(
        map((globalStats: any) => {
          const distanceStats = this.getEmbeddedDistanceStatistics(globalStats, distance);
          if (!distanceStats) {
            throw new Error(`Distance statistics not available for ${distance}`);
          }
          return distanceStats as DistanceStatistics;
        })
      );
    }

    const distanceFileName = toStatisticsDistanceFileName(distance, isIdsStatisticsFormat(datasetToUse));
    return this.http.get<DistanceStatistics>(
      `${datasetToUse.basePath}/distance/${distanceFileName}.json`
    );
  }
  private getEmbeddedDistanceStatistics(globalStats: any, distance: string): DistanceStatistics | null {
    const byDistance = globalStats?.by_distance;
    if (!byDistance) {
      return null;
    }

    const resolvedDistance = resolveStatisticsDistance(distance);
    const candidateKeys = Array.from(new Set([
      distance,
      resolvedDistance?.id,
      resolvedDistance?.slug
    ].filter(Boolean) as string[]));

    for (const key of candidateKeys) {
      if (byDistance[key]) {
        return byDistance[key] as DistanceStatistics;
      }
    }

    return null;
  }
  private loadCharacterNameMapping(): void {
    // Use character_names.json as name source, character.json for 6-digit card IDs
    
    try {
      const names = characterNamesData as Record<string, { name: string; skins: Record<string, string> }>;
      
      // Handle different ways TypeScript might import character.json
      let characters: any[] = [];
      if (Array.isArray(characterData)) {
        characters = characterData as any[];
      } else if ((characterData as any).default && Array.isArray((characterData as any).default)) {
        characters = (characterData as any).default;
      } else {
        console.error('❌ Character data is not in expected format:', typeof characterData, Object.keys(characterData || {}));
        this.characterDataLoaded = false;
        return;
      }
      this.characterNameToIdMap.clear();
      characters.forEach((character) => {
        if (character.id) {
          const charaId = Math.floor(parseInt(character.id, 10) / 100).toString();
          const nameEntry = names[charaId];
          const name = nameEntry?.name || character.name;
          if (name) {
            this.characterNameToIdMap.set(name, character.id);
          }
        }
      });
      this.characterDataLoaded = true;
      
    } catch (error) {
      console.error('❌ Failed to load character data:', error);
      this.characterDataLoaded = false;
    }
  }
  private loadSupportCardNameMapping(): void {
    try {
      const supportCards = getAllSupportCards();
      this.supportCardNameToIdMap.clear();
      
      supportCards.forEach(card => {
        if (card.name && card.id) {
          this.supportCardNameToIdMap.set(card.name, card.id);
        }
      });
      
      this.supportCardDataLoaded = true;
      
    } catch (error) {
      console.error('Failed to load support card data:', error);
      this.supportCardDataLoaded = false;
    }
  }
  getCharacterStatistics(characterNameOrId: string, dataset?: StatisticsDataset): Observable<CharacterStatistics> {
    const datasetToUse = dataset || this.selectedDataset$.value;
    if (!datasetToUse) {
      throw new Error('No dataset selected');
    }
    let characterId: string;
    // Check if the input is already a character ID (numeric)
    if (/^\d+$/.test(characterNameOrId)) {
      characterId = characterNameOrId;
    } else {
      // Get character ID from name mapping
      const mappedId = this.characterNameToIdMap.get(characterNameOrId);
      if (!mappedId) {
        console.error(`❌ Character ID not found for name: ${characterNameOrId}`);
        throw new Error(`Character ID not found for name: ${characterNameOrId}`);
      }
      characterId = mappedId;
    }
    // Check if character ID exists in statistics dataset
    if (!datasetToUse.index.character_ids?.includes(characterId)) {
      console.error(`❌ Character statistics not available for: ${characterNameOrId} (${characterId})`);
      throw new Error(`Character statistics not available for: ${characterNameOrId} (${characterId})`);
    }
    const useCompressedAsset = isStatisticsV4Format(datasetToUse);
    const url = `${datasetToUse.basePath}/characters/${characterId}.json${useCompressedAsset ? '.gz' : ''}`;
    return this.getJsonAsset<CharacterStatistics>(url, useCompressedAsset).pipe(
      catchError(error => {
        console.error(`❌ Failed to load character statistics for ${characterNameOrId} (${characterId}):`, error);
        throw error;
      })
    );
  }
  isCharacterDataLoaded(): boolean {
    return this.characterDataLoaded;
  }
  isCharacterStatisticsAvailable(characterName: string, dataset?: StatisticsDataset): boolean {
    const datasetToUse = dataset || this.selectedDataset$.value;
    if (!datasetToUse || !this.characterDataLoaded) {
      return false;
    }
    const characterId = this.characterNameToIdMap.get(characterName);
    if (!characterId) {
      return false;
    }
    return datasetToUse.index.character_ids?.includes(characterId) || false;
  }
  getCharacterIdFromName(characterName: string): string | null {
    return this.characterNameToIdMap.get(characterName) || null;
  }
  getSupportCardIdFromName(supportCardName: string): string | null {
    return this.supportCardNameToIdMap.get(supportCardName) || null;
  }
  getAvailableCharacters(dataset?: StatisticsDataset): string[] {
    const datasetToUse = dataset || this.selectedDataset$.value;
    return datasetToUse?.index.character_ids || [];
  }
  getAvailableDistances(dataset?: StatisticsDataset): string[] {
    const datasetToUse = dataset || this.selectedDataset$.value;
    return datasetToUse?.index.distances || [];
  }
}
