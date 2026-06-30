import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  drawSelection,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
} from '@codemirror/view';
import {
  Completion,
  CompletionContext,
  CompletionResult,
  acceptCompletion,
  autocompletion,
  closeCompletion,
  completionKeymap,
  startCompletion,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
} from '@codemirror/commands';

import type { UqlHighlightSegment, UqlSuggestion, UqlValidationIssue } from './uql-filter.component';

export interface UqlCompletionResult {
  from: number;
  to: number;
  options: UqlSuggestion[];
}

export type UqlEditorValidationState = 'empty' | 'valid' | 'incomplete' | 'invalid';

class UqlWherePrefixWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'uql-cm-where-prefix';
    el.textContent = 'where ';
    return el;
  }
  override eq(other: WidgetType): boolean {
    return other instanceof UqlWherePrefixWidget;
  }
  override ignoreEvent(): boolean { return true; }
}

class UqlChipWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly imageUrl: string | undefined,
    private readonly title: string | undefined,
    private readonly contextClass: string,
    private readonly rarityClass: string | undefined,
    private readonly badgeText: string | undefined,
    private readonly badgeClass: string | undefined,
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `uql-cm-chip ${this.contextClass} ${this.rarityClass ? `uql-cm-rarity-${this.rarityClass}` : ''}`.trim();
    if (this.title) el.title = this.title;
    if (this.imageUrl) {
      const img = document.createElement('img');
      img.src = this.imageUrl;
      img.alt = '';
      img.className = 'uql-cm-chip-img';
      el.appendChild(img);
    }
    const label = document.createElement('span');
    label.textContent = this.text;
    label.className = 'uql-cm-chip-label';
    el.appendChild(label);
    if (this.badgeText) {
      const badge = document.createElement('span');
      badge.textContent = this.badgeText;
      badge.className = `uql-cm-chip-badge ${this.badgeClass ? `uql-cm-chip-badge-${this.badgeClass}` : ''}`.trim();
      el.appendChild(badge);
    }
    return el;
  }

  override eq(other: WidgetType): boolean {
    if (!(other instanceof UqlChipWidget)) return false;
    return other.text === this.text
      && other.imageUrl === this.imageUrl
      && other.contextClass === this.contextClass
      && other.rarityClass === this.rarityClass
      && other.title === this.title
      && other.badgeText === this.badgeText
      && other.badgeClass === this.badgeClass;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const setSegmentsEffect = StateEffect.define<UqlHighlightSegment[]>();
const setValidationIssueEffect = StateEffect.define<UqlValidationIssue | null>();

function isChipSegment(seg: UqlHighlightSegment): boolean {
  if (seg.kind !== 'identifier') return false;
  if (seg.imageUrl || seg.valueContext === 'race-saddle' || seg.valueContext === 'legacy') return true;
  return !!seg.valueContext?.endsWith('-factor') && (seg.atomic || !!seg.title || !!seg.displayText);
}

function buildDecorationsFromSegments(segments: UqlHighlightSegment[], docLength: number): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const seg of segments) {
    const rawFrom = seg.sourceStart;
    const rawTo = seg.sourceEnd;
    if (rawFrom === undefined || rawTo === undefined) continue;
    const from = Math.max(0, Math.min(docLength, rawFrom));
    const to = Math.max(from, Math.min(docLength, rawTo));
    if (from === to) continue;
    if (from < lastTo) continue; // guard against accidental overlap
    if (isChipSegment(seg)) {
      const ctxClass = seg.valueContext ? `uql-cm-ctx-${seg.valueContext}` : '';
      const display = seg.displayText || seg.text;
      builder.add(
        from,
        to,
        Decoration.replace({
          widget: new UqlChipWidget(display, seg.imageUrl, seg.title, ctxClass, seg.rarityClass, seg.badgeText, seg.badgeClass),
          inclusive: false,
        }),
      );
    } else {
      const classes: string[] = [`uql-cm-${seg.kind}`];
      if (seg.kind === 'paren' && seg.depth !== undefined) {
        classes.push(`uql-cm-paren-depth-${seg.depth}`);
      }
      if (seg.valueContext) {
        classes.push(`uql-cm-ctx-${seg.valueContext}`);
      }
      if (seg.scopeContext) {
        classes.push(`uql-cm-scope-${seg.scopeContext}`);
      }
      builder.add(from, to, Decoration.mark({ class: classes.join(' ') }));
    }
    lastTo = to;
  }
  return builder.finish();
}

const decorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const ef of tr.effects) {
      if (ef.is(setSegmentsEffect)) {
        deco = buildDecorationsFromSegments(ef.value, tr.state.doc.length);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function buildValidationDecorations(issue: UqlValidationIssue | null, docLength: number): DecorationSet {
  if (!issue) return Decoration.none;
  const from = Math.max(0, Math.min(docLength, issue.from));
  const to = Math.max(from, Math.min(docLength, issue.to));
  if (from === to) return Decoration.none;
  const classes = [
    'uql-cm-validation-issue',
    `uql-cm-validation-${issue.state}`,
  ];
  return Decoration.set([
    Decoration.mark({
      class: classes.join(' '),
      attributes: issue.message ? { title: issue.message } : undefined,
    }).range(from, to),
  ]);
}

const validationIssueField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const ef of tr.effects) {
      if (ef.is(setValidationIssueEffect)) {
        deco = buildValidationDecorations(ef.value, tr.state.doc.length);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const wherePrefixPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    private build(view: EditorView): DecorationSet {
      if (view.state.doc.lines < 1) return Decoration.none;
      const first = view.state.doc.line(1);
      return Decoration.set([
        Decoration.widget({
          widget: new UqlWherePrefixWidget(),
          side: -1,
        }).range(first.from),
      ]);
    }
  },
  { decorations: (v) => v.decorations },
);

@Component({
  selector: 'app-uql-code-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="uql-cm-frame" [ngClass]="validationState">
      <div class="uql-cm-toolbar">
        <span class="uql-cm-lang">uql</span>
        <span class="uql-cm-meta">Ctrl+Space · Tab completes · Esc closes</span>
        <button
          *ngIf="value"
          type="button"
          class="uql-cm-clear"
          aria-label="Clear UQL"
          (click)="clear.emit()">
          <mat-icon>close</mat-icon>
        </button>
      </div>
      <div class="uql-cm-shell">
        <div #host class="uql-cm-host"></div>
      </div>
    </div>
  `,
  styleUrl: './uql-code-editor.component.scss',
})
export class UqlCodeEditorComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  @Input() value = '';
  @Input() validationState: UqlEditorValidationState = 'empty';
  @Input() validationIssue: UqlValidationIssue | null = null;
  @Input() placeholder = '';
  @Input() tokenize: ((text: string) => UqlHighlightSegment[]) | null = null;
  @Input() complete: ((text: string, pos: number) => UqlCompletionResult | null) | null = null;

  @Output() valueChange = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  private view: EditorView | null = null;
  private placeholderCompartment = new Compartment();
  private applyingExternalValue = false;
  private lastSegmentText: string | null = null;

  constructor(private readonly ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => this.createEditor());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.view) return;
    if (changes['value']) {
      const next = this.value || '';
      const current = this.view.state.doc.toString();
      if (next !== current) {
        this.applyingExternalValue = true;
        this.view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
        this.applyingExternalValue = false;
      }
    } else if (changes['tokenize']) {
      this.lastSegmentText = null;
      this.dispatchSegments();
    }
    if (changes['validationIssue']) {
      this.dispatchValidationIssue();
    }
    if (changes['placeholder']) {
      this.view.dispatch({
        effects: this.placeholderCompartment.reconfigure(placeholderExt(this.placeholder || '')),
      });
    }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  private createEditor(): void {
    const updateListener = EditorView.updateListener.of((u: ViewUpdate) => {
      if (!u.docChanged) return;
      const next = u.state.doc.toString();
      this.dispatchSegments();
      if (this.applyingExternalValue) return;
      if (next === this.value) return;
      this.value = next;
      this.ngZone.run(() => this.valueChange.emit(next));
    });

    const completionSource = (ctx: CompletionContext): CompletionResult | null => {
      const text = ctx.state.doc.toString();
      const pos = ctx.pos;
      const result = this.complete?.(text, pos);
      if (!result || result.options.length === 0) return null;
      return {
        from: result.from,
        to: result.to,
        filter: false,
        options: result.options.map((s) => {
          const completion: Completion & { _uql: UqlSuggestion } = {
            label: s.label,
            type: s.kind,
            apply: (view: EditorView, _completion, from: number, to: number) => {
              const insertValue = s.insertText;
              const adjustedFrom = this.getOverlappingCompletionStart(view.state.doc.toString(), from, insertValue, s.kind);
              const prefix = view.state.doc.sliceString(0, adjustedFrom);
              const suffix = view.state.doc.sliceString(to);
              const needsLeading = prefix.length > 0 && !/[\s(,]$/.test(prefix);
              const needsTrailing = suffix.length > 0 && !/^[\s),;]/.test(suffix);
              const insert = `${needsLeading ? ' ' : ''}${insertValue}${needsTrailing ? ' ' : ''}`;
              const cursorPos = adjustedFrom + insert.length + (s.cursorOffset ?? 0);
              view.dispatch({
                changes: { from: adjustedFrom, to, insert },
                selection: { anchor: cursorPos },
              });
            },
            _uql: s,
          };
          return completion;
        }),
      };
    };

    const state = EditorState.create({
      doc: this.value || '',
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        this.placeholderCompartment.of(placeholderExt(this.placeholder || '')),
        decorationField,
        validationIssueField,
        wherePrefixPlugin,
        autocompletion({
          override: [completionSource],
          activateOnTyping: true,
          maxRenderedOptions: 80,
          icons: false,
          closeOnBlur: true,
          optionClass: (c: Completion) => {
            const meta = (c as Completion & { _uql?: UqlSuggestion })._uql;
            const parts = ['uql-cm-completion'];
            if (meta?.valueContext) parts.push(`uql-cm-completion-ctx-${meta.valueContext}`);
            if (meta?.scopeContext) parts.push(`uql-cm-completion-scope-${meta.scopeContext}`);
            if (meta?.rarityClass) parts.push(`uql-cm-completion-rarity-${meta.rarityClass}`);
            if (meta?.badgeClass) parts.push(`uql-cm-completion-badge-${meta.badgeClass}`);
            return parts.join(' ');
          },
          addToOptions: [
            {
              render: (c: Completion) => {
                const meta = (c as Completion & { _uql?: UqlSuggestion })._uql;
                if (!meta?.imageUrl) return null;
                const img = document.createElement('img');
                img.src = meta.imageUrl;
                img.alt = '';
                img.className = 'uql-cm-completion-img';
                return img;
              },
              position: 20,
            },
            {
              render: (c: Completion) => {
                const meta = (c as Completion & { _uql?: UqlSuggestion })._uql;
                if (!meta?.badgeText) return null;
                const badge = document.createElement('span');
                badge.textContent = meta.badgeText;
                badge.className = `uql-cm-completion-badge ${meta.badgeClass ? `uql-cm-completion-badge-${meta.badgeClass}` : ''}`.trim();
                return badge;
              },
              position: 35,
            },
          ],
        }),
        keymap.of([
          { key: 'Tab', run: acceptCompletion },
          { key: 'Mod-Space', run: startCompletion },
          { key: 'Escape', run: closeCompletion },
          { key: 'Space', run: (view) => this.autoInsertInListParens(view) },
          ...completionKeymap,
          ...historyKeymap,
          ...defaultKeymap,
        ]),
        EditorView.theme(
          {
            '&': {
              color: 'rgba(255,255,255,0.92)',
              backgroundColor: 'transparent',
              fontSize: '13px',
            },
            '&.cm-focused': { outline: 'none' },
            '.cm-scroller': {
              fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace',
              lineHeight: '1.55',
              minHeight: '112px',
              maxHeight: '320px',
            },
            '.cm-content': {
              padding: '12px 12px 12px 8px',
              caretColor: '#64b5f6',
            },
            '.cm-line': { padding: '0 0 0 0' },
            '.cm-gutters': {
              background: 'transparent',
              color: 'rgba(255,255,255,0.5)',
              border: 'none',
              borderRight: '1px solid rgba(255,255,255,0.12)',
              fontFamily: '"JetBrains Mono",monospace',
              fontSize: '12px',
            },
            '.cm-gutterElement': { padding: '0 8px 0 6px', minWidth: '28px' },
            '.cm-activeLine': { backgroundColor: 'transparent' },
            '.cm-activeLineGutter': { backgroundColor: 'transparent' },
            '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection':
              {
                backgroundColor: 'rgba(100, 181, 246, 0.32) !important',
              },
            '.cm-cursor': { borderLeftColor: '#64b5f6', borderLeftWidth: '2px' },
            '.cm-tooltip': {
              background: 'rgba(17,21,26,0.97)',
              border: '1px solid rgba(100,181,246,0.2)',
              borderRadius: '6px',
              color: 'rgba(255,255,255,0.92)',
              boxShadow: '0 14px 32px rgba(0,0,0,0.42)',
              maxWidth: '420px',
            },
            '.cm-tooltip-autocomplete': { padding: '4px' },
            '.cm-tooltip-autocomplete > ul': {
              fontFamily: 'inherit',
              maxHeight: '240px',
            },
            '.cm-tooltip-autocomplete > ul > li': {
              padding: '4px 8px',
              borderRadius: '4px',
              color: 'rgba(255,255,255,0.78)',
            },
            '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
              background: 'rgba(100,181,246,0.12)',
              color: '#fff',
            },
            '.cm-completionDetail': {
              color: 'rgba(255,255,255,0.5)',
              fontStyle: 'normal',
              marginLeft: '12px',
              fontSize: '11px',
            },
          },
          { dark: true },
        ),
        updateListener,
      ],
    });

    this.view = new EditorView({
      state,
      parent: this.host.nativeElement,
    });
    this.dispatchSegments();
    this.dispatchValidationIssue();
  }

  private autoInsertInListParens(view: EditorView): boolean {
    const selection = view.state.selection.main;
    if (!selection.empty) return false;
    const cursor = selection.head;
    const before = view.state.doc.sliceString(0, cursor);
    const after = view.state.doc.sliceString(cursor);
    if (/^\s*\(/.test(after)) return false;
    const beforeOperator = before.replace(/\s+$/g, '');
    if (!/(?:^|\S\s+)(?:not\s+)?in$/i.test(beforeOperator)) return false;
    view.dispatch({
      changes: { from: cursor, to: cursor, insert: ' ()' },
      selection: { anchor: cursor + 2 },
    });
    return true;
  }

  private getOverlappingCompletionStart(text: string, from: number, insertValue: string, kind: UqlSuggestion['kind']): number {
    if (kind !== 'field' && kind !== 'snippet') return from;
    const before = text.slice(0, from);
    const trimmedBefore = before.replace(/\s+$/, '');
    if (!trimmedBefore || !insertValue.trim()) return from;
    const clauseMatch = trimmedBefore.match(/(?:^|[\n;(]|\b(?:where|and|or|not)\s+)([^\n;()]*)$/i);
    if (!clauseMatch) return from;
    const phrase = (clauseMatch[1] || '').trim();
    if (!phrase || phrase.length < 3) return from;
    const normalizedPhrase = this.normalizeCompletionOverlapText(phrase);
    const normalizedInsert = this.normalizeCompletionOverlapText(insertValue);
    if (!normalizedInsert.startsWith(normalizedPhrase)) return from;
    const phraseStart = trimmedBefore.length - phrase.length;
    return Math.max(0, phraseStart);
  }

  private normalizeCompletionOverlapText(value: string): string {
    return value.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private dispatchSegments(): void {
    if (!this.view || !this.tokenize) return;
    const text = this.view.state.doc.toString();
    if (text === this.lastSegmentText) return;
    this.lastSegmentText = text;
    const segments = this.tokenize(text);
    this.view.dispatch({ effects: setSegmentsEffect.of(segments) });
  }

  private dispatchValidationIssue(): void {
    if (!this.view) return;
    this.view.dispatch({ effects: setValidationIssueEffect.of(this.validationIssue) });
  }
}
