import type { Colour } from './screenshot-pixels';

/**
 * The hue of each grade's letter, from the game's palette (our `--aptitude-*` tokens; S measured from screenshots).
 * G is grey, so it has no hue.
 */
const GRADE_HUES: [grade: number, hue: number][] = [
  [8, 45],
  [7, 25],
  [6, 342],
  [5, 107],
  [4, 205],
  [3, 288],
  [2, 253]
];
/** Below this saturation a letter is G's grey. */
const GREY_SATURATION = 0.15;
/** Fewer tinted pixels than this is no letter at all. */
const MIN_LETTER_PIXELS = 12;

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

/** The grade a letter's colour stands for: every grade is drawn in its own colour. */
export function colourGrade({ red, green, blue }: Colour): number {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (!max || chroma / max < GREY_SATURATION) return 1;

  let hue: number;
  if (max === red) hue = (((green - blue) / chroma) % 6) * 60;
  else if (max === green) hue = ((blue - red) / chroma + 2) * 60;
  else hue = ((red - green) / chroma + 4) * 60;

  const [grade] = GRADE_HUES.reduce((nearest, entry) =>
    hueDistance(hue, entry[1]) < hueDistance(hue, nearest[1]) ? entry : nearest
  );
  return grade;
}

/**
 * The grade of a letter from its pixels' colours, by vote: the edges of the label beside it and of the next row's
 * letters add a few stray colours that would pull an average off.
 */
export function inkGrade(colours: Colour[]): number | undefined {
  if (colours.length < MIN_LETTER_PIXELS) return undefined;

  const votes = new Map<number, number>();
  for (const colour of colours) {
    const grade = colourGrade(colour);
    votes.set(grade, (votes.get(grade) ?? 0) + 1);
  }

  return [...votes].reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}
