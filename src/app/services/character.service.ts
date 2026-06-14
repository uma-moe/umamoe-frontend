import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, filter, take } from 'rxjs/operators';
import { Character } from '../models/character.model';
import { MasterDataService } from './master-data.service';
import { ResourceLoadError } from './resource-data.service';
@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  constructor(private masterData: MasterDataService) {
    this.masterData.init();
  }

  get characters$(): Observable<Character[]> {
    return this.masterData.characters$;
  }

  get resourcesPending$(): Observable<boolean> {
    return this.masterData.charactersPending$;
  }

  get resourceError$(): Observable<ResourceLoadError | null> {
    return this.masterData.charactersError$;
  }

  get resourcesUsingCachedData$(): Observable<boolean> {
    return this.masterData.charactersUsingCachedData$;
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
   * Get characters marked as globally released by the resource data.
   */
  getReleasedCharacters(): Observable<Character[]> {
    return this.characters$.pipe(
      filter(characters => characters.length > 0),
      map(characters => characters.filter(character => character.isReleased_en === true))
    );
  }
}
