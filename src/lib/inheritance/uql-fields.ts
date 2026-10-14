// Angular's readable field catalog, shared by completion and query serialization.
import { factorOptions } from '@/lib/catalog/factor-catalog';
import type {
  UqlValueContext,
  UqlFieldType,
} from '@/components/query-editor-types';

export interface FriendlySparkField {
  label: string;
  aliases: string[];
  field: string;
  factorId: number;
  maxLevel: number;
}

export interface FriendlyFieldAlias {
  label: string;
  aliases: string[];
  field: string;
  type?: UqlFieldType;
}

export const friendlySparkFields: FriendlySparkField[] = [
  {
    label: 'Speed',
    aliases: ['speed'],
    field: 'blue_sparks',
    factorId: 10,
    maxLevel: 9,
  },
  {
    label: 'Stamina',
    aliases: ['stamina'],
    field: 'blue_sparks',
    factorId: 20,
    maxLevel: 9,
  },
  {
    label: 'Power',
    aliases: ['power'],
    field: 'blue_sparks',
    factorId: 30,
    maxLevel: 9,
  },
  {
    label: 'Guts',
    aliases: ['guts'],
    field: 'blue_sparks',
    factorId: 40,
    maxLevel: 9,
  },
  {
    label: 'Wit',
    aliases: ['wit', 'wisdom', 'intelligence'],
    field: 'blue_sparks',
    factorId: 50,
    maxLevel: 9,
  },
  {
    label: 'Turf',
    aliases: ['turf'],
    field: 'pink_sparks',
    factorId: 110,
    maxLevel: 9,
  },
  {
    label: 'Dirt',
    aliases: ['dirt'],
    field: 'pink_sparks',
    factorId: 120,
    maxLevel: 9,
  },
  {
    label: 'Front Runner',
    aliases: ['front runner', 'front'],
    field: 'pink_sparks',
    factorId: 210,
    maxLevel: 9,
  },
  {
    label: 'Pace Chaser',
    aliases: ['pace chaser', 'pace'],
    field: 'pink_sparks',
    factorId: 220,
    maxLevel: 9,
  },
  {
    label: 'Late Surger',
    aliases: ['late surger', 'late'],
    field: 'pink_sparks',
    factorId: 230,
    maxLevel: 9,
  },
  {
    label: 'End Closer',
    aliases: ['end closer', 'end'],
    field: 'pink_sparks',
    factorId: 240,
    maxLevel: 9,
  },
  {
    label: 'Sprint',
    aliases: ['sprint'],
    field: 'pink_sparks',
    factorId: 310,
    maxLevel: 9,
  },
  {
    label: 'Mile',
    aliases: ['mile'],
    field: 'pink_sparks',
    factorId: 320,
    maxLevel: 9,
  },
  {
    label: 'Medium',
    aliases: ['medium', 'middle'],
    field: 'pink_sparks',
    factorId: 330,
    maxLevel: 9,
  },
  {
    label: 'Long',
    aliases: ['long'],
    field: 'pink_sparks',
    factorId: 340,
    maxLevel: 9,
  },
];

