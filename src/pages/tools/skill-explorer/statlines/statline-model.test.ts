import { describe, expect, it } from 'vitest';
import {
  RUNNING_STYLES,
  chooseDistanceTerms,
  fitStatlineModel,
  forecastStatline,
  leaveOneCmOut,
  type CmStatline,
  type Stats
} from './statline-model';

/** CMs whose winners follow known rules: stamina rises with distance, speed jumps in the current era. */
const COURSES = [
  { cm: 10, distance: 1600, dirt: true },
  { cm: 11, distance: 3200, dirt: false },
  { cm: 12, distance: 2000, dirt: false },
  { cm: 13, distance: 2400, dirt: false },
  { cm: 14, distance: 1600, dirt: false },
  { cm: 15, distance: 2200, dirt: false },
  { cm: 17, distance: 2000, dirt: true },
  { cm: 18, distance: 1600, dirt: false },
  { cm: 19, distance: 2200, dirt: false }
];

function winnersOf(cm: number, distance: number, dirt: boolean, style: number): Stats {
  const currentEra = cm >= 17;
  return [
    currentEra ? 1550 : 1200,
    Math.round(300 + 0.25 * distance + (currentEra ? 60 : 0)),
    1100 + (dirt ? -40 : 0),
    600 + style * 10,
    1050
  ];
}

const statlines: CmStatline[] = COURSES.flatMap(({ cm, distance, dirt }) =>
  RUNNING_STYLES.map((style) => {
    const median = winnersOf(cm, distance, dirt, style);
    return {
      cm,
      courseId: 10000 + cm,
      distance,
      dirt,
      style,
      winners: 1000,
      median,
      p25: median,
      p75: median
    };
  })
);

describe('statline model', () => {
  it('forecasts a current-era course from the rules it was fitted on', () => {
    const terms = chooseDistanceTerms(statlines);
    const model = fitStatlineModel(statlines, terms);

    const forecast = forecastStatline(model, { style: 2, distance: 2400, dirt: false, cm: 25 });

    expect(forecast[0]).toBeCloseTo(1550, -1);
    expect(forecast[1]).toBeCloseTo(300 + 0.25 * 2400 + 60, -1);
    expect(forecast[3]).toBeCloseTo(620, -1);
  });

  it('lets stamina follow distance and leaves guts without it', () => {
    const terms = chooseDistanceTerms(statlines);

    expect(terms[1]).toBe(true);
    expect(terms[3]).toBe(false);
  });

  it('beats copying the previous CM when the course changes', () => {
    const terms = chooseDistanceTerms(statlines);

    const errors = leaveOneCmOut(statlines, terms);

    expect(errors.forecasts).toBe(32);
    expect(errors.model[1]).toBeLessThan(errors.previousCm[1]);
  });
});
