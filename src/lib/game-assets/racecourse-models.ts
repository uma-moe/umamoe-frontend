// Resolves the whole-course models the game art pipeline publishes.
//
// Since the art tree landed, everything is addressed from `art/index.json`: a section name points at
// a listing, and each entry in that listing names its own files. Courses are not in that tree yet, so
// this reader looks for the `racecourses` section and says plainly when it is not there.

import { trackName } from '@/lib/game-data/racing/courses';

const ART_ROOT = 'https://assets.uma.moe';
const INDEX_PATH = '/art/index.json';
/** The section of `art/index.json` that lists the courses. */
const SECTION = 'racecourses';

export interface RacecourseModel {
  /** `race_track_id` from the game's course master: 10006 is Tokyo. */
  trackId: number;
  /** The track's name, as the rest of the site writes it. */
  name: string;
  /** File name without extension; the page's `?track=` value. */
  slug: string;
  url: string;
}

/** Absolute URL for a link from a document, which may be rooted at `/` or relative to it. */
export function artUrl(link: string, from: string): string {
  if (link.startsWith('/')) return `${ART_ROOT}${link}`;
  return new URL(link, `${ART_ROOT}${from}`).toString();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** The path a document gives for its model, whether it is a plain link or `{ file }`. */
function modelLink(entry: Record<string, unknown>): string | undefined {
  const model = entry.model;
  if (typeof model === 'string') return model;
  const record = asRecord(model);
  return record ? asString(record.file) : undefined;
}

function model(path: string, link: string, from: string, fallbackName?: string): RacecourseModel {
  const url = artUrl(link, from);
  const file = url.split('/').pop() ?? '';
  const slug = file.replace(/\.glb$/, '');
  const id = Number(path.replace(/\D+/g, ''));
  return {
    trackId: id,
    name: trackName(id) === `Track ${id}` ? (fallbackName ?? trackName(id)) : trackName(id),
    slug,
    url
  };
}

/**
 * Turns the `racecourses` listing into courses. An entry may name its model directly, or point at the
 * course document that names it; both shapes are accepted so the tree can settle.
 */
export function racecourseModels(
  listing: unknown,
  listingPath = `/art/${SECTION}/index.json`
): RacecourseModel[] {
  const entries = asRecord(listing)?.[SECTION];
  if (!Array.isArray(entries)) return [];

  const seen = new Set<string>();
  const models: RacecourseModel[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = typeof record.id === 'number' ? String(record.id) : asString(record.id);
    if (!id) continue;
    const link = modelLink(record);
    const from =
      asString(record.index) ?? `${listingPath.replace(/index\.json$/, '')}${id}/index.json`;
    // The listing may only point at the course document; then the model comes from a later read.
    if (!link) continue;
    const course = model(`/${id}`, link, from.replace(/\/[^/]*$/, '/'), asString(record.name));
    if (seen.has(course.url)) continue;
    seen.add(course.url);
    models.push(course);
  }
  return models.sort((left, right) => left.name.localeCompare(right.name));
}

/** Sections of `art/index.json`, so a caller can see what exists. */
export async function loadArtIndex(
  fetchImpl: typeof fetch = fetch
): Promise<Record<string, string>> {
  const response = await fetchImpl(`${ART_ROOT}${INDEX_PATH}`, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Asset index unavailable (${response.status})`);
  const sections = asRecord(asRecord(await response.json())?.sections) ?? {};
  return Object.fromEntries(
    Object.entries(sections).flatMap(([name, link]) => {
      const path = asString(link);
      return path ? [[name, path]] : [];
    })
  );
}

/** Reads the published courses. */
export async function loadRacecourseModels(
  fetchImpl: typeof fetch = fetch
): Promise<RacecourseModel[]> {
  const sections = await loadArtIndex(fetchImpl);
  const section = sections[SECTION];
  if (!section) throw new Error('The art tree has no racecourses section yet');

  const response = await fetchImpl(artUrl(section, INDEX_PATH), {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`Course listing unavailable (${response.status})`);

  const listing = await response.json();
  const listed = racecourseModels(listing, section);
  if (listed.length > 0) return listed;

  // The listing only points at course documents: read them, they are small.
  const entries = asRecord(listing)?.[SECTION];
  const documents = Array.isArray(entries) ? entries : [];
  const courses = await Promise.all(
    documents.map(async (entry) => {
      const record = asRecord(entry);
      const path = record ? asString(record.index) : undefined;
      if (!path) return undefined;
      const doc = await fetchImpl(artUrl(path, INDEX_PATH), {
        headers: { accept: 'application/json' }
      }).then((result) => (result.ok ? result.json() : undefined));
      const docRecord = asRecord(doc);
      const link = docRecord ? modelLink(docRecord) : undefined;
      const id = record && typeof record.id === 'number' ? String(record.id) : '';
      if (!link || !id) return undefined;
      return model(`/${id}`, link, path.replace(/\/[^/]*$/, '/'), asString(record?.name));
    })
  );
  return courses.filter((course): course is RacecourseModel => course !== undefined);
}
