import type { GachaKind } from '@/lib/gacha-simulator/gacha-draw';

const KINDS: readonly GachaKind[] = ['character', 'support'];

export interface GachaQuery {
  /** The gacha type the URL asks for; characters when it names none or one we do not know. */
  kind: GachaKind;
  /** The banner the URL asks for, when it names one. */
  banner?: string;
}

export function readGachaQuery(search: string): GachaQuery {
  const query = new URLSearchParams(search);
  const requestedKind = query.get('type');

  return {
    kind: KINDS.find((kind) => kind === requestedKind) ?? 'character',
    banner: query.get('banner') ?? undefined
  };
}

/** Keeps ?type= and ?banner= on the URL, dropping each while its default is showing. */
export function writeGachaQuery({ kind, banner }: GachaQuery): void {
  const url = new URL(location.href);

  if (kind === 'character') url.searchParams.delete('type');
  else url.searchParams.set('type', kind);

  if (banner) url.searchParams.set('banner', banner);
  else url.searchParams.delete('banner');

  history.replaceState(history.state, '', `${url.pathname}${url.search}`);
}
