import { aptitudeGrade } from '@/lib/profile/profile-display';
import type { CharacterData } from '@/lib/game-data/characters';
import type { FieldResult } from '../../simulator-repository';
import { createTrainee } from '../trainee';
import { GENERATED_FIELD_SOURCE, MOB_SOURCE } from '../../simulator-roster.svelte';
import type { SimulatorUma } from '../../simulator-uma';

/**
 * A generated field's teams as race field runners. Player teams keep the card, stats and aptitudes the simulator drew;
 * mobs are deliberately nameless and outfitless, with the simulator's generic build.
 */
export function simulatorTeamsFromField(
  result: FieldResult,
  characters: ReadonlyMap<number, CharacterData>
): SimulatorUma[][] {
  let index = 0;
  return result.teams.map((team) =>
    team.runners.map((runner) => {
      const position = index++;
      const character = runner.card_id === undefined ? undefined : characters.get(runner.card_id);
      const name = runner.is_mob
        ? 'Mob ' + (position + 1)
        : (character?.name ?? (runner.card_id ? 'Uma ' + runner.card_id : 'Uma'));
      return {
        id: crypto.randomUUID(),
        name,
        cardId: runner.card_id,
        trainee: createTrainee({
          speed: String(runner.stats.speed),
          stamina: String(runner.stats.stamina),
          power: String(runner.stats.power),
          guts: String(runner.stats.guts),
          wisdom: String(runner.stats.wisdom),
          runningStyle: runner.running_style,
          motivation: String(runner.motivation),
          distanceAptitudes: runner.aptitudes.distance.map(aptitudeGrade),
          styleAptitudes: runner.aptitudes.running_style.map(aptitudeGrade),
          groundAptitudes: runner.aptitudes.ground.map(aptitudeGrade)
        }),
        skills: runner.skills.map((skill) => ({
          skillId: skill.skill_id,
          level: skill.level
        })),
        teamId: team.team_id,
        frameOrder: runner.frame_order,
        ...(runner.is_mob ? { fanCount: runner.fan_count ?? 10_000 } : {}),
        source: runner.is_mob ? MOB_SOURCE : GENERATED_FIELD_SOURCE
      } satisfies SimulatorUma;
    })
  );
}
