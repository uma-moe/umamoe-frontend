import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { UqlFilterComponent } from './uql-filter.component';
import type { UqlSnippet } from '../database-filter.component';
import type { UqlSuggestion, UqlValidationIssue } from './uql-filter.component';

/**
 * Lazy boundary for CodeMirror and the UQL editor.
 *
 * Keeping this wrapper separate prevents the editor's sizeable dependency
 * graph from entering the default inheritance-route chunk.
 */
@Component({
  selector: 'app-uql-filter-deferred',
  standalone: true,
  imports: [UqlFilterComponent],
  template: `
    <app-uql-filter
      [query]="query"
      [validationState]="validationState"
      [validationMessage]="validationMessage"
      [validationIssue]="validationIssue"
      [snippets]="snippets"
      [suggestions]="suggestions"
      (queryChange)="queryChange.emit($event)"
      (clear)="clear.emit()"
      (insertSnippet)="insertSnippet.emit($event)">
    </app-uql-filter>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UqlFilterDeferredComponent {
  @Input() query = '';
  @Input() validationState: 'empty' | 'valid' | 'incomplete' | 'invalid' = 'empty';
  @Input() validationMessage = '';
  @Input() validationIssue: UqlValidationIssue | null = null;
  @Input() snippets: UqlSnippet[] = [];
  @Input() suggestions: UqlSuggestion[] = [];

  @Output() queryChange = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();
  @Output() insertSnippet = new EventEmitter<string>();
}
