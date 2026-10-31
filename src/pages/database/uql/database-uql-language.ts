import {
  friendlySparkFields,
  friendlyFieldAliases,
  type FriendlySparkField,
  type FriendlyFieldAlias,
  type FriendlyScopedSparkField,
  type UqlFactorValueContext,
  buildScopedSparkFields,
  scopedUqlFactors
} from '@/lib/inheritance/uql/uql-fields';
import { factorOptions, factorImage } from '@/lib/game-data/factors/factors';
import { characterImagePath } from '@/lib/game-data/characters';
import type {
  UqlSuggestion,
  UqlValueContext,
  UqlFieldType
} from '@/components/editor/query-editor-types';
import { UqlEditorLanguage } from '@/lib/inheritance/uql/uql-editor';
import type { GameDataEntry } from '@/lib/game-data/display-records';
import type { RaceQueryValue } from '@/lib/game-data/racing/races';
import type { UqlCharacter } from '@/lib/inheritance/uql/uql-compiler';
import { uqlLegacyDisplay, uqlLegacyName } from '@/lib/inheritance/uql/uql-context';
import type { SelectableParent } from '@/lib/veterans/parents/parent-picker';

function getUqlValueContextForField(fieldText: string): UqlValueContext | null {
  const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    endsWithAny(normalized, [
      'characters',
      'character',
      'umas',
      'uma',
      'charas',
      'chara',
      'main character',
      'main characters',
      'main uma',
      'main umas',
      'main parent',
      'main chara',
      'main charas',
      'main chara id',
      'left parent',
      'left character',
      'left characters',
      'left uma',
      'left umas',
      'left chara',
      'left charas',
      'left chara id',
      'right parent',
      'right character',
      'right characters',
      'right uma',
      'right umas',
      'right chara',
      'right charas',
      'right chara id',
      'gp1 character',
      'gp1 characters',
      'gp1 uma',
      'gp1 umas',
      'gp1 chara',
      'gp1 charas',
      'gp2 character',
      'gp2 characters',
      'gp2 uma',
      'gp2 umas',
      'gp2 chara',
      'gp2 charas',
      'gp character',
      'gp characters',
      'grandparent character',
      'grandparent characters',
      'great parent character',
      'great parent characters'
    ])
  ) {
    return 'character';
  }

  if (endsWithAny(normalized, ['support card', 'support', 'card', 'support card id'])) {
    return 'support-card';
  }

  if (
    endsWithAny(normalized, [
      'race results',
      'race wins',
      'main race wins',
      'left race wins',
      'right race wins',
      'win saddles',
      'main win saddles',
      'left win saddles',
      'right win saddles'
    ])
  ) {
    return 'race-saddle';
  }

  if (endsWithAny(normalized, ['rank', 'parent rank'])) {
    return 'rank';
  }

  if (
    endsWithAny(normalized, [
      'white sparks',
      'white skills',
      'white factors',
      'main parent white skills',
      'main parent skills',
      'parent white skills',
      'parent skills',
      'main white factors',
      'main white sparks',
      'left white factors',
      'left white sparks',
      'right white factors',
      'right white sparks',
      'gp1 white factors',
      'gp1 white sparks',
      'gp2 white factors',
      'gp2 white sparks'
    ])
  ) {
    return 'white-factor';
  }

  if (
    endsWithAny(normalized, [
      'green sparks',
      'unique skills',
      'green factors',
      'main green sparks',
      'main green factors',
      'main unique skills',
      'left green sparks',
      'left green factors',
      'left unique skills',
      'right green sparks',
      'right green factors',
      'right unique skills',
      'gp1 green sparks',
      'gp1 green factors',
      'gp1 unique skills',
      'gp2 green sparks',
      'gp2 green factors',
      'gp2 unique skills'
    ])
  ) {
    return 'green-factor';
  }

  if (
    endsWithAny(normalized, [
      'blue sparks',
      'blue factors',
      'main blue sparks',
      'main blue factors',
      'left blue sparks',
      'left blue factors',
      'right blue sparks',
      'right blue factors',
      'gp1 blue sparks',
      'gp1 blue factors',
      'gp2 blue sparks',
      'gp2 blue factors'
    ])
  ) {
    return 'blue-factor';
  }

  if (
    endsWithAny(normalized, [
      'pink sparks',
      'pink factors',
      'main pink sparks',
      'main pink factors',
      'left pink sparks',
      'left pink factors',
      'right pink sparks',
      'right pink factors',
      'gp1 pink sparks',
      'gp1 pink factors',
      'gp2 pink sparks',
      'gp2 pink factors'
    ])
  ) {
    return 'pink-factor';
  }

  return null;
}

