import type { SkillData } from '@/lib/game-data/skills/skills';

/** The symbol some skill names end in, which tells a skill from its stronger or weaker version. */
export type SkillMark = '○' | '◎' | '×';

export interface SkillName {
  skillId: number;
  name: string;
  /** The name in lower-case letters and digits only, which is what OCR text is compared on. */
  key: string;
  mark?: SkillMark;
  /** A card's own unique; the inherited copy shares its name. */
  personalUnique: boolean;
  inheritedUnique: boolean;
}

export interface SkillNameIndex {
  byKey: ReadonlyMap<string, SkillName[]>;
}

/** What one line of OCR text says about a skill. */
export interface SkillText {
  key: string;
  /** The unique's level, from its `Lvl N` suffix. */
  level?: number;
  /** A trailing symbol; `circle` when OCR saw a round glyph but can't say which one. */
  mark?: SkillMark | 'circle';
  /** The name's last word with letters in it, which a mark follows. */
  nameEnd?: number;
}

/** Reads ○ or ◎ from the pixels right after the line's word at this index. */
export type CircleReader = (wordIndex: number) => '○' | '◎' | undefined;

export type SkillMatch =
  | { kind: 'skill'; skillId: number; level: number; score: number }
  | { kind: 'choice'; candidates: number[]; level: number; score: number }
  | { kind: 'none'; score: number };

