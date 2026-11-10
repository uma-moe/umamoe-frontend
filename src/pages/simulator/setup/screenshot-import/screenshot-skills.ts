import { boxHeight, type Box } from './screenshot-pixels';
import type { SkillLine } from './screenshot-layout';
import { matchSkillLine, type SkillMatch, type SkillNameIndex } from './skill-names';

export interface ReadSkill {
  skillId: number;
  level: number;
}

/** A line that could be several skills; the player picks one or leaves it out. */
export interface SkillChoice {
  text: string;
  candidates: number[];
  level: number;
  box: Box;
  /** The line as it looks in the screenshot, so the player can see what it says. */
  image?: string;
}

export interface SkillLineReading {
  skills: ReadSkill[];
  choices: SkillChoice[];
  /** Lines with a name's worth of letters that named no skill, to read again on their own. */
  unread: SkillLine[];
}

/** A wrapped name's second line starts within this many line heights of the first. */
const WRAP_GAP_HEIGHTS = 0.8;
const MAX_WRAP_LINES = 2;
/** Fewer letters than this is a scrap of an icon or the card's frame, not a name. */
const MIN_NAME_LETTERS = 5;
const LETTER = /\p{L}/gu;

/** Reads ○ or ◎ from the pixels right after a word's box. */
export type CircleReader = (box: Box) => '○' | '◎' | undefined;

function matchLine(index: SkillNameIndex, line: SkillLine, readCircle: CircleReader): SkillMatch {
  const text = line.words.map((word) => word.text).join(' ');
  return matchSkillLine(index, text, (wordIndex) => {
    const word = line.words[wordIndex];
    return word ? readCircle(word.box) : undefined;
  });
}

function joinLines(first: SkillLine, second: SkillLine): SkillLine {
  return {
    text: first.text + ' ' + second.text,
    words: [...first.words, ...second.words],
    column: first.column,
    box: {
      x0: Math.min(first.box.x0, second.box.x0),
      y0: first.box.y0,
      x1: Math.max(first.box.x1, second.box.x1),
      y1: second.box.y1
    }
  };
}

function leadingSkill(match: SkillMatch): number | undefined {
  if (match.kind === 'skill') return match.skillId;
  if (match.kind === 'choice') return match.candidates[0];

  return undefined;
}

/**
 * Whether two lines read together name more than the second does alone. Re-reading the second line's own skill makes
 * them two skills; a longer name that matches as well as the second line's own skill does, as "Straightaway" and
 * "Acceleration" make "Straightaway Acceleration", is one wrapped name.
 */
function namesMoreThan(joined: SkillMatch, next: SkillMatch): boolean {
  if (joined.score !== next.score) return joined.score > next.score;

  return leadingSkill(joined) !== leadingSkill(next);
}

function hasNameLetters(line: SkillLine): boolean {
  return (line.text.match(LETTER)?.length ?? 0) >= MIN_NAME_LETTERS;
}

function wrapsOnto(line: SkillLine, next: SkillLine | undefined): next is SkillLine {
  if (!next || next.column !== line.column) return false;

  return next.box.y0 - line.box.y1 <= boxHeight(line.box) * WRAP_GAP_HEIGHTS;
}

/**
 * The skills named by the skill list's lines. A long name wraps onto a second line, so a line that doesn't read as a
 * skill on its own is tried together with the line under it. Each skill is read once.
 */
export function readSkillLines(
  lines: SkillLine[],
  index: SkillNameIndex,
  readCircle: CircleReader
): SkillLineReading {
  const skills: ReadSkill[] = [];
  const choices: SkillChoice[] = [];
  const unread: SkillLine[] = [];

  for (let position = 0; position < lines.length; position++) {
    let line = lines[position]!;
    let match = matchLine(index, line, readCircle);

    // A wrapped name continues on the next line or two; the unique's `Lvl N` can read as a line of its own.
    let joined = line;
    let consumed = 0;
    for (let extra = 1; extra <= MAX_WRAP_LINES && match.kind !== 'skill'; extra++) {
      const next = lines[position + extra];
      if (!wrapsOnto(joined, next)) break;

      joined = joinLines(joined, next);
      const joinedMatch = matchLine(index, joined, readCircle);
      const nextMatch = matchLine(index, next, readCircle);
      if (
        joinedMatch.kind !== 'none' &&
        joinedMatch.score > match.score &&
        namesMoreThan(joinedMatch, nextMatch)
      ) {
        line = joined;
        match = joinedMatch;
        consumed = extra;
      }
    }
    position += consumed;

    if (match.kind === 'skill') {
      if (!skills.some((skill) => skill.skillId === match.skillId))
        skills.push({ skillId: match.skillId, level: match.level });
    } else if (match.kind === 'choice') {
      choices.push({
        text: line.text,
        candidates: match.candidates,
        level: match.level,
        box: line.box
      });
    } else if (hasNameLetters(line)) {
      unread.push(line);
    }
  }

  return { skills, choices, unread };
}
