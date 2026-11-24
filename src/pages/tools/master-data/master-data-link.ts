/** A shareable query. The parameter names match Hakuraku's `/masterdata?q=…&filter=…` links. */
export interface MasterDataLink {
  sql: string;
  filter: string;
  source?: 'preliminary';
}

export function readMasterDataLink(search: string): MasterDataLink {
  const params = new URLSearchParams(search);
  const link: MasterDataLink = { sql: params.get('q') ?? '', filter: params.get('filter') ?? '' };
  if (params.get('source') === 'preliminary') link.source = 'preliminary';
  return link;
}

export function masterDataSearch({ sql, filter, source }: MasterDataLink): string {
  const params = new URLSearchParams();
  if (sql.trim()) params.set('q', sql);
  if (filter.trim()) params.set('filter', filter);
  if (source === 'preliminary') params.set('source', 'preliminary');

  const search = params.toString();
  return search ? `?${search}` : '';
}
