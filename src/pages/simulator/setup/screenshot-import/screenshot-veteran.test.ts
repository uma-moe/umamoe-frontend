import { describe, expect, it } from 'vitest';
import type { CharacterData } from '@/lib/game-data/characters';
import {
  mergeReadings,
  screenshotVeteran,
  unreadFields,
  type ScreenshotReading
} from './screenshot-veteran';

const characters = new Map<number, CharacterData>([
  [100101, { id: '100101', name: 'Special Week', subtitle: '[Special Dreamer]', image: '' }],
  [100201, { id: '100201', name: 'Silence Suzuka', subtitle: '[Innocent Silence]', image: '' }]
]);

const stats = { speed: 1150, stamina: 800, power: 900, guts: 400, wiz: 600 };

const reading = (overrides: Partial<ScreenshotReading> = {}): ScreenshotReading => ({
  stats,
  aptitudes: {},
  skills: [],
  choices: [],
  titleLines: [],
  ...overrides
});

describe('mergeReadings', () => {
  it('takes stats from the first screenshot and every skill once', () => {
    const merged = mergeReadings([
      reading({ skills: [{ skillId: 200331, level: 1 }] }),
      reading({
        stats: { ...stats, speed: 1 },
        skills: [
          { skillId: 200331, level: 1 },
          { skillId: 201351, level: 1 }
        ]
      })
    ]);

    expect(merged.stats.speed).toBe(1150);
    expect(merged.skills.map((skill) => skill.skillId)).toEqual([200331, 201351]);
  });

  it('drops a choice another screenshot read clearly', () => {
    const choice = {
      text: 'Right-Handed',
      candidates: [200011, 200012],
      level: 1,
      box: { x0: 0, y0: 0, x1: 1, y1: 1 }
    };
    const merged = mergeReadings([
      reading({ choices: [choice] }),
      reading({ skills: [{ skillId: 200011, level: 1 }] })
    ]);

    expect(merged.choices).toEqual([]);
  });

  it('asks once about a line two screenshots read with different runner-up guesses', () => {
    const box = { x0: 0, y0: 0, x1: 1, y1: 1 };
    const merged = mergeReadings([
      reading({ choices: [{ text: 'Mudy', candidates: [200011, 200012], level: 1, box }] }),
      reading({ choices: [{ text: 'Muddy o', candidates: [200011], level: 1, box }] })
    ]);

    expect(merged.choices.map((choice) => choice.text)).toEqual(['Mudy']);
  });
});

/** A reading whose stats are all filled in, as the dialog hands it over. */
const complete = (overrides: Partial<ScreenshotReading> = {}) => ({ ...reading(overrides), stats });

describe('screenshotVeteran', () => {
  it('finds her card from her unique and keeps its level', () => {
    const veteran = screenshotVeteran(
      complete({ skills: [{ skillId: 100011, level: 4 }] }),
      characters
    );

    expect(veteran.card_id).toBe(100101);
    expect(veteran.skill_array).toEqual([{ skill_id: 100011, level: 4 }]);
  });

  it('falls back to the screen’s title and turns her own inherited unique into her personal one', () => {
    const veteran = screenshotVeteran(
      complete({
        titleLines: ['[Innocent Silence] Silence Suzuka'],
        skills: [{ skillId: 900021, level: 1 }]
      }),
      characters
    );

    expect(veteran.card_id).toBe(100201);
    expect(veteran.skill_array).toEqual([{ skill_id: 100021, level: 1 }]);
  });

  it('picks her best style aptitude as her style', () => {
    const veteran = screenshotVeteran(
      complete({
        aptitudes: {
          proper_running_style_nige: 4,
          proper_running_style_senko: 7,
          proper_running_style_sashi: 7
        }
      }),
      characters
    );

    expect(veteran.running_style).toBe(2);
    expect(veteran.proper_running_style_oikomi).toBeNull();
  });
});

describe('unreadFields', () => {
  it('names what the screenshots didn’t show', () => {
    const fields = unreadFields({
      stats: { speed: 1 },
      aptitudes: { proper_ground_turf: 7 }
    });

    expect(fields).toContain('Stamina');
    expect(fields).toContain('Dirt');
    expect(fields).not.toContain('Speed');
    expect(fields).not.toContain('Turf');
  });
});
