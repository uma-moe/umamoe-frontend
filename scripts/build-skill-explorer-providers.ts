// Extracts Global trainee and support sources, including events, from GameTora's public datasets.
// Only IDs and canonical page paths are saved; the frontend supplies names, artwork and release flags.
//   node scripts/build-skill-explorer-providers.ts [out-dir] [snapshot-dir]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

interface ProviderCard {
  card: number;
  path: string;
  skills: number[];
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid GameTora record.');
  return value as Record<string, unknown>;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Invalid GameTora list.');
  return value.map(record);
}

function id(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)
    throw new Error('Invalid GameTora ID.');
  return value;
}

function sourceIds(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Invalid GameTora source IDs.');
  return value.flat().map(id);
}

function providerCards(value: unknown, idField: string): Map<number, ProviderCard> {
  return new Map(
    rows(value).map((card) => {
      const cardId = id(card[idField]);
      const page = card.url_name;
      if (typeof page !== 'string' || !page.startsWith(`${cardId}-`) || !/^[a-z0-9-]+$/.test(page))
        throw new Error('Invalid GameTora card page.');

      return [cardId, { card: cardId, path: page, skills: [] }];
    })
  );
}

export function buildProviderCatalog(rawSkills: unknown, rawUmas: unknown, rawSupports: unknown) {
  const umas = providerCards(rawUmas, 'card_id');
  const supports = providerCards(rawSupports, 'support_id');

  function add(cards: Map<number, ProviderCard>, cardIds: number[], skillIds: number[]) {
    for (const cardId of cardIds) {
      const card = cards.get(cardId);
      if (card === undefined) throw new Error(`GameTora source card ${cardId} is missing.`);

      for (const skillId of skillIds) {
        if (!card.skills.includes(skillId)) card.skills.push(skillId);
      }
    }
  }

  for (const skill of rows(rawSkills)) {
    const locale = skill.loc === undefined ? {} : record(skill.loc);
    const global = locale.en === undefined ? {} : record(locale.en);
    const rarity = id(skill.rarity);
    const unique = rarity >= 3 && rarity <= 5;
    // Normal and gold source lists are replaced as a whole for Global, including absent/empty fields.
    const sources = unique ? { ...skill, ...global } : global;
    const skillIds = [id(skill.id)];
    if (skill.gene_version !== undefined) skillIds.push(id(record(skill.gene_version).id));

    add(umas, [...sourceIds(sources.char), ...sourceIds(sources.char_e)], skillIds);
    add(supports, [...sourceIds(sources.sup_hint), ...sourceIds(sources.sup_e)], skillIds);
  }

  const populated = (cards: Map<number, ProviderCard>) =>
    [...cards.values()]
      .filter((card) => card.skills.length > 0)
      .sort((left, right) => left.card - right.card);
  return { umas: populated(umas), supports: populated(supports) };
}

async function main() {
  const [outDir = 'public/skill-explorer', snapshotDir] = process.argv.slice(2);
  const readJson = async (key: string, url: string): Promise<unknown> => {
    if (snapshotDir)
      return JSON.parse(await readFile(path.join(snapshotDir, `gametora-${key}.json`), 'utf8'));

    const response = await fetch(url);
    if (!response.ok) throw new Error(`GameTora ${key} returned ${response.status}.`);
    return response.json();
  };
  const manifest = record(
    await readJson('manifest', 'https://gametora.com/data/manifests/umamusume.json')
  );
  const keys = ['skills', 'character-cards', 'support-cards'];
  const datasets = await Promise.all(
    keys.map((key) => {
      const hash = manifest[key];
      if (typeof hash !== 'string' || !/^[a-z0-9]+$/i.test(hash))
        throw new Error(`Invalid GameTora ${key} revision.`);
      return readJson(key, `https://gametora.com/data/umamusume/${key}.${hash}.json`);
    })
  );
  const catalog = buildProviderCatalog(datasets[0], datasets[1], datasets[2]);
  const output = path.join(outDir, 'providers.json.gz');
  await writeFile(
    output,
    gzipSync(
      JSON.stringify({
        generated: new Date().toISOString(),
        source: 'https://gametora.com/umamusume/skills',
        revisions: Object.fromEntries(keys.map((key) => [key, manifest[key]])),
        ...catalog
      }),
      { level: 9 }
    )
  );
  console.log(
    `${catalog.umas.length} trainee and ${catalog.supports.length} support source lists → ${output}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