export const friendlyFieldAliases: FriendlyFieldAlias[] = [
  {
    label: 'Wins',
    aliases: ['wins', 'win count', 'g1 wins'],
    field: 'win_count',
    type: 'number',
  },
  {
    label: 'White count',
    aliases: ['white factor count', 'white count'],
    field: 'white_count',
    type: 'number',
  },
  {
    label: 'Common white count',
    aliases: [
      'common whites count',
      'common spark count',
      'common factor count',
      'skill white count',
    ],
    field: 'common_white_count',
    type: 'number',
  },
  {
    label: 'Common white stars',
    aliases: [
      'common whites stars',
      'common spark stars',
      'common factor stars',
      'skill white stars',
    ],
    field: 'common_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Scenario white count',
    aliases: [
      'scenario whites count',
      'scenario spark count',
      'scenario factor count',
    ],
    field: 'scenario_white_count',
    type: 'number',
  },
  {
    label: 'Scenario white stars',
    aliases: [
      'scenario whites stars',
      'scenario spark stars',
      'scenario factor stars',
    ],
    field: 'scenario_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Race white count',
    aliases: ['race whites count', 'race spark count', 'race factor count'],
    field: 'race_white_count',
    type: 'number',
  },
  {
    label: 'Race white stars',
    aliases: ['race whites stars', 'race spark stars', 'race factor stars'],
    field: 'race_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Main common white count',
    aliases: [
      'main common whites count',
      'main common spark count',
      'main common factor count',
      'parent common white count',
    ],
    field: 'main_common_white_count',
    type: 'number',
  },
  {
    label: 'Main common white stars',
    aliases: [
      'main common whites stars',
      'main common spark stars',
      'main common factor stars',
      'parent common white stars',
    ],
    field: 'main_common_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Main scenario white count',
    aliases: [
      'main scenario whites count',
      'main scenario spark count',
      'main scenario factor count',
      'parent scenario white count',
    ],
    field: 'main_scenario_white_count',
    type: 'number',
  },
  {
    label: 'Main scenario white stars',
    aliases: [
      'main scenario whites stars',
      'main scenario spark stars',
      'main scenario factor stars',
      'parent scenario white stars',
    ],
    field: 'main_scenario_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Main race white count',
    aliases: [
      'main race whites count',
      'main race spark count',
      'main race factor count',
      'parent race white count',
    ],
    field: 'main_race_white_count',
    type: 'number',
  },
  {
    label: 'Main race white stars',
    aliases: [
      'main race whites stars',
      'main race spark stars',
      'main race factor stars',
      'parent race white stars',
    ],
    field: 'main_race_white_stars_sum',
    type: 'number',
  },
  {
    label: 'Followers',
    aliases: ['followers', 'follower count'],
    field: 'follower_num',
    type: 'number',
  },
  {
    label: 'Trainer name',
    aliases: ['trainer name', 'trainer', 'name'],
    field: 'trainer_name',
    type: 'string',
  },
  {
    label: 'Trainer ID',
    aliases: ['trainer id', 'account id'],
    field: 'account_id',
    type: 'string',
  },
  {
    label: 'Support card',
    aliases: ['support card', 'support', 'card', 'support card id'],
    field: 'support_card_id',
    type: 'number',
  },
  {
    label: 'LB',
    aliases: [
      'lb',
      'limitbreak',
      'limit break',
      'limit_break',
      'limit break count',
      'limitbreak count',
      'limit_break_count',
      'min lb',
      'minimum lb',
    ],
    field: 'limit_break_count',
    type: 'number',
  },
  {
    label: 'Characters',
    aliases: ['characters', 'character', 'umas', 'uma', 'charas', 'chara'],
    field: 'characters',
    type: 'number',
  },
  {
    label: 'Main character',
    aliases: [
      'main character',
      'main characters',
      'runner',
      'runners',
      'main uma',
      'main umas',
      'main chara',
      'main charas',
    ],
    field: 'main_chara_id',
    type: 'number',
  },
  {
    label: 'Main parent (p1/2)',
    aliases: [
      'parent character',
      'parent uma',
      'main parent character',
      'main parent',
      'main',
      'parent',
    ],
    field: 'main_parent_id',
    type: 'number',
  },
  {
    label: 'Great parent 1 (gp1)',
    aliases: [
      'gp1 character',
      'gp1 characters',
      'gp1 uma',
      'gp1 umas',
      'gp1 chara',
      'gp1 charas',
      'grandparent 1',
      'grandparent 1 character',
      'grandparent 1 characters',
      'grand parent 1',
      'grand parent 1 character',
      'grand parent 1 characters',
      'great parent 1',
      'great parent 1 character',
      'left parent',
      'left character',
      'left characters',
      'left uma',
      'left umas',
      'left chara',
      'left charas',
      'gp1',
    ],
    field: 'left_chara_id',
    type: 'number',
  },
  {
    label: 'Great parent 2 (gp2)',
    aliases: [
      'gp2 character',
      'gp2 characters',
      'gp2 uma',
      'gp2 umas',
      'gp2 chara',
      'gp2 charas',
      'grandparent 2',
      'grandparent 2 character',
      'grandparent 2 characters',
      'grand parent 2',
      'grand parent 2 character',
      'grand parent 2 characters',
      'great parent 2',
      'great parent 2 character',
      'right parent',
      'right character',
      'right characters',
      'right uma',
      'right umas',
      'right chara',
      'right charas',
      'gp2',
    ],
    field: 'right_chara_id',
    type: 'number',
  },
  {
    label: 'Great parent (gp1/2)',
    aliases: [
      'gp characters',
      'gp character',
      'gp umas',
      'gp uma',
      'gp charas',
      'gp chara',
      'grandparent characters',
      'grandparent character',
      'grand parent characters',
      'grand parent character',
      'great parent characters',
      'great parent character',
      'any gp characters',
      'any gp character',
      'any grandparent characters',
      'any grandparent character',
      'any great parent characters',
      'any great parent character',
    ],
    field: 'grandparent_characters',
    type: 'number',
  },
  {
    label: 'Rank',
    aliases: ['parent rank', 'rank'],
    field: 'parent_rank',
    type: 'number',
  },
  {
    label: 'Scenario',
    aliases: ['scenario', 'training scenario', 'scenario id', 'scenario_id'],
    field: 'scenario_id',
    type: 'number',
  },
  {
    label: 'Blue stars',
    aliases: [
      'blue stars',
      'blue star sum',
      'blue sparks total',
      'total blue sparks',
      'lineage blue sparks',
      'lineage blue stars',
    ],
    field: 'blue_stars_sum',
    type: 'number',
  },
  {
    label: 'Pink stars',
    aliases: [
      'pink stars',
      'pink star sum',
      'pink sparks total',
      'total pink sparks',
      'lineage pink sparks',
      'lineage pink stars',
      'red stars',
      'red star sum',
      'red sparks total',
      'total red sparks',
    ],
    field: 'pink_stars_sum',
    type: 'number',
  },
  {
    label: 'Green stars',
    aliases: [
      'green stars',
      'green star sum',
      'green sparks total',
      'total green sparks',
      'lineage green sparks',
      'lineage green stars',
    ],
    field: 'green_stars_sum',
    type: 'number',
  },
  {
    label: 'White stars',
    aliases: [
      'white stars',
      'white star sum',
      'white sparks total',
      'total white sparks',
      'lineage white sparks',
      'lineage white stars',
    ],
    field: 'white_stars_sum',
    type: 'number',
  },
  {
    label: 'Affinity',
    aliases: ['affinity', 'total affinity', 'legacy affinity'],
    field: 'affinity',
    type: 'number',
  },
  {
    label: 'Race affinity',
    aliases: ['race affinity'],
    field: 'computed_race_affinity',
    type: 'number',
  },
  {
    label: 'White factors',
    aliases: ['white factors', 'white sparks', 'white skills'],
    field: 'white_sparks',
    type: 'array',
  },
  {
    label: 'Blue sparks',
    aliases: ['blue sparks', 'blue factors'],
    field: 'blue_sparks',
    type: 'array',
  },
  {
    label: 'Pink sparks',
    aliases: ['pink sparks', 'pink factors'],
    field: 'pink_sparks',
    type: 'array',
  },
  {
    label: 'Green sparks',
    aliases: ['green sparks', 'green factors', 'unique skills'],
    field: 'green_sparks',
    type: 'array',
  },
  {
    label: 'Main white factors',
    aliases: [
      'main white factors',
      'main white sparks',
      'main white skills',
      'main skills',
    ],
    field: 'main_white_factors',
    type: 'array',
  },
  {
    label: 'Main race wins',
    aliases: ['main race wins', 'main race results', 'main win saddles'],
    field: 'main_win_saddles',
    type: 'array',
  },
  // Additional fields documented in the UQL README so they show up in autocomplete and validate correctly.
  {
    label: 'Inheritance ID',
    aliases: ['inheritance id', 'inheritance_id'],
    field: 'inheritance_id',
    type: 'number',
  },
  {
    label: 'Parent inheritance ID',
    aliases: ['main parent id', 'main_parent_id', 'parent inheritance id'],
    field: 'main_parent_id',
    type: 'number',
  },
  {
    label: 'GP1 inheritance ID',
    aliases: [
      'gp1 id',
      'grandparent 1 id',
      'left parent id',
      'parent left id',
      'left_parent_id',
      'parent_left_id',
    ],
    field: 'parent_left_id',
    type: 'number',
  },
  {
    label: 'GP2 inheritance ID',
    aliases: [
      'gp2 id',
      'grandparent 2 id',
      'right parent id',
      'parent right id',
      'right_parent_id',
      'parent_right_id',
    ],
    field: 'parent_right_id',
    type: 'number',
  },
  {
    label: 'Parent rarity',
    aliases: ['parent rarity', 'rarity'],
    field: 'parent_rarity',
    type: 'number',
  },
  {
    label: 'Main blue sparks',
    aliases: [
      'main blue sparks',
      'main blue factors',
      'main blue total',
      'main blue stars total',
      'main blue category count',
      'main blue parsed sparks',
      'main blue spark ids',
      'main blue factor ids',
    ],
    field: 'main_blue_factors',
    type: 'number',
  },
  {
    label: 'Main pink sparks',
    aliases: [
      'main pink sparks',
      'main pink factors',
      'main pink total',
      'main pink stars total',
      'main pink category count',
      'main pink parsed sparks',
      'main pink spark ids',
      'main pink factor ids',
    ],
    field: 'main_pink_factors',
    type: 'number',
  },
  {
    label: 'Main green sparks',
    aliases: [
      'main green sparks',
      'main green factors',
      'main green total',
      'main green stars total',
      'main green category count',
      'main unique skills',
      'main unique skill',
      'main green parsed sparks',
      'main green spark ids',
      'main green factor ids',
    ],
    field: 'main_green_factors',
    type: 'number',
  },
  {
    label: 'Main white count',
    aliases: ['main white count'],
    field: 'main_white_count',
    type: 'number',
  },
  {
    label: 'GP1 blue sparks',
    aliases: [
      'gp1 blue sparks',
      'gp1 blue factors',
      'gp1 blue spark ids',
      'gp1 blue factor ids',
      'left blue sparks',
      'left blue factors',
      'left blue parsed sparks',
    ],
    field: 'left_blue_factors',
    type: 'number',
  },
  {
    label: 'GP1 pink sparks',
    aliases: [
      'gp1 pink sparks',
      'gp1 pink factors',
      'gp1 pink spark ids',
      'gp1 pink factor ids',
      'left pink sparks',
      'left pink factors',
      'left pink parsed sparks',
    ],
    field: 'left_pink_factors',
    type: 'number',
  },
  {
    label: 'GP1 green sparks',
    aliases: [
      'gp1 green sparks',
      'gp1 green factors',
      'gp1 unique skills',
      'gp1 unique skill',
      'gp1 green spark ids',
      'gp1 green factor ids',
      'left green sparks',
      'left green factors',
      'left unique skills',
      'left unique skill',
      'left green parsed sparks',
    ],
    field: 'left_green_factors',
    type: 'number',
  },
  {
    label: 'Left white count',
    aliases: ['left white count'],
    field: 'left_white_count',
    type: 'number',
  },
  {
    label: 'GP2 blue sparks',
    aliases: [
      'gp2 blue sparks',
      'gp2 blue factors',
      'gp2 blue spark ids',
      'gp2 blue factor ids',
      'right blue sparks',
      'right blue factors',
      'right blue parsed sparks',
    ],
    field: 'right_blue_factors',
    type: 'number',
  },
  {
    label: 'GP2 pink sparks',
    aliases: [
      'gp2 pink sparks',
      'gp2 pink factors',
      'gp2 pink spark ids',
      'gp2 pink factor ids',
      'right pink sparks',
      'right pink factors',
      'right pink parsed sparks',
    ],
    field: 'right_pink_factors',
    type: 'number',
  },
  {
    label: 'GP2 green sparks',
    aliases: [
      'gp2 green sparks',
      'gp2 green factors',
      'gp2 unique skills',
      'gp2 unique skill',
      'gp2 green spark ids',
      'gp2 green factor ids',
      'right green sparks',
      'right green factors',
      'right unique skills',
      'right unique skill',
      'right green parsed sparks',
    ],
    field: 'right_green_factors',
    type: 'number',
  },
  {
    label: 'Right white count',
    aliases: ['right white count'],
    field: 'right_white_count',
    type: 'number',
  },
  {
    label: 'Race affinity (raw)',
    aliases: ['race affinity raw'],
    field: 'race_affinity',
    type: 'number',
  },
  {
    label: 'Support card count',
    aliases: ['support cards', 'support card count', 'support cards count'],
    field: 'support_card_count',
    type: 'number',
  },
  {
    label: 'Left white factors',
    aliases: [
      'left white factors',
      'left white sparks',
      'gp1 white factors',
      'gp1 white sparks',
    ],
    field: 'left_white_factors',
    type: 'array',
  },
  {
    label: 'Right white factors',
    aliases: [
      'right white factors',
      'right white sparks',
      'gp2 white factors',
      'gp2 white sparks',
    ],
    field: 'right_white_factors',
    type: 'array',
  },
  {
    label: 'Left race wins',
    aliases: ['left race wins', 'left race results', 'left win saddles'],
    field: 'left_win_saddles',
    type: 'array',
  },
  {
    label: 'Right race wins',
    aliases: ['right race wins', 'right race results', 'right win saddles'],
    field: 'right_win_saddles',
    type: 'array',
  },
  {
    label: 'Race wins',
    aliases: ['race wins', 'race results', 'win saddles'],
    field: 'main_win_saddles',
    type: 'array',
  },
];

