import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { UqlCodeEditorComponent, UqlCompletionResult } from './uql-code-editor.component';

type UqlValidationState = 'empty' | 'valid' | 'incomplete' | 'invalid';
export type UqlSuggestionKind = 'field' | 'operator' | 'function' | 'keyword' | 'value' | 'snippet' | 'punctuation';
export type UqlValueContext = 'character' | 'legacy' | 'support-card' | 'race-saddle' | 'blue-factor' | 'pink-factor' | 'green-factor' | 'white-factor' | 'number' | 'text';
export type UqlScopeContext = 'main' | 'gp1' | 'gp2' | 'any-gp';
export type UqlFieldType = 'number' | 'string' | 'array' | 'directive';
export type UqlHighlightKind = 'keyword' | 'function' | 'field' | 'operator' | 'number' | 'string' | 'paren' | 'identifier' | 'text' | 'punct' | 'ghost' | 'cursor';
export interface UqlHighlightSegment {
  text: string;
  displayText?: string;
  kind: UqlHighlightKind;
  sourceStart?: number;
  sourceEnd?: number;
  atomic?: boolean;
  depth?: number;
  imageUrl?: string;
  title?: string;
  valueContext?: UqlValueContext;
  scopeContext?: UqlScopeContext;
  rarityClass?: string;
  badgeText?: string;
  badgeClass?: string;
}

export interface UqlSnippet {
  label: string;
  insertText: string;
}

interface UqlDocSnippet {
  text: string;
  segments: UqlHighlightSegment[];
}

interface UqlKnownSuggestionCandidate {
  candidate: string;
  lowerCandidate: string;
  displayText?: string;
  suggestion: UqlSuggestion;
}

export interface UqlSuggestion {
  label: string;
  insertText: string;
  kind: UqlSuggestionKind;
  detail?: string;
  searchText?: string;
  matchPhrases?: string[];
  priority?: number;
  valueContext?: UqlValueContext;
  scopeContext?: UqlScopeContext;
  backendValue?: string;
  imageUrl?: string;
  rarityClass?: string;
  badgeText?: string;
  badgeClass?: string;
  fieldType?: UqlFieldType;
  cursorOffset?: number;
}

@Component({
  selector: 'app-uql-filter',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    ScrollingModule,
    UqlCodeEditorComponent
  ],
  templateUrl: './uql-filter.component.html',
  styleUrl: './uql-filter.component.scss'
})
export class UqlFilterComponent implements AfterViewInit, OnDestroy {
  @ViewChild('queryInput') queryInput?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('highlightLayer') highlightLayer?: ElementRef<HTMLElement>;
  @ViewChild('suggestionViewport') suggestionViewport?: CdkVirtualScrollViewport;
  private _query = '';
  @Input()
  set query(value: string) {
    this._query = this.normalizeEditableSparkIds(this.stripFixedWhere(value || '')).query;
  }
  get query(): string {
    return this._query;
  }
  @Input() validationState: UqlValidationState = 'empty';
  @Input() validationMessage = '';
  @Input() snippets: UqlSnippet[] = [];
  private _suggestions: UqlSuggestion[] = [];
  @Input()
  set suggestions(value: UqlSuggestion[]) {
    this._suggestions = value || [];
    this.tokenizeCache = null;
    this.knownSuggestionBuckets = new WeakMap<UqlKnownSuggestionCandidate[], Map<string, UqlKnownSuggestionCandidate[]>>();
    this.rebuildHighlightLookups();
    this.rebuildFieldSuggestionPhraseIndex();
    this.rebuildSuggestionSearchIndex();
    const normalized = this.normalizeEditableSparkIds(this._query);
    if (normalized.changed) {
      this._query = normalized.query;
      queueMicrotask(() => this.queryChange.emit(this._query));
    }
    this.refreshDocSnippets();
  }
  get suggestions(): UqlSuggestion[] {
    return this._suggestions;
  }
  @Output() queryChange = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();
  @Output() insertSnippet = new EventEmitter<string>();
  visibleSuggestions: UqlSuggestion[] = [];
  atomicCaretStyle: Record<string, string> | null = null;
  protected readonly simplePredicateDocSnippets = [
    this.createDocSnippet('Speed >= 3 and Wins >= 30'),
    this.createDocSnippet('White count >= 12'),
    this.createDocSnippet('target = Special Week'),
    this.createDocSnippet('Characters in (Special Week, Silence Suzuka)'),
    this.createDocSnippet('Support card = Kitasan Black [SSR] (Speed) and limitbreak >= 4')
  ];
  protected readonly globalFactorDocSnippets = [
    this.createDocSnippet('Speed >= 6'),
    this.createDocSnippet('Blue stars >= 9')
  ];
  protected readonly specificSlotDocSnippets = [
    this.createDocSnippet('Main Speed >= 3'),
    this.createDocSnippet('GP1 Turf >= 2')
  ];
  protected readonly slotPrefixDocSnippets = [
    this.createDocSnippet('Main Speed >= 3'),
    this.createDocSnippet('GP Speed >= 3')
  ];
  protected readonly whiteSkillDocSnippets = [
    this.createDocSnippet('Main has Right-Handed ○'),
    this.createDocSnippet('GP has any (Right-Handed ○, Left-Handed ○)'),
    this.createDocSnippet('White factors in (Speed Straight ○ > 3, Corner Recovery ○)'),
    this.createDocSnippet('White factors contains all (Right-Handed ○, Left-Handed ○)'),
    this.createDocSnippet('Grandparent does not have Right-Handed ○'),
    this.createDocSnippet('optional white = Right-Handed ○'),
    this.createDocSnippet('optional white in (Right-Handed ○, Left-Handed ○)'),
    this.createDocSnippet('optional main white in (Right-Handed ○, Left-Handed ○)'),
    this.createDocSnippet('lineage white in (Right-Handed ○, Left-Handed ○)')
  ];
  protected readonly logicDocSnippets = [
    this.createDocSnippet('Characters in (Special Week, Silence Suzuka)'),
    this.createDocSnippet('GP1 character in (Special Week, Silence Suzuka)'),
    this.createDocSnippet('GP characters not in (Special Week, Silence Suzuka)'),
    this.createDocSnippet('Main character in (Special Week, Silence Suzuka)'),
    this.createDocSnippet('Race wins has all (Niigata Junior Stakes)'),
    this.createDocSnippet('Support card = Kitasan Black [SSR] (Speed)'),
    this.createDocSnippet("Trainer name ilike '%name%'"),
    this.createDocSnippet('(Speed >= 3 or Stamina >= 3) and Wins >= 30')
  ];
  protected copiedDocBlock = '';
  private readonly docSnippetGroups = [
    this.simplePredicateDocSnippets,
    this.globalFactorDocSnippets,
    this.specificSlotDocSnippets,
    this.slotPrefixDocSnippets,
    this.whiteSkillDocSnippets,
    this.logicDocSnippets
  ];
  readonly suggestionItemSize = 30;
  private readonly maxSuggestionViewportHeight = 240;
  private suggestionViewportMaxHeight = this.maxSuggestionViewportHeight;
  activeSuggestionIndex = 0;
  editorScrollTop = 0;
  suggestionMenuStyle: Record<string, string> = { left: '56px', top: '38px' };
  animatedPlaceholder = '';
  private suggestionMenuOpen = false;
  private suggestionMenuExplicit = false;
  private blurTimer: ReturnType<typeof setTimeout> | null = null;
  private placeholderTimer: ReturnType<typeof setTimeout> | null = null;
  private docCopyTimer: ReturnType<typeof setTimeout> | null = null;
  private editorFocused = false;
  private placeholderStepIndex = 0;
  private placeholderCharIndex = 0;
  private placeholderDeleting = false;
  private placeholderPauseTicks = 0;
  private placeholderTargetRewind = 0;
  private knownFactorValueCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownCharacterValueCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownLegacyValueCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownSupportCardValueCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownRaceSaddleValueCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownFactorFieldCandidates: UqlKnownSuggestionCandidate[] = [];
  private knownFactorSparkValueCandidates = new Map<string, UqlKnownSuggestionCandidate>();
  private knownSuggestionBuckets = new WeakMap<UqlKnownSuggestionCandidate[], Map<string, UqlKnownSuggestionCandidate[]>>();
  private tokenizeCache: { text: string; segments: UqlHighlightSegment[] } | null = null;
  private activeTokenizeText: string | null = null;
  private activeValueMatchContextCache = new Map<number, { context: UqlValueContext | null; allowAnyFactorContext: boolean; inFactorArrayList: boolean }>();
  private knownFieldNames = new Set<string>();
  private readonly placeholderSteps = [
    { text: 'Speed >= 3', rewindTo: 6 },
    { text: 'Speed >= 3 and Wins >= 30', rewindTo: 16 },
    { text: 'Speed >= 3 and Wins >= 30 and White count >= 12', rewindTo: 0 },
    { text: 'Main Speed >= 3', rewindTo: 5 },
    { text: 'Main Speed >= 3 and Main has Right-Handed ○', rewindTo: 21 },
    { text: 'Main Speed >= 3 and Main has Right-Handed ○ and GP Speed >= 3', rewindTo: 0 },
    { text: 'GP Speed >= 3', rewindTo: 3 },
    { text: 'GP has any (Right-Handed ○, Left-Handed ○)', rewindTo: 7 },
    { text: 'GP has any (Right-Handed ○, Left-Handed ○) and Blue stars >= 9', rewindTo: 0 },
    { text: 'Main character in (Special Week, Silence Suzuka)', rewindTo: 15 },
    { text: "Main character in (Special Week, Silence Suzuka) and Trainer name ilike '%name%'", rewindTo: 0 },
    { text: '(Grandparent Speed >= 3 or GP1 Turf >= 2) and Wins >= 30', rewindTo: 28 },
    { text: '(Grandparent Speed >= 3 or GP1 Turf >= 2) and Wins >= 30 and not Trainer name ilike \'%test%\'', rewindTo: 0 }
  ];

  constructor() {
    this.refreshDocSnippets();
  }

  // ---- Bridge into the embedded CodeMirror editor ----
  readonly tokenizeForEditor = (text: string): UqlHighlightSegment[] => {
    if (this.tokenizeCache?.text === text) return this.tokenizeCache.segments;
    const segments = this.tokenizeQuery(text);
    this.tokenizeCache = { text, segments };
    return segments;
  };

  readonly completeForEditor = (text: string, pos: number): UqlCompletionResult | null => {
    const { suggestions } = this.getMatchingSuggestions(text, pos);
    if (!suggestions.length) return null;
    const range = this.getCompletionRangeForSuggestions(text, pos, suggestions);
    return { from: range.start, to: range.end, options: suggestions };
  };

  onEditorValueChange(next: string): void {
    const value = this.stripFixedWhere(next || '');
    if (value === this._query) return;
    this._query = value;
    this.queryChange.emit(value);
  }

  ngAfterViewInit(): void {
    this.startPlaceholderAnimation();
  }

  ngOnDestroy(): void {
    this.stopPlaceholderAnimation();
    this.clearBlurTimer();
    this.clearDocCopyTimer();
  }

  protected copyDocSnippets(snippets: readonly UqlDocSnippet[], blockKey: string): void {
    const text = snippets.map(snippet => snippet.text).join('\n');
    const copyPromise = navigator.clipboard?.writeText
      ? navigator.clipboard.writeText(text).catch(() => this.copyTextWithFallback(text))
      : this.copyTextWithFallback(text);
    copyPromise.then(() => {
      this.copiedDocBlock = blockKey;
      this.clearDocCopyTimer();
      this.docCopyTimer = setTimeout(() => {
        this.copiedDocBlock = '';
      }, 1400);
    });
  }

  private copyTextWithFallback(text: string): Promise<void> {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return Promise.resolve();
  }

  private clearDocCopyTimer(): void {
    if (!this.docCopyTimer) return;
    clearTimeout(this.docCopyTimer);
    this.docCopyTimer = null;
  }

  get lineNumbers(): number[] {
    const lineCount = Math.max(6, (this.query.match(/\n/g)?.length ?? 0) + 2);
    return Array.from({ length: lineCount }, (_, index) => index + 1);
  }

  get gutterTransform(): string {
    return `translateY(${-this.editorScrollTop}px)`;
  }

  get suggestionViewportHeight(): string {
    return `${Math.min(this.suggestionViewportMaxHeight, Math.max(this.suggestionItemSize, this.visibleSuggestions.length * this.suggestionItemSize))}px`;
  }

  get renderedSegments(): UqlHighlightSegment[] {
    const query = this.query || '';
    const input = this.queryInput?.nativeElement;
    const cursor = input?.selectionStart ?? query.length;
    const selectionEnd = input?.selectionEnd ?? cursor;
    const ghostText = selectionEnd === cursor ? this.inlineCompletion : '';
    const showCursor = this.editorFocused && selectionEnd === cursor;
    if (!ghostText && !showCursor) return this.tokenizeQuery(query);
    return [
      ...this.tokenizeQuery(query.slice(0, cursor), 0),
      ...(showCursor ? [{ text: '\u200b', kind: 'cursor' as const, sourceStart: cursor, sourceEnd: cursor }] : []),
      ...(ghostText ? [{ text: ghostText, kind: 'ghost' as const }] : []),
      ...this.tokenizeQuery(query.slice(cursor), cursor)
    ];
  }

