import { occurrenceComparison } from './factor-occurrences';
import { isUqlQuoteStart, replaceOutsideUqlStrings } from './uql-text';
// Query compilation extracted from the live Angular Database filter.
// No component state, fetching, or persistence: callers supply the shared catalogs.
import {
  friendlySparkFields,
  friendlyFieldAliases,
  namedUqlFactors,
  scopedUqlFactors,
  buildScopedSparkFields,
  type FriendlySparkField,
  type FriendlyScopedSparkField,
  type UqlNamedFactor,
  type UqlFactorValueContext,
} from './uql-fields';
import type { UqlValueContext } from '@/components/query-editor-types';
import type { SupportCardCatalogEntry } from '@/lib/catalog/support-card-catalog';
import type { RaceQueryValue } from '@/lib/catalog/race-catalog';
import { scenarios } from '@/lib/catalog/scenario-catalog';

export interface UqlCharacter {
  id: string;
  name: string;
  displayName: string;
  skin: string;
}
export interface UqlQueryCatalog {
  characters: readonly UqlCharacter[];
  supports: readonly SupportCardCatalogEntry[];
  races: readonly RaceQueryValue[];
}

interface FriendlySparkComparisonAlias extends FriendlySparkField {
  alias: string;
  comparisonPattern: RegExp;
}

interface FriendlyFieldAliasReplacement {
  alias: string;
  field: string;
  pattern: RegExp;
}

interface FriendlyCharacterScopeAliasReplacement {
  alias: string;
  label: string;
  fields: string[];
  comparisonPattern: RegExp;
  inPattern: RegExp;
  notInPattern: RegExp;
}

interface FriendlyArrayAliasReplacement {
  alias: string;
  label: string;
  fields: string[];
  hasAllPattern: RegExp;
  hasAnyPattern: RegExp;
  doesNotHavePattern: RegExp;
  hasPattern: RegExp;
  containsAllPattern: RegExp;
  containsAnyPattern: RegExp;
  inPattern: RegExp;
  notInPattern: RegExp;
  containsPattern: RegExp;
}

interface UqlSkillListItem {
  value: string;
  factor: UqlNamedFactor | null;
  operator?: string;
  level?: number;
  occurrences?: boolean;
}

export class UqlCompiler {
  private static readonly factorIndexes = new WeakMap<UqlNamedFactor[], {
    values: Map<string, UqlNamedFactor>;
    scoped: Map<string, FriendlyScopedSparkField>;
  }>();
  private readonly friendlySparkFields = friendlySparkFields;
  private readonly friendlyFieldAliases = friendlyFieldAliases;
  private readonly factors = namedUqlFactors();
  private readonly blueFactors = this.factors
    .filter((factor) => factor.valueContext === 'blue-factor')
    .map((factor) => ({ id: factor.factorId }));
  private readonly pinkFactors = this.factors
    .filter((factor) => factor.valueContext === 'pink-factor')
    .map((factor) => ({ id: factor.factorId }));
  private readonly greenFactors = this.factors
    .filter((factor) => factor.valueContext === 'green-factor')
    .map((factor) => ({ id: factor.factorId }));
  private readonly scenarioOptionIds = scenarios.map((scenario) => scenario.id);

  constructor(
    private readonly catalog: UqlQueryCatalog = {
      characters: [],
      supports: [],
      races: [],
    },
  ) {
    this.uqlNamedFactorsCache = this.factors;
    this.scopedUqlNamedFactorsCache = scopedUqlFactors(this.factors);
    const cached = UqlCompiler.factorIndexes.get(this.factors);
    if (cached) {
      this.factorValueLookup = cached.values;
      this.scopedSparkComparisonAliasLookup = cached.scoped;
      return;
    }
    for (const factor of this.factors)
      for (const alias of new Set([factor.label, ...factor.aliases])) {
        const name = this.normalizeUqlName(alias);
        for (const context of [factor.valueContext, null]) {
          const key = this.getFactorValueLookupKey(context, name);
          if (!this.factorValueLookup.has(key))
            this.factorValueLookup.set(key, factor);
        }
      }
    for (const field of buildScopedSparkFields(this.scopedUqlNamedFactorsCache))
      for (const alias of new Set([field.label, ...field.aliases])) {
        this.scopedSparkComparisonAliasLookup.set(
          this.normalizeUqlName(alias),
          field,
        );
      }
    UqlCompiler.factorIndexes.set(this.factors, { values: this.factorValueLookup, scoped: this.scopedSparkComparisonAliasLookup });
  }

  compile(query: string): string {
    const scoringFunctionNameCompiled =
      this.compileFriendlyScoringFunctionNames(query);
    const scoringFunctionValueCompiled =
      this.compileFriendlyWhiteScoringFunctionValues(
        scoringFunctionNameCompiled,
      );
    const arrayOperatorCompiled = this.compileFriendlyArrayOperators(
      scoringFunctionValueCompiled,
    );
    const factorSumCompiled = this.compileFriendlyFactorSumComparisons(
      this.compileFriendlyOccurrenceComparisons(arrayOperatorCompiled),
    );
    const scalarArithmeticCompiled =
      this.compileFriendlyScalarArithmeticFactorAliases(factorSumCompiled);
    const scopedSparkCompiled = this.compileFriendlyScopedSparkComparisons(
      scalarArithmeticCompiled,
    );
    const scopedSparkCategoryCompiled =
      this.compileFriendlyScopedSparkCategoryComparisons(scopedSparkCompiled);
    const sparkCategoryCompiled = this.compileFriendlySparkCategoryComparisons(
      scopedSparkCategoryCompiled,
    );
    const sparkCompiled = this.compileFriendlySparkComparisons(
      sparkCategoryCompiled,
    );
    const factorCompiled =
      this.compileFriendlyLoadedFactorComparisons(sparkCompiled);
    const characterScopeCompiled =
      this.compileFriendlyCharacterScopeExpressions(factorCompiled);
    const supportCardCompiled = this.compileFriendlySupportCardExpressions(
      characterScopeCompiled,
    );
    const namedValueCompiled =
      this.compileFriendlyNamedValues(supportCardCompiled);
    return this.normalizeCompiledSupportCardAliases(
      this.compileFriendlyFieldAliases(namedValueCompiled),
    ).trim();
  }

  private getScenarioName(id: number): string {
    return (
      scenarios.find((scenario) => scenario.id === id)?.label ??
      `Scenario ${id}`
    );
  }
  private getSupportCardTypeDisplay(type: string): string {
    return (
      (
        {
          speed: 'Speed',
          stamina: 'Stamina',
          power: 'Power',
          guts: 'Guts',
          intelligence: 'Wisdom',
          friend: 'Friend',
        } as Record<string, string>
      )[type] ?? 'Unknown'
    );
  }
  private getSupportCardRarityDisplay(rarity: number): string {
    return (
      ({ 1: 'R', 2: 'SR', 3: 'SSR' } as Record<number, string>)[rarity] ??
      'Unknown'
    );
  }
  private getUqlRaceSaddleValues() {
    return this.catalog.races.map((race) => ({
      label: race.name,
      aliases: race.aliases ?? [race.shortName, String(race.id)],
      saddleIds: race.saddleIds,
    }));
  }
  private getUqlFieldPattern(context: UqlValueContext): string {
    const aliases = this.friendlyFieldAliases
      .filter(
        (field) =>
          this.getUqlValueContextForField(field.field) === context ||
          field.aliases.some(
            (alias) => this.getUqlValueContextForField(alias) === context,
          ),
      )
      .flatMap((field) => [field.field, field.label, ...field.aliases]);
    return `(?:${[...new Set(aliases)].map((alias) => this.escapeRegExp(alias).replace(/\s+/g, '\\s+')).join('|')})`;
  }
  private resolveCharacterUqlValue(
    rawValue: string,
    fieldText?: string,
  ): string | null {
    const name = this.normalizeUqlName(rawValue);
    const matches = (value: string) => this.normalizeUqlName(value) === name;
    const character =
      this.catalog.characters.find((entry) => matches(entry.displayName)) ??
      this.catalog.characters.find(
        (entry) => entry.skin === 'Original' && matches(entry.name),
      ) ??
      this.catalog.characters.find((entry) => matches(entry.name));
    return character
      ? this.formatCharacterUqlId(Number(character.id), fieldText)
      : null;
  }

  private readonly friendlySparkComparisonAliases: FriendlySparkComparisonAlias[] =
    this.friendlySparkFields
      .flatMap((field) =>
        field.aliases.map((alias) =>
          this.createFriendlySparkComparisonAlias(field, alias),
        ),
      )
      .sort((left, right) => right.alias.length - left.alias.length);

  private readonly friendlyFieldAliasReplacements: FriendlyFieldAliasReplacement[] =
    this.friendlyFieldAliases
      .flatMap((aliasGroup) =>
        [aliasGroup.field, aliasGroup.label, ...aliasGroup.aliases].map(
          (alias) =>
            this.createFriendlyFieldAliasReplacement(alias, aliasGroup.field),
        ),
      )
      .sort((left, right) => right.alias.length - left.alias.length);

  private readonly friendlyCharacterScopeAliasReplacements: FriendlyCharacterScopeAliasReplacement[] =
    this.buildCharacterScopeAliases()
      .sort((left, right) => right.alias.length - left.alias.length)
      .map((scope) => this.createFriendlyCharacterScopeAliasReplacement(scope));

  private readonly scopedArrayFields = this.buildScopedArrayFields();

  private readonly friendlyArrayAliases =
    [
      ...this.friendlyFieldAliases
        .filter((field) => field.type === 'array')
        .flatMap((field) =>
          [field.field, field.label, ...field.aliases].map((alias) => ({
            alias,
            fields: [field.field],
            label: field.label,
          })),
        ),
      ...this.scopedArrayFields,
    ]
      .sort((left, right) => right.alias.length - left.alias.length);

  private readonly friendlyArrayAliasReplacements = new Map<(typeof this.friendlyArrayAliases)[number], FriendlyArrayAliasReplacement>();
  private skillClauseBoundary: string | undefined;

  private uqlNamedFactorsCache: UqlNamedFactor[] = [];

  private scopedUqlNamedFactorsCache: UqlNamedFactor[] = [];

  private scopedSparkComparisonAliasLookup = new Map<
    string,
    FriendlyScopedSparkField
  >();

  private factorValueLookup = new Map<string, UqlNamedFactor>();

  private normalizePriorityGroup(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
  }

  private rangeInclusive(start: number, end: number): number[] {
    if (end < start) return [];
    return Array.from(
      { length: end - start + 1 },
      (_value, index) => start + index,
    );
  }

