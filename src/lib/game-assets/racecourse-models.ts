// Resolves the whole-course models the game art pipeline publishes.
//
// Since the art tree landed, everything is addressed from `art/index.json`: a section points at a
// listing, each entry at a course document, and that document names the files. A course may be
// published whole (`model`) or as the prefabs it was assembled from (`parts`); both are handled, and
// the parts are narrowed to one variant per slot the way the pipeline assembles the whole model.

import { trackName } from '@/lib/game-data/racing/courses';

const ART_ROOT = 'https://assets.uma.moe';
const INDEX_PATH = '/art/index.json';
/** The section of `art/index.json` that lists the courses. */
const SECTION = 'racecourses';
/**
 * The season, weather and time digits the whole-course model is assembled for, from the pipeline's
 * README: a sunny spring day. `0` in a variant's digits fits any value.
 */
const VARIANT = '112';
/** A slot only the game uses: it marks where 3D spectators stand, and the course model leaves it out. */
const SPECTATOR_SLOT = '7013';
/**
 * The slots the whole-course model is assembled from, per the pipeline's README: the track and turf
 * (`0xxx`), the trees (`6000`) and the stands (`7001`–`7003`). Rails, signs and flower beds
 * (`1xxx`–`5xxx`) are templates the game places along the track at runtime, so they are not modelled
 * where they stand and would pile up at the origin.
 */
const COURSE_SLOT = /^[067]/;

