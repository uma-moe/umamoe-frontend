// Builds the Skill Explorer's uma picker data: which skills each trainee card gives. Cards out on Global come from the
// beta resources' Global master, which follows each game update; cards Global does not have yet come from a JP master.
// The page names them and tells released from upcoming at runtime, from the character list and the banner timeline.
//   npx vite-node scripts/build-skill-explorer-umas.ts <jp-master.mdb> [out-dir]
// Writes `umas.json.gz`: `{generated, globalMaster, cards: [{card, unique?, skills}]}`, with `unique` the inherited
// version of the card's unique skill (as the explorer values it) and `skills` its starting and potential-level skills.
// Skills from training events are not in the master and are left out. Rerun after a game update or a new JP master.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import initSqlJs, { type Database } from 'sql.js';

const BETA_RESOURCES = 'https://beta.uma.moe';
const GZIP_MAGIC = [0x1f, 0x8b];

/** Trainee cards are 1CCCOO: character CCC, outfit OO. Ids outside it are special story cards. */
const TRAINEE_CARDS = 'c.id BETWEEN 100000 AND 199999';
/** Inherited uniques are 9xxxxx; some uniques also have longer scenario-only inherited ids. */
const INHERITED_UNIQUES = 'inherited.id BETWEEN 900000 AND 999999';

interface UmaSkills {
  card: number;
  unique?: number;
  skills: number[];
}

const [jpMasterPath, outDir = 'public/skill-explorer'] = process.argv.slice(2);
if (!jpMasterPath) {
  console.error('build-skill-explorer-umas <jp-master.mdb> [out-dir]');
  process.exit(1);
}

/** The Global master the beta resources publish, and its game version marker. */
async function betaGlobalMaster(): Promise<{ bytes: Uint8Array; marker: string }> {
  const manifestResponse = await fetch(`${BETA_RESOURCES}/resources/manifest.json`);
  if (!manifestResponse.ok)
    throw new Error(`The beta resources manifest returned ${manifestResponse.status}.`);

  const manifest: unknown = await manifestResponse.json();
  const master =
    typeof manifest === 'object' && manifest !== null && 'master' in manifest ? manifest.master : undefined;
  if (typeof master !== 'object' || master === null || !('path' in master) || typeof master.path !== 'string')
    throw new Error('The beta resources manifest names no master database.');

  const masterResponse = await fetch(`${BETA_RESOURCES}${master.path}`);
  if (!masterResponse.ok) throw new Error(`The beta master database returned ${masterResponse.status}.`);

  // Served as .gz, though the response may already be decoded.
  const body = new Uint8Array(await masterResponse.arrayBuffer());
  const gzipped = GZIP_MAGIC.every((byte, index) => body[index] === byte);
  const marker = 'marker' in master && typeof master.marker === 'string' ? master.marker : '';
  return { bytes: gzipped ? gunzipSync(body) : body, marker };
}

function rows(database: Database, sql: string): number[][] {
  return (database.exec(sql)[0]?.values ?? []).map((row) => row.map(Number));
}

function cardSkills(database: Database): Map<number, UmaSkills> {
  const cards = new Map<number, UmaSkills>(
    rows(database, `SELECT c.id FROM card_data c WHERE ${TRAINEE_CARDS} ORDER BY c.id`).map(([card]) => [
      card!,
      { card: card!, skills: [] }
    ])
  );

  // Every rarity of a card shares its unique, at a higher level.
  for (const [card, unique] of rows(
    database,
    `
    SELECT DISTINCT c.id, inherited.id
    FROM card_data c
    JOIN card_rarity_data rarity ON rarity.card_id = c.id
    JOIN skill_set unique_set ON unique_set.id = rarity.skill_set
    JOIN skill_data inherited ON inherited.unique_skill_id_1 = unique_set.skill_id1
    WHERE ${TRAINEE_CARDS} AND ${INHERITED_UNIQUES}
  `
  )) {
    const entry = cards.get(card!);
    if (entry) entry.unique = unique;
  }

  for (const [card, skill] of rows(
    database,
    `
    SELECT c.id, available.skill_id
    FROM card_data c
    JOIN available_skill_set available ON available.available_skill_set_id = c.available_skill_set_id
    WHERE ${TRAINEE_CARDS} AND available.skill_id > 0
    ORDER BY c.id, available.need_rank, available.id
  `
  )) {
    cards.get(card!)?.skills.push(skill!);
  }

  return cards;
}

const SQL = await initSqlJs();
const globalMaster = await betaGlobalMaster();

const globalDatabase = new SQL.Database(globalMaster.bytes);
const globalCards = cardSkills(globalDatabase);
globalDatabase.close();

const jpDatabase = new SQL.Database(await readFile(jpMasterPath));
const jpCards = cardSkills(jpDatabase);
jpDatabase.close();

// A card's Global skills win: JP has since given some cards more (Special Week two more potential levels).
const cards = new Map(jpCards);
for (const [card, skills] of globalCards) cards.set(card, skills);

const output = path.join(outDir, 'umas.json.gz');
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
