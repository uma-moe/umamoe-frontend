/** A shareable query. The parameter names match Hakuraku's `/masterdata?q=…&filter=…` links. */
export interface MasterDataLink {
  sql: string;
  filter: string;
}

export function readMasterDataLink(search: string): MasterDataLink {
  const params = new URLSearchParams(search);
  return { sql: params.get('q') ?? '', filter: params.get('filter') ?? '' };
}

export function masterDataSearch({ sql, filter }: MasterDataLink): string {
  const params = new URLSearchParams();
  if (sql.trim()) params.set('q', sql);
  if (filter.trim()) params.set('filter', filter);

  const search = params.toString();
  return search ? `?${search}` : '';
}