export interface RacecourseModel {
  /** `race_track_id` from the game's course master: 10006 is Tokyo. */
  trackId: number;
  /** The track's name, as the rest of the site writes it. */
  name: string;
  /** File name without extension; the page's `?track=` value. */
  slug: string;
  /** The whole course, when the pipeline published it as one file. */
  url?: string;
  /** Otherwise the prefabs to draw, one variant per slot, as absolute URLs. */
  parts: string[];
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

/** `0000_002.glb` is slot `0000`, variant `002`. */
function slotOf(file: string): string {
  return file.split('_')[0] ?? '';
}

/** How badly a variant's digits miss the wanted season, weather and time; a `0` digit fits any. */
function variantDistance(file: string, target: string): number {
  const digits = (file.split('_')[1] ?? '').replace(/\.glb$/, '');
  let distance = 0;
  for (let index = 0; index < target.length; index += 1) {
    const digit = Number(digits[index] ?? 0);
    if (digit !== 0) distance += Math.abs(digit - Number(target[index]));
  }
  return distance;
}

/**
 * One prefab per slot, the variant closest to the wanted season, weather and time. Only the slots the
 * whole-course model is built from are kept, and the spectator markers are dropped.
 */
export function selectVariants(links: string[], target = VARIANT): string[] {
  const slots = new Map<string, string[]>();
  for (const link of links) {
    const slot = slotOf(link.split('/').pop() ?? '');
    if (!COURSE_SLOT.test(slot) || slot === SPECTATOR_SLOT) continue;
    slots.set(slot, [...(slots.get(slot) ?? []), link]);
  }

  const chosen: string[] = [];
  for (const slot of [...slots.keys()].sort()) {
    const variants = slots.get(slot) ?? [];
    const best = variants.reduce((winner, candidate) =>
      variantDistance(candidate.split('/').pop() ?? '', target) <
      variantDistance(winner.split('/').pop() ?? '', target)
        ? candidate
        : winner
    );
    if (best) chosen.push(best);
  }
  return chosen;
}

/**
 * The shared sky the whole-course model is drawn under, chosen by the same season/weather/time digits.
 * The parts of a course do not include it, so it is fetched once from the shared folder.
 */
export function sharedSky(links: string[], target = VARIANT): string | undefined {
  return links
    .filter((link) => /00000_9000_/.test(link))
    .reduce<string | undefined>((winner, candidate) => {
      if (!winner) return candidate;
      const score = variantDistance(candidate.split('/').pop() ?? '', target);
      return score < variantDistance(winner.split('/').pop() ?? '', target) ? candidate : winner;
    }, undefined);
}

function course(
  entry: Record<string, unknown>,
  docPath: string,
  document: Record<string, unknown>
): RacecourseModel | undefined {
  const id = typeof entry.id === 'number' ? entry.id : Number(asString(entry.id));
  if (!Number.isFinite(id)) return undefined;

  const from = docPath.replace(/\/[^/]*$/, '/');
  const link = modelLink(document);
  const parts = Array.isArray(document.parts)
    ? document.parts.flatMap((part) => {
        const path = asString(part);
        return path ? [artUrl(path, from)] : [];
      })
    : [];

  const url = link ? artUrl(link, from) : undefined;
  if (!url && parts.length === 0) return undefined;

  const file = (url ?? parts[0] ?? '').split('/').pop() ?? '';
  const named = asString(entry.name) ?? asString(document.name);
  return {
    trackId: id,
    name: trackName(id) === `Track ${id}` ? (named ?? trackName(id)) : trackName(id),
    slug: url ? file.replace(/\.glb$/, '') : `course-${id}`,
    url,
    parts: url ? [] : selectVariants(parts)
  };
}

/** Turns the `racecourses` listing into courses, reading the document each entry points at. */
export function racecourseModels(
  listing: unknown,
  listingPath = `/art/${SECTION}/index.json`
): RacecourseModel[] {
  const entries = asRecord(listing)?.[SECTION];
  if (!Array.isArray(entries)) return [];

  const models: RacecourseModel[] = [];
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) continue;
    const id = typeof record.id === 'number' ? String(record.id) : asString(record.id);
    if (!id) continue;
    const docPath =
      asString(record.index) ?? `${listingPath.replace(/index\.json$/, '')}${id}/index.json`;
    // A listing may carry the model itself; then no document read is needed.
    const inline = modelLink(record);
    const course_ = inline ? course(record, docPath, { ...record, model: inline }) : undefined;
    if (course_) models.push(course_);
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

/** Reads the published courses, following each course document. */
export async function loadRacecourseModels(
  fetchImpl: typeof fetch = fetch
): Promise<RacecourseModel[]> {
  const sections = await loadArtIndex(fetchImpl);
  const section = sections[SECTION];
  if (!section) throw new Error('The art tree has no racecourses section yet');

  const listingUrl = artUrl(section, INDEX_PATH);
  const listing = await fetchImpl(listingUrl, { headers: { accept: 'application/json' } }).then(
    (response) => (response.ok ? response.json() : undefined)
  );
  const entries = asRecord(listing)?.[SECTION];
  if (!Array.isArray(entries)) throw new Error('Course listing unavailable');

  const courses = await Promise.all(
    entries.map(async (entry) => {
      const record = asRecord(entry);
      if (!record) return undefined;
      const id = typeof record.id === 'number' ? String(record.id) : asString(record.id);
      if (!id) return undefined;
      const docPath =
        asString(record.index) ?? `${listingUrl.replace(/index\.json$/, '')}${id}/index.json`;

      if (modelLink(record)) return course(record, docPath, record);
      const document = await fetchImpl(artUrl(docPath, INDEX_PATH), {
        headers: { accept: 'application/json' }
      }).then((response) => (response.ok ? response.json() : undefined));
      const docRecord = asRecord(document);
      return docRecord ? course(record, docPath, docRecord) : undefined;
    })
  );

  const resolved = courses.filter((entry): entry is RacecourseModel => entry !== undefined);
  if (resolved.some((entry) => entry.parts.length > 0)) {
    // A course drawn from its parts is missing the shared sky the whole-course model carries.
    const sky = sharedSky(await sharedSkyLinks(fetchImpl, section));
    if (sky) for (const entry of resolved) if (!entry.url) entry.parts.push(sky);
  }
  return resolved;
}

/** The files under the shared folder, read once from the course tree. */
async function sharedSkyLinks(fetchImpl: typeof fetch, section: string): Promise<string[]> {
  const base = section.replace(/index\.json$/, '');
  const read = async (path: string) => {
    const body = await fetchImpl(artUrl(path, INDEX_PATH), {
      headers: { accept: 'application/json' }
    }).then((response) => (response.ok ? response.json() : undefined));
    return asRecord(body);
  };

  const shared = await read(`${base}shared/index.json`);
  const folders = Array.isArray(shared?.folders) ? shared.folders : [];
  const skies = folders.flatMap((folder) => {
    const path = asString(folder);
    return path && /skies/.test(path) ? [path] : [];
  });
  if (skies.length === 0) return [];

  const listing = await read(skies[0]!);
  const files = Array.isArray(listing?.files) ? listing.files : [];
  return files.flatMap((file) => {
    const path = asString(file);
    return path ? [artUrl(path, skies[0]!)] : [];
  });
}
