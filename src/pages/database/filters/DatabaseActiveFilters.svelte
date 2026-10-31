<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import type {
    CharacterPickerOption,
    SupportCardPickerOption
  } from '@/components/pickers/picker-types';
  import { factorOptions } from '@/lib/game-data/factors/factors';
  import type {
    InheritanceFilterMode,
    InheritanceSearchFilters
  } from '@/lib/inheritance/search/inheritance-search';
  import type { UqlValidation } from '@/lib/inheritance/uql/uql';

  interface Props {
    filters: InheritanceSearchFilters;
    filterMode: InheritanceFilterMode;
    uqlState: UqlValidation['state'];
    characterOptions: Pick<CharacterPickerOption, 'id' | 'name'>[];
    supportOptions: SupportCardPickerOption[];
    legacyName?: string;
    sharedLegacyLabel?: string;
    includeMaxFollowers: boolean;
    onclear: () => void;
    onclearlegacy: () => void;
    onchange: () => void;
  }

  let {
    filters = $bindable(),
    filterMode,
    uqlState,
    characterOptions,
    supportOptions,
    legacyName,
    sharedLegacyLabel,
    includeMaxFollowers = $bindable(),
    onclear,
    onclearlegacy,
    onchange
  }: Props = $props();

  type ActiveChipTone =
    | 'blue'
    | 'pink'
    | 'green'
    | 'white'
    | 'optional'
    | 'character'
    | 'exclude'
    | 'support'
    | 'default';

  interface ActiveFilterView {
    id: string;
    label: string;
    tone: ActiveChipTone;
    remove: () => void;
  }

  const factorLabels = $derived(new Map(factorOptions().map((factor) => [factor.id, factor.text])));

  const scenarioLabels = [
    '',
    'URA Finals',
    'Unity Cup',
    'Grand Concert',
    'Trackblazer',
    'Grand Masters',
    'Project L’Arc',
    'U.A.F.',
    'Great Food Festival',
    'Run! Mecha',
    'Twinkle Legends',
    'Design Your Island',
    'Yukoma Hot Springs',
    'Beyond Dreams'
  ];

  const activeFilterViews = $derived.by<ActiveFilterView[]>(() => {
    const views: ActiveFilterView[] = [];
    const add = (id: string, label: string, tone: ActiveChipTone, remove: () => void) =>
      views.push({ id, label, tone, remove });

    if (filterMode === 'uql') {
      if (filters.uql?.trim())
        add('uql', `UQL: ${uqlState === 'valid' ? 'Active' : 'Editing'}`, 'default', onclear);
      return views;
    }

    const characterName = (id: number) =>
      characterOptions.find((option) =>
        id >= 10000 ? Number(option.id) === id : Math.floor(Number(option.id) / 100) === id
      )?.name ?? `Character ${id}`;

    if (filters.playerCharaId)
      add('target', `Target: ${characterName(filters.playerCharaId)}`, 'character', () => {
        filters.playerCharaId = undefined;
      });
    if (legacyName !== undefined)
      add('legacy', `Legacy: ${legacyName}`, 'character', () => onclearlegacy());
    else if (sharedLegacyLabel)
      add('legacy', sharedLegacyLabel, 'character', () => onclearlegacy());
    if (filters.trainerId?.trim())
      add('trainer-id', `Trainer ID: ${filters.trainerId.trim()}`, 'default', () => {
        filters.trainerId = undefined;
      });
    if (filters.trainerName?.trim())
      add('trainer-name', `Username: ${filters.trainerName.trim()}`, 'default', () => {
        filters.trainerName = undefined;
      });
    const characterGroups = [
      ['mainParentIds', 'Allow main', 'character'],
      ['includeParentIds', 'Allow great', 'character'],
      ['excludeMainParentIds', 'Hide main', 'exclude'],
      ['excludeParentIds', 'Hide great', 'exclude']
    ] as const satisfies ReadonlyArray<
      readonly [keyof InheritanceSearchFilters, string, ActiveChipTone]
    >;

    for (const [key, prefix, tone] of characterGroups) {
      const ids = filters[key];
      ids.forEach((id, index) =>
        add(`${String(key)}-${id}-${index}`, `${prefix}: ${characterName(id)}`, tone, () => {
          filters[key] = ids.filter((_, itemIndex) => itemIndex !== index);
        })
      );
    }

    const factorGroups = [
      ['blue', 'Blue', 'blue'],
      ['pink', 'Pink', 'pink'],
      ['green', 'Green', 'green'],
      ['white', 'White', 'white'],
      ['mainBlue', 'Main blue', 'blue'],
      ['mainPink', 'Main pink', 'pink'],
      ['mainGreen', 'Main green', 'green'],
      ['mainWhite', 'Main white', 'white'],
      ['optionalWhite', 'Preferred', 'optional'],
      ['optionalMainWhite', 'Preferred main', 'optional'],
      ['lineageWhite', 'Lineage', 'optional']
    ] as const satisfies ReadonlyArray<
      readonly [keyof InheritanceSearchFilters, string, ActiveChipTone]
    >;

    for (const [key, prefix, tone] of factorGroups) {
      const requirements = filters[key];
      requirements.forEach((requirement, index) => {
        if (
          !Number.isFinite(requirement.factorId) ||
          requirement.factorId < 0 ||
          (requirement.factorId === 0 && tone === 'white')
        )
          return;
        const starRange =
          requirement.maximumStars && requirement.maximumStars !== requirement.minimumStars
            ? `${requirement.minimumStars}–${requirement.maximumStars}★`
            : `${requirement.minimumStars}★`;

        const range =
          requirement.metric === 'occurrences'
            ? `${requirement.minimumOccurrences ?? 0}–${requirement.maximumOccurrences ?? 3}×`
            : starRange;

        add(
          `${String(key)}-${requirement.factorId}-${index}`,
          `${prefix}: ${requirement.factorId === 0 ? 'Any' : (factorLabels.get(String(requirement.factorId)) ?? requirement.factorId)} ${range}`,
          tone,
          () => {
            filters[key] = requirements.filter((_, itemIndex) => itemIndex !== index);
          }
        );
      });
    }

    if (filters.supportCardId)
      add(
        'support',
        `Support: ${supportOptions.find((option) => Number(option.id) === filters.supportCardId)?.title ?? filters.supportCardId}${filters.minLimitBreak ? `, LB${filters.minLimitBreak}` : ''}`,
        'support',
        () => {
          filters.supportCardId = undefined;
          filters.minLimitBreak = undefined;
        }
      );
    filters.scenarioIds.forEach((id) =>
      add(`scenario-${id}`, `Scenario: ${scenarioLabels[id] ?? id}`, 'default', () => {
        filters.scenarioIds = filters.scenarioIds.filter((value) => value !== id);
      })
    );

    const scalarGroups = [
      ['minWinCount', 'Wins ≥', 'default'],
      ['minWhiteCount', 'White factors ≥', 'white'],
      ['minBlueStarsSum', 'Blue stars ≥', 'blue'],
      ['minPinkStarsSum', 'Pink stars ≥', 'pink'],
      ['minGreenStarsSum', 'Green stars ≥', 'green'],
      ['minWhiteStarsSum', 'White stars ≥', 'white'],
      ['minCommonWhiteCount', 'Common factors ≥', 'white'],
      ['minCommonWhiteStarsSum', 'Common stars ≥', 'white'],
      ['minScenarioWhiteCount', 'Scenario factors ≥', 'white'],
      ['minScenarioWhiteStarsSum', 'Scenario stars ≥', 'white'],
      ['minRaceWhiteCount', 'Race factors ≥', 'white'],
      ['minRaceWhiteStarsSum', 'Race stars ≥', 'white'],
      ['minMainWhiteCount', 'Main white factors ≥', 'white']
    ] as const satisfies ReadonlyArray<
      readonly [keyof InheritanceSearchFilters, string, ActiveChipTone]
    >;

    for (const [key, prefix, tone] of scalarGroups) {
      const value = filters[key];
      if (typeof value === 'number' && value > 0)
        add(String(key), `${prefix} ${value}`, tone, () => {
          filters[key] = undefined;
        });
    }

    if ((filters.minParentRank ?? 1) > 1)
      add('minParentRank', `Rank ≥ ${filters.minParentRank}`, 'default', () => {
        filters.minParentRank = 1;
      });
    if (includeMaxFollowers)
      add('max-followers', 'Max followers: Included', 'default', () => {
        includeMaxFollowers = false;
        filters.maxFollowerNum = 999;
      });
    if (filters.raceSchedule.length)
      add(
        'races',
        `${filters.raceSchedule.length} required race${filters.raceSchedule.length === 1 ? '' : 's'}`,
        'default',
        () => {
          filters.raceSchedule = [];
          filters.mainWinSaddle = [];
        }
      );
    if (filters.uql?.trim())
      add('uql', `UQL: ${filters.uql.trim()}`, 'default', () => {
        filters.uql = '';
      });
    return views;
  });