  private createFriendlySparkComparisonAlias(
    field: FriendlySparkField,
    alias: string,
  ): FriendlySparkComparisonAlias {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      ...field,
      alias,
      comparisonPattern: new RegExp(
        `(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])\\s*(==|=|!=|<>|<=|>=|<|>)\\s*(\\d+)`,
        'gi',
      ),
    };
  }

  private createFriendlyFieldAliasReplacement(
    alias: string,
    field: string,
  ): FriendlyFieldAliasReplacement {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      alias,
      field,
      pattern: new RegExp(
        `(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])`,
        'gi',
      ),
    };
  }

  private createFriendlyCharacterScopeAliasReplacement(scope: {
    alias: string;
    label: string;
    fields: string[];
  }): FriendlyCharacterScopeAliasReplacement {
    const aliasPattern = this.escapeRegExp(scope.alias).replace(/\s+/g, '\\s+');
    const fieldBoundary = `(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])`;
    return {
      alias: scope.alias,
      label: scope.label,
      fields: [...scope.fields],
      comparisonPattern: new RegExp(
        `${fieldBoundary}\\s*(==|=|!=|<>)\\s*([^\\s(),][^;)]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`,
        'gi',
      ),
      inPattern: new RegExp(
        `${fieldBoundary}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      notInPattern: new RegExp(
        `${fieldBoundary}\\s+not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
    };
  }

  private createFriendlyArrayAliasReplacement(field: {
    alias: string;
    fields: string[];
    label: string;
  }): FriendlyArrayAliasReplacement {
    const fieldPattern = this.escapeRegExp(field.alias).replace(/\s+/g, '\\s+');
    const fieldBoundary = `(^|[^A-Za-z0-9_])(${fieldPattern})(?=$|[^A-Za-z0-9_])`;
    const skillClauseBoundary = this.getFriendlySkillClauseBoundaryLookahead();
    return {
      alias: field.alias,
      label: field.label,
      fields: [...field.fields],
      hasAllPattern: new RegExp(
        `${fieldBoundary}\\s+has\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      hasAnyPattern: new RegExp(
        `${fieldBoundary}\\s+has\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      doesNotHavePattern: new RegExp(
        `${fieldBoundary}\\s+does\\s+not\\s+have\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
      hasPattern: new RegExp(
        `${fieldBoundary}\\s+has\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
      containsAllPattern: new RegExp(
        `${fieldBoundary}\\s+contains\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      containsAnyPattern: new RegExp(
        `${fieldBoundary}\\s+contains\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      inPattern: new RegExp(
        `${fieldBoundary}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      notInPattern: new RegExp(
        `${fieldBoundary}\\s+not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      containsPattern: new RegExp(
        `${fieldBoundary}\\s+contains\\s+(?!all\\b|any\\b|\\()((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
    };
  }

  private getFriendlySkillClauseBoundaryLookahead(): string {
    return this.skillClauseBoundary ??= `(?=\\s+(?:and|or)\\s+(?:${this.getUqlPredicateStartPattern()})|\\)|;|$)`;
  }

  private getUqlPredicateStartPattern(): string {
    const phrases = [
      ...this.friendlyFieldAliases.flatMap((field) => [
        field.field,
        field.label,
        ...field.aliases,
      ]),
      ...this.friendlySparkFields.flatMap((field) => [
        field.label,
        ...field.aliases,
      ]),
      ...this.friendlyCharacterScopeAliasReplacements.map(
        (scope) => scope.alias,
      ),
      ...this.scopedArrayFields.map((field) => field.alias),
      'target',
      'owned legacy',
      'your legacy',
      'my legacy',
      'legacy',
      'has',
      'contains',
      'does not have',
      'in',
      'not in',
      'not',
      'contains',
      'has',
      'overlaps',
      'any',
      'has_all',
      'contains_all',
      'all',
      'support_card',
      'has_support_card',
      'spark_sum',
      'optional_white',
      'optional_main_white',
      'optional_any_white',
      'lineage_white',
    ];
    const phrasePattern = [...new Set(phrases.filter(Boolean))]
      .sort((left, right) => right.length - left.length)
      .map((phrase) => this.escapeRegExp(phrase).replace(/\s+/g, '\\s+'))
      .join('|');
    return `(?:${phrasePattern})(?=$|[^A-Za-z0-9_])|[A-Za-z_]\\w*\\s*\\(|\\(`;
  }

  private resetPattern(pattern: RegExp): RegExp {
    pattern.lastIndex = 0;
    return pattern;
  }

  private getFactorValueLookupKey(
    context: UqlValueContext | null,
    normalizedValue: string,
  ): string {
    return `${context || '*'}:${normalizedValue}`;
  }

  private buildScopedArrayFields(): Array<{
    alias: string;
    fields: string[];
    label: string;
  }> {
    return [
      {
        label: 'Main has',
        aliases: ['main', 'parent', 'main parent'],
        fields: ['main_white_factors'],
      },
      {
        label: 'GP1 has',
        aliases: [
          'gp1',
          'left',
          'left parent',
          'grandparent 1',
          'grand parent 1',
          'great parent 1',
        ],
        fields: ['left_white_factors'],
      },
      {
        label: 'GP2 has',
        aliases: [
          'gp2',
          'right',
          'right parent',
          'grandparent 2',
          'grand parent 2',
          'great parent 2',
        ],
        fields: ['right_white_factors'],
      },
      {
        label: 'Great parent has',
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
        fields: ['left_white_factors', 'right_white_factors'],
      },
    ].flatMap((scope) =>
      scope.aliases.map((alias) => ({
        alias,
        fields: scope.fields,
        label: scope.label,
      })),
    );
  }

  private buildCharacterScopeAliases(): Array<{
    alias: string;
    fields: string[];
    label: string;
  }> {
    return [
      {
        label: 'Characters',
        aliases: ['characters', 'character', 'umas', 'uma', 'charas', 'chara'],
        fields: ['main_chara_id', 'left_chara_id', 'right_chara_id'],
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
        fields: ['main_chara_id'],
      },
      {
        label: 'Main parent (p1/2)',
        aliases: ['parent character', 'parent uma', 'main parent character'],
        fields: ['main_parent_id'],
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
          'grandparent 1 character',
          'grandparent 1 characters',
          'grand parent 1 character',
          'grand parent 1 characters',
          'great parent 1 character',
          'great parent 1 characters',
          'left character',
          'left characters',
          'left uma',
          'left umas',
          'left chara',
          'left charas',
        ],
        fields: ['left_chara_id'],
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
          'grandparent 2 character',
          'grandparent 2 characters',
          'grand parent 2 character',
          'grand parent 2 characters',
          'great parent 2 character',
          'great parent 2 characters',
          'right character',
          'right characters',
          'right uma',
          'right umas',
          'right chara',
          'right charas',
        ],
        fields: ['right_chara_id'],
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
        fields: ['left_chara_id', 'right_chara_id'],
      },
    ].flatMap((scope) =>
      scope.aliases.map((alias) => ({
        alias,
        fields: scope.fields,
        label: scope.label,
      })),
    );
  }

  private compileFriendlyScopedSparkComparisons(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      const comparisonPattern =
        /(^|[^A-Za-z0-9_])([A-Za-z][^<>=!;()]*?)\s*(==|=|!=|<>|<=|>=|<|>)\s*(\d+)\b/gi;
      return segment.replace(
        comparisonPattern,
        (
          match,
          leadingText: string,
          aliasText: string,
          operator: string,
          value: string,
        ) => {
          const resolved = this.resolveScopedSparkComparisonAlias(aliasText);
          if (!resolved) return match;
          return `${leadingText}${resolved.prefix}${this.buildScopedSparkComparison(resolved.field, operator, parseInt(value, 10))}`;
        },
      );
    });
  }

  private resolveScopedSparkComparisonAlias(
    aliasText: string,
  ): { field: FriendlyScopedSparkField; prefix: string } | null {
    const match = aliasText.match(/^(\s*(?:(?:where|and|or|not)\s+)*)(.*?)\s*$/i);
    const prefix = match?.[1] ?? '';
    const alias = match?.[2] ?? aliasText.trim();
    const field = this.scopedSparkComparisonAliasLookup.get(
      this.normalizeUqlName(alias),
    );
    return field ? { field, prefix } : null;
  }

  private compileFriendlyScopedSparkCategoryComparisons(query: string): string {
    if (!this.hasFriendlySparkCategoryComparisonSyntax(query)) return query;
    const scopes = [
      {
        aliases: ['main', 'parent', 'main parent'],
        fields: ['main_blue_factors'],
        color: 'blue' as const,
      },
      {
        aliases: ['main', 'parent', 'main parent'],
        fields: ['main_pink_factors'],
        color: 'pink' as const,
      },
      {
        aliases: ['main', 'parent', 'main parent'],
        fields: ['main_green_factors'],
        color: 'green' as const,
      },
      {
        aliases: [
          'gp1',
          'left',
          'left parent',
          'grandparent 1',
          'grand parent 1',
          'great parent 1',
        ],
        fields: ['left_blue_factors'],
        color: 'blue' as const,
      },
      {
        aliases: [
          'gp1',
          'left',
          'left parent',
          'grandparent 1',
          'grand parent 1',
          'great parent 1',
        ],
        fields: ['left_pink_factors'],
        color: 'pink' as const,
      },
      {
        aliases: [
          'gp1',
          'left',
          'left parent',
          'grandparent 1',
          'grand parent 1',
          'great parent 1',
        ],
        fields: ['left_green_factors'],
        color: 'green' as const,
      },
      {
        aliases: [
          'gp2',
          'right',
          'right parent',
          'grandparent 2',
          'grand parent 2',
          'great parent 2',
        ],
        fields: ['right_blue_factors'],
        color: 'blue' as const,
      },
      {
        aliases: [
          'gp2',
          'right',
          'right parent',
          'grandparent 2',
          'grand parent 2',
          'great parent 2',
        ],
        fields: ['right_pink_factors'],
        color: 'pink' as const,
      },
      {
        aliases: [
          'gp2',
          'right',
          'right parent',
          'grandparent 2',
          'grand parent 2',
          'great parent 2',
        ],
        fields: ['right_green_factors'],
        color: 'green' as const,
      },
      {
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
        fields: ['left_blue_factors', 'right_blue_factors'],
        color: 'blue' as const,
      },
      {
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
        fields: ['left_pink_factors', 'right_pink_factors'],
        color: 'pink' as const,
      },
      {
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
        fields: ['left_green_factors', 'right_green_factors'],
        color: 'green' as const,
      },
    ];
    const colorAliases = {
      blue: ['blue spark', 'blue sparks', 'blue factor', 'blue factors'],
      pink: ['pink spark', 'pink sparks', 'pink factor', 'pink factors'],
      green: [
        'green spark',
        'green sparks',
        'green factor',
        'green factors',
        'unique skill',
        'unique skills',
      ],
    };
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      for (const scope of scopes) {
        for (const scopeAlias of scope.aliases) {
          for (const colorAlias of colorAliases[scope.color]) {
            const aliasPattern = `${this.escapeRegExp(scopeAlias).replace(/\s+/g, '\\s+')}\\s+${this.escapeRegExp(colorAlias).replace(/\s+/g, '\\s+')}`;
            const pattern = new RegExp(
              `(^|[^\\w])(${aliasPattern})\\s*(==|=|!=|<>|>=|<=|>|<)\\s*(\\d+)`,
              'gi',
            );
            compiledSegment = compiledSegment.replace(
              pattern,
              (
                _match,
                leadingText: string,
                _aliasText: string,
                operator: string,
                value: string,
              ) => {
                return `${leadingText}${this.buildScopedSparkCategoryComparison(scope.fields, scope.color, operator, parseInt(value, 10))}`;
              },
            );
          }
        }
      }
      return compiledSegment;
    });
  }

  private buildScopedSparkCategoryComparison(
    fields: string[],
    color: 'blue' | 'pink' | 'green',
    operator: string,
    value: number,
  ): string {
    const normalizedOperator =
      this.normalizeUqlComparisonOperator(operator) || operator;
    const factors =
      color === 'blue'
        ? this.blueFactors
        : color === 'pink'
          ? this.pinkFactors
          : this.greenFactors;
    const levels =
      normalizedOperator === '!='
        ? [value]
        : this.getSparkLevelsForComparison(normalizedOperator, value, 3);
    if (!levels.length) return '(1 = 0)';
    const ids = factors.flatMap((factor) =>
      levels.map((level) => this.buildSparkId(Number(factor.id), level)),
    );
    if (!ids.length) return normalizedOperator === '!=' ? '(1 = 1)' : '(1 = 0)';
    const buildClause = (field: string) =>
      normalizedOperator === '!='
        ? `${field} not in (${ids.join(', ')})`
        : `${field} in (${ids.join(', ')})`;
    if (fields.length === 1) return buildClause(fields[0]!);
    const joiner = normalizedOperator === '!=' ? ' and ' : ' or ';
    return `(${fields.map(buildClause).join(joiner)})`;
  }

  private compileFriendlySparkCategoryComparisons(query: string): string {
    if (!this.hasFriendlySparkCategoryComparisonSyntax(query)) return query;
    const colorAliases = {
      blue: ['blue spark', 'blue sparks', 'blue factor', 'blue factors'],
      pink: ['pink spark', 'pink sparks', 'pink factor', 'pink factors'],
      green: [
        'green spark',
        'green sparks',
        'green factor',
        'green factors',
        'unique skill',
        'unique skills',
      ],
    };
    const colorFields = {
      blue: 'blue_sparks',
      pink: 'pink_sparks',
      green: 'green_sparks',
    };

    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      for (const color of ['blue', 'pink', 'green'] as const) {
        for (const alias of colorAliases[color]) {
          const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
          const pattern = new RegExp(
            `(^|[^\\w])(${aliasPattern})\\s*(==|=|!=|<>|>=|<=|>|<)\\s*(\\d+)`,
            'gi',
          );
          compiledSegment = compiledSegment.replace(
            pattern,
            (
              _match,
              leadingText: string,
              _aliasText: string,
              operator: string,
              value: string,
            ) => {
              return `${leadingText}${this.buildSparkCategoryComparison(colorFields[color], color, operator, parseInt(value, 10))}`;
            },
          );
        }
      }
      return compiledSegment;
    });
  }

  private buildSparkCategoryComparison(
    fieldName: string,
    color: 'blue' | 'pink' | 'green',
    operator: string,
    value: number,
  ): string {
    const normalizedOperator =
      this.normalizeUqlComparisonOperator(operator) || operator;
    const factors =
      color === 'blue'
        ? this.blueFactors
        : color === 'pink'
          ? this.pinkFactors
          : this.greenFactors;
    const levels =
      normalizedOperator === '!='
        ? [value]
        : this.getSparkLevelsForComparison(normalizedOperator, value, 9);
    if (!levels.length) return '(1 = 0)';
    const ids = factors.flatMap((factor) =>
      levels.map((level) => this.buildSparkId(Number(factor.id), level)),
    );
    if (!ids.length) return normalizedOperator === '!=' ? '(1 = 1)' : '(1 = 0)';
    if (normalizedOperator === '!=') {
      return ids.length === 1
        ? `not contains(${fieldName}, ${ids[0]})`
        : `not overlaps(${fieldName}, (${ids.join(', ')}))`;
    }
    return ids.length === 1
      ? `contains(${fieldName}, ${ids[0]})`
      : `overlaps(${fieldName}, (${ids.join(', ')}))`;
  }

  private hasFriendlySparkCategoryComparisonSyntax(query: string): boolean {
    return /\b(?:blue|pink|green|unique)\s+(?:spark|sparks|factor|factors|skill|skills)\s*(?:==|=|!=|<>|>=|<=|>|<)\s*\d+\b/i.test(
      query,
    );
  }

  private compileFriendlySparkComparisons(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      const normalized = segment.toLowerCase().replace(/\s+/g, ' ');
      this.friendlySparkComparisonAliases.forEach((field) => {
        if (!normalized.includes(field.alias.toLowerCase().replace(/\s+/g, ' '))) return;
        compiledSegment = compiledSegment.replace(
          this.resetPattern(field.comparisonPattern),
          (
            _match,
            leadingText: string,
            _aliasText: string,
            operator: string,
            value: string,
          ) => {
            return `${leadingText}${this.buildSparkComparison(field, operator, parseInt(value, 10))}`;
          },
        );
      });
      return compiledSegment;
    });
  }

  private compileFriendlyFieldAliases(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      const normalized = segment.toLowerCase().replace(/\s+/g, ' ');
      this.friendlyFieldAliasReplacements.forEach((aliasGroup) => {
        if (!normalized.includes(aliasGroup.alias.toLowerCase().replace(/\s+/g, ' '))) return;
        compiledSegment = compiledSegment.replace(
          this.resetPattern(aliasGroup.pattern),
          (_match, leadingText: string) => `${leadingText}${aliasGroup.field}`,
        );
      });
      return compiledSegment;
    });
  }

  private compileFriendlyScoringFunctionNames(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      const applyFieldSyntax = (
        fieldPattern: string,
        functionName: string,
      ): void => {
        compiledSegment = compiledSegment.replace(
          new RegExp(
            `\\b${fieldPattern}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
            'gi',
          ),
          `${functionName}($1)`,
        );
        compiledSegment = compiledSegment.replace(
          new RegExp(
            `\\b${fieldPattern}\\s*(?:==|=)\\s*((?:[^;()]|\\([^)]*\\))+?)(?=\\s+(?:and|or)\\b|\\)|;|$)`,
            'gi',
          ),
          (_match, rawValue: string) => `${functionName}(${rawValue.trim()})`,
        );
      };

      applyFieldSyntax('optional\\s+main\\s+white', 'optional_main_white');
      applyFieldSyntax('optional\\s+any\\s+white', 'optional_any_white');
      applyFieldSyntax('optional\\s+white', 'optional_white');
      applyFieldSyntax('lineage\\s+white', 'lineage_white');

      return compiledSegment
        .replace(/\boptional\s+main\s+white\s*\(/gi, 'optional_main_white(')
        .replace(/\boptional\s+any\s+white\s*\(/gi, 'optional_any_white(')
        .replace(/\boptional\s+white\s*\(/gi, 'optional_white(')
        .replace(/\blineage\s+white\s*\(/gi, 'lineage_white(');
    });
  }

  private compileFriendlyCharacterScopeExpressions(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      const normalized = segment.toLowerCase().replace(/\s+/g, ' ');
      this.friendlyCharacterScopeAliasReplacements.forEach((scope) => {
        if (!normalized.includes(scope.alias.toLowerCase().replace(/\s+/g, ' '))) return;
        compiledSegment = compiledSegment.replace(
          this.resetPattern(scope.notInPattern),
          (
            _match,
            leadingText: string,
            _aliasText: string,
            listText: string,
          ) => {
            return `${leadingText}${this.buildCharacterScopeListClause(scope.fields, listText, true)}`;
          },
        );
        compiledSegment = compiledSegment.replace(
          this.resetPattern(scope.inPattern),
          (
            _match,
            leadingText: string,
            _aliasText: string,
            listText: string,
          ) => {
            return `${leadingText}${this.buildCharacterScopeListClause(scope.fields, listText, false)}`;
          },
        );
        compiledSegment = compiledSegment.replace(
          this.resetPattern(scope.comparisonPattern),
          (
            _match,
            leadingText: string,
            _aliasText: string,
            operator: string,
            rawValue: string,
          ) => {
            return `${leadingText}${this.buildCharacterScopeComparisonClause(scope.fields, operator, rawValue)}`;
          },
        );
      });
      return compiledSegment;
    });
  }

  private compileFriendlyOccurrenceComparisons(query: string): string {
    if (!/\d\s*[x×]/i.test(query)) return query;
    return replaceOutsideUqlStrings(query, segment => this.compileFriendlyFunctionValues(segment).replace(
      /(^|[\s(,])([A-Za-z][^<>=!;()]*?)\s*(==|=|!=|<>|<=|>=|<|>)\s*(\d+)\s*[x×](?![\w.])/gi,
      (match, leading: string, alias: string, operator: string, count: string) => {
        const scoped = this.resolveScopedSparkComparisonAlias(alias);
        const parts = alias.match(/^(\s*(?:(?:where|and|or|not)\s+)*)(.*?)\s*$/i);
        const factor = this.resolveFactorUqlValue(parts?.[2] ?? alias) as UqlNamedFactor | null;
        if (!scoped && !factor) return match;
        return leading + (scoped?.prefix ?? parts?.[1] ?? '') + occurrenceComparison(scoped?.field.factorId ?? factor!.factorId, scoped?.field.fields.map(field => field.field) ?? [factor!.field], operator, Number(count));
      }
    ));
  }

  private compileFriendlyLoadedFactorComparisons(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      const comparisonPattern =
        /(^|[\s(,])([A-Za-z][^<>=!;()]*?)\s*(==|=|!=|<>|<=|>=|<|>)\s*(\d+)\b/gi;
      return segment.replace(
        comparisonPattern,
        (
          match,
          leadingText: string,
          aliasText: string,
          operator: string,
          value: string,
        ) => {
          const parts = aliasText.match(/^(\s*(?:(?:where|and|or|not)\s+)*)(.*?)\s*$/i);
          const factor = this.resolveFactorUqlValue(
            parts?.[2] ?? aliasText,
          ) as UqlNamedFactor | null;
          if (!factor) return match;
          return `${leadingText}${parts?.[1] ?? ''}${this.buildSparkComparison(factor, operator, parseInt(value, 10))}`;
        },
      );
    });
  }

  private compileFriendlyScalarArithmeticFactorAliases(query: string): string {
    if (!this.hasUqlArithmeticFactorAliasSyntax(query)) return query;
    const factors = this.getScopedUqlNamedFactors()
      .flatMap((factor) =>
        [factor.label, ...factor.aliases]
          .filter(Boolean)
          .map((alias) => ({ alias, factor })),
      )
      .sort((left, right) => right.alias.length - left.alias.length);

    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = segment;
      for (const { alias, factor } of factors) {
        const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
        const pattern = new RegExp(
          `(^|[^A-Za-z0-9_])(${aliasPattern})(?=[^A-Za-z0-9_]|$)`,
          'gi',
        );
        compiledSegment = compiledSegment.replace(
          pattern,
          (
            match: string,
            leadingText: string,
            _aliasText: string,
            offset: number,
          ) => {
            const aliasStart = offset + leadingText.length;
            const aliasEnd = offset + match.length;
            if (
              !this.isUqlArithmeticScalarAliasContext(
                compiledSegment,
                aliasStart,
                aliasEnd,
              )
            ) {
              return match;
            }
            return `${leadingText}spark_sum(${this.getGlobalSkillFieldForContext(factor.valueContext)}, ${factor.factorId})`;
          },
        );
      }
      return compiledSegment;
    });
  }

  private hasUqlArithmeticFactorAliasSyntax(query: string): boolean {
    if (!/[*/%]|\bmod\b/i.test(query)) return false;
    const normalizedQuery = this.normalizeUqlName(query);
    return this.getScopedUqlNamedFactors().some((factor) =>
      [factor.label, ...factor.aliases]
        .filter(Boolean)
        .some((alias) =>
          this.containsNormalizedUqlPhrase(normalizedQuery, alias),
        ),
    );
  }

  private containsNormalizedUqlPhrase(
    normalizedText: string,
    phrase: string,
  ): boolean {
    const normalizedPhrase = this.normalizeUqlName(phrase);
    if (!normalizedPhrase) return false;
    return (
      normalizedText === normalizedPhrase ||
      normalizedText.startsWith(`${normalizedPhrase} `) ||
      normalizedText.endsWith(` ${normalizedPhrase}`) ||
      normalizedText.includes(` ${normalizedPhrase} `)
    );
  }

  private isUqlArithmeticScalarAliasContext(
    segment: string,
    aliasStart: number,
    aliasEnd: number,
  ): boolean {
    const leftBoundary = this.findUqlScalarAliasWindowBoundary(
      segment,
      aliasStart,
      -1,
    );
    const rightBoundary = this.findUqlScalarAliasWindowBoundary(
      segment,
      aliasEnd,
      1,
    );
    const window = segment.slice(leftBoundary, rightBoundary);
    return /[+*/%]|\bmod\b/i.test(window);
  }

  private findUqlScalarAliasWindowBoundary(
    segment: string,
    start: number,
    direction: -1 | 1,
  ): number {
    if (direction < 0) {
      for (let index = start - 1; index >= 0; index--) {
        if (this.isUqlScalarAliasBoundaryAt(segment, index, direction))
          return index + 1;
      }
      return 0;
    }
    for (let index = start; index < segment.length; index++) {
      if (this.isUqlScalarAliasBoundaryAt(segment, index, direction))
        return index;
    }
    return segment.length;
  }

  private isUqlScalarAliasBoundaryAt(
    segment: string,
    index: number,
    direction: -1 | 1,
  ): boolean {
    const char = segment.charAt(index);
    if (char === ',' || char === ';') return true;
    if (/[<>=!]/.test(char)) return true;
    const remaining =
      direction < 0 ? segment.slice(0, index + 1) : segment.slice(index);
    return direction < 0
      ? /\b(?:where|and|or|not)\s*$/i.test(remaining)
      : /^\s*\b(?:and|or)\b/i.test(remaining);
  }

  private compileFriendlyFactorSumComparisons(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      const operatorPattern = '(==|=|!=|<>|>=|<=|>|<)';
      const compileExpression = (expression: string): string | null => {
        const terms = expression
          .split('+')
          .map((term) => term.trim())
          .filter(Boolean);
        if (terms.length < 2) return null;
        let compiledFactorCount = 0;
        const compiledTerms = terms.map((term) => {
          const factor = this.resolveFactorUqlValue(
            term,
          ) as UqlNamedFactor | null;
          if (!factor) {
            return /^-?\d+(?:\.\d+)?$/.test(term) ||
              /^[A-Za-z_]\w*\s*\(/.test(term)
              ? term
              : null;
          }
          compiledFactorCount++;
          return `spark_sum(${this.getGlobalSkillFieldForContext(factor.valueContext)}, ${factor.factorId})`;
        });
        if (compiledFactorCount === 0 || compiledTerms.some((term) => !term))
          return null;
        return compiledTerms.join(' + ');
      };

      let compiledSegment = segment.replace(
        new RegExp(
          `\\(([^()]*\\+[^()]*)\\)\\s*${operatorPattern}\\s*(\\d+)`,
          'gi',
        ),
        (match, expression: string, operator: string, value: string) => {
          const compiledExpression = compileExpression(expression);
          return compiledExpression
            ? `(${compiledExpression}) ${this.normalizeUqlComparisonOperator(operator)} ${value}`
            : match;
        },
      );

      compiledSegment = compiledSegment.replace(
        new RegExp(
          `(^|\\b(?:where|and|or)\\s+)([^;()]*\\+[^;()]*?)\\s*${operatorPattern}\\s*(\\d+)`,
          'gi',
        ),
        (
          match,
          leadingText: string,
          expression: string,
          operator: string,
          value: string,
        ) => {
          const compiledExpression = compileExpression(expression);
          return compiledExpression
            ? `${leadingText}${compiledExpression} ${this.normalizeUqlComparisonOperator(operator)} ${value}`
            : match;
        },
      );

      return compiledSegment;
    });
  }

  private compileFriendlyArrayOperators(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      if (!this.hasFriendlyArrayOperatorKeyword(segment)) return segment;
      const hasBareSyntax =
        this.hasBareFriendlySkillArrayOperatorSyntax(segment);
      const arrayFields =
        this.getFriendlyArrayAliasReplacementsForSegment(segment);
      if (!hasBareSyntax && !arrayFields.length) return segment;
      let compiledSegment = hasBareSyntax
        ? this.compileBareFriendlySkillArrayOperators(segment)
        : segment;
      arrayFields.forEach((arrayField) => {
        if (/\bhas\s+all\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.hasAllPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'all',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'all',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `has_all(${field}, (${listText}))`, 'or')}`;
            },
          );
        }

        if (/\bhas\s+any\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.hasAnyPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'any',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'any',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `overlaps(${field}, (${listText}))`, 'or')}`;
            },
          );
        }

        if (/\bdoes\s+not\s+have\b/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.doesNotHavePattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              rawValue: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'not',
                rawValue,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'not',
                rawValue,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `not contains(${field}, ${rawValue.trim()})`, 'and')}`;
            },
          );
        }

        if (/\bhas\b/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.hasPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              rawValue: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'one',
                rawValue,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'one',
                rawValue,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `contains(${field}, ${rawValue.trim()})`, 'or')}`;
            },
          );
        }

        if (/\bcontains\s+all\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.containsAllPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'all',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'all',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `has_all(${field}, (${listText}))`, 'or')}`;
            },
          );
        }

        if (/\bcontains\s+any\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.containsAnyPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'any',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'any',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `overlaps(${field}, (${listText}))`, 'or')}`;
            },
          );
        }

        if (/\bnot\s+in\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.notInPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'not',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'not',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `not overlaps(${field}, (${listText}))`, 'and')}`;
            },
          );
        }

        if (/\bin\s*\(/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.inPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              listText: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'any',
                listText,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'any',
                listText,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `overlaps(${field}, (${listText}))`, 'or')}`;
            },
          );
        }

        if (/\bcontains\b(?!\s+(?:all|any)\s*\()/i.test(compiledSegment)) {
          compiledSegment = compiledSegment.replace(
            this.resetPattern(arrayField.containsPattern),
            (
              _match,
              leadingText: string,
              _aliasText: string,
              rawValue: string,
            ) => {
              const raceSaddleClause = this.buildRaceSaddleArrayClause(
                arrayField.fields,
                'one',
                rawValue,
              );
              if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
              const scopedClause = this.buildContextAwareScopedSkillClause(
                arrayField,
                'one',
                rawValue,
              );
              if (scopedClause) return `${leadingText}${scopedClause}`;
              return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, (field) => `contains(${field}, ${rawValue.trim()})`, 'or')}`;
            },
          );
        }
      });

      return compiledSegment;
    });
  }

  private hasFriendlyArrayOperatorKeyword(segment: string): boolean {
    return /(?:^|[^A-Za-z0-9_])(?:does\s+not\s+have|has_all|contains_all|overlaps|not\s+in|has|contains|all|any|in)(?=$|[^A-Za-z0-9_])/i.test(
      segment,
    );
  }

  private hasBareFriendlySkillArrayOperatorSyntax(segment: string): boolean {
    return /(^|\b(?:where|and|or)\s+|\()\s*(?:has\s+(?:all|any)\s*\(|has\b|does\s+not\s+have\b|contains\s+(?:all|any)\s*\(|contains\b|not\s+in\s*\(|in\s*\()/i.test(
      segment,
    );
  }

  private getFriendlyArrayAliasReplacementsForSegment(
    segment: string,
  ): FriendlyArrayAliasReplacement[] {
    return this.friendlyArrayAliases.filter((arrayField) =>
      this.hasFriendlyArrayAliasOperatorSyntax(segment, arrayField.alias),
    ).map((field) => {
      let replacement = this.friendlyArrayAliasReplacements.get(field);
      if (!replacement) {
        replacement = this.createFriendlyArrayAliasReplacement(field);
        this.friendlyArrayAliasReplacements.set(field, replacement);
      }
      return replacement;
    });
  }

  private hasFriendlyArrayAliasOperatorSyntax(
    segment: string,
    alias: string,
  ): boolean {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return new RegExp(
      `(^|[^A-Za-z0-9_])${aliasPattern}(?=$|[^A-Za-z0-9_])\\s+(?:does\\s+not\\s+have|has\\s+(?:all|any)|has|contains\\s+(?:all|any)|contains|not\\s+in|in)\\b`,
      'i',
    ).test(segment);
  }

  private buildRaceSaddleArrayClause(
    fields: string[],
    mode: 'one' | 'any' | 'all' | 'not',
    listText: string,
  ): string | null {
    const targetFields = [
      ...new Set(
        fields.flatMap((field) => this.getRaceSaddleTargetFields(field)),
      ),
    ];
    if (!targetFields.length) return null;
    const resolvedItems = this.resolveRaceSaddleListItems(listText);
    if (
      !resolvedItems.length ||
      resolvedItems.some((item) => item.saddleIds.length === 0)
    )
      return null;
    const effectiveMode =
      mode === 'one' && resolvedItems.length > 1 ? 'all' : mode;
    const buildAnyClause = (fieldName: string, saddleIds: number[]): string => {
      const ids = [...new Set(saddleIds)].sort((left, right) => left - right);
      return ids.length === 1
        ? `contains(${fieldName}, ${ids[0]})`
        : `overlaps(${fieldName}, (${ids.join(', ')}))`;
    };

    if (effectiveMode === 'all') {
      const clauses = resolvedItems.map((item) =>
        this.buildScopedArrayClause(
          targetFields,
          (field) => buildAnyClause(field, item.saddleIds),
          'or',
        ),
      );
      return clauses.length === 1 ? clauses[0]! : `(${clauses.join(' and ')})`;
    }

    const allSaddleIds = [
      ...new Set(resolvedItems.flatMap((item) => item.saddleIds)),
    ].sort((left, right) => left - right);
    if (!allSaddleIds.length) return null;
    if (effectiveMode === 'not') {
      return this.buildScopedArrayClause(
        targetFields,
        (field) => `not ${buildAnyClause(field, allSaddleIds)}`,
        'and',
      );
    }
    return this.buildScopedArrayClause(
      targetFields,
      (field) => buildAnyClause(field, allSaddleIds),
      'or',
    );
  }

  private getRaceSaddleTargetFields(fieldText: string): string[] {
    const normalized = fieldText
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(?:not|where)\s+/, '');
    if (
      normalized === 'race results' ||
      normalized === 'race wins' ||
      normalized === 'win saddles'
    )
      return ['main_win_saddles'];
    if (
      normalized === 'main race wins' ||
      normalized === 'main race results' ||
      normalized === 'main win saddles'
    )
      return ['main_win_saddles'];
    if (
      normalized === 'left race wins' ||
      normalized === 'left race results' ||
      normalized === 'left win saddles'
    )
      return ['left_win_saddles'];
    if (
      normalized === 'right race wins' ||
      normalized === 'right race results' ||
      normalized === 'right win saddles'
    )
      return ['right_win_saddles'];
    return [];
  }

  private buildContextAwareScopedSkillClause(
    arrayField: FriendlyArrayAliasReplacement,
    mode: 'one' | 'any' | 'all' | 'not',
    listText: string,
  ): string | null {
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some((item) => !item.factor)) return null;
    const clauses = resolved.flatMap((item) =>
      this.buildScopedSkillPresenceClauses(
        arrayField.fields,
        item,
        mode === 'not',
      ),
    );
    if (!clauses.length) return null;
    const strictList =
      mode === 'all' ||
      mode === 'not' ||
      (mode === 'one' && resolved.length > 1);
    const joiner = strictList ? ' and ' : ' or ';
    return clauses.length === 1 ? clauses[0]! : `(${clauses.join(joiner)})`;
  }

  private buildScopedSkillPresenceClauses(
    templateFields: string[],
    item: UqlSkillListItem,
    negated: boolean,
  ): string[] {
    const factor = item.factor;
    if (!factor) return [];
    if (item.occurrences) {
      const fields = templateFields.flatMap(field => this.getContextualSkillFields(field, factor.valueContext));
      const clause = occurrenceComparison(factor.factorId, fields, item.operator!, item.level!);
      return [negated ? 'not (' + clause + ')' : clause];
    }
    return templateFields.flatMap((templateField) => {
      const targetFields = this.getContextualSkillFields(
        templateField,
        factor.valueContext,
      );
      return targetFields.map((fieldName) =>
        this.buildSkillPresenceClause(fieldName, item, negated),
      );
    });
  }

  private getContextualSkillFields(
    templateField: string,
    context: UqlFactorValueContext,
  ): string[] {
    const scope = templateField.toLowerCase().replace(/[_\s-]+/g, '_');
    const contextField = (prefix: string): string => {
      switch (context) {
        case 'blue-factor':
          return `${prefix}_blue_factors`;
        case 'pink-factor':
          return `${prefix}_pink_factors`;
        case 'green-factor':
          return `${prefix}_green_factors`;
        case 'white-factor':
          return `${prefix}_white_factors`;
      }
    };
    if (
      scope === 'main_white_factors' ||
      scope === 'main_white_sparks' ||
      scope === 'main_parent_white_sparks'
    )
      return [contextField('main')];
    if (scope === 'left_white_factors' || scope === 'left_white_sparks')
      return [contextField('left')];
    if (scope === 'right_white_factors' || scope === 'right_white_sparks')
      return [contextField('right')];
    if (scope === 'white_sparks' && context === 'white-factor')
      return ['white_sparks'];
    if (scope === 'blue_sparks' && context === 'blue-factor')
      return ['blue_sparks'];
    if (scope === 'pink_sparks' && context === 'pink-factor')
      return ['pink_sparks'];
    if (scope === 'green_sparks' && context === 'green-factor')
      return ['green_sparks'];
    return [];
  }

  private buildSkillPresenceClause(
    fieldName: string,
    item: UqlSkillListItem,
    negated: boolean,
  ): string {
    const factor = item.factor!;
    if (item.occurrences) {
      const clause = occurrenceComparison(factor.factorId, [fieldName], item.operator!, item.level!);
      return negated ? 'not (' + clause + ')' : clause;
    }
    const normalizedOperator = item.operator
      ? this.normalizeUqlComparisonOperator(item.operator)
      : undefined;
    if (normalizedOperator === '!=' && item.level !== undefined) {
      const sparkId = this.buildSparkId(factor.factorId, item.level);
      const normalizedField = fieldName
        .toLowerCase()
        .replace(/[_\s-]+/g, '_')
        .trim();
      const arrayField =
        normalizedField.endsWith('_sparks') ||
        normalizedField.endsWith('_white_factors');
      const exactClause = arrayField
        ? `contains(${fieldName}, ${sparkId})`
        : `${fieldName} = ${sparkId}`;
      return negated
        ? exactClause
        : arrayField
          ? `not ${exactClause}`
          : `${fieldName} != ${sparkId}`;
    }
    const ids = this.getSparkIdsForFactorField(
      factor,
      fieldName,
      item.operator,
      item.level,
    );
    if (!ids.length) return negated ? '(1 = 1)' : '(1 = 0)';
    const normalizedField = fieldName
      .toLowerCase()
      .replace(/[_\s-]+/g, '_')
      .trim();
    const arrayField =
      normalizedField.endsWith('_sparks') ||
      normalizedField.endsWith('_white_factors');
    if (arrayField) {
      const clause =
        ids.length === 1
          ? `contains(${fieldName}, ${ids[0]})`
          : `overlaps(${fieldName}, (${ids.join(', ')}))`;
      return negated ? `not ${clause}` : clause;
    }
    if (ids.length === 1)
      return `${fieldName} ${negated ? '!=' : '='} ${ids[0]}`;
    return `${fieldName} ${negated ? 'not in' : 'in'} (${ids.join(', ')})`;
  }

  private resolveAnyFactorListItems(listText: string): UqlSkillListItem[] {
    return this.parseUqlAnyFactorListItems(listText).map((item) => ({
      ...item,
      factor: this.resolveFactorUqlValue(item.value) as UqlNamedFactor | null,
    }));
  }

  private compileBareFriendlySkillArrayOperators(segment: string): string {
    let compiledSegment = segment;
    const leadingBoundary = '(^|\\b(?:where|and|or)\\s+|\\()';
    const skillClauseBoundary = this.getFriendlySkillClauseBoundaryLookahead();
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*has\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (_match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'all',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}has_all(white_sparks, (${listText}))`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*has\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (_match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'any',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}overlaps(white_sparks, (${listText}))`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*does\\s+not\\s+have\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
      (_match, leadingText: string, rawValue: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'not',
          rawValue,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}not contains(white_sparks, ${rawValue.trim()})`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*has\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
      (_match, leadingText: string, rawValue: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'one',
          rawValue,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}contains(white_sparks, ${rawValue.trim()})`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*contains\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (_match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'all',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}has_all(white_sparks, (${listText}))`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*contains\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (_match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'any',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return `${leadingText}overlaps(white_sparks, (${listText}))`;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'not',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return match;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
        'gi',
      ),
      (match, leadingText: string, listText: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'any',
          listText,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return match;
      },
    );
    compiledSegment = compiledSegment.replace(
      new RegExp(
        `${leadingBoundary}\\s*contains\\s+(?!all\\b|any\\b|\\()((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`,
        'gi',
      ),
      (match, leadingText: string, rawValue: string) => {
        const contextAwareClause = this.buildBareContextAwareSkillClause(
          'one',
          rawValue,
        );
        if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
        return match;
      },
    );
    return compiledSegment;
  }

  private buildBareContextAwareSkillClause(
    mode: 'one' | 'any' | 'all' | 'not',
    listText: string,
  ): string | null {
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some((item) => !item.factor)) return null;
    const clauses = resolved.map((item) =>
      this.buildSkillPresenceClause(
        this.getGlobalSkillFieldForContext(item.factor!.valueContext),
        item,
        mode === 'not',
      ),
    );
    const strictList =
      mode === 'all' ||
      mode === 'not' ||
      (mode === 'one' && resolved.length > 1);
    const joiner = strictList ? ' and ' : ' or ';
    return clauses.length === 1 ? clauses[0]! : `(${clauses.join(joiner)})`;
  }

  private getGlobalSkillFieldForContext(
    context: UqlFactorValueContext,
  ): string {
    switch (context) {
      case 'blue-factor':
        return 'blue_sparks';
      case 'pink-factor':
        return 'pink_sparks';
      case 'green-factor':
        return 'green_sparks';
      case 'white-factor':
        return 'white_sparks';
    }
  }

  private compileFriendlyNamedValues(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment = this.compileFriendlyComparisonValues(segment);
      compiledSegment = this.compileFriendlyFunctionValues(compiledSegment);
      return compiledSegment;
    });
  }

  private compileFriendlyComparisonValues(segment: string): string {
    const characterFieldPattern = this.getUqlFieldPattern('character');
    let compiledSegment = this.replaceComparisonValue(
      segment,
      characterFieldPattern,
      (value, fieldText) => this.resolveCharacterUqlValue(value, fieldText),
    );
    compiledSegment = this.replaceInListValues(
      compiledSegment,
      characterFieldPattern,
      (value, fieldText) => this.resolveCharacterUqlValue(value, fieldText),
    );
    const scenarioFieldPattern =
      '(?:scenario_id|scenario\\s+id|training\\s+scenario|scenario)';
    compiledSegment = this.replaceComparisonValue(
      compiledSegment,
      scenarioFieldPattern,
      (value) => this.resolveScenarioUqlValue(value),
    );
    compiledSegment = this.replaceInListValues(
      compiledSegment,
      scenarioFieldPattern,
      (value) => this.resolveScenarioUqlValue(value),
    );
    return compiledSegment;
  }

  private resolveScenarioUqlValue(rawValue: string): string | null {
    const value = rawValue.trim().replace(/^['"]|['"]$/g, '');
    if (/^\d+$/.test(value)) return value;
    const normalizedValue = this.normalizeUqlName(value);
    return (
      this.scenarioOptionIds
        .find(
          (id) =>
            this.normalizeUqlName(this.getScenarioName(id)) === normalizedValue,
        )
        ?.toString() ?? null
    );
  }

  private compileFriendlySupportCardExpressions(query: string): string {
    return replaceOutsideUqlStrings(query, (segment) => {
      let compiledSegment =
        this.compileFriendlySupportCardFunctionValues(segment);
      compiledSegment =
        this.compileFriendlySupportCardFieldValues(compiledSegment);
      compiledSegment =
        this.combineSupportCardLimitBreakClauses(compiledSegment);
      compiledSegment =
        this.compileStandaloneSupportCardLimitBreak(compiledSegment);
      return compiledSegment;
    });
  }

  private compileFriendlySupportCardFunctionValues(segment: string): string {
    const functionPattern =
      /\b(support_card|has_support_card)\s*\(((?:[^()]|\([^)]*\))*)\)/gi;
    return segment.replace(
      functionPattern,
      (match, functionName: string, argsText: string) => {
        const normalizedArgs = this.normalizeSupportCardFunctionArgs(argsText);
        return normalizedArgs
          ? `${functionName}(${normalizedArgs.join(', ')})`
          : match;
      },
    );
  }

  private normalizeSupportCardFunctionArgs(argsText: string): string[] | null {
    const args = this.splitUqlDelimitedValues(argsText);
    if (!args.length) return null;
    let changed = false;
    const normalizedArgs = args.map((arg, index) => {
      const idMatch = arg.match(
        /^(?:(?:id|card_id|support_card_id)\s*=\s*)?(.+)$/i,
      );
      if (index === 0 && idMatch) {
        const resolvedId = this.resolveSupportCardUqlValue(idMatch[1]!);
        if (resolvedId) {
          changed = resolvedId !== arg;
          return resolvedId;
        }
      }
      const normalizedLimitBreak = this.normalizeSupportCardLimitBreakArg(arg);
      if (normalizedLimitBreak) {
        changed = changed || normalizedLimitBreak !== arg;
        return normalizedLimitBreak;
      }
      return arg;
    });
    return changed ? normalizedArgs : null;
  }

  private compileFriendlySupportCardFieldValues(segment: string): string {
    const supportCardFieldPattern = this.getUqlFieldPattern('support-card');
    let compiledSegment = this.replaceSupportCardComparisonValues(
      segment,
      supportCardFieldPattern,
    );
    compiledSegment = this.replaceSupportCardInListValues(
      compiledSegment,
      supportCardFieldPattern,
    );
    return compiledSegment;
  }

  private replaceSupportCardComparisonValues(
    segment: string,
    fieldPattern: string,
  ): string {
    const comparisonPattern = new RegExp(
      `(${fieldPattern})\\s*(==|=|!=|<>)\\s*((?:[^(),;)]|\\([^)]*\\))+?)(?=\\s+(?:and|or)\\b|\\)|;|$)`,
      'gi',
    );
    return segment.replace(
      comparisonPattern,
      (match, _fieldText: string, operator: string, rawValue: string) => {
        const resolvedId = this.resolveSupportCardUqlValue(rawValue);
        if (!resolvedId) return match;
        const normalizedOperator =
          this.normalizeUqlComparisonOperator(operator);
        return normalizedOperator === '!='
          ? `not support_card(${resolvedId})`
          : `support_card(${resolvedId})`;
      },
    );
  }

  private replaceSupportCardInListValues(
    segment: string,
    fieldPattern: string,
  ): string {
    const inListPattern = new RegExp(
      `(${fieldPattern})\\s+(not\\s+)?in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`,
      'gi',
    );
    return segment.replace(
      inListPattern,
      (
        match,
        _fieldText: string,
        notText: string | undefined,
        listText: string,
      ) => {
        const resolvedIds = this.splitUqlSupportCardListValues(listText).map(
          (value) => this.resolveSupportCardUqlValue(value),
        );
        if (!resolvedIds.length || resolvedIds.some((id) => !id)) return match;
        const negated = !!notText;
        const clauses = resolvedIds.map(
          (id) => `${negated ? 'not ' : ''}support_card(${id})`,
        );
        return clauses.length === 1
          ? clauses[0]!
          : `(${clauses.join(negated ? ' and ' : ' or ')})`;
      },
    );
  }

  private splitUqlSupportCardListValues(listText: string): string[] {
    const namedValues = this.catalog.supports
      .flatMap((card) => [card.name, card.id])
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private combineSupportCardLimitBreakClauses(segment: string): string {
    const lbPattern =
      '(?:lb|limitbreak|limit[_\\s-]?break|limit[_\\s-]?break[_\\s-]?count)';
    const operatorPattern = '(?:>=|<=|!=|<>|==|=|>|<)';
    const supportThenLb = new RegExp(
      `support_card\\((\\d+)\\)\\s+and\\s+${lbPattern}\\s*(${operatorPattern})\\s*(\\d+)`,
      'gi',
    );
    let compiledSegment = segment.replace(
      supportThenLb,
      (_match, supportCardId: string, operator: string, value: string) => {
        return `support_card(${supportCardId}, lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
      },
    );
    const lbThenSupport = new RegExp(
      `${lbPattern}\\s*(${operatorPattern})\\s*(\\d+)\\s+and\\s+support_card\\((\\d+)\\)`,
      'gi',
    );
    compiledSegment = compiledSegment.replace(
      lbThenSupport,
      (_match, operator: string, value: string, supportCardId: string) => {
        return `support_card(${supportCardId}, lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
      },
    );
    return compiledSegment;
  }

  private compileStandaloneSupportCardLimitBreak(segment: string): string {
    const lbPattern =
      /\b(?:lb|limitbreak|limit[_\s-]?break|limit[_\s-]?break[_\s-]?count)\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+)\b/gi;
    return segment.replace(
      lbPattern,
      (
        match,
        operator: string,
        value: string,
        offset: number,
        fullText: string,
      ) => {
        if (this.isInsideSupportCardFunction(fullText, offset)) return match;
        return `support_card(lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
      },
    );
  }

  private isInsideSupportCardFunction(text: string, index: number): boolean {
    const prefix = text.slice(0, index);
    const openIndex = prefix.lastIndexOf('support_card(');
    if (openIndex < 0) return false;
    const closeIndex = text.indexOf(')', openIndex);
    return closeIndex >= index;
  }

  private normalizeSupportCardLimitBreakArg(arg: string): string | null {
    const match = arg.match(
      /^(?:lb|limitbreak|limit[_\s-]?break|limit[_\s-]?break[_\s-]?count)\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+)$/i,
    );
    if (!match) return null;
    return `lb ${this.normalizeUqlComparisonOperator(match[1]!)} ${match[2]}`;
  }

  private normalizeCompiledSupportCardAliases(query: string): string {
    return query.replace(
      /\b(support_card|has_support_card)\s*\(((?:[^()]|\([^)]*\))*)\)/gi,
      (match, functionName: string, argsText: string) => {
        const normalizedArgs = this.splitUqlDelimitedValues(argsText)
          .map(
            (arg) =>
              this.normalizeSupportCardLimitBreakArg(arg.trim()) || arg.trim(),
          )
          .filter(Boolean);
        return normalizedArgs.length
          ? `${functionName}(${normalizedArgs.join(', ')})`
          : match;
      },
    );
  }

  private compileFriendlyFunctionValues(segment: string): string {
    const singleValuePattern =
      /\b(contains|has|any)\s*\(\s*([^,()]+?)\s*,\s*((?:[^()]|\([^)]*\))*?)\s*\)/gi;
    let compiledSegment = segment.replace(
      singleValuePattern,
      (match, functionName: string, fieldText: string, rawValue: string) => {
        const factorClause = this.buildFriendlyFactorSingleFunctionClause(
          functionName,
          fieldText,
          rawValue,
        );
        if (factorClause) return factorClause;
        const raceSaddleClause = this.buildFriendlyRaceSaddleFunctionClause(
          functionName,
          fieldText,
          rawValue,
        );
        if (raceSaddleClause) return raceSaddleClause;
        const resolvedValue = this.resolveNamedUqlValueForField(
          fieldText,
          rawValue,
        );
        return resolvedValue
          ? `${functionName}(${fieldText}, ${resolvedValue})`
          : match;
      },
    );

    const listValuePattern =
      /\b(overlaps|has_all|contains_all|all)\s*\(\s*([^,()]+?)\s*,\s*\(((?:[^()]|\([^)]*\))*)\)\s*\)/gi;
    compiledSegment = compiledSegment.replace(
      listValuePattern,
      (match, functionName: string, fieldText: string, listText: string) => {
        const factorClause = this.buildFriendlyFactorListFunctionClause(
          functionName,
          fieldText,
          listText,
        );
        if (factorClause) return factorClause;
        const raceSaddleClause = this.buildFriendlyRaceSaddleFunctionClause(
          functionName,
          fieldText,
          listText,
        );
        if (raceSaddleClause) return raceSaddleClause;
        const resolvedList = this.replaceNamedListValues(listText, (value) =>
          this.resolveNamedUqlValueForField(fieldText, value),
        );
        return resolvedList !== listText
          ? `${functionName}(${fieldText}, (${resolvedList}))`
          : match;
      },
    );

    return this.compileFriendlyWhiteScoringFunctionValues(compiledSegment);
  }

  private compileFriendlyWhiteScoringFunctionValues(segment: string): string {
    const scoringFunctionPattern =
      /\b(optional_white|optional_main_white|optional_any_white|lineage_white)\s*\(((?:[^()]|\([^)]*\))*)\)/gi;
    return segment.replace(
      scoringFunctionPattern,
      (match, functionName: string, argsText: string) => {
        return (
          this.buildFriendlyWhiteScoringFunctionClause(
            functionName,
            argsText,
          ) || match
        );
      },
    );
  }

  private buildFriendlyWhiteScoringFunctionClause(
    functionName: string,
    argsText: string,
  ): string | null {
    const parsed = this.splitWhiteScoringFunctionArgs(argsText);
    if (!parsed) return null;
    const resolved = this.parseUqlFactorListItems(
      parsed.skillList,
      'white-factor',
    );
    if (
      !resolved.length ||
      resolved.some((item) => !item.factor && !/^\d+$/.test(item.value))
    )
      return null;
    const normalizedParams = this.normalizeWhiteScoringParams(
      parsed.params.trim(),
    );
    if (
      !resolved.some((item) => item.factor) &&
      normalizedParams === parsed.params.trim()
    )
      return null;
    const ids = resolved.map((item) =>
      item.factor ? item.factor.factorId.toString() : item.value.trim(),
    );
    const listText = parsed.parenthesizedList
      ? `(${ids.join(', ')})`
      : ids.join(', ');
    return `${functionName}(${normalizedParams ? `${listText}, ${normalizedParams}` : listText})`;
  }

  private normalizeWhiteScoringParams(params: string): string {
    return params.replace(
      /(^|,)\s*(?:priority|priority_group|prio_group|prio\s+group|group)\s*=\s*(-?\d+)/gi,
      (_match, leadingText: string, value: string) => {
        return `${leadingText}${leadingText ? ' ' : ''}priority = ${this.normalizePriorityGroup(value)}`;
      },
    );
  }

  private splitWhiteScoringFunctionArgs(
    argsText: string,
  ): { skillList: string; params: string; parenthesizedList: boolean } | null {
    const trimmed = argsText.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('(')) {
      let depth = 0;
      for (let index = 0; index < trimmed.length; index++) {
        const char = trimmed[index];
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (depth !== 0) continue;
        const rest = trimmed.slice(index + 1).trim();
        return {
          skillList: trimmed.slice(1, index),
          params: rest.replace(/^,\s*/, ''),
          parenthesizedList: true,
        };
      }
      return null;
    }
    const paramsMatch = trimmed.match(/,\s*(?:prio\s+group|[A-Za-z_]\w*)\s*=/i);
    if (!paramsMatch || paramsMatch.index === undefined) {
      return { skillList: trimmed, params: '', parenthesizedList: false };
    }
    return {
      skillList: trimmed.slice(0, paramsMatch.index),
      params: trimmed.slice(paramsMatch.index + 1).trim(),
      parenthesizedList: false,
    };
  }

  private buildFriendlyFactorSingleFunctionClause(
    _functionName: string,
    fieldText: string,
    rawValue: string,
  ): string | null {
    const context = this.getUqlValueContextForField(fieldText);
    if (!context?.endsWith('-factor')) return null;
    const item = this.parseUqlFactorItem(rawValue, context);
    if (!item.factor) return null;
    return this.buildSkillPresenceClause(fieldText.trim(), item, false);
  }

  private buildFriendlyRaceSaddleFunctionClause(
    functionName: string,
    fieldText: string,
    listText: string,
  ): string | null {
    const targetFields = this.getRaceSaddleTargetFields(fieldText);
    if (!targetFields.length) return null;
    const normalizedFunction = functionName.toLowerCase();
    const mode =
      normalizedFunction === 'has_all' ||
      normalizedFunction === 'contains_all' ||
      normalizedFunction === 'all'
        ? 'all'
        : 'any';
    return this.buildRaceSaddleArrayClause(targetFields, mode, listText);
  }

  private buildFriendlyFactorListFunctionClause(
    functionName: string,
    fieldText: string,
    listText: string,
  ): string | null {
    const context = this.getUqlValueContextForField(fieldText);
    if (!context?.endsWith('-factor')) return null;
    const resolved = this.parseUqlFactorListItems(listText, context);
    if (!resolved.length) return null;
    if (!resolved.some((item) => item.factor)) return null;
    if (resolved.some((item) => !item.factor && !/^\d+$/.test(item.value)))
      return null;

    const normalizedFunction = functionName.toLowerCase();
    if (normalizedFunction === 'overlaps' && resolved.some(item => item.occurrences)) {
      return '(' + resolved.map(item => item.factor ? this.buildSkillPresenceClause(fieldText.trim(), item, false) : 'contains(' + fieldText.trim() + ', ' + item.value + ')').join(' or ') + ')';
    }
    if (normalizedFunction === 'overlaps') {
      const ids = resolved.flatMap((item) =>
        item.factor
          ? this.getSparkIdsForFactorField(
              item.factor,
              fieldText,
              item.operator,
              item.level,
            ).map((id) => id.toString())
          : [item.value],
      );
      return `overlaps(${fieldText.trim()}, (${ids.join(', ')}))`;
    }

    if (
      normalizedFunction === 'has_all' ||
      normalizedFunction === 'contains_all' ||
      normalizedFunction === 'all'
    ) {
      const clauses = resolved.map((item) =>
        item.factor
          ? this.buildSkillPresenceClause(fieldText.trim(), item, false)
          : `contains(${fieldText.trim()}, ${item.value})`,
      );
      return clauses.length === 1 ? clauses[0]! : `(${clauses.join(' and ')})`;
    }

    return null;
  }

  private splitUqlDelimitedValues(
    listText: string,
    preserveWhitespace = false,
  ): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let index = 0; index < listText.length; index++) {
      const character = listText.charAt(index);
      if (quote) {
        if (character === quote) {
          if (listText[index + 1] === quote) {
            index++;
          } else {
            quote = null;
          }
        }
        continue;
      }
      if (isUqlQuoteStart(listText, index)) {
        quote = character;
        continue;
      }
      if (character === '(') {
        depth++;
        continue;
      }
      if (character === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (character !== ',' || depth !== 0) continue;
      parts.push(listText.slice(start, index));
      start = index + 1;
    }
    parts.push(listText.slice(start));
    return parts
      .map((value) => (preserveWhitespace ? value : value.trim()))
      .filter((value) => value.trim().length > 0);
  }

  private splitUqlFactorListValues(
    listText: string,
    context: UqlValueContext,
  ): string[] {
    const namedValues = this.uqlNamedFactorsCache
      .filter((factor) => factor.valueContext === context)
      .flatMap((factor) => [factor.label, ...factor.aliases])
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      .sort((left, right) => right.length - left.length);
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
      while (index < listText.length && /[\s,]/.test(listText.charAt(index)))
        index++;
      if (index >= listText.length) break;
      const knownValue = this.matchKnownUqlListValueAt(
        listText,
        index,
        namedValues,
      );
      if (knownValue) {
        values.push(knownValue.text.trim());
        index = knownValue.end;
      } else {
        let end = index;
        while (end < listText.length && listText[end] !== ',') end++;
        values.push(listText.slice(index, end).trim());
        index = end;
      }
      while (index < listText.length && /\s/.test(listText.charAt(index)))
        index++;
      if (listText.charAt(index) === ',') index++;
    }
    return values.filter(Boolean);
  }

  private splitUqlAnyFactorListValues(listText: string): string[] {
    const namedValues = this.uqlNamedFactorsCache
      .flatMap((factor) => [factor.label, ...factor.aliases])
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private parseUqlFactorListItems(
    listText: string,
    context: UqlValueContext,
  ): UqlSkillListItem[] {
    return this.splitUqlFactorListValues(
      this.stripOuterParens(listText),
      context,
    ).map((value) => this.parseUqlFactorItem(value, context));
  }

  private parseUqlAnyFactorListItems(listText: string): UqlSkillListItem[] {
    return this.splitUqlAnyFactorListValues(
      this.stripOuterParens(listText),
    ).map((value) => this.parseUqlFactorItem(value));
  }

  private parseUqlFactorItem(
    rawValue: string,
    context?: UqlValueContext,
  ): UqlSkillListItem {
    const trimmedValue = this.stripOuterParens(rawValue.trim());
    const comparisonMatch = trimmedValue.match(
      /^(.*?)(?:\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+)\s*([x×])?)\s*$/,
    );
    const value = comparisonMatch ? comparisonMatch[1]!.trim() : trimmedValue;
    const operator = comparisonMatch?.[2]
      ? this.normalizeUqlComparisonOperator(comparisonMatch[2])
      : undefined;
    const level = comparisonMatch?.[3]
      ? parseInt(comparisonMatch[3], 10)
      : undefined;
    return {
      value,
      factor: this.resolveFactorUqlValue(
        value,
        context,
      ) as UqlNamedFactor | null,
      operator,
      level,
      occurrences: !!comparisonMatch?.[4],
    };
  }

  private splitUqlKnownListValues(
    listText: string,
    namedValues: string[],
  ): string[] {
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
      while (index < listText.length && /[\s,]/.test(listText.charAt(index)))
        index++;
      if (index >= listText.length) break;
      const knownValue = this.matchKnownUqlListValueAt(
        listText,
        index,
        namedValues,
      );
      if (knownValue) {
        values.push(knownValue.text.trim());
        index = knownValue.end;
      } else {
        let end = index;
        while (end < listText.length && listText[end] !== ',') end++;
        values.push(listText.slice(index, end).trim());
        index = end;
      }
      while (index < listText.length && /\s/.test(listText.charAt(index)))
        index++;
      if (listText.charAt(index) === ',') index++;
    }
    return values.filter(Boolean);
  }

  private matchKnownUqlListValueAt(
    listText: string,
    index: number,
    namedValues: string[],
  ): { text: string; end: number } | null {
    const lowerText = listText.toLowerCase();
    for (const value of namedValues) {
      const lowerValue = value.toLowerCase();
      if (!lowerText.startsWith(lowerValue, index)) continue;
      const end = index + value.length;
      let boundary = end;
      while (boundary < listText.length && /\s/.test(listText.charAt(boundary)))
        boundary++;
      if (
        boundary < listText.length &&
        listText.charAt(boundary) !== ',' &&
        !/[<>=!]/.test(listText.charAt(boundary))
      )
        continue;
      const comparisonMatch = listText
        .slice(boundary)
        .match(/^\s*(?:>=|<=|!=|<>|==|=|>|<)\s*\d+(?:\s*[x×](?![\w.]))?/);
      const comparisonEnd = comparisonMatch
        ? boundary + comparisonMatch[0].length
        : end;
      return { text: listText.slice(index, comparisonEnd), end: comparisonEnd };
    }
    return null;
  }

  private getSparkIdsForFactorField(
    factor: FriendlySparkField,
    fieldText: string,
    operator?: string,
    level?: number,
  ): number[] {
    const maxLevel = this.getSparkMaxLevelForUqlField(fieldText, factor);
    const levels =
      operator && level !== undefined
        ? this.getSparkLevelsForComparison(operator, level, maxLevel)
        : Array.from({ length: maxLevel }, (_entry, index) => index + 1);
    return levels.map((sparkLevel) =>
      this.buildSparkId(factor.factorId, sparkLevel),
    );
  }

  private getSparkMaxLevelForUqlField(
    fieldText: string,
    factor: FriendlySparkField,
  ): number {
    const normalizedField = fieldText
      .toLowerCase()
      .replace(/[_\s-]+/g, '_')
      .trim();
    const scopedParentField =
      /^(?:main|left|right)_(?:blue|pink|green|white)_factors$/.test(
        normalizedField,
      ) || normalizedField === 'main_parent_white_sparks';
    return scopedParentField ? Math.min(factor.maxLevel, 3) : factor.maxLevel;
  }

  private replaceComparisonValue(
    segment: string,
    fieldPattern: string,
    resolveValue: (value: string, fieldText: string) => string | null,
  ): string {
    const comparisonPattern = new RegExp(
      `(${fieldPattern}\\s*(?:==|=|!=|<>|<=|>=|<|>)\\s*)([^\\s(),][^;)]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`,
      'gi',
    );
    return segment.replace(
      comparisonPattern,
      (match, prefix: string, rawValue: string) => {
        const fieldText = prefix
          .replace(/\s*(?:==|=|!=|<>|<=|>=|<|>)\s*$/, '')
          .trim();
        const resolvedValue = resolveValue(rawValue, fieldText);
        return resolvedValue ? `${prefix}${resolvedValue}` : match;
      },
    );
  }

  private replaceInListValues(
    segment: string,
    fieldPattern: string,
    resolveValue: (value: string, fieldText: string) => string | null,
  ): string {
    const inListPattern = new RegExp(
      `(${fieldPattern}\\s+(?:not\\s+)?in\\s*\\()((?:[^()]|\\([^)]*\\))*)(\\))`,
      'gi',
    );
    return segment.replace(
      inListPattern,
      (_match, prefix: string, listText: string, suffix: string) => {
        const fieldText = prefix.replace(/\s+(?:not\s+)?in\s*\($/i, '').trim();
        return `${prefix}${this.replaceNamedListValues(listText, (value) => resolveValue(value, fieldText))}${suffix}`;
      },
    );
  }

  private replaceNamedListValues(
    listText: string,
    resolveValue: (value: string) => string | null,
  ): string {
    const items = this.splitUqlDelimitedValues(listText, true);
    const resolvedItems: string[] = [];
    for (let index = 0; index < items.length; index++) {
      let bestMatch: { endIndex: number; text: string } | null = null;
      for (let endIndex = index; endIndex < items.length; endIndex++) {
        const candidateText = items.slice(index, endIndex + 1).join(',');
        const value = candidateText.trim();
        if (!value) continue;
        const resolvedValue = resolveValue(value);
        if (!resolvedValue) continue;
        const leadingWhitespace = candidateText.match(/^\s*/)?.[0] || '';
        const trailingWhitespace = candidateText.match(/\s*$/)?.[0] || '';
        bestMatch = {
          endIndex,
          text: `${leadingWhitespace}${resolvedValue}${trailingWhitespace}`,
        };
      }
      if (bestMatch) {
        resolvedItems.push(bestMatch.text);
        index = bestMatch.endIndex;
        continue;
      }
      const item = items[index]!;
      const leadingWhitespace = item.match(/^\s*/)?.[0] || '';
      const trailingWhitespace = item.match(/\s*$/)?.[0] || '';
      const value = item.trim();
      resolvedItems.push(
        `${leadingWhitespace}${resolveValue(value) || value}${trailingWhitespace}`,
      );
    }
    return resolvedItems.join(',');
  }

  private buildCharacterScopeListClause(
    fields: string[],
    listText: string,
    negated: boolean,
  ): string {
    const clauses = fields.map((fieldName) => {
      const resolvedList = this.replaceNamedListValues(listText, (value) =>
        this.resolveCharacterUqlValue(value, fieldName),
      );
      return `${fieldName} ${negated ? 'not in' : 'in'} (${resolvedList})`;
    });
    if (clauses.length === 1) return clauses[0]!;
    return `(${clauses.join(negated ? ' and ' : ' or ')})`;
  }

  private buildCharacterScopeComparisonClause(
    fields: string[],
    operator: string,
    rawValue: string,
  ): string {
    const normalizedOperator =
      this.normalizeUqlComparisonOperator(operator) || operator;
    const negated = normalizedOperator === '!=';
    const clauses = fields.map((fieldName) => {
      const resolvedValue =
        this.resolveCharacterUqlValue(rawValue, fieldName) || rawValue.trim();
      return `${fieldName} ${normalizedOperator} ${resolvedValue}`;
    });
    if (clauses.length === 1) return clauses[0]!;
    return `(${clauses.join(negated ? ' and ' : ' or ')})`;
  }

  private resolveNamedUqlValueForField(
    fieldText: string,
    rawValue: string,
  ): string | null {
    const value = rawValue.trim();
    if (!value || /^\d+$/.test(value) || /^'.*'$|^".*"$/.test(value))
      return null;
    const context = this.getUqlValueContextForField(fieldText);
    if (context === 'character')
      return this.resolveCharacterUqlValue(value, fieldText);
    if (context === 'support-card')
      return this.resolveSupportCardUqlValue(value);
    if (context === 'race-saddle') {
      const ids = this.resolveRaceSaddleUqlValue(value);
      return ids.length ? ids.join(', ') : null;
    }
    if (
      context === 'blue-factor' ||
      context === 'pink-factor' ||
      context === 'green-factor' ||
      context === 'white-factor'
    ) {
      const factor = this.resolveFactorUqlValue(value, context);
      return factor ? this.buildSparkId(factor.factorId, 1).toString() : null;
    }
    return null;
  }

  private resolveRaceSaddleListItems(
    listText: string,
  ): Array<{ value: string; saddleIds: number[] }> {
    return this.splitUqlRaceSaddleListValues(listText).map((value) => ({
      value,
      saddleIds: this.resolveRaceSaddleUqlValue(value),
    }));
  }

  private resolveRaceSaddleUqlValue(rawValue: string): number[] {
    const value = rawValue
      .trim()
      .replace(
        /^(?:id|saddle_id|win_saddle_id|race_id|race_instance_id)\s*=\s*/i,
        '',
      );
    if (!value || /^'.*'$|^".*"$/.test(value)) return [];
    if (/^\d+$/.test(value)) return [parseInt(value, 10)];
    const normalizedValue = this.normalizeUqlName(value);
    const matchedRace = this.getUqlRaceSaddleValues().find((race) =>
      [race.label, ...race.aliases].some(
        (alias) => this.normalizeUqlName(alias) === normalizedValue,
      ),
    );
    return matchedRace?.saddleIds ?? [];
  }

  private splitUqlRaceSaddleListValues(listText: string): string[] {
    const namedValues = this.getUqlRaceSaddleValues()
      .flatMap((race) => [race.label, ...race.aliases])
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private resolveSupportCardUqlValue(rawValue: string): string | null {
    const value = rawValue
      .trim()
      .replace(/^(?:id|card_id|support_card_id)\s*=\s*/i, '');
    if (!value || /^'.*'$|^".*"$/.test(value)) return null;
    if (/^\d+$/.test(value)) return value;
    const parsed = this.parseSupportCardUqlDisplayValue(value);
    const card = this.catalog.supports.find((entry) => {
      if (this.normalizeUqlName(entry.name) !== parsed.name) return false;
      if (
        parsed.type &&
        this.normalizeUqlName(this.getSupportCardTypeDisplay(entry.type)) !==
          parsed.type
      )
        return false;
      if (
        parsed.rarity &&
        this.normalizeUqlName(
          this.getSupportCardRarityDisplay(entry.rarity),
        ) !== parsed.rarity
      )
        return false;
      return true;
    });
    return card?.id || null;
  }

  private parseSupportCardUqlDisplayValue(value: string): {
    name: string;
    rarity?: string;
    type?: string;
  } {
    let text = value.trim();
    let type: string | undefined;
    let rarity: string | undefined;
    const typeMatch = text.match(/\s*\(([^)]+)\)\s*$/);
    if (typeMatch) {
      type = this.normalizeUqlName(typeMatch[1]!);
      text = text.slice(0, typeMatch.index).trim();
    }
    const rarityMatch = text.match(/\s*\[(R|SR|SSR)\]\s*$/i);
    if (rarityMatch) {
      rarity = this.normalizeUqlName(rarityMatch[1]!);
      text = text.slice(0, rarityMatch.index).trim();
    }
    return { name: this.normalizeUqlName(text), rarity, type };
  }

  private formatCharacterUqlId(cardId: number, _fieldText?: string): string {
    return cardId.toString();
  }

  private resolveFactorUqlValue(
    rawValue: string,
    context?: UqlValueContext,
  ): FriendlySparkField | null {
    const normalizedValue = this.normalizeUqlName(rawValue);
    return (
      this.factorValueLookup.get(
        this.getFactorValueLookupKey(context || null, normalizedValue),
      ) || null
    );
  }

  private getUqlValueContextForField(
    fieldText: string,
  ): UqlValueContext | null {
    const normalized = fieldText
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      this.endsWithAny(normalized, [
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
        'great parent characters',
      ])
    ) {
      return 'character';
    }
    if (
      this.endsWithAny(normalized, [
        'support card',
        'support',
        'card',
        'support card id',
      ])
    ) {
      return 'support-card';
    }
    if (
      this.endsWithAny(normalized, [
        'race results',
        'race wins',
        'main race wins',
        'left race wins',
        'right race wins',
        'win saddles',
        'main win saddles',
        'left win saddles',
        'right win saddles',
      ])
    ) {
      return 'race-saddle';
    }
    if (this.endsWithAny(normalized, ['rank', 'parent rank'])) {
      return 'rank';
    }
    if (
      this.endsWithAny(normalized, [
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
        'gp2 white sparks',
      ])
    ) {
      return 'white-factor';
    }
    if (
      this.endsWithAny(normalized, [
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
        'gp2 unique skills',
      ])
    ) {
      return 'green-factor';
    }
    if (
      this.endsWithAny(normalized, [
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
        'gp2 blue factors',
      ])
    ) {
      return 'blue-factor';
    }
    if (
      this.endsWithAny(normalized, [
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
        'gp2 pink factors',
      ])
    ) {
      return 'pink-factor';
    }
    return null;
  }

  private getScopedUqlNamedFactors(): UqlNamedFactor[] {
    return this.scopedUqlNamedFactorsCache;
  }

  private normalizeUqlName(value: string): string {
    return value.replace(/^['"]|['"]$/g, '')
      .replace(/[○◎◯]/g, '')
      .replace(/\s+[oO]$/g, '')
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private buildScopedSparkComparison(
    field: FriendlyScopedSparkField,
    operator: string,
    value: number,
  ): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const clauses = field.fields.map((target) =>
      target.type === 'array'
        ? this.buildSparkComparison(
            { ...field, field: target.field },
            normalizedOperator,
            value,
          )
        : this.buildSingleSparkFieldComparison(
            target.field,
            field.factorId,
            normalizedOperator,
            value,
            field.maxLevel,
          ),
    );
    if (clauses.length === 1) return clauses[0]!;
    const joiner = normalizedOperator === '!=' ? ' and ' : ' or ';
    return `(${clauses.join(joiner)})`;
  }

  private buildSingleSparkFieldComparison(
    fieldName: string,
    factorId: number,
    operator: string,
    value: number,
    maxLevel: number,
  ): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const zeroClause = this.buildZeroSparkComparisonClause(
      fieldName,
      factorId,
      normalizedOperator,
      value,
      maxLevel,
    );
    if (zeroClause) return zeroClause;
    if (normalizedOperator === '!=') {
      return `${fieldName} != ${this.buildSparkId(factorId, value)}`;
    }
    const levels = this.getSparkLevelsForComparison(
      normalizedOperator,
      value,
      maxLevel,
    );
    if (!levels.length) return '(1 = 0)';
    const sparkIds = levels.map((level) => this.buildSparkId(factorId, level));
    if (sparkIds.length === 1) return `${fieldName} = ${sparkIds[0]}`;
    return `${fieldName} in (${sparkIds.join(', ')})`;
  }

  private buildScopedArrayClause(
    fields: string[],
    buildClause: (field: string) => string,
    joiner: 'and' | 'or',
  ): string {
    const clauses = fields.map(buildClause);
    if (clauses.length === 1) return clauses[0]!;
    return `(${clauses.join(` ${joiner} `)})`;
  }

  private buildSparkComparison(
    field: FriendlySparkField,
    operator: string,
    value: number,
  ): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const zeroClause = this.buildZeroSparkComparisonClause(
      field.field,
      field.factorId,
      normalizedOperator,
      value,
      field.maxLevel,
    );
    if (zeroClause) return zeroClause;
    const levels = this.getSparkLevelsForComparison(
      normalizedOperator,
      value,
      field.maxLevel,
    );
    if (normalizedOperator === '!=') {
      const sparkId = this.buildSparkId(field.factorId, value);
      return `not contains(${field.field}, ${sparkId})`;
    }
    if (!levels.length) return '(1 = 0)';
    const sparkIds = levels.map((level) =>
      this.buildSparkId(field.factorId, level),
    );
    if (sparkIds.length === 1)
      return `contains(${field.field}, ${sparkIds[0]})`;
    return `overlaps(${field.field}, (${sparkIds.join(', ')}))`;
  }

  private normalizeUqlComparisonOperator(operator: string): string {
    if (operator === '==' || operator === '=') return '=';
    if (operator === '<>') return '!=';
    return operator;
  }

  private buildZeroSparkComparisonClause(
    fieldName: string,
    factorId: number,
    operator: string | undefined,
    value: number,
    maxLevel: number,
  ): string | null {
    if (!Number.isFinite(value) || value !== 0 || !operator) return null;
    const ids = this.rangeInclusive(1, maxLevel).map((level) =>
      this.buildSparkId(factorId, level),
    );
    if (!ids.length) return null;
    const normalizedField = fieldName
      .toLowerCase()
      .replace(/[_\s-]+/g, '_')
      .trim();
    const isArrayField =
      normalizedField.endsWith('_sparks') ||
      normalizedField.endsWith('_white_factors');
    const anyMatch = isArrayField
      ? `overlaps(${fieldName}, (${ids.join(', ')}))`
      : `${fieldName} in (${ids.join(', ')})`;
    switch (operator) {
      case '=':
      case '<=':
        return `not ${anyMatch}`;
      case '!=':
      case '>':
        return anyMatch;
      case '<':
        return '(1 = 0)';
      case '>=':
        return '(1 = 1)';
      default:
        return null;
    }
  }

  private getSparkLevelsForComparison(
    operator: string,
    value: number,
    maxLevel: number,
  ): number[] {
    const levels = Array.from(
      { length: maxLevel },
      (_entry, index) => index + 1,
    );
    switch (operator) {
      case '=':
        return levels.filter((level) => level === value);
      case '>':
        return levels.filter((level) => level > value);
      case '>=':
        return levels.filter((level) => level >= value);
      case '<':
        return levels.filter((level) => level < value);
      case '<=':
        return levels.filter((level) => level <= value);
      default:
        return [];
    }
  }

  private buildSparkId(factorId: number, level: number): number {
    return parseInt(`${factorId}${level}`, 10);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private endsWithAny(value: string, endings: string[]): boolean {
    return endings.some((ending) => value.endsWith(ending));
  }

  private stripOuterParens(value: string): string {
    let text = value.trim();
    while (text.startsWith('(') && text.endsWith(')')) {
      let depth = 0;
      let wrapsWholeText = true;
      for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth === 0 && index < text.length - 1) {
          wrapsWholeText = false;
          break;
        }
      }
      if (!wrapsWholeText) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  }
}
