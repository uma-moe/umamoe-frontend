import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { SQLite, type SQLNamespace } from '@codemirror/lang-sql';
import type { MasterColumn, MasterTable } from './master-data-types';

const keywords = new Set(SQLite.spec.keywords?.split(' ') ?? []);

/** Quotes names SQLite would read as keywords, such as text_data's `index` column. */
export function sqlIdentifier(name: string): string {
  const plain = /^[a-z_][a-z0-9_]*$/i.test(name) && !keywords.has(name.toLowerCase());
  return plain ? name : `"${name.replaceAll('"', '""')}"`;
}

function columnCompletion(column: MasterColumn): Completion {
  const identifier = sqlIdentifier(column.name);
  return {
    label: column.name,
    type: 'property',
    detail: column.type.toLowerCase(),
    ...(identifier === column.name ? {} : { apply: identifier })
  };
}

/** `table.column` completions, which lang-sql offers after a table name and a dot. */
export function sqlSchema(tables: MasterTable[]): SQLNamespace {
  return Object.fromEntries(
    tables.map((table) => [table.name, table.columns.map(columnCompletion)])
  );
}

/**
 * Columns of the tables the statement reads, without a table prefix: after
 * `SELECT * FROM text_data WHERE cat`, `category` is the useful suggestion.
 */
export function columnsInScope(tables: MasterTable[]) {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));

  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/\w+/);
    if (!word && !context.explicit) return null;

    const statement = context.state.doc.toString();
    const named = [...statement.matchAll(/\b(?:from|join)\s+(?:"((?:[^"]|"")+)"|([\w$]+))/gi)]
      .map((match) => byName.get((match[1]?.replaceAll('""', '"') ?? match[2] ?? '').toLowerCase()))
      .filter((table) => table !== undefined);

    if (!named.length) return null;

    return {
      from: word?.from ?? context.pos,
      options: named.flatMap((table) =>
        table.columns.map((column) => ({ ...columnCompletion(column), boost: 2 }))
      ),
      validFor: /^\w*$/
    };
  };
}