</script>

{#if activeFilterViews.length}
  <section
    class="active-filters"
    aria-label="Active filters"
  >
    <div class="active-filters-inner">
      <strong>Active Filters:</strong>
      <div class="active-filter-chips">
        {#each activeFilterViews as chip (chip.id)}
          <button
            type="button"
            data-tone={chip.tone}
            onclick={() => {
              chip.remove();
              onchange();
            }}
          >
            <span>{chip.label}</span>
            <Icon
              name="close"
              size={15}
            />
          </button>
        {/each}
      </div>
      <button
        class="clear-current"
        type="button"
        onclick={onclear}
      >
        <Icon
          name="filter"
          size={15}
        />
        <span>Clear current</span>
      </button>
    </div>
  </section>
{/if}

<style>
  .active-filters {
    margin-top: 8px;
    padding: 10px 14px;
    border: 1.5px solid var(--border-primary);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
  }
  .active-filters-inner {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 8px 10px;
  }
  .active-filters-inner > strong {
    padding-top: 5px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  .active-filter-chips {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    overflow: hidden;
  }
  .active-filter-chips button {
    max-width: 100%;
    min-width: 0;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border: 1px solid transparent;
    border-radius: 14px;
    background: rgb(158 158 158/0.15);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .active-filter-chips button:hover {
    filter: brightness(1.15);
  }
  .active-filter-chips button span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .active-filter-chips button :global(svg) {
    flex: 0 0 auto;
    opacity: 0.7;
  }
  .active-filter-chips button[data-tone='blue'] {
    border-color: rgb(33 150 243/0.3);
    background: rgb(33 150 243/0.15);
    color: var(--accent-primary);
  }
  .active-filter-chips button[data-tone='pink'] {
    border-color: rgb(233 30 99/0.3);
    background: rgb(233 30 99/0.15);
    color: var(--color-pink);
  }
  .active-filter-chips button[data-tone='green'] {
    border-color: rgb(76 175 80/0.3);
    background: rgb(76 175 80/0.15);
    color: var(--accent-secondary);
  }
  .active-filter-chips button[data-tone='white'] {
    border-color: var(--border-secondary);
    background: var(--surface-3);
    color: var(--text-primary);
  }
  .active-filter-chips button[data-tone='optional'] {
    border-color: var(--border-secondary);
    background: var(--surface-2);
    color: var(--text-secondary);
  }
  .active-filter-chips button[data-tone='character'] {
    border-color: rgb(255 193 7/0.3);
    background: rgb(255 193 7/0.15);
    color: var(--accent-warning);
  }
  .active-filter-chips button[data-tone='exclude'] {
    border-color: rgb(244 67 54/0.3);
    background: rgb(244 67 54/0.15);
    color: var(--accent-error);
  }
  .active-filter-chips button[data-tone='support'] {
    border-color: rgb(156 39 176/0.3);
    background: rgb(156 39 176/0.15);
    color: var(--accent-purple);
  }
  .clear-current {
    height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 9px;
    border: 1px solid rgb(239 83 80/0.28);
    border-radius: var(--radius-xs);
    background: rgb(244 67 54/0.08);
    color: var(--accent-error);
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  @media (max-width: 600px) {
    .active-filters {
      padding: 10px;
    }
    .active-filters-inner {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
    .active-filters-inner > strong {
      grid-column: 1;
    }
    .active-filter-chips {
      grid-column: 1/-1;
    }
    .clear-current {
      grid-column: 2;
      grid-row: 1;
    }
    .active-filter-chips button {
      min-height: 32px;
      padding-inline: 8px;
      font-size: 11px;
    }
  }
</style>