function getFriendlyFieldSearchText(field: FriendlyFieldAlias): string {
  const extraTerms: string[] = [];
  switch (field.field) {
    case 'main_chara_id':
      extraTerms.push('main char', 'main character', 'runner', 'runner character');
      break;
    case 'main_parent_id':
      extraTerms.push(
        'parent char',
        'parent character',
        'main parent char',
        'main parent character'
      );
      break;
    case 'blue_stars_sum':
    case 'pink_stars_sum':
    case 'green_stars_sum':
    case 'white_stars_sum':
      extraTerms.push('total sparks', 'total stars', 'lineage total', 'lineage spark total');
      break;
    case 'left_chara_id':
      extraTerms.push(
        'gp char',
        'gp cha',
        'gp1 char',
        'gp1 character',
        'grandparent character',
        'left char',
        'left character'
      );
      break;
    case 'right_chara_id':
      extraTerms.push(
        'gp char',
        'gp cha',
        'gp2 char',
        'gp2 character',
        'grandparent character',
        'right char',
        'right character'
      );
      break;
    default:
      break;
  }

  return [...field.aliases, field.label, ...extraTerms].join(' ');
}

function getFriendlyFieldPriority(field: FriendlyFieldAlias): number {
  if (field.field.endsWith('_chara_id') || field.field === 'main_parent_id') return 0;
  if (field.field === 'support_card_id') return 1;
  if (field.field === 'limit_break_count') return 2;
  if (field.field === 'trainer_name' || field.field === 'account_id') return 4;
  if (field.type === 'string') return 6;
  if (
    [
      'main_blue_factors',
      'main_pink_factors',
      'main_green_factors',
      'left_blue_factors',
      'left_pink_factors',
      'left_green_factors',
      'right_blue_factors',
      'right_pink_factors',
      'right_green_factors'
    ].includes(field.field)
  )
    return 24;
  if (
    [
      'win_count',
      'white_count',
      'follower_num',
      'parent_rank',
      'affinity',
      'computed_race_affinity'
    ].includes(field.field)
  )
    return 8;
  if (field.type === 'array') return 16;
  return 12;
}

function getFriendlyFieldSuggestionDetail(field: FriendlyFieldAlias): string {
  switch (field.field) {
    case 'blue_stars_sum':
      return 'Total blue stars across the lineage, e.g. Blue stars >= 9';
    case 'pink_stars_sum':
      return 'Total pink stars across the lineage, e.g. Pink stars >= 6';
    case 'green_stars_sum':
      return 'Total green stars across the lineage';
    case 'white_stars_sum':
      return 'Total white stars across the lineage';
    case 'main_blue_factors':
      return 'Main-slot blue total, max 3. For a specific stat, use Main Speed >= 1';
    case 'main_pink_factors':
      return 'Main-slot pink total, max 3. For a specific aptitude, use Main End Closer >= 1';
    case 'main_green_factors':
      return 'Main-slot green total, max 3. For a specific unique skill, use Main [skill] >= 1';
    case 'left_blue_factors':
    case 'right_blue_factors':
      return `Category star count. For a specific stat, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} Speed >= 1`;
    case 'left_pink_factors':
    case 'right_pink_factors':
      return `Category star count. For a specific aptitude, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} End Closer >= 1`;
    case 'left_green_factors':
    case 'right_green_factors':
      return `Category star count. For a specific unique skill, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} [skill] >= 1`;
    default:
      return `${field.label} filter`;
  }
}