export interface FriendlyScopedSparkField {
  label: string;
  aliases: string[];
  fields: { field: string; type: 'number' | 'array' }[];
  factorId: number;
  maxLevel: number;
  valueContext: UqlFactorValueContext;
}

export type UqlFactorValueContext = Extract<
  UqlValueContext,
  'blue-factor' | 'pink-factor' | 'green-factor' | 'white-factor'
>;

export type UqlNamedFactor = FriendlySparkField & {
  valueContext: UqlFactorValueContext;
};

const scopedFieldsCache = new WeakMap<UqlNamedFactor[], FriendlyScopedSparkField[]>();
export function buildScopedSparkFields(
  factors: UqlNamedFactor[],
): FriendlyScopedSparkField[] {
  const cached = scopedFieldsCache.get(factors);
  if (cached) return cached;
  const scopes = [
    {
      label: 'Main',
      aliases: ['main', 'parent', 'main parent'],
      fieldsByContext: {
        'blue-factor': [
          { field: 'main_blue_factors', type: 'number' as const },
        ],
        'pink-factor': [
          { field: 'main_pink_factors', type: 'number' as const },
        ],
        'green-factor': [
          { field: 'main_green_factors', type: 'number' as const },
        ],
        'white-factor': [
          { field: 'main_white_factors', type: 'array' as const },
        ],
      },
    },
    {
      label: 'GP1',
      aliases: [
        'gp1',
        'left',
        'left parent',
        'grandparent 1',
        'grand parent 1',
        'great parent 1',
      ],
      fieldsByContext: {
        'blue-factor': [
          { field: 'left_blue_factors', type: 'number' as const },
        ],
        'pink-factor': [
          { field: 'left_pink_factors', type: 'number' as const },
        ],
        'green-factor': [
          { field: 'left_green_factors', type: 'number' as const },
        ],
        'white-factor': [
          { field: 'left_white_factors', type: 'array' as const },
        ],
      },
    },
    {
      label: 'GP2',
      aliases: [
        'gp2',
        'right',
        'right parent',
        'grandparent 2',
        'grand parent 2',
        'great parent 2',
      ],
      fieldsByContext: {
        'blue-factor': [
          { field: 'right_blue_factors', type: 'number' as const },
        ],
        'pink-factor': [
          { field: 'right_pink_factors', type: 'number' as const },
        ],
        'green-factor': [
          { field: 'right_green_factors', type: 'number' as const },
        ],
        'white-factor': [
          { field: 'right_white_factors', type: 'array' as const },
        ],
      },
    },
    {
      label: 'Great parent',
      aliases: [
        'gp',
        'any gp',
        'grandparent',
        'grand parent',
        'great parent',
        'any grandparent',
        'any grand parent',
        'any great parent',
      ],
      fieldsByContext: {
        'blue-factor': [
          { field: 'left_blue_factors', type: 'number' as const },
          { field: 'right_blue_factors', type: 'number' as const },
        ],
        'pink-factor': [
          { field: 'left_pink_factors', type: 'number' as const },
          { field: 'right_pink_factors', type: 'number' as const },
        ],
        'green-factor': [
          { field: 'left_green_factors', type: 'number' as const },
          { field: 'right_green_factors', type: 'number' as const },
        ],
        'white-factor': [
          { field: 'left_white_factors', type: 'array' as const },
          { field: 'right_white_factors', type: 'array' as const },
        ],
      },
    },
  ];

  const fields = scopes.flatMap((scope) =>
    factors.flatMap((factor) => {
      const fields = scope.fieldsByContext[factor.valueContext];
      if (!fields?.length) return [];
      const factorAliases = [...new Set([factor.label, ...factor.aliases])];
      return [
        {
          label: `${scope.label} ${factor.label}`,
          aliases: scope.aliases.flatMap((scopeAlias) =>
            factorAliases.map((factorAlias) => `${scopeAlias} ${factorAlias}`),
          ),
          fields,
          factorId: factor.factorId,
          maxLevel: 3,
          valueContext: factor.valueContext,
        },
      ];
    }),
  );
  scopedFieldsCache.set(factors, fields);
  return fields;
}

