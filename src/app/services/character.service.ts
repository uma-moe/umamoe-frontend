import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, filter, take } from 'rxjs/operators';
import { Character } from '../models/character.model';
import { getAllCharacters } from '../data/character.data';
import { MasterDataService } from './master-data.service';
@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  private charactersSubject = new BehaviorSubject<Character[]>([]);
  public characters$ = this.charactersSubject.asObservable();
  constructor(private masterData: MasterDataService) {
    // Load characters from bundled data immediately
    this.charactersSubject.next(getAllCharacters());
    this.masterData.init();
    this.masterData.characters$.subscribe(characters => this.charactersSubject.next(characters));
  }
  getCharacters(): Observable<Character[]> {
    return this.characters$;
  }
  getCharacterById(id: number | string): Observable<Character | undefined> {
    return this.characters$.pipe(
      filter(characters => characters.length > 0), // Only emit when characters are loaded
      map(characters => {
        const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
        return characters.find(c => c.id === numericId);
      }),
      take(1) // Complete after first emission
    );
  }
  searchCharacters(query: string): Observable<Character[]> {
    return this.characters$.pipe(
      filter(characters => characters.length > 0),
      map(characters => characters.filter(character =>
        character.name.toLowerCase().includes(query.toLowerCase()) ||
        character.id.toString().includes(query)
      ))
    );
  }
  /**
   * Get characters that have been released globally by a specific date
   * Uses the timeline calculation logic similar to the timeline service
   * Includes a 2-day grace period for upcoming releases
   */
  getReleasedCharacters(cutoffDate?: Date, gracePeriodDays: number = 2): Observable<Character[]> {
    const globalReleaseDate = new Date('2025-06-26'); // Global game launch
    const baseCutoffDate = cutoffDate || new Date(); // Default to today
    
    // Add grace period to the cutoff date
    const effectiveCutoffDate = new Date(baseCutoffDate);
    effectiveCutoffDate.setDate(effectiveCutoffDate.getDate() + gracePeriodDays);
    
    return this.characters$.pipe(
      filter(characters => characters.length > 0),
      map(characters => {
        const releaseDatesAreGlobal = this.hasGlobalReleaseDates(characters, globalReleaseDate);
        return characters.filter(character => {
          const releaseDate = new Date(character.release_date);
          if (isNaN(releaseDate.getTime())) return false;

          if (releaseDatesAreGlobal) {
            return releaseDate <= effectiveCutoffDate;
          }

          const estimatedGlobalDate = this.calculateGlobalReleaseDate(releaseDate, globalReleaseDate);
          return estimatedGlobalDate <= effectiveCutoffDate;
        });
      })
    );
  }

  private hasGlobalReleaseDates(characters: Character[], globalLaunchDate: Date): boolean {
    const releaseDates = characters
      .map(character => new Date(character.release_date))
      .filter(releaseDate => !isNaN(releaseDate.getTime()));

    return releaseDates.length > 0 && releaseDates.every(releaseDate => releaseDate >= globalLaunchDate);
  }

  /**
   * Calculate estimated global release date based on timeline service logic
   * This mirrors the calculation used in timeline.service.ts
   */
  private calculateGlobalReleaseDate(jpDate: Date, globalLaunchDate: Date): Date {
    const jpLaunchDate = new Date('2021-02-24'); // JP game launch
    const catchupRate = 1 / 1.42; // Global is catching up at 1.6x speed
    
    // Days since JP launch
    const daysSinceJpLaunch = Math.floor((jpDate.getTime() - jpLaunchDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate adjusted days for global (faster release schedule)
    const adjustedDays = Math.floor(daysSinceJpLaunch * catchupRate);
    
    // Global release date = Global launch + adjusted days
    const globalDate = new Date(globalLaunchDate);
    globalDate.setDate(globalDate.getDate() + adjustedDays);
    
    return globalDate;
  }
}
