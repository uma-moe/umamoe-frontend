// Builds Build search's potential-skill data: the skills each trainee card lets her buy without a hint, and the
// potential (talent) level that unlocks each. Level 1 gives a card's starting skills; levels 2 to 5 add one each.
// Cards out on Global come from the beta resources' Global master; an optional JP master adds cards Global lacks.
//   npx vite-node scripts/build-potential-skills.ts [jp-master.mdb] [out-dir]
// Writes `potential-skills.json.gz`: `{generated, globalMaster, cards: [{card, skills: [[level, skill id], ...]}]}`.
// Rerun after a game update.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import initSqlJs, { type Database } from 'sql.js';

const BETA_RESOURCES = 'https://beta.uma.moe';
const GZIP_MAGIC = [0x1f, 0x8b];

/** Trainee cards are 1CCCOO: character CCC, outfit OO. Ids outside it are special story cards. */
const TRAINEE_CARDS = 'c.id BETWEEN 100000 AND 199999';

/** The master numbers a card's starting skills rank 0; potential levels 2 to 5 keep their own number. */
const STARTING_RANK = 0;
const STARTING_LEVEL = 1;

interface CardPotentialSkills {
  card: number;
  /** `[potential level, skill id]`, by level. */
  skills: [number, number][];
}

const [jpMasterPath, outDir = 'public/game-data'] = process.argv.slice(2);

/** The Global master the beta resources publish, and its game version marker. */
async function betaGlobalMaster(): Promise<{ bytes: Uint8Array; marker: string }> {
  const manifestResponse = await fetch(`${BETA_RESOURCES}/resources/manifest.json`);
  if (!manifestResponse.ok)
    throw new Error(`The beta resources manifest returned ${manifestResponse.status}.`);

  const manifest: unknown = await manifestResponse.json();
  const master =
    typeof manifest === 'object' && manifest !== null && 'master' in manifest
      ? manifest.master
      : undefined;
  if (
    typeof master !== 'object' ||
    master === null ||
    !('path' in master) ||
    typeof master.path !== 'string'
  )
    throw new Error('The beta resources manifest names no master database.');

  const masterResponse = await fetch(`${BETA_RESOURCES}${master.path}`);
  if (!masterResponse.ok)
    throw new Error(`The beta master database returned ${masterResponse.status}.`);

  // Served as .gz, though the response may already be decoded.
  const body = new Uint8Array(await masterResponse.arrayBuffer());
  const gzipped = GZIP_MAGIC.every((byte, index) => body[index] === byte);
  const marker = 'marker' in master && typeof master.marker === 'string' ? master.marker : '';
  return { bytes: gzipped ? gunzipSync(body) : body, marker };
}

function cardPotentialSkills(database: Database): Map<number, CardPotentialSkills> {
  const result = database.exec(`
    SELECT c.id, available.need_rank, available.skill_id
    FROM card_data c
    JOIN available_skill_set available ON available.available_skill_set_id = c.available_skill_set_id
    WHERE ${TRAINEE_CARDS} AND available.skill_id > 0
    ORDER BY c.id, available.need_rank, available.id
  `);

  const cards = new Map<number, CardPotentialSkills>();
  for (const row of result[0]?.values ?? []) {
    const [card, rank, skill] = row.map(Number) as [number, number, number];
    const level = rank === STARTING_RANK ? STARTING_LEVEL : rank;

    const entry = cards.get(card) ?? { card, skills: [] };
    entry.skills.push([level, skill]);
    cards.set(card, entry);
  }

  return cards;
}

const SQL = await initSqlJs();
const globalMaster = await betaGlobalMaster();

const globalDatabase = new SQL.Database(globalMaster.bytes);
const globalCards = cardPotentialSkills(globalDatabase);
globalDatabase.close();

// A card's Global skills win: JP has since given some cards more.
const cards = new Map<number, CardPotentialSkills>();
if (jpMasterPath) {
  const jpDatabase = new SQL.Database(await readFile(jpMasterPath));
  for (const [card, skills] of cardPotentialSkills(jpDatabase)) cards.set(card, skills);
  jpDatabase.close();
}

for (const [card, skills] of globalCards) cards.set(card, skills);

const output = path.join(outDir, 'potential-skills.json.gz');
await writeFile(
  output,
  gzipSync(
    JSON.stringify({
      generated: new Date().toISOString(),
      globalMaster: globalMaster.marker,
      cards: [...cards.values()].sort((left, right) => left.card - right.card)
    }),
    { level: 9 }
  )
);

console.log(
  `${globalCards.size} Global cards (${globalMaster.marker}) and ${cards.size - globalCards.size} JP-only cards → ${output}`
);