  get inlineCompletion(): string {
    const input = this.queryInput?.nativeElement;
    const query = this.query || '';
    const cursor = input?.selectionStart ?? query.length;
    const selectionEnd = input?.selectionEnd ?? cursor;
    if (selectionEnd !== cursor) return '';
    if (!this.suggestionMenuOpen || !this.visibleSuggestions.length) return '';
    if (this.hasNonWhitespaceAfterCursor(query, cursor) || this.isCursorInsideWrittenToken(query, cursor)) return '';
    const suggestion = this.visibleSuggestions[this.activeSuggestionIndex];
    if (!suggestion) return '';
    const range = this.getSuggestionReplacementRange(query, cursor, suggestion);
    if (suggestion.kind === 'value' && cursor < range.end) return '';
    const token = query.slice(range.start, cursor);
    const candidates = [suggestion.insertText, suggestion.label, suggestion.backendValue]
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (!token.trim()) {
      const preview = this.visibleSuggestions.length ? this.formatInlineCompletionText(candidates[0] || '') : '';
      if (!preview) return '';
      const needsLeadingSpace = range.start === cursor && cursor > 0 && !/[\s(,]$/.test(query.slice(0, cursor));
      return `${needsLeadingSpace ? ' ' : ''}${preview}`;
    }
    const match = candidates.find(candidate => candidate.toLowerCase().startsWith(token.toLowerCase()));
    if (!match) return '';
    return this.formatInlineCompletionText(match.slice(token.length));
  }

  private formatInlineCompletionText(text: string): string {
    return text.replace(/\s+$/g, '');
  }

  private startPlaceholderAnimation(): void {
    if (this.placeholderTimer || this.editorFocused || this.query) return;
    if (!this.animatedPlaceholder && this.placeholderCharIndex === 0) {
      this.placeholderStepIndex = this.placeholderStepIndex % this.placeholderSteps.length;
      this.placeholderCharIndex = 0;
      this.placeholderDeleting = false;
      this.placeholderPauseTicks = 2;
      this.placeholderTargetRewind = 0;
    }
    this.schedulePlaceholderTick(this.randomDelay(120, 260));
  }

  private stopPlaceholderAnimation(): void {
    if (this.placeholderTimer) {
      clearTimeout(this.placeholderTimer);
      this.placeholderTimer = null;
    }
    this.animatedPlaceholder = '';
  }

  private schedulePlaceholderTick(delay: number): void {
    this.placeholderTimer = setTimeout(() => this.tickPlaceholderAnimation(), delay);
  }

  private tickPlaceholderAnimation(): void {
    this.placeholderTimer = null;
    if (this.editorFocused || this.query) {
      this.animatedPlaceholder = '';
      return;
    }

    const step = this.placeholderSteps[this.placeholderStepIndex];
    if (this.placeholderPauseTicks > 0) {
      this.placeholderPauseTicks--;
    } else if (this.placeholderDeleting) {
      this.placeholderCharIndex = Math.max(this.placeholderTargetRewind, this.placeholderCharIndex - 1);
      if (this.placeholderCharIndex === this.placeholderTargetRewind) {
        this.placeholderDeleting = false;
        this.placeholderStepIndex = (this.placeholderStepIndex + 1) % this.placeholderSteps.length;
        const nextStep = this.placeholderSteps[this.placeholderStepIndex];
        this.placeholderCharIndex = Math.min(this.placeholderCharIndex, nextStep.text.length);
        this.placeholderPauseTicks = this.placeholderCharIndex === 0 ? this.randomInt(1, 3) : this.randomInt(2, 6);
      }
    } else {
      this.placeholderCharIndex = Math.min(step.text.length, this.placeholderCharIndex + 1);
      if (this.placeholderCharIndex === step.text.length) {
        this.placeholderDeleting = true;
        this.placeholderTargetRewind = this.getPlaceholderRewindTarget(step.rewindTo, step.text.length);
        this.placeholderPauseTicks = this.randomInt(7, 15);
      }
    }

    this.animatedPlaceholder = this.placeholderSteps[this.placeholderStepIndex].text.slice(0, this.placeholderCharIndex);
    const nextDelay = this.placeholderPauseTicks > 0
      ? this.randomDelay(90, 180)
      : this.placeholderDeleting
        ? this.randomDelay(18, 46)
        : this.randomDelay(34, 92);
    this.schedulePlaceholderTick(nextDelay);
  }

  private getPlaceholderRewindTarget(preferredRewind: number, textLength: number): number {
    if (preferredRewind > 0) return Math.min(preferredRewind, Math.max(0, textLength - 1));
    if (Math.random() < 0.65 && textLength > 18) {
      return this.randomInt(Math.floor(textLength * 0.18), Math.floor(textLength * 0.58));
    }
    return 0;
  }

  private randomDelay(min: number, max: number): number {
    return this.randomInt(min, max);
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private stripFixedWhere(value: string): string {
    return value.replace(/^\s*where\b\s*/i, '');
  }

  private normalizeEditableSparkIds(query: string, selectionStart = query.length, selectionEnd = selectionStart): { query: string; selectionStart: number; selectionEnd: number; changed: boolean } {
    if (!query || this.knownFactorSparkValueCandidates.size === 0) {
      return { query, selectionStart, selectionEnd, changed: false };
    }
    const replacements: Array<{ start: number; end: number; text: string }> = [];
    let quoteCharacter: string | null = null;
    let index = 0;
    while (index < query.length) {
      const character = query[index];
      if (quoteCharacter) {
        if (character === quoteCharacter) quoteCharacter = null;
        index++;
        continue;
      }
      if (character === '\'' || character === '"') {
        quoteCharacter = character;
        index++;
        continue;
      }
      if (!/[0-9]/.test(character)) {
        index++;
        continue;
      }
      const match = this.getKnownNumericValueMatchAt(query, index);
      const label = match?.suggestion.label;
      if (!match || !label || label === match.text || match.text !== match.suggestion.backendValue) {
        index++;
        continue;
      }
      replacements.push({ start: index, end: index + match.text.length, text: label });
      index += match.text.length;
    }
    if (replacements.length === 0) {
      return { query, selectionStart, selectionEnd, changed: false };
    }
    let nextQuery = '';
    let lastIndex = 0;
    for (const replacement of replacements) {
      nextQuery += query.slice(lastIndex, replacement.start);
      nextQuery += replacement.text;
      lastIndex = replacement.end;
    }
    nextQuery += query.slice(lastIndex);
    const mapPosition = (position: number): number => {
      let shift = 0;
      for (const replacement of replacements) {
        if (position <= replacement.start) break;
        if (position < replacement.end) return replacement.start + shift + replacement.text.length;
        shift += replacement.text.length - (replacement.end - replacement.start);
      }
      return position + shift;
    };
    return {
      query: nextQuery,
      selectionStart: mapPosition(selectionStart),
      selectionEnd: mapPosition(selectionEnd),
      changed: true
    };
  }

  get activeSuggestionDetail(): string {
    return this.visibleSuggestions[this.activeSuggestionIndex]?.detail || '';
  }

  get editorPlaceholder(): string {
    if (this.editorFocused) return '';
    return this.animatedPlaceholder;
  }

  get statusIcon(): string {
    switch (this.validationState) {
      case 'valid': return 'check_circle';
      case 'incomplete': return 'pending';
      case 'invalid': return 'error';
      default: return 'radio_button_unchecked';
    }
  }

  get statusLabel(): string {
    switch (this.validationState) {
      case 'valid': return 'Valid';
      case 'incomplete': return 'Incomplete';
      case 'invalid': return 'Invalid';
      default: return 'UQL';
    }
  }

  onQueryInput(value: string): void {
    const input = this.queryInput?.nativeElement;
    const rawSelectionStart = input?.selectionStart ?? value.length;
    const rawSelectionEnd = input?.selectionEnd ?? rawSelectionStart;
    const strippedValue = this.stripFixedWhere(value);
    const strippedOffset = value.length - strippedValue.length;
    const normalized = this.normalizeEditableSparkIds(
      strippedValue,
      Math.max(0, rawSelectionStart - strippedOffset),
      Math.max(0, rawSelectionEnd - strippedOffset)
    );
    const nextValue = normalized.query;
    this._query = nextValue;
    this.queryChange.emit(nextValue);
    if (nextValue) {
      this.stopPlaceholderAnimation();
    } else if (!this.editorFocused) {
      this.startPlaceholderAnimation();
    }
    if (this.suggestionMenuOpen) {
      this.updateVisibleSuggestions();
    } else {
      this.maybeAutoOpenSuggestions();
    }
    queueMicrotask(() => {
      if (normalized.changed) {
        input?.setSelectionRange(normalized.selectionStart, normalized.selectionEnd);
      }
      this.syncHighlightScroll();
      this.updateSuggestionMenuPosition();
      this.updateAtomicCaret();
    });
  }

  onEditorScroll(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.editorScrollTop = target.scrollTop;
    const layer = this.highlightLayer?.nativeElement;
    if (!layer) return;
    layer.scrollTop = target.scrollTop;
    layer.scrollLeft = target.scrollLeft;
    if (this.suggestionMenuOpen) {
      this.updateSuggestionMenuPosition();
    }
    if (this.atomicCaretStyle) {
      this.updateAtomicCaret();
    }
  }

  private syncHighlightScroll(): void {
    const input = this.queryInput?.nativeElement;
    const layer = this.highlightLayer?.nativeElement;
    if (!input || !layer) return;
    layer.scrollTop = input.scrollTop;
    layer.scrollLeft = input.scrollLeft;
  }

  onEditorFocus(): void {
    this.editorFocused = true;
    this.clearBlurTimer();
    this.stopPlaceholderAnimation();
    queueMicrotask(() => this.updateAtomicCaret());
  }

  onEditorCursorChange(): void {
    this.snapCursorOutOfAtomicValue();
    if (this.suggestionMenuOpen) {
      this.updateVisibleSuggestions();
    } else {
      this.maybeAutoOpenSuggestions();
    }
    queueMicrotask(() => {
      this.updateSuggestionMenuPosition();
      this.updateAtomicCaret();
    });
  }

  private maybeAutoOpenSuggestions(): void {
    const input = this.queryInput?.nativeElement;
    const cursor = input?.selectionStart ?? this.query.length;
    if (!this.canShowSuggestionsAtCursor(this.query, cursor, false)) {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      return;
    }
    // Don't auto-open right after a space following a complete predicate without meaningful matches
    const matches = this.getMatchingSuggestions(this.query, cursor).suggestions;
    if (matches.length === 0) {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      return;
    }
    this.suggestionMenuOpen = true;
    this.suggestionMenuExplicit = false;
    this.visibleSuggestions = matches;
    this.activeSuggestionIndex = 0;
    this.updateSuggestionMenuPosition();
    queueMicrotask(() => this.suggestionViewport?.checkViewportSize());
  }

  private isInsideString(text: string): boolean {
    let quote: string | null = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; }
      else if (c === "'" || c === '"') quote = c;
    }
    return quote !== null;
  }

  private canShowSuggestionsAtCursor(query: string, cursor: number, explicit: boolean): boolean {
    if (this.isInsideString(query.slice(0, cursor))) return false;
    if (this.isCursorInsideWrittenToken(query, cursor)) return false;
    if (!explicit && this.hasNonWhitespaceAfterCursor(query, cursor)) return false;
    return true;
  }

  private hasNonWhitespaceAfterCursor(query: string, cursor: number): boolean {
    return /\S/.test(query.slice(cursor));
  }

  private isCursorInsideWrittenToken(query: string, cursor: number): boolean {
    return this.isTokenCharacter(query[cursor - 1]) && this.isTokenCharacter(query[cursor]);
  }

