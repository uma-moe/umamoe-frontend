<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { scenarios } from '@/lib/catalog/scenario-catalog';
  import { scenarioName } from '@/lib/profile/profile-display';
  import { statisticsDistanceId } from '@/lib/statistics/statistics';
  import { classColors, distanceColors, distanceNames } from './statistics-display';

  let {
    allScenarios,
    allClasses,
    allDistances,
    selectedScenarios = $bindable([]),
    selectedClasses = $bindable([]),
    selectedDistances = $bindable([]),
    selectedSamples
  }: {
    allScenarios: string[];
    allClasses: string[];
    allDistances: string[];
    selectedScenarios?: string[];
    selectedClasses?: string[];
    selectedDistances?: string[];
    selectedSamples: number;
  } = $props();
  const id = $props.id();

  const groups = $derived([
    {
      key: 'scenarios',
      label: 'Scenario',
      all: allScenarios,
      selected: selectedScenarios,
      color: 'var(--accent-primary)'
    },
    {
      key: 'classes',
      label: 'Team class',
      all: [...allClasses].reverse(),
      selected: selectedClasses,
      color: 'var(--accent-purple)'
    },
    {
      key: 'distances',
      label: 'Distance',
      all: allDistances,
      selected: selectedDistances,
      color: 'var(--accent-secondary)'
    }
  ]);

  function select(group: string, values: string[]) {
    if (group === 'scenarios') selectedScenarios = values;
    else if (group === 'classes') selectedClasses = values;
    else selectedDistances = values;
  }
</script>

<div class="statistics-filters">
  <p class="intro">Choose what to include. Results update as you select.</p>
  {#each groups.filter((group) => group.all.length) as group}
    <div
      class="filter-group"
      role="group"
      aria-labelledby={`${id}-${group.key}`}
    >
      <div
        class="group-heading"
        style:--group-color={group.color}
      >
        <h3 id={`${id}-${group.key}`}>
          <i aria-hidden="true"></i>
          {group.label}
          <span>{group.selected.length} / {group.all.length}</span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          ariaLabel={`${group.selected.length === group.all.length ? 'Deselect' : 'Select'} all ${group.key}`}
          onclick={() =>
            select(group.key, group.selected.length === group.all.length ? [] : [...group.all])}
        >
          {group.selected.length === group.all.length ? 'Clear' : 'Select all'}
        </Button>
      </div>
      <div
        class="choices"
        class:scenarios={group.key === 'scenarios'}
      >
        {#each group.all as value}
          {@const scenario =
            group.key === 'scenarios'
              ? scenarios.find((item) => item.id === Number(value))
              : undefined}
          {@const label =
            group.key === 'scenarios'
              ? scenarioName(Number(value))
              : group.key === 'classes'
                ? `Class ${value}`
                : (distanceNames[statisticsDistanceId(value)] ?? value)}
          {@const tone =
            group.key === 'classes'
              ? classColors[value]
              : group.key === 'distances'
                ? distanceColors[statisticsDistanceId(value)]
                : group.color}
          <label
            class="choice"
            class:selected={group.selected.includes(value)}
            style:--choice-color={tone ?? group.color}
            title={scenario?.label}
          >
            <input
              type="checkbox"
              aria-label={label}
              checked={group.selected.includes(value)}
              onchange={(event) =>
                select(
                  group.key,
                  event.currentTarget.checked
                    ? [...group.selected, value]
                    : group.selected.filter((item) => item !== value)
                )}
            />
            {#if scenario}
              <img
                src={scenario.image}
                alt=""
                width="64"
                height="38"
                loading="lazy"
              />
            {:else if group.key === 'classes'}
              <span
                class="class-number"
                aria-hidden="true"
              >
                {value}
              </span>
            {:else}
              <span
                class="distance-dot"
                aria-hidden="true"
              ></span>
            {/if}
            <span class="label">{label}</span>
            <span
              class="check"
              aria-hidden="true"
            >
              {#if group.selected.includes(value)}
                <Icon
                  name="check"
                  size={13}
                />
              {/if}
            </span>
          </label>
        {/each}
      </div>
    </div>
  {/each}
  <div
    class="result"
    role="status"
  >
    <span>
      <Icon
        name="database"
        size={15}
      />Matching training samples
    </span>
    <strong>{selectedSamples.toLocaleString()}</strong>
  </div>
</div>

<style>
  .intro {
    margin: 0 0 16px;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.5;
  }
  .filter-group + .filter-group {
    margin-top: 18px;
  }
  .group-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 12px;
  }
  h3 i {
    width: 3px;
    height: 14px;
    background: var(--group-color);
    border-radius: 2px;
  }
  h3 span {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .group-heading :global(.ui-button) {
    font-size: 11px;
    padding-inline: 8px;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .scenarios {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .choice {
    position: relative;
    min-width: 0;
    min-height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    cursor: pointer;
  }
  .choice input {
    position: absolute;
    z-index: 1;
    inset: 0;
    margin: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  .choice.selected {
    border-color: color-mix(in srgb, var(--choice-color) 60%, var(--border-primary));
    background: color-mix(in srgb, var(--choice-color) 12%, var(--surface-1));
  }
  .choice:hover {
    border-color: var(--choice-color);
  }
  .choice:has(input:focus-visible) {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  .choice img {
    width: 64px;
    height: 38px;
    object-fit: contain;
    flex: none;
  }
  .choice:not(.selected) img {
    opacity: 0.5;
    filter: grayscale(0.7);
  }
  .label {
    min-width: 0;
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.3;
  }
  .class-number {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    flex: none;
    border-radius: var(--radius-xs);
    background: color-mix(in srgb, var(--choice-color) 20%, var(--surface-1));
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .distance-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--choice-color);
    flex: none;
  }
  .check {
    display: grid;
    place-items: center;
    width: 17px;
    height: 17px;
    flex: none;
    border: 1px solid var(--border-secondary);
    border-radius: 4px;
    color: var(--text-primary);
  }
  .selected .check {
    border-color: var(--choice-color);
    background: color-mix(in srgb, var(--choice-color) 35%, var(--surface-1));
  }
  .result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
    padding-top: 14px;
    border-top: 1px solid var(--border-subtle);
    font-size: 12px;
    color: var(--text-secondary);
  }
  .result > span {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .result :global(svg) {
    color: var(--accent-primary);
  }
  .result strong {
    color: var(--accent-primary);
    font-size: 17px;
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 380px) {
    .choice {
      padding: 8px 7px;
      gap: 5px;
    }
    .class-number {
      display: none;
    }
    .label {
      font-size: 11px;
    }
    .choice img {
      width: 44px;
      height: 30px;
    }
    .result {
      font-size: 11px;
    }
  }
</style>
