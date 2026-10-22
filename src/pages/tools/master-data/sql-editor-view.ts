import { Compartment, EditorState, Prec } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  keymap,
  lineNumbers,
  placeholder,
  tooltips,
  type ViewUpdate
} from '@codemirror/view';
import { acceptCompletion, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { SQLite, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import type { MasterTable } from './master-data-types';
import { columnsInScope, sqlSchema } from './sql-completions';

// The same palette as the UQL editor, on its dark code surface in both themes.
const sqlHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c792ea', fontWeight: '600' },
  { tag: [tags.special(tags.string), tags.typeName], color: '#f7c873' },
  { tag: tags.string, color: '#c3e88d' },
  { tag: [tags.number, tags.bool, tags.null], color: '#ff9d77' },
  { tag: tags.operator, color: '#89ddff' },
  {
    tag: [tags.lineComment, tags.blockComment],
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic'
  }
]);

const editorTheme = EditorView.theme(
  {
    '&': { color: 'rgba(255,255,255,0.92)', backgroundColor: 'transparent', fontSize: '13px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': {
      fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace',
      lineHeight: '1.55',
      minHeight: '96px',
      maxHeight: '320px'
    },
    '.cm-content': { padding: '10px 12px 10px 8px', caretColor: '#64b5f6' },
    '.cm-gutters': {
      background: 'transparent',
      color: 'rgba(255,255,255,0.45)',
      border: 'none',
      borderRight: '1px solid rgba(255,255,255,0.12)'
    },
    '.cm-gutterElement': { padding: '0 8px 0 6px', minWidth: '28px' },
    '.cm-placeholder': { color: 'rgba(255,255,255,0.4)' },
    '.cm-cursor': { borderLeftColor: '#64b5f6', borderLeftWidth: '2px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(100, 181, 246, 0.32) !important'
    },
    '.cm-matchingBracket': { backgroundColor: 'rgba(137, 221, 255, 0.18)' },
    '.cm-tooltip': {
      background: 'rgba(17,21,26,0.97)',
      border: '1px solid rgba(100,181,246,0.2)',
      borderRadius: '6px',
      color: 'rgba(255,255,255,0.92)',
      boxShadow: '0 14px 32px rgba(0,0,0,0.42)'
    },
    '.cm-tooltip-autocomplete > ul': {
      fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace',
      maxHeight: '260px'
    },
    '.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px', color: 'rgba(255,255,255,0.78)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
      background: 'rgba(100,181,246,0.16)',
      color: '#fff'
    },
    '.cm-completionDetail': { color: 'rgba(255,255,255,0.5)', fontStyle: 'normal' }
  },
  { dark: true }
);

function sqlLanguage(tables: MasterTable[]) {
  return [
    sql({ dialect: SQLite, schema: sqlSchema(tables), upperCaseKeywords: true }),
    SQLite.language.data.of({ autocomplete: columnsInScope(tables) })
  ];
}

// Svelte owns mounting, binding and cleanup; this class owns one CodeMirror view.
export class SqlEditorView {
  #view: EditorView;
  #language = new Compartment();
  #applyingExternalValue = false;

  constructor(options: {
    host: HTMLElement;
    id: string;
    value: string;
    onchange: (text: string) => void;
    onrun: () => void;
  }) {
    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged && !this.#applyingExternalValue)
        options.onchange(update.state.doc.toString());
    });

    const runKey = Prec.highest(
      keymap.of([
        {
          key: 'Mod-Enter',
          run: () => {
            options.onrun();
            return true;
          }
        }
      ])
    );

    this.#view = new EditorView({
      parent: options.host,
      state: EditorState.create({
        doc: options.value,
        extensions: [
          EditorView.contentAttributes.of({
            id: options.id,
            'aria-label': 'SQL query',
            'data-gramm': 'false'
          }),
          runKey,
          lineNumbers(),
          history(),
          drawSelection(),
          bracketMatching(),
          EditorView.lineWrapping,
          placeholder('SELECT * FROM text_data WHERE category = 6'),
          this.#language.of(sqlLanguage([])),
          syntaxHighlighting(sqlHighlight),
          // Results scroll in their own panel; completions must not be clipped by it.
          tooltips({ parent: options.host.ownerDocument.body }),
          autocompletion({ icons: false, maxRenderedOptions: 80 }),
          keymap.of([
            { key: 'Tab', run: acceptCompletion },
            ...completionKeymap,
            ...historyKeymap,
            ...defaultKeymap
          ]),
          editorTheme,
          updateListener
        ]
      })
    });
  }

  setValue(value: string): void {
    const current = this.#view.state.doc.toString();
    if (value === current) return;

    this.#applyingExternalValue = true;
    this.#view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    this.#applyingExternalValue = false;
  }

  setTables(tables: MasterTable[]): void {
    this.#view.dispatch({ effects: this.#language.reconfigure(sqlLanguage(tables)) });
  }

  destroy(): void {
    this.#view.destroy();
  }
}
