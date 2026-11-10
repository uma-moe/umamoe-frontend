import { describe, expect, it } from 'vitest';
import type { CharacterData } from '@/lib/game-data/characters';
import type { FieldResult } from '../../simulator-repository';
import { simulatorTeamsFromField } from './field-population';

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
      name: 'Silence Suzuka',
      cardId: 100201,
      teamId: 1,
      frameOrder: 1,
      source: 'Simulator field'
    });
    expect(umas[0]!.trainee.distanceAptitudes).toEqual(['A', 'S', 'B', 'C']);
    expect(umas[0]!.skills).toEqual([{ skillId: 200001, level: 1 }]);

    expect(umas[1]).toMatchObject({
      name: 'Mob 2',
      cardId: undefined,
      teamId: 2,
      fanCount: 5000,
      source: 'Mob'
    });
    expect(umas[1]!.trainee.speed).toBe('550');
  });
});
