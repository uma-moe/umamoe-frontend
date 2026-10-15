import character from './resources/character.json' with { type: 'json' };
import characterNames from './resources/character_names.json' with { type: 'json' };
import skills from './resources/skills.json' with { type: 'json' };
import factors from './resources/factors.json' with { type: 'json' };
import races from './resources/race_to_saddle_mapping.json' with { type: 'json' };
import supports from './resources/support-cards-db.json' with { type: 'json' };

export const resourceFixtures: Record<string, unknown> = {
  character,
  character_names: characterNames,
  skills,
  factors,
  race_to_saddle_mapping: races,
  'support-cards-db': supports
};