let factorSnapshot: ReturnType<typeof factorOptions> = [], namedFactors: UqlNamedFactor[] = [];
export function namedUqlFactors(): UqlNamedFactor[] {
  // Read the reactive catalog even on a cache hit; resource replacement invalidates it.
  const factors = factorOptions();
  if (factors.length === factorSnapshot.length && factors.every((factor, index) => factor === factorSnapshot[index])) return namedFactors;
  factorSnapshot = factors;
  return namedFactors = factors
  .filter((factor) => factor.type >= 0 && factor.type <= 5)
  .map((factor) => {
    const color =
      factor.type === 0
        ? 'blue'
        : factor.type === 1
          ? 'pink'
          : factor.type === 5
            ? 'green'
            : 'white';
    return {
      label: factor.text,
      aliases: [
        ...new Set([
          factor.text,
          factor.text
            .replace(/[○◎◯]/g, '')
            .replace(/\s+[oO]$/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        ]),
      ],
      field: `${color}_sparks`,
      factorId: Number(factor.id),
      maxLevel: 9,
      valueContext: `${color}-factor` as UqlFactorValueContext,
    };
  });
}

// Angular prefers the stable stat/aptitude aliases over loaded duplicate labels.
const scopedFactorsCache = new WeakMap<UqlNamedFactor[], UqlNamedFactor[]>();
export function scopedUqlFactors(factors = namedUqlFactors()): UqlNamedFactor[] {
  const cached = scopedFactorsCache.get(factors);
  if (cached) return cached;
  const scoped = [
  ...new Map(
    [
      ...factors,
      ...friendlySparkFields.map((factor) => ({
        ...factor,
        valueContext: (factor.field === 'blue_sparks'
          ? 'blue-factor'
          : 'pink-factor') as UqlFactorValueContext,
      })),
    ].map(
      (factor) =>
        [`${factor.valueContext}:${factor.factorId}`, factor] as const,
    ),
  ).values(),
];
  scopedFactorsCache.set(factors, scoped);
  return scoped;
}
