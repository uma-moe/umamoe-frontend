/** A shared view of the version history, matching Hakuraku's `/masterdata?diff=…&table=…` links. */
export interface MasterHistoryLink {
  /** Short hash of the release whose diff is open; empty when only the list is shown. */
  release: string;
  /** The table the link points at inside that diff. */
  table: string;
}

/** The history view a link opens, or `undefined` when it opens the table browser. */
export function readMasterHistoryLink(search: string): MasterHistoryLink | undefined {
  const params = new URLSearchParams(search);
  const release = params.get('diff');
  if (release) return { release, table: params.get('table') ?? '' };

  return params.get('tab') === 'history' ? { release: '', table: '' } : undefined;
}

export function masterHistorySearch({ release, table }: MasterHistoryLink): string {
  if (!release) return '?tab=history';

  const params = new URLSearchParams({ diff: release });
  if (table) params.set('table', table);
  return `?${params}`;
}