  private isTokenCharacter(character: string | undefined): boolean {
    return !!character && !/[\s(),;=<>!'"\[\]]/.test(character);
  }

  onEditorBlur(): void {
    this.editorFocused = false;
    this.atomicCaretStyle = null;
    this.blurTimer = setTimeout(() => {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      this.startPlaceholderAnimation();
    }, 120);
  }

  onEditorKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
      this.insertLineBreak(event);
      return;
    }
    if (this.handleAtomicValueKeydown(event)) {
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === ' ') {
      event.preventDefault();
      this.openSuggestionMenu();
      return;
    }
    if (event.key === ',' && this.handleArrayCommaKeydown(event)) {
      return;
    }
    if (event.key === '(' && !event.ctrlKey && !event.metaKey && !event.altKey && this.shouldAutoWrapOpeningParen()) {
      this.autoWrap(event, '(', ')');
      return;
    }
    if (event.key === ')' && this.skipClosingParen(event)) {
      return;
    }
    if (!this.visibleSuggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.setActiveSuggestion((this.activeSuggestionIndex + 1) % this.visibleSuggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.setActiveSuggestion((this.activeSuggestionIndex - 1 + this.visibleSuggestions.length) % this.visibleSuggestions.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      this.applySuggestion(this.visibleSuggestions[this.activeSuggestionIndex]);
    } else if (event.key === 'Escape') {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
    }
  }

  private handleArrayCommaKeydown(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    const input = this.queryInput?.nativeElement;
    if (!input) return false;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const prefix = this.query.slice(0, start);
    const { context, inFactorArrayList } = this.getValueMatchContext(prefix);
    if (!context?.endsWith('-factor') || !inFactorArrayList) return false;

    event.preventDefault();
    const suffix = this.query.slice(end);
    const separator = suffix.startsWith(' ') || prefix.endsWith(',') ? ',' : ', ';
    const nextQuery = `${prefix}${separator}${suffix}`;
    const nextCursor = prefix.length + separator.length;
    this.query = nextQuery;
    this.queryChange.emit(nextQuery);
    this.suggestionMenuOpen = true;
    this.suggestionMenuExplicit = true;
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
      this.updateVisibleSuggestions();
      this.updateSuggestionMenuPosition();
    });
    return true;
  }

  private shouldAutoWrapOpeningParen(): boolean {
    const input = this.queryInput?.nativeElement;
    if (!input) return true;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    return start !== end || this.query[start] !== ')';
  }

  private handleAtomicValueKeydown(event: KeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    if (event.key !== 'Backspace' && event.key !== 'Delete' && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
    const input = this.queryInput?.nativeElement;
    if (!input) return false;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (start !== end) return false;

    if (event.key === 'Backspace') {
      const range = this.findAtomicValueRangeAt(this.query, start, false, true);
      if (!range) return false;
      event.preventDefault();
      this.replaceQueryRange(range.start, range.end, '', range.start);
      return true;
    }

    if (event.key === 'Delete') {
      const range = this.findAtomicValueRangeAt(this.query, start, true, false);
      if (!range) return false;
      event.preventDefault();
      this.replaceQueryRange(range.start, range.end, '', range.start);
      return true;
    }

    if (event.key === 'ArrowLeft') {
      const range = this.findAtomicValueRangeAt(this.query, start, false, true);
      if (!range) return false;
      event.preventDefault();
      input.setSelectionRange(range.start, range.start);
      this.onEditorCursorChange();
      return true;
    }

    const range = this.findAtomicValueRangeAt(this.query, start, true, false);
    if (!range) return false;
    event.preventDefault();
    input.setSelectionRange(range.end, range.end);
    this.onEditorCursorChange();
    return true;
  }

  private replaceQueryRange(start: number, end: number, replacement: string, nextCursor: number): void {
    const input = this.queryInput?.nativeElement;
    const nextQuery = `${this.query.slice(0, start)}${replacement}${this.query.slice(end)}`;
    this.query = nextQuery;
    this.queryChange.emit(nextQuery);
    this.visibleSuggestions = [];
    this.suggestionMenuOpen = false;
    this.suggestionMenuExplicit = false;
    queueMicrotask(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
      this.syncHighlightScroll();
      this.updateSuggestionMenuPosition();
      this.updateAtomicCaret();
    });
  }

  private findAtomicValueRangeAt(query: string, cursor: number, includeStart: boolean, includeEnd: boolean): { start: number; end: number } | null {
    let index = 0;
    while (index < query.length) {
      const range = this.getAtomicValueRangeStartingAt(query, index);
      if (range) {
        const afterStart = includeStart ? cursor >= range.start : cursor > range.start;
        const beforeEnd = includeEnd ? cursor <= range.end : cursor < range.end;
        if (afterStart && beforeEnd) return range;
        index = range.end;
        continue;
      }
      index++;
    }
    return null;
  }

  private snapCursorOutOfAtomicValue(): void {
    const input = this.queryInput?.nativeElement;
    if (!input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (start !== end) return;
    const range = this.findAtomicValueRangeAt(this.query, start, false, false);
    if (!range) return;
    const distanceToStart = start - range.start;
    const distanceToEnd = range.end - start;
    const nextCursor = distanceToStart <= distanceToEnd ? range.start : range.end;
    input.setSelectionRange(nextCursor, nextCursor);
    this.updateAtomicCaret();
  }

  private updateAtomicCaret(): void {
    const input = this.queryInput?.nativeElement;
    const layer = this.highlightLayer?.nativeElement;
    this.atomicCaretStyle = null;
    if (!input || !layer || input.ownerDocument.activeElement !== input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    if (start !== end) return;
    const markerElement = layer.querySelector<HTMLElement>('.uql-token-cursor');
    const editorElement = layer.parentElement;
    if (!markerElement || !editorElement) return;
    const markerRect = markerElement.getBoundingClientRect();
    const editorRect = editorElement.getBoundingClientRect();
    const lineHeight = parseFloat(input.ownerDocument.defaultView?.getComputedStyle(markerElement).lineHeight || '') || markerRect.height || 16;
    this.atomicCaretStyle = {
      left: `${markerRect.left - editorRect.left}px`,
      top: `${markerRect.top - editorRect.top}px`,
      height: `${lineHeight}px`
    };
  }

  onEditorPointerUp(): void {
    // Snap only on mouse-driven cursor placement; keyboard navigation uses handleAtomicValueKeydown.
    queueMicrotask(() => {
      this.snapCursorOutOfAtomicValue();
      this.updateAtomicCaret();
    });
  }

  private getAtomicValueRangeStartingAt(query: string, index: number): { start: number; end: number } | null {
    const match = this.getKnownValueMatchAt(query, index) || this.getKnownNumericValueMatchAt(query, index);
    if (!match || !match.suggestion.valueContext || (match.suggestion.valueContext !== 'character' && match.suggestion.valueContext !== 'legacy' && match.suggestion.valueContext !== 'support-card' && match.suggestion.valueContext !== 'race-saddle' && !match.suggestion.valueContext.endsWith('-factor'))) {
      return null;
    }
    return { start: index, end: index + match.text.length };
  }

  private insertLineBreak(event: KeyboardEvent): void {
    const input = this.queryInput?.nativeElement;
    if (!input) return;
    event.preventDefault();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const nextQuery = `${this.query.slice(0, start)}\n${this.query.slice(end)}`;
    const nextCursor = start + 1;
    this.query = nextQuery;
    this.queryChange.emit(nextQuery);
    this.visibleSuggestions = [];
    this.suggestionMenuOpen = false;
    this.suggestionMenuExplicit = false;
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(nextCursor, nextCursor);
      this.syncHighlightScroll();
    });
  }

  setActiveSuggestion(index: number): void {
    if (!this.visibleSuggestions.length) return;
    this.activeSuggestionIndex = Math.max(0, Math.min(index, this.visibleSuggestions.length - 1));
    this.suggestionViewport?.scrollToIndex(this.activeSuggestionIndex, 'smooth');
    this.updateSuggestionMenuPosition();
  }

  private autoWrap(event: KeyboardEvent, open: string, close: string): void {
    const input = this.queryInput?.nativeElement;
    if (!input) return;
    event.preventDefault();
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? start;
    const selected = this.query.slice(start, end);
    const insert = `${open}${selected}${close}`;
    const next = `${this.query.slice(0, start)}${insert}${this.query.slice(end)}`;
    const caret = start + open.length + selected.length;
    this.query = next;
    this.queryChange.emit(next);
    this.visibleSuggestions = [];
    this.suggestionMenuOpen = false;
    this.suggestionMenuExplicit = false;
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  }

  private skipClosingParen(event: KeyboardEvent): boolean {
    const input = this.queryInput?.nativeElement;
    if (!input) return false;
    const cursor = input.selectionStart ?? 0;
    if (input.selectionEnd !== cursor) return false;
    if (this.query[cursor] !== ')') return false;
    event.preventDefault();
    this.visibleSuggestions = [];
    this.suggestionMenuOpen = false;
    this.suggestionMenuExplicit = false;
    const next = cursor + 1;
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(next, next);
    });
    return true;
  }

  applySuggestion(suggestion: UqlSuggestion): void {
    this.clearBlurTimer();
    const input = this.queryInput?.nativeElement;
    const query = this.query || '';
    const cursor = input?.selectionStart ?? query.length;
    const range = this.getSuggestionReplacementRange(query, cursor, suggestion);
    const prefix = query.slice(0, range.start);
    const suffix = query.slice(range.end);
    const needsLeadingSpace = prefix.length > 0 && !/[\s(,]$/.test(prefix);
    const needsTrailingSpace = suffix.length > 0 && !/^[\s),;]/.test(suffix);
    const insertValue = this.getSuggestionInsertText(suggestion);
    const insertText = `${needsLeadingSpace ? ' ' : ''}${insertValue}${needsTrailingSpace ? ' ' : ''}`;
    const nextQuery = `${prefix}${insertText}${suffix}`;
    const baseCursor = prefix.length + insertText.length;
    const nextCursor = Math.max(prefix.length, Math.min(nextQuery.length, baseCursor + (suggestion.cursorOffset ?? 0)));
    this.query = nextQuery;
    this.queryChange.emit(nextQuery);
    this.visibleSuggestions = [];
    this.suggestionMenuOpen = false;
    this.suggestionMenuExplicit = false;
    queueMicrotask(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
      this.syncHighlightScroll();
      this.updateAtomicCaret();
    });
  }

  private getSuggestionInsertText(suggestion: UqlSuggestion): string {
    return suggestion.insertText;
  }

  private updateVisibleSuggestions(): void {
    if (!this.suggestionMenuOpen) return;
    const input = this.queryInput?.nativeElement;
    const query = this.query || '';
    const cursor = input?.selectionStart ?? query.length;
    if (!this.canShowSuggestionsAtCursor(query, cursor, this.suggestionMenuExplicit)) {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      return;
    }
    const matchingSuggestions = this.getMatchingSuggestions(query, cursor).suggestions;
    this.visibleSuggestions = matchingSuggestions;
    if (this.visibleSuggestions.length === 0) {
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      return;
    }
    if (this.activeSuggestionIndex >= this.visibleSuggestions.length) {
      this.activeSuggestionIndex = 0;
    }
    this.updateSuggestionMenuPosition();
    queueMicrotask(() => this.suggestionViewport?.checkViewportSize());
  }

  // ---- Syntax highlighting overlay ----
  private readonly highlightKeywords = new Set(['where', 'and', 'or', 'not', 'in', 'between', 'like', 'ilike', 'is', 'null', 'true', 'false', 'has', 'all', 'any']);
  private readonly highlightFunctions = new Set([
    'contains', 'overlaps', 'has_all', 'contains_all',
    'optional_white', 'optional_main_white', 'optional_any_white', 'lineage_white'
  ]);

  private createDocSnippet(text: string): UqlDocSnippet {
    return { text, segments: [] };
  }

  private refreshDocSnippets(): void {
    for (const group of this.docSnippetGroups) {
      for (const snippet of group) {
        snippet.segments = this.tokenizeQuery(snippet.text);
      }
    }
  }

  private rebuildHighlightLookups(): void {
    const valueCandidates: UqlKnownSuggestionCandidate[] = [];
    const characterCandidates: UqlKnownSuggestionCandidate[] = [];
    const legacyCandidates: UqlKnownSuggestionCandidate[] = [];
    const supportCardCandidates: UqlKnownSuggestionCandidate[] = [];
    const raceSaddleCandidates: UqlKnownSuggestionCandidate[] = [];
    const fieldCandidates: UqlKnownSuggestionCandidate[] = [];
    const factorSparkValueCandidates = new Map<string, UqlKnownSuggestionCandidate>();
    const fieldNames = new Set<string>();
    for (const suggestion of this._suggestions) {
      if (suggestion.kind === 'field') {
        fieldNames.add(suggestion.insertText.toLowerCase().replace(/\./g, '_'));
        fieldNames.add(suggestion.label.toLowerCase());
        if (this.inferSuggestionValueContext(suggestion)) {
          fieldCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
        }
      }
      if (suggestion.kind === 'value' && !!suggestion.valueContext && suggestion.valueContext.endsWith('-factor')) {
        valueCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
        for (const candidate of this.createKnownSparkIdCandidates(suggestion)) {
          if (!factorSparkValueCandidates.has(candidate.candidate)) {
            factorSparkValueCandidates.set(candidate.candidate, candidate);
          }
        }
      }
      if (suggestion.kind === 'value' && suggestion.valueContext === 'character') {
        characterCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
      }
      if (suggestion.kind === 'value' && suggestion.valueContext === 'legacy') {
        legacyCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
      }
      if (suggestion.kind === 'value' && suggestion.valueContext === 'support-card') {
        supportCardCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
      }
      if (suggestion.kind === 'value' && suggestion.valueContext === 'race-saddle') {
        raceSaddleCandidates.push(...this.createKnownSuggestionCandidates(suggestion));
      }
    }
    this.knownFactorValueCandidates = valueCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownCharacterValueCandidates = characterCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownLegacyValueCandidates = legacyCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownSupportCardValueCandidates = supportCardCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownRaceSaddleValueCandidates = raceSaddleCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownFactorFieldCandidates = fieldCandidates.sort((a, b) => b.candidate.length - a.candidate.length);
    this.knownFactorSparkValueCandidates = factorSparkValueCandidates;
    this.knownFieldNames = fieldNames;
  }

  private createKnownSuggestionCandidates(suggestion: UqlSuggestion): UqlKnownSuggestionCandidate[] {
    const candidates: UqlKnownSuggestionCandidate[] = [];
    const seenCandidates = new Set<string>();
    const addCandidate = (candidate: string | undefined, displayText?: string) => {
      if (!candidate || seenCandidates.has(candidate)) return;
      seenCandidates.add(candidate);
      candidates.push({ candidate, lowerCandidate: candidate.toLowerCase(), displayText, suggestion });
    };
    const displayText = suggestion.valueContext === 'support-card' || suggestion.valueContext === 'race-saddle' || suggestion.valueContext === 'legacy' ? suggestion.label : undefined;
    addCandidate(suggestion.label);
    addCandidate(suggestion.insertText, displayText);
    suggestion.matchPhrases?.forEach(phrase => addCandidate(phrase, displayText));
    addCandidate(suggestion.backendValue, displayText);
    return candidates;
  }

  private createKnownSparkIdCandidates(suggestion: UqlSuggestion): UqlKnownSuggestionCandidate[] {
    if (!suggestion.backendValue || !/^\d{2,}$/.test(suggestion.backendValue)) return [];
    const baseId = suggestion.backendValue.slice(0, -1);
    const candidates: UqlKnownSuggestionCandidate[] = [];
    for (let level = 1; level <= 9; level++) {
      const candidate = `${baseId}${level}`;
      candidates.push({
        candidate,
        lowerCandidate: candidate,
        suggestion
      });
    }
    return candidates;
  }

  private tokenizeQuery(text: string, sourceOffset = 0): UqlHighlightSegment[] {
    if (!text) return [];
    const previousTokenizeText = this.activeTokenizeText;
    const previousValueMatchContextCache = this.activeValueMatchContextCache;
    if (sourceOffset === 0) {
      this.activeTokenizeText = text;
      this.activeValueMatchContextCache = new Map();
    }
    const out: UqlHighlightSegment[] = [];
    const len = text.length;
    let i = 0;
    let depth = 0;
    const push = (kind: UqlHighlightKind, value: string, start: number, extra?: Partial<UqlHighlightSegment>) => {
      if (!value) return;
      out.push({ kind, text: value, sourceStart: sourceOffset + start, sourceEnd: sourceOffset + start + value.length, ...extra });
    };
    while (i < len) {
      const c = text[i];
      // whitespace / newlines preserved as text
      if (/\s/.test(c)) {
        let j = i;
        while (j < len && /\s/.test(text[j])) j++;
        push('text', text.slice(i, j), i);
        i = j;
        continue;
      }
      // strings
      if (c === "'" || c === '"') {
        let j = i + 1;
        while (j < len && text[j] !== c) j++;
        const end = Math.min(len, j + 1);
        push('string', text.slice(i, end), i);
        i = end;
        continue;
      }
      const keywordPhraseMatch = this.getKeywordPhraseMatchAt(text, i);
      if (keywordPhraseMatch) {
        push('keyword', keywordPhraseMatch, i);
        i += keywordPhraseMatch.length;
        continue;
      }
      const valueMatch = this.getKnownValueMatchAt(text, i);
      if (valueMatch) {
        push('identifier', valueMatch.text, i, {
          atomic: true,
          displayText: valueMatch.displayText,
          imageUrl: valueMatch.suggestion.imageUrl,
          title: valueMatch.suggestion.detail,
          valueContext: valueMatch.suggestion.valueContext,
          rarityClass: valueMatch.suggestion.rarityClass,
          badgeText: valueMatch.suggestion.badgeText,
          badgeClass: valueMatch.suggestion.badgeClass
        });
        i += valueMatch.text.length;
        continue;
      }
      const numericValueMatch = this.getKnownNumericValueMatchAt(text, i);
      if (numericValueMatch) {
        push('identifier', numericValueMatch.text, i, {
          atomic: true,
          displayText: numericValueMatch.displayText,
          imageUrl: numericValueMatch.suggestion.imageUrl,
          title: numericValueMatch.suggestion.detail,
          valueContext: numericValueMatch.suggestion.valueContext,
          rarityClass: numericValueMatch.suggestion.rarityClass,
          badgeText: numericValueMatch.suggestion.badgeText,
          badgeClass: numericValueMatch.suggestion.badgeClass
        });
        i += numericValueMatch.text.length;
        continue;
      }
      // numbers
      if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(text[i + 1] ?? ''))) {
        let j = i + 1;
        while (j < len && /[0-9.]/.test(text[j])) j++;
        push('number', text.slice(i, j), i);
        i = j;
        continue;
      }
      // parens with depth
      if (c === '(') {
        push('paren', '(', i, { depth: depth % 6 });
        depth++;
        i++;
        continue;
      }
      if (c === ')') {
        depth = Math.max(0, depth - 1);
        push('paren', ')', i, { depth: depth % 6 });
        i++;
        continue;
      }
      // operators
      const twoChar = text.slice(i, i + 2);
      if (twoChar === '>=' || twoChar === '<=' || twoChar === '!=' || twoChar === '<>') {
        push('operator', twoChar, i);
        i += 2;
        continue;
      }
      if (c === '=' || c === '<' || c === '>') {
        push('operator', c, i);
        i++;
        continue;
      }
      if (c === ',' || c === ';') {
        push('punct', c, i);
        i++;
        continue;
      }
      const partialValueMatch = this.getPartialValueMatchAt(text, i);
      if (partialValueMatch) {
        push('identifier', partialValueMatch.text, i, {
          displayText: partialValueMatch.displayText,
          imageUrl: partialValueMatch.imageUrl,
          title: partialValueMatch.title,
          valueContext: partialValueMatch.valueContext
        });
        i += partialValueMatch.text.length;
        continue;
      }
      const fieldMatch = this.getKnownFieldMatchAt(text, i);
      if (fieldMatch) {
        push('field', fieldMatch.text, i, {
          title: fieldMatch.suggestion.detail,
          valueContext: this.inferSuggestionValueContext(fieldMatch.suggestion),
          scopeContext: this.inferSuggestionScopeContext(fieldMatch.suggestion)
        });
        i += fieldMatch.text.length;
        continue;
      }
      // identifiers (letters, digits, underscores, dots, accented; allow spaces only if followed by another identifier word)
      if (/[A-Za-z_\u00C0-\uFFFF]/.test(c)) {
        let j = i + 1;
        while (j < len && /[A-Za-z0-9_.\u00C0-\uFFFF\u25A0-\u25FF\u2605\u2606\-]/.test(text[j])) j++;
        const word = text.slice(i, j);
        const lower = word.toLowerCase();
        let kind: UqlHighlightKind = 'identifier';
        if (this.highlightKeywords.has(lower)) kind = 'keyword';
        else if (this.highlightFunctions.has(lower)) kind = 'function';
        else if (this.isKnownField(lower)) kind = 'field';
        push(kind, word, i);
        i = j;
        continue;
      }
      // fallback single char
      push('text', c, i);
      i++;
    }
    if (sourceOffset === 0) {
      this.activeTokenizeText = previousTokenizeText;
      this.activeValueMatchContextCache = previousValueMatchContextCache;
    }
    return out;
  }

  private getKeywordPhraseMatchAt(text: string, index: number): string | null {
    if (index > 0 && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(text[index - 1])) return null;
    const phrases = ['does not have', 'has any', 'has all'];
    const lowerText = text.toLowerCase();
    for (const phrase of phrases) {
      if (!lowerText.startsWith(phrase, index)) continue;
      const end = index + phrase.length;
      if (end < text.length && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(text[end])) continue;
      return text.slice(index, end);
    }
    return null;
  }

  private isKnownField(word: string): boolean {
    const normalized = word.toLowerCase().replace(/\./g, '_');
    return this.knownFieldNames.has(normalized) || this.knownFieldNames.has(word);
  }

  private getKnownValueMatchAt(text: string, index: number): { text: string; displayText?: string; suggestion: UqlSuggestion } | null {
    if (this.isBooleanOperatorAfterCompletePredicate(text, index)) return null;
    const matchContext = this.getCachedValueMatchContext(text, index);
    const context = matchContext.context;
    if (context === 'character') {
      return this.getKnownSuggestionMatchAt(text, index, this.knownCharacterValueCandidates, context);
    }
    if (context === 'legacy') {
      return this.getKnownSuggestionMatchAt(text, index, this.knownLegacyValueCandidates, context);
    }
    if (context === 'support-card') {
      return this.getKnownSuggestionMatchAt(text, index, this.knownSupportCardValueCandidates, context);
    }
    if (context === 'race-saddle') {
      return this.getKnownSuggestionMatchAt(text, index, this.knownRaceSaddleValueCandidates, context);
    }
    if (context?.endsWith('-factor')) {
      const match = this.getKnownSuggestionMatchAt(text, index, this.knownFactorValueCandidates, context, matchContext.allowAnyFactorContext);
      if (/[0-9]/.test(text[index] || '') && !matchContext.allowAnyFactorContext && match && /[^0-9]/.test(match.text)) return match;
      if (/[0-9]/.test(text[index] || '') && !matchContext.allowAnyFactorContext) return null;
      return match;
    }
    return null;
  }

  private getKnownFieldMatchAt(text: string, index: number): { text: string; suggestion: UqlSuggestion } | null {
    return this.getKnownSuggestionMatchAt(text, index, this.knownFactorFieldCandidates);
  }

  private getKnownNumericValueMatchAt(text: string, index: number): { text: string; displayText?: string; suggestion: UqlSuggestion } | null {
    if (!/[0-9]/.test(text[index] || '')) return null;
    const matchContext = this.getCachedValueMatchContext(text, index);
    if (!matchContext.context?.endsWith('-factor') || !matchContext.inFactorArrayList) return null;
    let end = index + 1;
    while (end < text.length && /[0-9]/.test(text[end])) end++;
    const candidateText = text.slice(index, end);
    const candidate = this.knownFactorSparkValueCandidates.get(candidateText);
    if (!candidate || !this.matchesValueContext(candidate.suggestion.valueContext, matchContext.context, matchContext.allowAnyFactorContext)) return null;
    return { text: candidateText, displayText: candidate.displayText, suggestion: candidate.suggestion };
  }

  private getPartialValueMatchAt(text: string, index: number): { text: string; displayText?: string; imageUrl?: string; title?: string; valueContext: UqlValueContext } | null {
    if (index > 0 && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(text[index - 1])) return null;
    if (this.isBooleanOperatorAfterCompletePredicate(text, index)) return null;
    const context = this.getValueContext(text.slice(0, index));
    if (!context || context === 'number' || context === 'text') return null;
    const end = this.getCurrentValueEnd(text, index);
    const valueText = text.slice(index, end).trimEnd();
    if (!valueText || /^[,)]/.test(valueText)) return null;
    if (/^(?:and|or)\b/i.test(valueText.trimStart())) return null;
    if (context === 'legacy') {
      return { text: valueText, valueContext: context, ...this.getPartialLegacyChipMetadata(valueText) };
    }
    return { text: valueText, valueContext: context };
  }

  private getPartialLegacyChipMetadata(valueText: string): { displayText: string; imageUrl?: string; title?: string } {
    const displayText = valueText.trim().replace(/^\[\s*/, '').replace(/\s*\]$/, '');
    const characterName = displayText.replace(/\s+(?:#\d+|@[A-Za-z0-9_-]+)\s*$/i, '').trim();
    const normalizedName = this.normalizeSuggestionToken(characterName).replace(/\s+/g, ' ').trim();
    const characterSuggestion = normalizedName
      ? this.suggestions.find(suggestion => {
          if (suggestion.kind !== 'value' || suggestion.valueContext !== 'character') return false;
          const values = [suggestion.label, suggestion.insertText, ...(suggestion.matchPhrases || [])]
            .map(value => this.normalizeSuggestionToken(value).replace(/\s+/g, ' ').trim())
            .filter(Boolean);
          return values.some(value => value === normalizedName || value.startsWith(`${normalizedName} `) || normalizedName.startsWith(`${value} `));
        })
      : undefined;
    return {
      displayText,
      imageUrl: characterSuggestion?.imageUrl,
      title: characterSuggestion?.detail
    };
  }

  private getKnownSuggestionMatchAt(text: string, index: number, candidates: UqlKnownSuggestionCandidate[], valueContext?: UqlValueContext, allowAnyFactorContext = false): { text: string; displayText?: string; suggestion: UqlSuggestion } | null {
    if (index > 0 && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(text[index - 1])) return null;
    const lowerText = text.toLowerCase();
    const bucket = this.getKnownSuggestionBucket(candidates, lowerText[index] || '');
    for (const { candidate, lowerCandidate, displayText, suggestion } of bucket) {
      if (valueContext && !this.matchesValueContext(suggestion.valueContext, valueContext, allowAnyFactorContext)) continue;
      if (!candidate || !lowerText.startsWith(lowerCandidate, index)) continue;
      const end = index + candidate.length;
      if (end < text.length && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(text[end])) continue;
      return { text: text.slice(index, end), displayText, suggestion };
    }
    return null;
  }

  private getKnownSuggestionBucket(candidates: UqlKnownSuggestionCandidate[], firstChar: string): UqlKnownSuggestionCandidate[] {
    let buckets = this.knownSuggestionBuckets.get(candidates);
    if (!buckets) {
      buckets = new Map<string, UqlKnownSuggestionCandidate[]>();
      for (const candidate of candidates) {
        const key = candidate.lowerCandidate[0] || '';
        const bucket = buckets.get(key);
        if (bucket) bucket.push(candidate);
        else buckets.set(key, [candidate]);
      }
      this.knownSuggestionBuckets.set(candidates, buckets);
    }
    return buckets.get(firstChar) || [];
  }

  private getCachedValueMatchContext(text: string, index: number): { context: UqlValueContext | null; allowAnyFactorContext: boolean; inFactorArrayList: boolean } {
    if (this.activeTokenizeText !== text) return this.getValueMatchContext(text.slice(0, index));
    const cached = this.activeValueMatchContextCache.get(index);
    if (cached) return cached;
    const value = this.getValueMatchContext(text.slice(0, index));
    this.activeValueMatchContextCache.set(index, value);
    return value;
  }

  private isBooleanOperatorAfterCompletePredicate(text: string, index: number): boolean {
    if (!/^(?:and|or)\b/i.test(text.slice(index))) return false;
    const prefix = text.slice(0, index).trimEnd();
    return this.isAfterCompleteLiteralPredicate(prefix) || this.isAfterKnownValue(prefix);
  }

  private inferSuggestionValueContext(suggestion: UqlSuggestion): UqlValueContext | undefined {
    if (suggestion.valueContext) return suggestion.valueContext;
    const haystack = `${suggestion.label} ${suggestion.detail || ''} ${suggestion.searchText || ''} ${suggestion.insertText}`.toLowerCase();
    if (/\bowned legacy\b|\blegacy member\b|\bowned uma\b/.test(haystack)) return 'legacy';
    if (/\bblue[_\s-]?sparks?\b|\bblue factor/.test(haystack)) return 'blue-factor';
    if (/\bpink[_\s-]?sparks?\b|\bpink factor/.test(haystack)) return 'pink-factor';
    if (/\bgreen[_\s-]?sparks?\b|\bunique skills?\b|\bgreen factor/.test(haystack)) return 'green-factor';
    if (/\bwhite[_\s-]?sparks?\b|\bwhite skills?\b|\bwhite factors?\b|\bwhite factor/.test(haystack)) return 'white-factor';
    if (/\bsupport[_\s-]?cards?\b|\bsupport card id\b|\bcard id\b/.test(haystack)) return 'support-card';
    if (/\bwin[_\s-]?saddles?\b|\brace results?\b|\brace wins?\b/.test(haystack)) return 'race-saddle';
    return undefined;
  }

  private inferSuggestionScopeContext(suggestion: UqlSuggestion): UqlScopeContext | undefined {
    if (suggestion.scopeContext) return suggestion.scopeContext;
    const haystack = `${suggestion.label} ${suggestion.insertText} ${suggestion.searchText || ''}`.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:main|parent|main parent)\b/.test(haystack)) return 'main';
    if (/^(?:gp1|left|left parent|grandparent 1|grand parent 1)\b/.test(haystack)) return 'gp1';
    if (/^(?:gp2|right|right parent|grandparent 2|grand parent 2)\b/.test(haystack)) return 'gp2';
    if (/^(?:gp|any gp|grandparent|grand parent|any grandparent|any grand parent)\b/.test(haystack)) return 'any-gp';
    return undefined;
  }

  private openSuggestionMenu(): void {
    this.clearBlurTimer();
    const input = this.queryInput?.nativeElement;
    const query = this.query || '';
    const cursor = input?.selectionStart ?? query.length;
    if (!this.canShowSuggestionsAtCursor(query, cursor, true)) {
      this.visibleSuggestions = [];
      this.suggestionMenuOpen = false;
      this.suggestionMenuExplicit = false;
      return;
    }
    this.suggestionMenuOpen = true;
    this.suggestionMenuExplicit = true;
    this.updateVisibleSuggestions();
  }

  private updateSuggestionMenuPosition(): void {
    const input = this.queryInput?.nativeElement;
    if (!input || !this.suggestionMenuOpen || this.visibleSuggestions.length === 0) return;
    const coords = this.getMonospaceCaretCoordinates(input, input.selectionStart ?? this.query.length);
    const lineHeight = this.getLineHeight(input);
    const viewportPadding = 12;
    const menuGap = 10;
    const inputRect = input.getBoundingClientRect();
    const hintHeight = this.activeSuggestionDetail ? 24 : 0;
    const menuChromeHeight = 8 + hintHeight;
    const preferredViewportHeight = Math.min(
      this.maxSuggestionViewportHeight,
      Math.max(this.suggestionItemSize, this.visibleSuggestions.length * this.suggestionItemSize)
    );
    const availableBelow = Math.max(
      this.suggestionItemSize,
      window.innerHeight - (inputRect.top + coords.top + lineHeight + menuGap) - viewportPadding - menuChromeHeight
    );
    const availableAbove = Math.max(
      this.suggestionItemSize,
      inputRect.top + coords.top - viewportPadding - menuChromeHeight
    );
    const openAbove = availableBelow < preferredViewportHeight && availableAbove > availableBelow;
    this.suggestionViewportMaxHeight = Math.min(
      this.maxSuggestionViewportHeight,
      openAbove ? availableAbove : availableBelow
    );
    const viewportHeight = Math.min(preferredViewportHeight, this.suggestionViewportMaxHeight);
    const menuHeight = viewportHeight + menuChromeHeight;
    const maxMenuWidth = Math.min(420, Math.max(240, input.clientWidth - 64));
    const maxLeft = Math.max(56, input.clientWidth - maxMenuWidth - 12);
    const menuTop = openAbove
      ? Math.max(8, coords.top - menuHeight - 4)
      : coords.top + lineHeight + menuGap;
    this.suggestionMenuStyle = {
      left: `${Math.min(Math.max(56, coords.left), maxLeft)}px`,
      top: `${menuTop}px`,
      maxWidth: `${maxMenuWidth}px`
    };
  }

  private getMonospaceCaretCoordinates(input: HTMLTextAreaElement, cursor: number): { left: number; top: number } {
    const style = getComputedStyle(input);
    const lineHeight = this.getLineHeight(input);
    const paddingLeft = Number.parseFloat(style.paddingLeft || '56') || 56;
    const paddingTop = Number.parseFloat(style.paddingTop || '31') || 31;
    const textBeforeCursor = input.value.slice(0, cursor);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines[lines.length - 1] || '';
    const charWidth = this.getMonospaceCharWidth(input);
    return {
      left: paddingLeft + currentLine.length * charWidth - input.scrollLeft,
      top: paddingTop + (lines.length - 1) * lineHeight - input.scrollTop
    };
  }

  private getMonospaceCharWidth(input: HTMLTextAreaElement): number {
    const style = getComputedStyle(input);
    const probe = input.ownerDocument.createElement('span');
    probe.textContent = '0000000000';
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'pre';
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontWeight = style.fontWeight;
    probe.style.letterSpacing = style.letterSpacing;
    input.ownerDocument.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width / 10;
    input.ownerDocument.body.removeChild(probe);
    return Number.isFinite(width) && width > 0 ? width : 7.8;
  }

  private getLineHeight(input: HTMLTextAreaElement): number {
    const lineHeight = Number.parseFloat(getComputedStyle(input).lineHeight || '20');
    return Number.isFinite(lineHeight) ? lineHeight : 20;
  }

  private getCaretCoordinates(input: HTMLTextAreaElement, cursor: number): { left: number; top: number } {
    const doc = input.ownerDocument;
    const mirror = doc.createElement('div');
    const marker = doc.createElement('span');
    const style = getComputedStyle(input);
    const properties = [
      'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
      'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing',
      'wordSpacing', 'tabSize', 'MozTabSize'
    ] as const;
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    properties.forEach(property => {
      mirror.style.setProperty(property, style.getPropertyValue(property));
    });
    mirror.textContent = input.value.slice(0, cursor);
    if (mirror.textContent.endsWith('\n')) {
      mirror.textContent += ' ';
    }
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    doc.body.appendChild(mirror);
    const left = marker.offsetLeft - input.scrollLeft;
    const top = marker.offsetTop - input.scrollTop;
    doc.body.removeChild(mirror);
    return { left, top };
  }

  private getMatchingSuggestions(query: string, cursor: number): { suggestions: UqlSuggestion[]; token: string; contextualSuggestions: UqlSuggestion[] } {
    const contextualSuggestions = this.getContextualSuggestions(query, cursor);
    const token = this.getCompletionRangeForSuggestions(query, cursor, contextualSuggestions).token.toLowerCase();
    const normalizedToken = this.normalizeSuggestionToken(token);
    const rankedSuggestions = normalizedToken
      ? contextualSuggestions
        .map(suggestion => ({ suggestion, rank: this.getSuggestionMatchRank(suggestion, normalizedToken) }))
        .filter((entry): entry is { suggestion: UqlSuggestion; rank: number } => entry.rank !== null)
      : contextualSuggestions.map(suggestion => ({ suggestion, rank: 0 }));
    const kindOrder: Record<string, number> = { field: 0, operator: 1, function: 2, value: 3, snippet: 4, keyword: 5, punctuation: 6 };
    const suggestions = [...rankedSuggestions].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const pa = a.suggestion.priority ?? this.defaultSuggestionPriority(a.suggestion);
      const pb = b.suggestion.priority ?? this.defaultSuggestionPriority(b.suggestion);
      if (pa !== pb) return pa - pb;
      const ka = kindOrder[a.suggestion.kind] ?? 9;
      const kb = kindOrder[b.suggestion.kind] ?? 9;
      if (ka !== kb) return ka - kb;
      // prefer prefix matches over substring matches within a kind
      if (normalizedToken) {
        const la = this.getSuggestionSearchEntry(a.suggestion).normalizedLabel.startsWith(normalizedToken) ? 0 : 1;
        const lb = this.getSuggestionSearchEntry(b.suggestion).normalizedLabel.startsWith(normalizedToken) ? 0 : 1;
        if (la !== lb) return la - lb;
      }
      return a.suggestion.label.localeCompare(b.suggestion.label);
    }).map(entry => entry.suggestion);
    return { suggestions, token, contextualSuggestions };
  }

  private defaultSuggestionPriority(suggestion: UqlSuggestion): number {
    if (suggestion.kind === 'operator' || suggestion.kind === 'punctuation') return 0;
    if (suggestion.kind === 'keyword') return 10;
    if (suggestion.kind === 'function') return 20;
    if (suggestion.kind === 'field') return 40;
    if (suggestion.kind === 'value') return suggestion.valueContext === 'character' ? 40 : 50;
    if (suggestion.kind === 'snippet') return 80;
    return 100;
  }

  private getContextualSuggestions(query: string, cursor: number): UqlSuggestion[] {
    const prefix = query.slice(0, cursor);
    const trimmedPrefix = prefix.trimEnd();
    const scoringSuggestions = this.whiteScoringSuggestionsForPrefix(prefix);
    if (scoringSuggestions.length) return scoringSuggestions;
    const skillLevelSuggestions = this.skillLevelOperatorSuggestionsForPrefix(prefix);
    if (skillLevelSuggestions.length) return skillLevelSuggestions;
    const arrayValueSuggestions = this.arrayValueSuggestionsForPrefix(prefix);
    if (arrayValueSuggestions.length) {
      return arrayValueSuggestions;
    }
    const scopePrefixSuggestions = this.scopePrefixFieldSuggestionsForPrefix(prefix);
    if (scopePrefixSuggestions.length) {
      return scopePrefixSuggestions;
    }
    const fieldMatch = this.matchTrailingField(trimmedPrefix);
    if (fieldMatch) {
      return this.operatorSuggestionsForFieldType(fieldMatch.fieldType);
    }
    if (this.isAfterComparisonOperator(prefix)) {
      const contextualValues = this.valueSuggestionsForPrefix(prefix);
      return contextualValues.length ? contextualValues : [this.valueSuggestionForPrefix(prefix)];
    }
    const trailingOperatorFieldMatch = this.matchFieldBeforeTrailingOperator(trimmedPrefix);
    if (trailingOperatorFieldMatch) {
      return this.operatorSuggestionsForFieldType(trailingOperatorFieldMatch.fieldType);
    }
    const trailingOperatorPrefixFieldMatch = this.matchFieldBeforeTrailingOperatorPrefix(trimmedPrefix);
    if (trailingOperatorPrefixFieldMatch) {
      return this.operatorSuggestionsForFieldType(trailingOperatorPrefixFieldMatch.fieldType);
    }
    if (this.isAfterBooleanKeyword(trimmedPrefix)) {
      return this.expressionStartSuggestions();
    }
    if (this.isTypingBooleanContinuation(prefix)) {
      return this.continuationSuggestions(trimmedPrefix);
    }
    if (this.isAfterKnownValue(prefix) || this.isAfterCompleteLiteralPredicate(trimmedPrefix)) {
      return this.continuationSuggestions(trimmedPrefix);
    }
    const contextualValueSuggestions = this.valueSuggestionsForPrefix(prefix);
    if (contextualValueSuggestions.length) return contextualValueSuggestions;
    if (this.hasExpressionPrefixMatch(query, cursor)) {
      return this.expressionStartSuggestions();
    }
    return this.expressionStartSuggestions();
  }

  private arrayValueSuggestionsForPrefix(prefix: string): UqlSuggestion[] {
    const matchContext = this.getValueMatchContext(prefix);
    const context = matchContext.context;
    if (!context?.endsWith('-factor') || !matchContext.inFactorArrayList) return [];
    return this.suggestions.filter(suggestion => suggestion.kind === 'value' && this.matchesValueContext(suggestion.valueContext, context, matchContext.allowAnyFactorContext));
  }

  private skillLevelOperatorSuggestionsForPrefix(prefix: string): UqlSuggestion[] {
    const { context, allowAnyFactorContext, inFactorArrayList } = this.getValueMatchContext(prefix);
    if (!context?.endsWith('-factor') || !inFactorArrayList) return [];
    const currentClause = this.getCurrentClausePrefix(prefix);
    const listStart = Math.max(currentClause.lastIndexOf('('), currentClause.lastIndexOf(','));
    let currentItem: string;
    if (listStart >= 0) {
      currentItem = currentClause.slice(listStart + 1);
    } else {
      const singleMatch = currentClause.match(/\b(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains)\s+(.*)$/i);
      if (!singleMatch) return [];
      currentItem = singleMatch[1];
    }
    // Only offer a star level once the skill name is finished (trailing space) and no comparison exists yet.
    if (!/\s$/.test(currentItem) || /(?:>=|<=|<>|!=|=|>|<)/.test(currentItem)) return [];
    const skillText = currentItem.trim();
    if (!skillText || !this.isKnownFactorValue(skillText, context, allowAnyFactorContext)) return [];
    return this.skillLevelOperatorSuggestions();
  }

  private isKnownFactorValue(value: string, context: UqlValueContext, allowAnyFactorContext: boolean): boolean {
    const normalized = this.normalizeSuggestionToken(value);
    if (!normalized) return false;
    return this.suggestions.some(suggestion => suggestion.kind === 'value'
      && this.matchesValueContext(suggestion.valueContext, context, allowAnyFactorContext)
      && (this.normalizeSuggestionToken(suggestion.label) === normalized || this.normalizeSuggestionToken(suggestion.insertText) === normalized));
  }

  private skillLevelOperatorSuggestions(): UqlSuggestion[] {
    return [
      { label: '> stars', insertText: '> ', kind: 'operator', detail: 'This skill above N stars - leave blank to match all star levels' },
      { label: '>= stars', insertText: '>= ', kind: 'operator', detail: 'This skill at N or more stars' },
      { label: '= stars', insertText: '= ', kind: 'operator', detail: 'This skill at exactly N stars' },
      { label: '<= stars', insertText: '<= ', kind: 'operator', detail: 'This skill at N or fewer stars' },
      { label: '< stars', insertText: '< ', kind: 'operator', detail: 'This skill below N stars' },
    ];
  }

  private whiteScoringSuggestionsForPrefix(prefix: string): UqlSuggestion[] {
    if (!this.isInsideWhiteScoringFunction(prefix)) return [];
    return this.suggestions.filter(suggestion => suggestion.kind === 'value' && suggestion.valueContext === 'white-factor');
  }

  private expressionStartSuggestions(): UqlSuggestion[] {
    return this.suggestions.filter(suggestion => (suggestion.kind === 'field' || suggestion.kind === 'keyword' || suggestion.kind === 'function' || suggestion.kind === 'snippet')
      && this.isVisibleFieldSuggestion(suggestion));
  }

  private scopePrefixFieldSuggestionsForPrefix(prefix: string): UqlSuggestion[] {
    const scopeToken = this.getTrailingScopeToken(prefix);
    if (!scopeToken) return [];
    return this.suggestions.filter(suggestion => {
      if (suggestion.kind !== 'field' || !this.isVisibleFieldSuggestion(suggestion)) return false;
      const scope = suggestion.scopeContext || this.inferSuggestionScopeContext(suggestion);
      if (scopeToken === 'main') return scope === 'main';
      if (scopeToken === 'gp1') return scope === 'gp1';
      if (scopeToken === 'gp2') return scope === 'gp2';
      return scope === 'gp1' || scope === 'gp2' || scope === 'any-gp';
    });
  }

  private getTrailingScopeToken(prefix: string): 'main' | 'gp1' | 'gp2' | 'gp' | null {
    const phrase = this.getCurrentClausePrefix(prefix).toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (['main', 'parent', 'main parent'].includes(phrase)) return 'main';
    if (['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1'].includes(phrase)) return 'gp1';
    if (['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2'].includes(phrase)) return 'gp2';
    if (['gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent'].includes(phrase)) return 'gp';
    return null;
  }

  private isVisibleFieldSuggestion(suggestion: UqlSuggestion): boolean {
    if (suggestion.kind !== 'field') return true;
    if (suggestion.valueContext !== 'green-factor' && suggestion.valueContext !== 'white-factor') return true;
    return !/max\s+3\s+stars\s+on\s+a\s+specific\s+slot/i.test(suggestion.detail || '');
  }

  private isAfterBooleanKeyword(trimmedPrefix: string): boolean {
    return /(?:^|\s|\()(?:(?:and)|(?:or)|(?:not))$/i.test(trimmedPrefix);
  }

  private isTypingBooleanContinuation(prefix: string): boolean {
    const match = prefix.match(/(?:\d|'|"|\))\s+([A-Za-z]*)$/);
    if (!match) return false;
    const token = match[1].toLowerCase();
    if (token === 'and' || token === 'or') return false;
    return token === '' || 'and'.startsWith(token) || 'or'.startsWith(token);
  }

  private hasExpressionPrefixMatch(query: string, cursor: number): boolean {
    const phraseRange = this.getCurrentPhraseRange(query, cursor);
    const wordRange = this.getCurrentWordRange(query, cursor);
    const rawPhraseToken = phraseRange.token.trim();
    const phraseToken = /(?:=|!=|<>|<=|>=|<|>|\bhas\b|\bin\b|\blike\b|\bilike\b|\d|'|"|\))/.test(rawPhraseToken)
      ? wordRange.token.toLowerCase()
      : rawPhraseToken.toLowerCase();
    if (!phraseToken) return false;
    const normalizedToken = this.normalizeSuggestionToken(phraseToken);
    return this._suggestions.some(suggestion => {
      if ((suggestion.kind !== 'field' && suggestion.kind !== 'keyword' && suggestion.kind !== 'function' && suggestion.kind !== 'snippet') || !this.isVisibleFieldSuggestion(suggestion)) {
        return false;
      }
      return this.getSuggestionMatchRank(suggestion, normalizedToken) !== null;
    });
  }

  private operatorSuggestionsForFieldType(fieldType?: UqlFieldType): UqlSuggestion[] {
    if (fieldType === 'directive') {
      return [
        { label: '=', insertText: '= ', kind: 'operator', detail: 'Choose this editor context value' },
      ];
    }
    if (fieldType === 'string') {
      return [
        { label: 'ilike', insertText: "ilike '%%'", kind: 'operator', detail: 'Fuzzy match (case-insensitive)', cursorOffset: -2 },
        { label: 'like', insertText: "like ''", kind: 'operator', detail: 'SQL LIKE pattern', cursorOffset: -1 },
        { label: '=', insertText: "= ''", kind: 'operator', detail: 'Exact match', cursorOffset: -1 },
        { label: '!=', insertText: "!= ''", kind: 'operator', detail: 'Not equal', cursorOffset: -1 },
        { label: 'in (...)', insertText: 'in ()', kind: 'operator', detail: 'Match any listed value', cursorOffset: -1 },
        { label: 'not ilike', insertText: "not ilike '%%'", kind: 'operator', detail: 'Exclude fuzzy match', cursorOffset: -2 },
      ];
    }
    if (fieldType === 'array') {
      return [
        { label: 'has one', insertText: 'has ', kind: 'operator', detail: 'One skill/factor is present' },
        { label: 'has any', insertText: 'has any ()', kind: 'operator', detail: 'At least one listed skill/factor is present', cursorOffset: -1 },
        { label: 'has all', insertText: 'has all ()', kind: 'operator', detail: 'Every listed skill/factor is present', cursorOffset: -1 },
        { label: 'does not have', insertText: 'does not have ', kind: 'operator', detail: 'Exclude one skill/factor' },
        { label: 'contains', insertText: 'contains ', kind: 'operator', detail: 'Alias for "has one"' },
        { label: 'contains any', insertText: 'contains any ()', kind: 'operator', detail: 'Alias for "has any"', cursorOffset: -1 },
        { label: 'contains all', insertText: 'contains all ()', kind: 'operator', detail: 'Alias for "has all"', cursorOffset: -1 },
        { label: 'in (...)', insertText: 'in ()', kind: 'operator', detail: 'Match any listed skill/factor (like has any)', cursorOffset: -1 },
        { label: 'not in (...)', insertText: 'not in ()', kind: 'operator', detail: 'Exclude every listed skill/factor', cursorOffset: -1 },
      ];
    }
    return [
      { label: '>=', insertText: '>= ', kind: 'operator', detail: 'At least' },
      { label: '=', insertText: '= ', kind: 'operator', detail: 'Exactly' },
      { label: '<=', insertText: '<= ', kind: 'operator', detail: 'At most' },
      { label: '>', insertText: '> ', kind: 'operator', detail: 'Greater than' },
      { label: '<', insertText: '< ', kind: 'operator', detail: 'Less than' },
      { label: 'between', insertText: 'between ', kind: 'operator', detail: 'Range a between b' },
      { label: 'in (...)', insertText: 'in ()', kind: 'operator', detail: 'Include values', cursorOffset: -1 },
      { label: 'not in (...)', insertText: 'not in ()', kind: 'operator', detail: 'Exclude values', cursorOffset: -1 },
    ];
  }

  private continuationSuggestions(trimmedPrefix: string): UqlSuggestion[] {
    const out: UqlSuggestion[] = [
      { label: 'and', insertText: 'and ', kind: 'keyword', detail: 'Require both sides' },
      { label: 'or', insertText: 'or ', kind: 'keyword', detail: 'Match either side' },
    ];
    if (this.countUnclosedParens(trimmedPrefix) > 0) {
      out.push({ label: ')', insertText: ')', kind: 'punctuation', detail: 'Close group' });
    }
    return out;
  }

  private isAfterCompletePredicate(trimmedPrefix: string): boolean {
    if (!trimmedPrefix) return false;
    if (/(?:\bwhere\b|\band\b|\bor\b|\bnot\b|\bin\b|\bbetween\b|\blike\b|\bilike\b|[,(]|=|!=|<>|<=|>=|<|>)$/i.test(trimmedPrefix)) return false;
    return /(?:\d|'|"|\)|\])$/.test(trimmedPrefix) || /[A-Za-z\u00C0-\uFFFF]$/.test(trimmedPrefix);
  }

  private isAfterCompleteLiteralPredicate(trimmedPrefix: string): boolean {
    if (!trimmedPrefix) return false;
    if (/(?:\bwhere\b|\band\b|\bor\b|\bnot\b|\bin\b|\bbetween\b|\blike\b|\bilike\b|[,(]|=|!=|<>|<=|>=|<|>)$/i.test(trimmedPrefix)) return false;
    return /(?:\d|'|"|\)|\])$/.test(trimmedPrefix);
  }

  private isAfterKnownValue(prefix: string): boolean {
    const matchContext = this.getValueMatchContext(prefix);
    const context = matchContext.context;
    if (!context) return false;
    const range = this.getCurrentValueRange(prefix, prefix.length);
    const value = range?.token.trim() || '';
    if (!value) return false;
    const normalizedValue = this.normalizeValueToken(value);
    return this.suggestions.some(suggestion => {
      return suggestion.kind === 'value'
        && this.matchesValueContext(suggestion.valueContext, context, matchContext.allowAnyFactorContext)
        && [suggestion.insertText, suggestion.label, suggestion.backendValue]
          .filter((value): value is string => typeof value === 'string' && value.length > 0)
          .some(value => this.normalizeValueToken(value) === normalizedValue);
    });
  }

  private matchTrailingField(trimmedPrefix: string): { fieldType?: UqlFieldType } | null {
    const lower = trimmedPrefix.toLowerCase();
    const fields = this.fieldSuggestionPhraseIndex;
    for (const entry of fields) {
      for (const phrase of entry.phrases) {
        if (phrase.length > lower.length) continue;
        if (!lower.endsWith(phrase)) continue;
        const boundaryIndex = lower.length - phrase.length - 1;
        if (boundaryIndex < 0) return { fieldType: entry.fieldType };
        const boundaryChar = lower.charCodeAt(boundaryIndex);
        // space (32), tab (9), '(' (40)
        if (boundaryChar === 32 || boundaryChar === 9 || boundaryChar === 40) {
          return { fieldType: entry.fieldType };
        }
      }
    }
    return null;
  }

  private matchFieldBeforeTrailingOperator(trimmedPrefix: string): { fieldType?: UqlFieldType } | null {
    const match = trimmedPrefix.match(/^(.*?)(?:\s+)(?:not\s+in|in|has\s+all|has\s+any|does\s+not\s+have|has|between|ilike|like|!=|<>|<=|>=|=|<|>)\s*$/i);
    if (!match) return null;
    return this.matchTrailingField(match[1].trimEnd());
  }

  private matchFieldBeforeTrailingOperatorPrefix(trimmedPrefix: string): { fieldType?: UqlFieldType } | null {
    const operators = ['does not have', 'not in', 'contains all', 'contains any', 'has all', 'has any', 'between', 'ilike', 'like', 'contains', 'has', 'in'];
    for (let index = trimmedPrefix.length - 1; index > 0; index--) {
      if (!/\s/.test(trimmedPrefix[index])) continue;
      const fieldText = trimmedPrefix.slice(0, index).trimEnd();
      const operatorToken = trimmedPrefix.slice(index + 1).toLowerCase().replace(/\s+/g, ' ').trim();
      if (!fieldText || !operatorToken) continue;
      if (!operators.some(operator => operator.startsWith(operatorToken))) continue;
      const fieldMatch = this.matchTrailingField(fieldText);
      if (fieldMatch) return fieldMatch;
    }
    return null;
  }

  private fieldSuggestionPhraseIndex: Array<{ fieldType?: UqlFieldType; phrases: string[] }> = [];

  private suggestionSearchCache = new WeakMap<UqlSuggestion, {
    normalizedLabel: string;
    normalizedInsertText: string;
    normalizedSearchTokens: string[];
    searchTerms: string[];
    haystack: string;
  }>();

  private normalizeSuggestionToken(value: string | undefined | null): string {
    if (!value) return '';
    return value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private extractSuggestionTerms(value: string | undefined | null): string[] {
    const normalized = this.normalizeSuggestionToken(value);
    return normalized.match(/[a-z0-9\u00c0-\uffff]+/g) || [];
  }

  private matchesQueryTerms(candidateTerms: string[], queryTerms: string[], preserveOrder: boolean): boolean {
    if (queryTerms.length === 0) return true;
    if (!preserveOrder) {
      return queryTerms.every(queryTerm => candidateTerms.some(candidate => candidate.startsWith(queryTerm)));
    }
    let candidateIndex = 0;
    for (const queryTerm of queryTerms) {
      let found = false;
      while (candidateIndex < candidateTerms.length) {
        if (candidateTerms[candidateIndex].startsWith(queryTerm)) {
          found = true;
          candidateIndex++;
          break;
        }
        candidateIndex++;
      }
      if (!found) return false;
    }
    return true;
  }

  private getSuggestionMatchRank(suggestion: UqlSuggestion, normalizedToken: string): number | null {
    if (!normalizedToken) return 0;
    const entry = this.getSuggestionSearchEntry(suggestion);
    if (entry.normalizedLabel.startsWith(normalizedToken) || entry.normalizedInsertText.startsWith(normalizedToken)) return 0;
    const queryTerms = this.extractSuggestionTerms(normalizedToken);
    if (queryTerms.length === 0) return null;
    if (normalizedToken.length >= 3 && entry.haystack.includes(normalizedToken)) return 1;
    if (this.matchesQueryTerms(entry.searchTerms, queryTerms, true)) return 2;
    if (this.matchesQueryTerms(entry.searchTerms, queryTerms, false)) return 3;
    return null;
  }

  private rebuildSuggestionSearchIndex(): void {
    this.suggestionSearchCache = new WeakMap();
    for (const suggestion of this._suggestions) {
      const normalizedLabel = this.normalizeSuggestionToken(suggestion.label);
      const normalizedInsertText = this.normalizeSuggestionToken(suggestion.insertText);
      const normalizedSearch = this.normalizeSuggestionToken(suggestion.searchText || '');
      const normalizedDetail = this.normalizeSuggestionToken(suggestion.detail || '');
      const normalizedBackend = this.normalizeSuggestionToken(suggestion.backendValue || '');
      const haystack = `${normalizedLabel} ${normalizedDetail} ${normalizedSearch} ${normalizedInsertText} ${normalizedBackend}`;
      const normalizedSearchTokens = normalizedSearch ? normalizedSearch.split(/\s+/).filter(Boolean) : [];
      const searchTerms = [
        ...this.extractSuggestionTerms(suggestion.label),
        ...this.extractSuggestionTerms(suggestion.insertText),
        ...this.extractSuggestionTerms(suggestion.searchText || ''),
        ...this.extractSuggestionTerms(suggestion.detail || ''),
        ...this.extractSuggestionTerms(suggestion.backendValue || ''),
      ];
      this.suggestionSearchCache.set(suggestion, {
        normalizedLabel,
        normalizedInsertText,
        normalizedSearchTokens,
        searchTerms,
        haystack,
      });
    }
  }

  private getSuggestionSearchEntry(suggestion: UqlSuggestion) {
    let entry = this.suggestionSearchCache.get(suggestion);
    if (!entry) {
      const normalizedLabel = this.normalizeSuggestionToken(suggestion.label);
      const normalizedInsertText = this.normalizeSuggestionToken(suggestion.insertText);
      const normalizedSearch = this.normalizeSuggestionToken(suggestion.searchText || '');
      const normalizedDetail = this.normalizeSuggestionToken(suggestion.detail || '');
      const normalizedBackend = this.normalizeSuggestionToken(suggestion.backendValue || '');
      entry = {
        normalizedLabel,
        normalizedInsertText,
        normalizedSearchTokens: normalizedSearch ? normalizedSearch.split(/\s+/).filter(Boolean) : [],
        searchTerms: [
          ...this.extractSuggestionTerms(suggestion.label),
          ...this.extractSuggestionTerms(suggestion.insertText),
          ...this.extractSuggestionTerms(suggestion.searchText || ''),
          ...this.extractSuggestionTerms(suggestion.detail || ''),
          ...this.extractSuggestionTerms(suggestion.backendValue || ''),
        ],
        haystack: `${normalizedLabel} ${normalizedDetail} ${normalizedSearch} ${normalizedInsertText} ${normalizedBackend}`,
      };
      this.suggestionSearchCache.set(suggestion, entry);
    }
    return entry;
  }

  private rebuildFieldSuggestionPhraseIndex(): void {
    const seen = new Set<string>();
    const index: Array<{ fieldType?: UqlFieldType; phrases: string[] }> = [];
    for (const suggestion of this._suggestions) {
      if (suggestion.kind !== 'field') continue;
      if (!this.isVisibleFieldSuggestion(suggestion)) continue;
      const raw = [suggestion.insertText, suggestion.label, ...(suggestion.matchPhrases || [])];
      const phrases: string[] = [];
      for (const value of raw) {
        if (!value) continue;
        const lower = value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!lower || seen.has(`${suggestion.fieldType || ''}|${lower}`)) continue;
        seen.add(`${suggestion.fieldType || ''}|${lower}`);
        phrases.push(lower);
      }
      if (phrases.length) index.push({ fieldType: suggestion.fieldType, phrases });
    }
    this.fieldSuggestionPhraseIndex = index;
  }

  private countUnclosedParens(text: string): number {
    let open = 0;
    let quote: string | null = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === "'" || c === '"') { quote = c; continue; }
      if (c === '(') open++;
      else if (c === ')') open--;
    }
    return open;
  }

  private isAfterComparisonOperator(prefix: string): boolean {
    return /(=|!=|<>|<=|>=|<|>|\bin\b\s*(?:\(\s*)?|\bnot\s+in\b\s*(?:\(\s*)?|\bhas\s+|\bhas\s+any\s*\(|\bhas\s+all\s*\(|\bdoes\s+not\s+have\s+)\s*$/i.test(prefix);
  }

  private valueSuggestionForPrefix(prefix: string): UqlSuggestion {
    const valueContext = this.getValueContext(prefix);
    if (valueContext === 'legacy') {
      return this.openLegacyPickerSuggestion();
    }
    const currentClause = this.getCurrentClausePrefix(prefix);
    const fieldPrefix = currentClause.replace(/(=|!=|<>|<=|>=|<|>|\bin\b\s*(?:\(\s*)?|\bnot\s+in\b\s*(?:\(\s*)?)\s*$/i, '').trimEnd().toLowerCase();
    const matchedField = this.findFieldSuggestion(fieldPrefix);
    if (matchedField?.detail?.toLowerCase().includes('max 3 stars')) {
      return { label: '3', insertText: '3', kind: 'value', detail: 'Stars on this specific slot (1-3)' };
    }
    if (/(trainer name|trainer_name|name)$/i.test(fieldPrefix)) {
      return { label: "'%name%'", insertText: "'%name%'", kind: 'value', detail: 'Text match value' };
    }
    if (/(support card|support_card|card)$/i.test(fieldPrefix)) {
      return { label: 'Support card name', insertText: 'Support card name', kind: 'value', detail: 'Support card name' };
    }
    if (/^(main|parent)$/i.test(fieldPrefix) || /(characters?|charas?|chara|umas?|parent|_id)$/i.test(fieldPrefix)) {
      return { label: '1001', insertText: '1001', kind: 'value', detail: 'Character id' };
    }
    return { label: '0', insertText: '0', kind: 'value', detail: 'Any number' };
  }

  private valueSuggestionsForPrefix(prefix: string): UqlSuggestion[] {
    const { context, allowAnyFactorContext } = this.getValueMatchContext(prefix);
    if (!context) return [];
    const values = this.suggestions.filter(suggestion => suggestion.kind === 'value' && this.matchesValueContext(suggestion.valueContext, context, allowAnyFactorContext));
    return context === 'legacy'
      ? [this.openLegacyPickerSuggestion(), ...values]
      : values;
  }

  private openLegacyPickerSuggestion(): UqlSuggestion {
    return {
      label: 'Open legacy picker',
      insertText: '[]',
      kind: 'value',
      detail: 'Pick a legacy from your account',
      valueContext: 'legacy'
    };
  }

  private getValueMatchContext(prefix: string): { context: UqlValueContext | null; allowAnyFactorContext: boolean; inFactorArrayList: boolean } {
    const context = this.getValueContext(prefix);
    const inFactorArrayList = !!context?.endsWith('-factor') && this.isArrayFactorValuePrefix(prefix);
    return {
      context,
      allowAnyFactorContext: inFactorArrayList && this.shouldAllowAnyFactorContext(prefix),
      inFactorArrayList,
    };
  }

  private shouldAllowAnyFactorContext(prefix: string): boolean {
    const currentClause = this.getCurrentClausePrefix(prefix);
    const friendlyArrayMatch = currentClause.match(/([^()]+?)\s+(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains)\s*(?:\([^)]*)?[^)]*$/i);
    if (friendlyArrayMatch) {
      return this.isScopedParentFactorPrefix(friendlyArrayMatch[1]);
    }
    return /^(?:not\s+)?(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains|in|not\s+in)\s*(?:\([^)]*)?[^)]*$/i.test(currentClause.trimStart());
  }

  private matchesValueContext(candidateContext: UqlValueContext | undefined, expectedContext: UqlValueContext, allowAnyFactorContext = false): boolean {
    if (candidateContext === expectedContext) return true;
    return allowAnyFactorContext && !!candidateContext?.endsWith('-factor') && expectedContext.endsWith('-factor');
  }

  private isArrayFactorValuePrefix(prefix: string): boolean {
    const currentClause = this.getCurrentClausePrefix(prefix);
    return /(?:contains|overlaps|has_all|contains_all)\s*\(\s*[^,()]+\s*,\s*(?:\([^)]*)?[^)]*$/i.test(currentClause)
      || /[^()]+?\s+(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains)\s*(?:\([^)]*)?[^)]*$/i.test(currentClause)
      || /\b(?:not\s+in|in)\s*\([^)]*$/i.test(currentClause);
  }

  private getValueContext(prefix: string): UqlValueContext | null {
    const currentClause = this.getCurrentClausePrefix(prefix);
    if (this.isInsideWhiteScoringFunction(currentClause)) return 'white-factor';

    const functionMatch = currentClause.match(/(?:contains|overlaps|has_all|contains_all)\s*\(\s*([^,()]+)\s*,\s*(?:\([^)]*)?[^)]*$/i);
    if (functionMatch) {
      return this.valueContextForField(functionMatch[1]);
    }

    const friendlyArrayMatch = currentClause.match(/([^()]+?)\s+(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains)\s*(?:\([^)]*)?[^)]*$/i);
    if (friendlyArrayMatch) {
      if (this.isScopedParentFactorPrefix(friendlyArrayMatch[1])) return 'white-factor';
      return this.valueContextForField(friendlyArrayMatch[1]);
    }

    if (/^(?:not\s+)?(?:contains\s+all|contains\s+any|has\s+any|has\s+all|does\s+not\s+have|has|contains|in|not\s+in)\s*(?:\([^)]*)?[^)]*$/i.test(currentClause.trimStart())) {
      return 'white-factor';
    }

    const comparisonPrefix = currentClause.replace(/(?:=|!=|<>|<=|>=|<|>|\bin\b\s*\(?|\bnot\s+in\b\s*\(?)\s*[^()]*$/i, '').trimEnd();
    if (comparisonPrefix !== currentClause.trimEnd()) {
      const normalizedComparisonPrefix = comparisonPrefix.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:not|where)\s+/, '');
      if (normalizedComparisonPrefix === 'main' || normalizedComparisonPrefix === 'parent') return 'character';
      return this.valueContextForField(comparisonPrefix);
    }

    return null;
  }

  private isInsideWhiteScoringFunction(prefix: string): boolean {
    return /\b(?:optional_white|optional_main_white|optional_any_white|lineage_white|optional\s+white|optional\s+main\s+white|optional\s+any\s+white|lineage\s+white)\s*\([^)]*$/i.test(prefix);
  }

  private getCurrentClausePrefix(prefix: string): string {
    let quoteCharacter: string | null = null;
    let clauseStart = 0;
    for (let index = 0; index < prefix.length; index++) {
      const character = prefix[index];
      if (quoteCharacter) {
        if (character === quoteCharacter) quoteCharacter = null;
        continue;
      }
      if (character === '\'' || character === '"') {
        quoteCharacter = character;
        continue;
      }
      if (character === ';' || character === '\n') {
        clauseStart = index + 1;
        continue;
      }
      const booleanMatch = prefix.slice(index).match(/^(where|and|or)\b/i);
      if (!booleanMatch) continue;
      const before = index > 0 ? prefix[index - 1] : '';
      const afterIndex = index + booleanMatch[0].length;
      const after = prefix[afterIndex] || '';
      if ((index === 0 || /[\s(]/.test(before)) && (!after || /\s/.test(after))) {
        clauseStart = afterIndex;
        while (clauseStart < prefix.length && /\s/.test(prefix[clauseStart])) clauseStart++;
        index = clauseStart - 1;
      }
    }
    return prefix.slice(clauseStart);
  }

  private isScopedParentFactorPrefix(fieldText: string): boolean {
    const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:not|where)\s+/, '');
    return [
      'main', 'parent', 'main parent',
      'gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent',
      'gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1',
      'gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2'
    ].includes(normalized);
  }

  private valueContextForField(fieldText: string): UqlValueContext | null {
    const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:not|where)\s+/, '');
    const matchedField = this.findFieldSuggestion(normalized);
    if (matchedField) {
      const context = this.inferSuggestionValueContext(matchedField);
      if (context) return context;
    }
    if (this.endsWithAny(normalized, [
      'target',
      'characters', 'character', 'umas', 'uma', 'charas', 'chara',
      'main character', 'main characters', 'main character runner', 'runner', 'runners', 'main uma', 'main umas', 'main chara', 'main charas', 'main chara id',
      'parent character', 'parent uma', 'main parent character',
      'grandparent 1', 'grand parent 1', 'gp1', 'left parent', 'left character', 'left characters', 'left uma', 'left umas', 'left chara', 'left charas', 'left chara id', 'gp1 character', 'gp1 characters', 'gp1 uma', 'gp1 umas', 'gp1 chara', 'gp1 charas',
      'grandparent 2', 'grand parent 2', 'gp2', 'right parent', 'right character', 'right characters', 'right uma', 'right umas', 'right chara', 'right charas', 'right chara id', 'gp2 character', 'gp2 characters', 'gp2 uma', 'gp2 umas', 'gp2 chara', 'gp2 charas',
      'gp character', 'gp characters', 'grandparent character', 'grandparent characters', 'any gp character', 'any gp characters'
    ])) {
      return 'character';
    }
    if (this.endsWithAny(normalized, ['legacy', 'owned legacy', 'owned uma', 'my legacy'])) {
      return 'legacy';
    }
    if (this.endsWithAny(normalized, ['support card', 'support', 'card', 'support card id'])) {
      return 'support-card';
    }
    if (this.endsWithAny(normalized, ['race results', 'race wins', 'main race wins', 'left race wins', 'right race wins', 'win saddles', 'main win saddles', 'left win saddles', 'right win saddles'])) {
      return 'race-saddle';
    }
    if (this.endsWithAny(normalized, ['white sparks', 'white skills', 'white factors', 'main parent white skills', 'main parent skills', 'parent white skills', 'parent skills', 'main white factors', 'main white sparks', 'left white factors', 'left white sparks', 'right white factors', 'right white sparks', 'gp1 white factors', 'gp1 white sparks', 'gp2 white factors', 'gp2 white sparks', 'optional white', 'optional main white', 'lineage white'])) {
      return 'white-factor';
    }
    if (this.endsWithAny(normalized, ['green sparks', 'unique skills', 'green factors', 'main green sparks', 'main green factors', 'main unique skills', 'left green sparks', 'left green factors', 'left unique skills', 'right green sparks', 'right green factors', 'right unique skills', 'gp1 green sparks', 'gp1 green factors', 'gp1 unique skills', 'gp2 green sparks', 'gp2 green factors', 'gp2 unique skills'])) {
      return 'green-factor';
    }
    if (this.endsWithAny(normalized, ['blue sparks', 'blue factors', 'main blue sparks', 'main blue factors', 'left blue sparks', 'left blue factors', 'right blue sparks', 'right blue factors', 'gp1 blue sparks', 'gp1 blue factors', 'gp2 blue sparks', 'gp2 blue factors'])) {
      return 'blue-factor';
    }
    if (this.endsWithAny(normalized, ['pink sparks', 'pink factors', 'main pink sparks', 'main pink factors', 'left pink sparks', 'left pink factors', 'right pink sparks', 'right pink factors', 'gp1 pink sparks', 'gp1 pink factors', 'gp2 pink sparks', 'gp2 pink factors'])) {
      return 'pink-factor';
    }
    if (this.endsWithAny(normalized, ['trainer name', 'trainer', 'name'])) {
      return 'text';
    }
    return null;
  }

  private findFieldSuggestion(fieldText: string): UqlSuggestion | null {
    const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    return this.suggestions.find(suggestion => {
      if (suggestion.kind !== 'field') return false;
      return [suggestion.label, suggestion.insertText]
        .filter(Boolean)
        .some(value => value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim() === normalized);
    }) || null;
  }

  private getSuggestionReplacementRange(query: string, cursor: number, suggestion: UqlSuggestion): { start: number; end: number; token: string } {
    if (suggestion.kind === 'operator') {
      return this.getOperatorCompletionRange(query, cursor);
    }
    if (suggestion.kind === 'punctuation') {
      return { start: cursor, end: cursor, token: '' };
    }
    if (suggestion.kind === 'value') {
      const valueRange = this.getCurrentValueRange(query, cursor);
      if (valueRange) return valueRange;
    }
    if (suggestion.kind === 'field' || suggestion.kind === 'snippet') {
      return this.getFieldOrSnippetCompletionRange(query, cursor);
    }
    return this.getCurrentWordRange(query, cursor);
  }

  private getCompletionRangeForSuggestions(query: string, cursor: number, suggestions: UqlSuggestion[]): { start: number; end: number; token: string } {
    if (suggestions.some(suggestion => suggestion.kind === 'value')) {
      const valueRange = this.getCurrentValueRange(query, cursor);
      if (valueRange) {
        return { ...valueRange, token: query.slice(valueRange.start, cursor) };
      }
      return this.getCurrentWordRange(query, cursor);
    }
    if (suggestions.some(suggestion => suggestion.kind === 'field' || suggestion.kind === 'snippet')) {
      return this.getFieldOrSnippetCompletionRange(query, cursor);
    }
    return this.getCurrentWordRange(query, cursor);
  }

  private getOperatorCompletionRange(query: string, cursor: number): { start: number; end: number; token: string } {
    const beforeCursor = query.slice(0, cursor);
    const match = beforeCursor.match(/(^|[\s(])((?:does\s+not\s+have|not\s+in|has\s+all|has\s+any|has|between|ilike|like|in|!=|<>|<=|>=|=|<|>))\s*$/i);
    if (!match) return { start: cursor, end: cursor, token: '' };
    const matchedText = match[0];
    const leadingText = match[1] || '';
    const start = cursor - matchedText.length + leadingText.length;
    return {
      start,
      end: cursor,
      token: query.slice(start, cursor).trimEnd()
    };
  }

  private getFieldOrSnippetCompletionRange(query: string, cursor: number): { start: number; end: number; token: string } {
    const wordRange = this.getCurrentWordRange(query, cursor);
    if (/^(?:and|or|not)$/i.test(wordRange.token)) {
      return { start: cursor, end: cursor, token: '' };
    }
    const phraseRange = this.getCurrentPhraseRange(query, cursor);
    if (/(?:=|!=|<>|<=|>=|<|>|\bhas\b|\bin\b|\blike\b|\bilike\b|\d|'|"|\))/.test(phraseRange.token)) {
      return wordRange;
    }
    return phraseRange;
  }

  private getCurrentValueRange(query: string, cursor: number): { start: number; end: number; token: string } | null {
    const beforeCursor = query.slice(0, cursor);
    const delimiterPattern = /=|!=|<>|<=|>=|<|>|\bin\b\s*\(?|\bnot\s+in\b\s*\(?|\bhas\s+any\s*\(|\bhas\s+all\s*\(|\bhas\s+|\bdoes\s+not\s+have\s+|,|\(/gi;
    let start = -1;
    let match: RegExpExecArray | null;
    while ((match = delimiterPattern.exec(beforeCursor)) !== null) {
      start = match.index + match[0].length;
    }
    if (start < 0) return null;
    const end = this.getCurrentValueEnd(query, cursor);
    const rawToken = query.slice(start, end);
    const leadingWhitespace = rawToken.match(/^\s*/)?.[0].length ?? 0;
    const trailingWhitespace = rawToken.match(/\s*$/)?.[0].length ?? 0;
    const rangeStart = start + leadingWhitespace;
    const knownValueMatch = this.getKnownValueMatchAt(query, rangeStart);
    if (knownValueMatch) {
      const knownValueEnd = rangeStart + knownValueMatch.text.length;
      if (cursor <= knownValueEnd) {
        return {
          start: rangeStart,
          end: knownValueEnd,
          token: knownValueMatch.text
        };
      }
    }
    const rangeEnd = Math.max(rangeStart, end - trailingWhitespace);
    return {
      start: rangeStart,
      end: rangeEnd,
      token: query.slice(rangeStart, rangeEnd)
    };
  }

  private getCurrentValueEnd(query: string, cursor: number): number {
    if (query[cursor] === '[') {
      let quote: string | null = null;
      for (let i = cursor + 1; i < query.length; i++) {
        const char = query[i];
        if (quote) {
          if (char === quote) quote = null;
          continue;
        }
        if (char === "'" || char === '"') {
          quote = char;
          continue;
        }
        if (char === ']') return i + 1;
      }
    }
    let quote: string | null = null;
    for (let i = cursor; i < query.length; i++) {
      const char = query[i];
      if (quote) {
        if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === ',' || char === ')' || char === ']' || char === ';' || char === '\n') return i;
      if (/\s/.test(char)) {
        const rest = query.slice(i);
        if (/^\s+(?:and|or)\b/i.test(rest)) return i;
      }
    }
    return query.length;
  }

  private endsWithAny(value: string, endings: string[]): boolean {
    return endings.some(ending => value.endsWith(ending));
  }

  private getCurrentWordRange(query: string, cursor: number): { start: number; end: number; token: string } {
    const beforeCursor = query.slice(0, cursor);
    const match = beforeCursor.match(/[A-Za-z0-9_-]*$/);
    const token = match?.[0] || '';
    return {
      start: cursor - token.length,
      end: cursor,
      token
    };
  }

  private getCurrentPhraseRange(query: string, cursor: number): { start: number; end: number; token: string } {
    const beforeCursor = query.slice(0, cursor);
    const rawToken = this.getCurrentClausePrefix(beforeCursor);
    const leadingWhitespace = rawToken.match(/^\s*/)?.[0].length ?? 0;
    const start = cursor - rawToken.length + leadingWhitespace;
    return {
      start,
      end: cursor,
      token: query.slice(start, cursor)
    };
  }

  private normalizeValueToken(value: string): string {
    return value.replace(/^['"]|['"]$/g, '').toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private clearBlurTimer(): void {
    if (!this.blurTimer) return;
    clearTimeout(this.blurTimer);
    this.blurTimer = null;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