/** At or above this a line is read as the skill without asking. */
const ACCEPT_SCORE = 0.82;
/** …and only when the next closest name trails it by this much. */
const ACCEPT_MARGIN = 0.08;
/** Below this a line is some other text on the screen. */
const CANDIDATE_SCORE = 0.6;
const MAX_CANDIDATES = 4;
/** A shorter scrap of text is only read when it matches a name closely; otherwise it's noise, not a choice. */
const MIN_CHOICE_LENGTH = 5;
/** Skill icons read as a few stray words at either end of a line. */
const MAX_LEADING_NOISE = 4;
const MAX_TRAILING_NOISE = 3;
/** Dropping a word costs this much score, so a line that names a skill whole keeps all of it. */
const DROPPED_WORD_COST = 0.03;
/** No skill name starts with a word without letters; such words are the icon. */
const LEADING_NOISE = /^[^\p{L}]+$/u;
/** The card's edge and the icons' frames, read as brackets and bars. */
const FRAME_NOISE = /^[[\]|(){}=_.,:;'"!~-]+$/;

/** `Lvl` as OCR reads it: `Lvl`, `Lv|`, `Lol`, or with the L and v run together as `Wl`. */
const LEVEL_WORD = /^(?:[LI|][vVyuoW]?[lI1|]?|[vVW][lI1|])\.?$/;
const LEVEL_NUMBER = /^[1-6]$/;
const LEVEL_JOINED = /^(?:L[vVo]|W)[lI1|]?\.?([1-6])$/;
const NAME_MARK = /\s*([○◎×])\s*$/;
/** How Tesseract's English model writes ○ and ◎: one or two round letters or digits, or a lone symbol other than a frame. */
const CIRCLE_TOKEN = /^(?:[○◎OoQ0@©®°◯]|[Oo0]{2}|\(\)|(?![[\]|(){}=_.,:;'"!~-])[^\p{L}\p{N}])$/u;
const CROSS_TOKEN = /^[xX×]$/;
const HAS_LETTERS = /\p{L}/u;

export function textKey(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function nameMark(name: string): SkillMark | undefined {
  return NAME_MARK.exec(name)?.[1] as SkillMark | undefined;
}

export function buildSkillNameIndex(
  skills: ReadonlyMap<number, SkillData>,
  released?: ReadonlySet<number>
): SkillNameIndex {
  const byKey = new Map<string, SkillName[]>();

  for (const skill of skills.values()) {
    if (released?.size && !released.has(skill.skill_id)) continue;

    const key = textKey(skill.name.replace(NAME_MARK, ''));
    if (!key) continue;

    const inheritedUnique = skill.skill_id >= 900_000 && skill.skill_id < 1_000_000;
    const entry: SkillName = {
      skillId: skill.skill_id,
      name: skill.name,
      key,
      mark: nameMark(skill.name),
      personalUnique: !inheritedUnique && (skill.unique === true || skill.rarity >= 4),
      inheritedUnique
    };
    byKey.set(key, [...(byKey.get(key) ?? []), entry]);
  }

  return { byKey };
}

function lineWords(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

/** The unique's level from a `Lvl N` pair anywhere in the words, since a wrapped name can put it mid-line. */
function levelWords(words: string[]): { start: number; count: number; level: number } | undefined {
  for (let position = 0; position < words.length; position++) {
    const joined = LEVEL_JOINED.exec(words[position]!);
    if (joined) return { start: position, count: 1, level: Number(joined[1]) };

    const number = words[position + 1];
    if (LEVEL_WORD.test(words[position]!) && number && LEVEL_NUMBER.test(number))
      return { start: position, count: 2, level: Number(number) };
  }

  return undefined;
}

function markOf(word: string): SkillText['mark'] {
  if (word === '○' || word === '◎') return word;
  if (CROSS_TOKEN.test(word)) return '×';
  if (CIRCLE_TOKEN.test(word)) return 'circle';

  return undefined;
}

/** Splits a line's words into the name, the unique's level and a trailing ○, ◎ or ×. */
function readWords(words: string[]): SkillText {
  const level = levelWords(words);
  const positions = words.map((_, position) => position);
  const nameWords = level
    ? positions.filter(
        (position) => position < level.start || position >= level.start + level.count
      )
    : positions;

  const last = nameWords.at(-1);
  const mark = nameWords.length > 1 && last !== undefined ? markOf(words[last]!) : undefined;
  const name = mark ? nameWords.slice(0, -1) : nameWords;

  return {
    key: textKey(name.map((position) => words[position]).join(' ')),
    level: level?.level,
    mark,
    nameEnd: name.findLast((position) => HAS_LETTERS.test(words[position]!))
  };
}

/** Splits a skill line into its name, the unique's level suffix and a trailing ○, ◎ or ×. */
export function readSkillText(line: string): SkillText {
  return readWords(lineWords(line));
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length]!;
}

export function similarity(a: string, b: string): number {
  const length = Math.max(a.length, b.length);
  return length ? 1 - editDistance(a, b) / length : 0;
}

function isRing(mark: SkillMark | undefined): boolean {
  return mark === '○' || mark === '◎';
}

/**
 * Whether the line's ring has to be read from its pixels: OCR saw only a round glyph, or no mark at all where the name
 * comes with one, since it drops a ring as easily as it misreads one.
 */
function needsRing(names: SkillName[], text: SkillText): boolean {
  if (text.mark === 'circle') return true;
  if (text.mark) return false;

  return names.some((name) => isRing(name.mark));
}

/** Of the skills that share a name, the ones this line can be. */
function namesForLine(names: SkillName[], text: SkillText, ring?: '○' | '◎'): SkillName[] {
  const withMark = (marks: (SkillMark | undefined)[]) =>
    names.filter((name) => marks.includes(name.mark));

  let fitting: SkillName[];
  if (ring) fitting = withMark([ring]);
  else if (text.mark === 'circle') fitting = withMark(['○', '◎']);
  else if (text.mark) fitting = withMark([text.mark]);
  else fitting = withMark([undefined]);

  // OCR can drop a mark or misread it; the name alone is then still worth offering.
  if (!fitting.length) fitting = names;

  const level = text.level !== undefined;
  const uniques = fitting.filter((name) => (level ? name.personalUnique : name.inheritedUnique));
  return uniques.length ? uniques : fitting;
}

interface RankedKey {
  key: string;
  score: number;
}

/** Name keys by similarity to the text, best first; names too different in length to reach a candidate are skipped. */
function rankKeys(index: SkillNameIndex, key: string): RankedKey[] {
  const ranked: RankedKey[] = [];
  for (const name of index.byKey.keys()) {
    const shorter = Math.min(name.length, key.length);
    const longer = Math.max(name.length, key.length);
    if (shorter / longer < CANDIDATE_SCORE) continue;

    ranked.push({ key: name, score: similarity(key, name) });
  }

  return ranked.sort((a, b) => b.score - a.score);
}

interface LineReading {
  text: SkillText;
  ranked: RankedKey[];
  /** Which word of the whole line this reading starts at. */
  start: number;
  /** The best name's score less the cost of the words dropped to reach it. */
  value: number;
}

/**
 * The reading of the line that comes closest to a skill name. Icons and frames read as symbols are dropped from its
 * ends, and a few stray words may be too.
 */
function bestReading(index: SkillNameIndex, words: string[]): LineReading | undefined {
  let first = 0;
  while (first < words.length && LEADING_NOISE.test(words[first]!)) first++;

  let last = words.length;
  while (last > first && FRAME_NOISE.test(words[last - 1]!)) last--;

  let best: LineReading | undefined;
  for (let start = first; start <= Math.min(first + MAX_LEADING_NOISE, last - 1); start++) {
    const lowest = Math.max(start + 1, last - MAX_TRAILING_NOISE);
    for (let end = last; end >= lowest; end--) {
      const text = readWords(words.slice(start, end));
      if (text.key.length < 3) continue;

      const dropped = start - first + (last - end);
      const ranked = rankKeys(index, text.key);
      const value = (ranked[0]?.score ?? 0) - dropped * DROPPED_WORD_COST;
      if (!best || value > best.value) best = { text, ranked, start, value };
    }
  }

  return best;
}

/**
 * The skill a line of OCR text names. A close match to one skill is read as it; a looser match, or a name several
 * skills share, comes back as candidates for the player to pick from. `readCircle` reads ○ or ◎ from the pixels after
 * the name when OCR can't say which it is.
 */
export function matchSkillLine(
  index: SkillNameIndex,
  line: string,
  readCircle?: CircleReader
): SkillMatch {
  const reading = bestReading(index, lineWords(line));
  const best = reading?.ranked[0];
  if (!reading || !best || best.score < CANDIDATE_SCORE)
    return { kind: 'none', score: best?.score ?? 0 };

  const { text, ranked, start } = reading;
  if (best.score < ACCEPT_SCORE && text.key.length < MIN_CHOICE_LENGTH)
    return { kind: 'none', score: best.score };

  const sharingName = index.byKey.get(best.key) ?? [];
  const ring =
    text.nameEnd !== undefined && needsRing(sharingName, text)
      ? readCircle?.(start + text.nameEnd)
      : undefined;
  const level = text.level ?? 1;
  const names = namesForLine(sharingName, text, ring);
  const clearlyBest = (ranked[1]?.score ?? 0) <= best.score - ACCEPT_MARGIN;
  if (best.score >= ACCEPT_SCORE && clearlyBest && names.length === 1)
    return { kind: 'skill', skillId: names[0]!.skillId, level, score: best.score };

  const runnersUp = ranked
    .slice(1)
    .filter((entry) => entry.score >= CANDIDATE_SCORE)
    .flatMap((entry) => index.byKey.get(entry.key) ?? []);
  const candidates = [...names, ...runnersUp].slice(0, MAX_CANDIDATES).map((name) => name.skillId);
  return { kind: 'choice', candidates, level, score: best.score };
}