function getScopedSparkFieldSearchText(field: FriendlyScopedSparkField): string {
  const colorLabel = getUqlFactorColorLabel(field.valueContext);
  const coloredLabel = field.label.replace(/^(\S+)/, `$1 ${colorLabel}`);
  return [
    field.label,
    `${field.label} stars`,
    `${field.label} spark`,
    coloredLabel,
    `${coloredLabel} sparks`,
    `${coloredLabel} factors`,
    ...field.aliases
  ].join(' ');
}

function getUqlFactorColorLabel(context: UqlFactorValueContext): string {
  switch (context) {
    case 'blue-factor':
      return 'blue';
    case 'pink-factor':
      return 'pink';
    case 'green-factor':
      return 'green';
    case 'white-factor':
      return 'white';
  }

  return 'spark';
}

function getScopedSparkFieldPriority(field: FriendlyScopedSparkField): number {
  return field.valueContext === 'blue-factor' || field.valueContext === 'pink-factor' ? 7 : 28;
}

function getScopedSparkCategorySuggestions(): UqlSuggestion[] {
  return [
    {
      label: 'Great parent blue sparks',
      insertText: 'Great parent Blue Sparks',
      detail: 'Up to 3 blue stars on either great parent',
      matchPhrases: [
        'great parent blue sparks',
        'great parent blue factors',
        'grandparent blue sparks',
        'grandparent blue factors',
        'gp blue sparks',
        'gp blue factors',
        'any gp blue sparks',
        'any gp blue factors'
      ],
      valueContext: 'blue-factor' as const
    },
    {
      label: 'Great parent pink sparks',
      insertText: 'Great parent Pink Sparks',
      detail: 'Up to 3 pink stars on either great parent',
      matchPhrases: [
        'great parent pink sparks',
        'great parent pink factors',
        'grandparent pink sparks',
        'grandparent pink factors',
        'gp pink sparks',
        'gp pink factors',
        'any gp pink sparks',
        'any gp pink factors'
      ],
      valueContext: 'pink-factor' as const
    },
    {
      label: 'Great parent green sparks',
      insertText: 'Great parent Green Sparks',
      detail: 'Up to 3 green stars on either great parent',
      matchPhrases: [
        'great parent green sparks',
        'great parent green factors',
        'great parent unique skills',
        'grandparent green sparks',
        'grandparent green factors',
        'grandparent unique skills',
        'gp green sparks',
        'gp green factors',
        'gp unique skills',
        'any gp green sparks',
        'any gp green factors',
        'any gp unique skills'
      ],
      valueContext: 'green-factor' as const
    }
  ].map((field) => ({
    label: field.label,
    insertText: field.insertText,
    kind: 'field' as const,
    detail: field.detail,
    searchText: field.matchPhrases.join(' '),
    matchPhrases: field.matchPhrases,
    priority: 11,
    scopeContext: 'any-gp' as const,
    valueContext: field.valueContext,
    fieldType: 'number' as UqlFieldType
  }));
}

function getSyntaxSuggestionPriority(suggestion: UqlSuggestion): number {
  if (suggestion.kind === 'keyword') return 10;
  if (suggestion.kind === 'operator') return 12;
  return 70;
}

function getScopeContextForLabel(label: string): UqlSuggestion['scopeContext'] {
  const normalized = label.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(?:main|parent|main parent)\b/.test(normalized)) return 'main';
  if (/^(?:gp1|left|left parent|grandparent 1|grand parent 1|great parent 1)\b/.test(normalized))
    return 'gp1';
  if (/^(?:gp2|right|right parent|grandparent 2|grand parent 2|great parent 2)\b/.test(normalized))
    return 'gp2';
  if (
    /^(?:gp|any gp|grandparent|grand parent|great parent|any grandparent|any grand parent|any great parent)\b/.test(
      normalized
    )
  )
    return 'any-gp';
  return undefined;
}

function endsWithAny(value: string, endings: string[]): boolean {
  return endings.some((ending) => value.endsWith(ending));
}

const factorContext = (type: number): UqlFactorValueContext =>
  type === 0
    ? 'blue-factor'
    : type === 1
      ? 'pink-factor'
      : type === 5
        ? 'green-factor'
        : 'white-factor';

