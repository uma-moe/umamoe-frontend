// Fits the Skill Explorer's statline model on what CM winners brought, checks it on each CM left out, and forecasts the
// current era's statline for every course.
//   npx vite-node scripts/fit-cm-statlines.ts <cm-winner-statlines.json> <simulator_courses.json> <out.json>
// The first file comes from the simulator's `cm-statlines` example; the output feeds its `skill-explorer` example and
// `scripts/build-skill-explorer.mjs`.
import { readFile, writeFile } from 'node:fs/promises';
import {
  RUNNING_STYLES,
  STAT_NAMES,
  chooseDistanceTerms,
  fitStatlineModel,
  forecastStatline,
  leaveOneCmOut,
  type CmStatline,
  type RunningStyle,
  type Stats
} from '../src/pages/tools/skill-explorer/statlines/statline-model';

interface RawStatline {
  cm: number;
  course_id: number;
  distance: number;
  style: number;
  winners: number;
  median: Stats;
  p25: Stats;
  p75: Stats;
}

interface RawCourse {
  course_id: number;
  distance: number;
  surface: number;
}

const DIRT = 2;

const [statlinesPath, coursesPath, outPath] = process.argv.slice(2);
if (!statlinesPath || !coursesPath || !outPath) {
  console.error('fit-cm-statlines <cm-winner-statlines.json> <simulator_courses.json> <out.json>');
  process.exit(1);
}

const rawStatlines = JSON.parse(await readFile(statlinesPath, 'utf8')) as RawStatline[];
const rawCourses = (JSON.parse(await readFile(coursesPath, 'utf8')) as { courses: RawCourse[] })
  .courses;
const surfaceOf = new Map(rawCourses.map((course) => [course.course_id, course.surface]));

const statlines: CmStatline[] = rawStatlines
  .filter((raw) => RUNNING_STYLES.includes(raw.style as RunningStyle))
  .map((raw) => ({
    cm: raw.cm,
    courseId: raw.course_id,
    distance: raw.distance,
    dirt: surfaceOf.get(raw.course_id) === DIRT,
    style: raw.style as RunningStyle,
    winners: raw.winners,
    median: raw.median,
    p25: raw.p25,
    p75: raw.p75
  }));

const terms = chooseDistanceTerms(statlines);
const model = fitStatlineModel(statlines, terms);
const errors = leaveOneCmOut(statlines, terms);
const latestCm = Math.max(...statlines.map((statline) => statline.cm));

const forecasts = Object.fromEntries(
  rawCourses.map((course) => [
    course.course_id,
    Object.fromEntries(
      RUNNING_STYLES.map((style) => [
        style,
        forecastStatline(model, {
          style,
          distance: course.distance,
          dirt: course.surface === DIRT,
          cm: latestCm + 1
        })
      ])
    )
  ])
);

await writeFile(
  outPath,
  JSON.stringify({ generated: new Date().toISOString(), latestCm, model, errors, past: statlines, forecasts })
);

const table = (values: Stats) => STAT_NAMES.map((name, stat) => `${name} ${values[stat]}`).join(', ');
console.log(`distance terms: ${STAT_NAMES.filter((_, stat) => terms[stat]).join(', ') || 'none'}`);
console.log(`held out, ${errors.forecasts} CM × style forecasts`);
console.log(`  model        ${table(errors.model)}`);
console.log(`  previous CM  ${table(errors.previousCm)}`);
