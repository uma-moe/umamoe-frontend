import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type WhiteSparkSectionKey = 'scenario' | 'normal' | 'race';

/**
 * Shared UI state for inheritance entries.
 *
 * Inheritance records are rendered as separate OnPush components, so section
 * state must live above an individual card to keep every visible entry aligned.
 */
@Injectable({
  providedIn: 'root',
})
export class InheritanceDisplayStateService {
  private readonly collapsedWhiteSectionsSubject =
    new BehaviorSubject<ReadonlySet<WhiteSparkSectionKey>>(new Set());

  readonly collapsedWhiteSections$ = this.collapsedWhiteSectionsSubject.asObservable();

  isWhiteSectionCollapsed(section: WhiteSparkSectionKey): boolean {
    return this.collapsedWhiteSectionsSubject.value.has(section);
  }

  toggleWhiteSection(section: WhiteSparkSectionKey): void {
    const collapsed = new Set(this.collapsedWhiteSectionsSubject.value);
    if (collapsed.has(section)) {
      collapsed.delete(section);
    } else {
      collapsed.add(section);
    }
    this.collapsedWhiteSectionsSubject.next(collapsed);
  }
}