const factorSuggestions = (): UqlSuggestion[] =>
  factorOptions()
    .filter((factor) => factor.type >= 0 && factor.type <= 5)
    .map((factor) => ({
      label: factor.text,
      insertText: factor.text,
      kind: 'value',
      detail: 'Factor id ' + factor.id,
      searchText: [
        factor.text,
        factor.id,
        ...Array.from({ length: 9 }, (_, i) => Number(factor.id) * 10 + i + 1)
      ].join(' '),
      valueContext: factorContext(factor.type),
      priority: factorContext(factor.type) === 'white-factor' ? 12 : 18,
      backendValue: String(Number(factor.id) * 10 + 1)
    }));

const scopedSuggestions = new WeakMap<FriendlyScopedSparkField, UqlSuggestion>();
export function createDatabaseUqlLanguage(
  characters: GameDataEntry[],
  supports: GameDataEntry[],
  races: readonly RaceQueryValue[],
  queryCharacters: readonly UqlCharacter[] = [],
  legacyParents: readonly SelectableParent[] = []
): UqlEditorLanguage {
  const syntaxSuggestions: UqlSuggestion[] = [
    {
      label: 'where',
      insertText: 'where ',
      kind: 'keyword',
      detail: 'Start a filter expression'
    },
    {
      label: 'Scenario',
      insertText: 'Scenario = Aoharu',
      kind: 'snippet',
      detail: 'Filter by the training scenario ID using its readable name'
    },
    {
      label: 'Sort by total blue stars',
      insertText: 'sort by = Total Blue stars',
      kind: 'snippet',
      detail: 'Order by total blue spark stars, highest first'
    },
    {
      label: 'Sort by total red stars',
      insertText: 'sort by = Total Red stars',
      kind: 'snippet',
      detail: 'Order by total red/pink spark stars, highest first'
    },
    {
      label: 'Sort by total green stars',
      insertText: 'sort by = Total Green stars',
      kind: 'snippet',
      detail: 'Order by total green spark stars, highest first'
    },
    {
      label: 'Sort by total white stars',
      insertText: 'sort by = Total White stars',
      kind: 'snippet',
      detail: 'Order by total white spark stars, highest first'
    },
    {
      label: 'Sort by white skills amount',
      insertText: 'sort by = White skills amount',
      kind: 'snippet',
      detail: 'Order by raw white skill count, then affinity'
    },
    {
      label: 'and',
      insertText: ' and ',
      kind: 'keyword',
      detail: 'Require both sides'
    },
    {
      label: 'or',
      insertText: ' or ',
      kind: 'keyword',
      detail: 'Match either side'
    },
    {
      label: 'not',
      insertText: 'not ',
      kind: 'keyword',
      detail: 'Negate a predicate'
    },
    {
      label: 'greater than or equal',
      insertText: '>= ',
      kind: 'operator',
      detail: 'At least'
    },
    {
      label: 'less than or equal',
      insertText: '<= ',
      kind: 'operator',
      detail: 'At most'
    },
    {
      label: 'equals',
      insertText: '= ',
      kind: 'operator',
      detail: 'Exact match'
    },
    {
      label: 'match list',
      insertText: 'in ()',
      kind: 'operator',
      detail: 'Match any listed value'
    },
    {
      label: 'omit list',
      insertText: 'not in ()',
      kind: 'operator',
      detail: 'Reject listed values'
    },
    {
      label: 'Parentheses',
      insertText: '(Speed >= 3 or Stamina >= 3)',
      kind: 'snippet',
      detail: 'Group OR logic'
    },
    {
      label: 'Modulo search',
      insertText: 'Wins % 2 = 0',
      kind: 'snippet',
      detail: 'Use arithmetic operators in numeric comparisons'
    },
    {
      label: 'Match list',
      insertText: 'Main character in (Special Week, Silence Suzuka)',
      kind: 'snippet',
      detail: 'Use in (...) for listed values'
    },
    {
      label: 'Omit list',
      insertText: 'Main character not in (Special Week, Silence Suzuka)',
      kind: 'snippet',
      detail: 'Use not in (...) for omitted values'
    },
    {
      label: 'has skill',
      insertText: 'has Right-Handed ○',
      kind: 'snippet',
      detail: 'Skill present on any parent'
    },
    {
      label: 'has any skills',
      insertText: 'has any (Right-Handed ○, Left-Handed ○)',
      kind: 'snippet',
      detail: 'At least one skill present on any parent'
    },
    {
      label: 'has all skills',
      insertText: 'has all (Right-Handed ○, Left-Handed ○)',
      kind: 'snippet',
      detail: 'Every listed skill present across all parents'
    },
    {
      label: 'optional white skills',
      insertText: 'optional white in (Right-Handed ○, Left-Handed ○)',
      kind: 'snippet',
      detail: 'Require and rank global white skill matches'
    },
    {
      label: 'optional white priority group',
      insertText: 'optional white in (Right-Handed ○, Left-Handed ○, priority = 0)',
      kind: 'snippet',
      detail: 'Require and rank global white skill matches in priority group 0'
    },
    {
      label: 'optional white prio group',
      insertText: 'optional white in (Right-Handed ○, Left-Handed ○, prio group = 0)',
      kind: 'snippet',
      detail: 'Require and rank global white skill matches in prio group 0'
    },
    {
      label: 'optional main white skills',
      insertText: 'optional main white in (Right-Handed ○, Left-Handed ○)',
      kind: 'snippet',
      detail: 'Require and rank main-parent white skill matches'
    },
    {
      label: 'optional main white priority group',
      insertText: 'optional main white in (Right-Handed ○, Left-Handed ○, priority group = 1)',
      kind: 'snippet',
      detail: 'Require and rank main-parent white skill matches in priority group 1'
    },
    {
      label: 'lineage white skills',
      insertText: 'lineage white in (Right-Handed ○, Left-Handed ○)',
      kind: 'snippet',
      detail: 'Sort by lineage-style white skill stacking'
    },
    {
      label: 'lineage white priority group',
      insertText: 'lineage white in (Right-Handed ○, Left-Handed ○, group = 2)',
      kind: 'snippet',
      detail: 'Sort by lineage-style white skill stacking in priority group 2'
    },
    {
      label: 'Main speed stars',
      insertText: 'Main Speed >= 3',
      kind: 'snippet',
      detail: 'Main slot Speed stars, max 3'
    },
    {
      label: 'GP1 speed stars',
      insertText: 'GP1 Speed >= 3',
      kind: 'snippet',
      detail: 'Great parent 1 Speed stars, max 3'
    },
    {
      label: 'GP2 speed stars',
      insertText: 'GP2 Speed >= 3',
      kind: 'snippet',
      detail: 'Great parent 2 Speed stars, max 3'
    },
    {
      label: 'Great parent speed stars',
      insertText: 'Great parent Speed >= 3',
      kind: 'snippet',
      detail: 'Either great parent has Speed stars, max 3'
    },
    {
      label: 'Main has skill',
      insertText: 'Main has Right-Handed ○',
      kind: 'snippet',
      detail: 'Specific white factor on the main slot'
    },
    {
      label: 'Great parent has skill',
      insertText: 'Great parent has Right-Handed ○',
      kind: 'snippet',
      detail: 'Either great parent has this white factor'
    }
  ];

  const friendlyFieldSuggestions: UqlSuggestion[] = [
    ...[
      {
        label: 'Target (ace)',
        insertText: 'target',
        detail: 'Editor context target character',
        matchPhrases: ['target', 'target ace', 'affinity target'],
        valueContext: 'character' as const
      },
      {
        label: 'Owned legacy',
        insertText: 'owned legacy = []',
        cursorOffset: -1,
        detail: 'Pick a legacy from your account',
        matchPhrases: ['owned legacy', 'legacy', 'your legacy', 'my legacy'],
        valueContext: 'legacy' as const
      }
    ].map((field) => ({
      label: field.label,
      insertText: field.insertText || field.label,
      kind: 'field' as const,
      detail: field.detail,
      searchText: field.matchPhrases.join(' '),
      matchPhrases: field.matchPhrases,
      priority: 0,
      valueContext: field.valueContext,
      fieldType: 'directive' as UqlFieldType,
      cursorOffset: field.cursorOffset
    })),
    ...friendlySparkFields.map((field) => ({
      label: field.label,
      insertText: field.label,
      kind: 'field' as const,
      detail: 'Compare this spark by its combined star count',
      searchText: field.aliases.join(' '),
      matchPhrases: [field.label, ...field.aliases],
      priority: 22,
      fieldType: 'number' as UqlFieldType
    })),
    ...friendlyFieldAliases.map((alias) => ({
      label: alias.label,
      insertText: alias.label,
      kind: 'field' as const,
      detail: getFriendlyFieldSuggestionDetail(alias),
      searchText: getFriendlyFieldSearchText(alias),
      matchPhrases: [alias.label, ...alias.aliases],
      priority: getFriendlyFieldPriority(alias),
      fieldType: alias.type,
      valueContext: getUqlValueContextForField(alias.field) || undefined
    })),
    ...getScopedSparkCategorySuggestions(),
    ...[
      {
        label: 'Optional white',
        detail: 'Ranks rows with these global white skill matches',
        matchPhrases: ['optional white', 'optional skills', 'optional white skills']
      },
      {
        label: 'Optional main white',
        detail: 'Ranks rows with these main-parent white skill matches',
        matchPhrases: ['optional main white', 'optional parent white', 'optional main skills']
      },
      {
        label: 'Lineage white',
        detail: 'Ranks rows by lineage-style white skill stacking',
        matchPhrases: ['lineage white', 'lineage skills', 'lineage white skills']
      }
    ].map((field) => ({
      label: field.label,
      insertText: field.label,
      kind: 'field' as const,
      detail: field.detail,
      searchText: field.matchPhrases.join(' '),
      matchPhrases: field.matchPhrases,
      priority: 13,
      valueContext: 'white-factor' as const,
      fieldType: 'array' as UqlFieldType
    })),
    ...[
      {
        label: 'Main',
        detail: 'White factors on the main-parent slot',
        searchText: 'main parent main has parent has',
        matchPhrases: ['main', 'parent', 'main parent'],
        scopeContext: 'main' as const
      },
      {
        label: 'GP1',
        detail: 'White factors on great parent 1',
        searchText: 'gp1 left grandparent 1 grand parent 1 great parent 1 left has',
        matchPhrases: [
          'gp1',
          'left',
          'left parent',
          'grandparent 1',
          'grand parent 1',
          'great parent 1'
        ],
        scopeContext: 'gp1' as const
      },
      {
        label: 'GP2',
        detail: 'White factors on great parent 2',
        searchText: 'gp2 right grandparent 2 grand parent 2 great parent 2 right has',
        matchPhrases: [
          'gp2',
          'right',
          'right parent',
          'grandparent 2',
          'grand parent 2',
          'great parent 2'
        ],
        scopeContext: 'gp2' as const
      },
      {
        label: 'Any GP',
        detail: 'White factors on either great parent',
        searchText:
          'gp any gp grandparent grand parent great parent any grandparent any great parent has',
        matchPhrases: [
          'gp',
          'any gp',
          'grandparent',
          'grand parent',
          'great parent',
          'any grandparent',
          'any grand parent',
          'any great parent'
        ],
        scopeContext: 'any-gp' as const
      },
      {
        label: 'Great parent',
        detail: 'White factors on either great parent',
        searchText:
          'gp any gp grandparent grand parent great parent any grandparent any great parent has',
        matchPhrases: [
          'gp',
          'any gp',
          'grandparent',
          'grand parent',
          'great parent',
          'any grandparent',
          'any grand parent',
          'any great parent'
        ],
        scopeContext: 'any-gp' as const
      }
    ].map((field) => ({
      label: field.label,
      insertText: field.label,
      kind: 'field' as const,
      detail: field.detail,
      searchText: field.searchText,
      matchPhrases: field.matchPhrases,
      priority: 14,
      scopeContext: field.scopeContext,
      valueContext: 'white-factor' as const,
      fieldType: 'array' as UqlFieldType
    })),
    ...buildScopedSparkFields(scopedUqlFactors()).map((field) => {
      const cached = scopedSuggestions.get(field);
      if (cached) return cached;
      const suggestion: UqlSuggestion = {
        label: field.label,
        insertText: field.label,
        kind: 'field',
        detail:
          'Up to 3 stars on a specific slot. Compare a named factor like Main End Closer >= 1',
        searchText: getScopedSparkFieldSearchText(field),
        matchPhrases: [field.label, ...field.aliases],
        priority: getScopedSparkFieldPriority(field),
        scopeContext: getScopeContextForLabel(field.label),
        valueContext: field.valueContext,
        fieldType: 'number'
      };

      scopedSuggestions.set(field, suggestion);
      return suggestion;
    })
  ];

  const characterNames = new Map(queryCharacters.map((character) => [character.id, character]));
  const characterSuggestions: UqlSuggestion[] = characters.map((character) => ({
    label: characterNames.get(character.id)?.displayName ?? character.title,
    insertText: characterNames.get(character.id)?.displayName ?? character.title,
    kind: 'value',
    detail: `${characterNames.get(character.id)?.skin || 'Original'}, character ID ${character.id}`,
    searchText: `${character.searchText} ${characterNames.get(character.id)?.displayName ?? ''}`,
    valueContext: 'character',
    priority: 0,
    backendValue: character.id,
    imageUrl: character.image
  }));

  const supportSuggestions: UqlSuggestion[] = supports.map((card) => {
    const label =
      card.title +
      ' [' +
      card.tags[1] +
      '] (' +
      (card.tags[0] === 'Wit' ? 'Wisdom' : card.tags[0]) +
      ')';

    return {
      label,
      insertText: label,
      kind: 'value',
      detail: 'Support card id ' + card.id,
      searchText: card.searchText,
      matchPhrases: [card.title, label],
      valueContext: 'support-card',
      priority: 2,
      backendValue: card.id,
      imageUrl: card.image,
      rarityClass: card.tags[1]?.toLowerCase()
    };
  });

  const raceSuggestions: UqlSuggestion[] = races.map((race) => ({
    label: race.name,
    insertText: race.name,
    kind: 'value',
    detail: 'Win saddle ids ' + race.saddleIds.join(', '),
    searchText:
      race.searchText ?? [race.name, race.shortName, race.id, ...race.saddleIds].join(' '),
    matchPhrases: race.aliases ?? [race.shortName, String(race.id)],
    valueContext: 'race-saddle',
    priority: 8,
    backendValue: race.saddleIds.join(', '),
    badgeText: race.grade,
    badgeClass: race.grade ? 'grade-' + race.grade.toLowerCase() : undefined
  }));

  const rankSuggestions: UqlSuggestion[] = Array.from({ length: 20 }, (_, i) => ({
    label: 'Rank ' + (i + 1),
    insertText: String(i + 1),
    kind: 'value',
    valueContext: 'rank',
    priority: 4,
    backendValue: String(i + 1),
    imageUrl: '/assets/images/icon/ranks/utx_txt_rank_' + String(i + 1).padStart(2, '0') + '.webp'
  }));

  return new UqlEditorLanguage([
    ...legacyParents.map((parent): UqlSuggestion => ({
      label: uqlLegacyDisplay(parent, queryCharacters),
      insertText: `[${uqlLegacyDisplay(parent, queryCharacters)}]`,
      kind: 'value',
      valueContext: 'legacy',
      priority: 0,
      detail: `Owned legacy (${parent.trainer_id || parent.share_source})`,
      matchPhrases: [
        uqlLegacyName(parent, queryCharacters),
        `${parent.trainer_id}:${parent.member_id}`
      ],
      backendValue: String(parent.id),
      imageUrl: parent.card_id ? characterImagePath(parent.card_id) : undefined
    })),
    ...friendlyFieldSuggestions,
    ...syntaxSuggestions.map((s) => ({
      ...s,
      priority: getSyntaxSuggestionPriority(s)
    })),
    ...characterSuggestions,
    ...supportSuggestions,
    ...raceSuggestions,
    ...rankSuggestions,
    ...factorSuggestions().map((suggestion) => ({
      ...suggestion,
      imageUrl: factorImage(Math.floor(Number(suggestion.backendValue) / 10))
    }))
  ]);
}
