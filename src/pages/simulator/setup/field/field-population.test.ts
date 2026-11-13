import { describe, expect, it } from 'vitest';
import type { CharacterData } from '@/lib/game-data/characters';
import type { FieldResult } from '../../simulator-repository';
import { populateNotice, simulatorTeamsFromField } from './field-population';

const runner = (overrides: Partial<FieldResult['teams'][number]['runners'][number]> = {}) => ({
  stats: { speed: 1200, stamina: 900, power: 1000, guts: 600, wisdom: 800 },
  running_style: 'Senko',
  motivation: 4,
  aptitudes: { distance: [7, 8, 6, 5], running_style: [6, 8, 7, 5], ground: [8, 6] },
  skills: [{ skill_id: 200001, level: 1 }],
  frame_order: 1,
  team_id: 1,
  is_mob: false,
  ...overrides
});

const field = (): FieldResult => ({
  schema_version: 1,
  source: { kind: 'rooms', course_id: 10506 },
  layout: { teams: 2, team_size: 1, mobs: 1, mob_team_size: 1 },
  teams: [
    { team_id: 1, kind: 'player', runners: [runner({ card_id: 100201 })] },
    {
      team_id: 2,
      kind: 'mob',
      runners: [
        runner({
          team_id: 2,
          is_mob: true,
          fan_count: 5000,
          stats: { speed: 550, stamina: 560, power: 570, guts: 580, wisdom: 590 }
        })
      ]
    }
  ]
});

describe('a generated field as simulator runners', () => {
  it('keeps the player card and build, and the mob nameless and outfitless', () => {
    const character = { name: 'Silence Suzuka', subtitle: 'Innocent Silence' } as CharacterData;
    const teams = simulatorTeamsFromField(field(), new Map([[100201, character]]));
    const umas = teams.flat();

    expect(teams.map((team) => team.length)).toEqual([1, 1]);
    expect(umas[0]).toMatchObject({
      name: 'Silence Suzuka [Populated]',
      cardId: 100201,
      teamId: 1,
      frameOrder: 1,
      source: 'Simulator field'
    });
    expect(umas[0]!.trainee.distanceAptitudes).toEqual(['A', 'S', 'B', 'C']);
    expect(umas[0]!.skills).toEqual([{ skillId: 200001, level: 1 }]);

    expect(umas[1]).toMatchObject({
      name: 'Mob 2 [Populated]',
      cardId: undefined,
      teamId: 2,
      fanCount: 5000,
      source: 'Mob'
    });
    expect(umas[1]!.trainee.speed).toBe('550');
  });

  it('tags a runner the model refit apart from one with the build she ran', () => {
    const borrowed = field();
    borrowed.teams[0]!.runners = [
      runner({ card_id: 100201 }),
      runner({ refit: { removed: [201151], added: [201091] } })
    ];

    const names = simulatorTeamsFromField(borrowed, new Map())[0]!.map((uma) => uma.name);

    expect(names).toEqual(['Uma 100201 [Populated]', 'Uma [Refit]']);
  });
});

describe('the populate notice', () => {
  const courseLabel = (courseId: number) => 'course ' + courseId;

  it('says the builds are as they ran on the course itself', () => {
    const notice = populateNotice(field(), courseLabel);

    expect(notice).toBe('Populated 2 real CM runners from course 10506, with the builds they ran.');
  });

  it('counts the runners the model refit when another course stood in', () => {
    const borrowed = field();
    borrowed.source.from_course_id = 10808;
    borrowed.teams[0]!.runners[0]!.refit = { removed: [201151], added: [201091] };

    const notice = populateNotice(borrowed, courseLabel);

    expect(notice).toBe(
      'Populated 2 real CM runners from course 10808 for course 10506. Stats are as trained. ' +
        'The model re-spent skills that cannot fire here on 1 of them, tagged [Refit].'
    );
  });

  it('says a borrowed field nothing was re-spent on kept its builds', () => {
    const borrowed = field();
    borrowed.source.from_course_id = 10808;

    const notice = populateNotice(borrowed, courseLabel);

    expect(notice).toBe(
      'Populated 2 real CM runners from course 10808 for course 10506. Stats are as trained. ' +
        'Their builds are the ones they ran.'
    );
  });
});
