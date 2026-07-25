const RACE_THUMBNAIL_DIRECTORY = '/assets/images/race-thumbnails';

export const RACE_THUMBNAIL_ID_BY_NAME: Readonly<Record<string, number>> = {
  kawasakikinen: 1107,
  zennipponjunioryushun: 1108,
  kashiwakinen: 1109,
  mcnambuhai: 1110,
};

export function normalizeRaceName(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '')
    : '';
}

export function getRaceThumbnailUrl(thumbnailId: unknown): string | null {
  const id = Number(thumbnailId);
  return Number.isInteger(id) && id > 0
    ? `${RACE_THUMBNAIL_DIRECTORY}/thum_race_rt_000_${id}_00.webp`
    : null;
}

export function getKnownRaceThumbnailId(name: unknown): number | null {
  return RACE_THUMBNAIL_ID_BY_NAME[normalizeRaceName(name)] ?? null;
}
