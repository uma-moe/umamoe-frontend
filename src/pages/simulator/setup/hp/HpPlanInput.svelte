<script lang="ts">
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import HpSkillCounts from './HpSkillCounts.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import { hpCalculator } from './hp-calculator.svelte';
  import { rushChance, situationSeconds, type PlanCourse } from './hp-plan';

  /**
   * The quick input: how many skills of each kind, and what happens between her and the other runners. Each count
   * becomes recovery, speed or acceleration at the usual place on the course. Every row sits on the form's five
   * columns: the kind, then gold, white and unique, then what the unique heals.
   */
  let {
    course,
    guts,
    wit,
    skillCount = 0,
    oncount
  }: {
    course: PlanCourse;
    /** Her guts with green skills, for the usual length of a position fight. */
    guts: number;
    /** Her wit with green skills, for her chance to get rushed. */
    wit: number;
    /** How many skills her full build has, to count them into the plan. */
    skillCount?: number;
    oncount?: () => void;
  } = $props();

  const plan = $derived(hpCalculator.plan);
  const downhills = $derived(
    (course.slopes ?? []).filter((slope) => slope.slope < 0 && slope.start < course.distance).length
  );
  const downhillWhere = $derived.by(() => {
    if (!downhills) return 'no downhills here';

    return 'on ' + (downhills === 1 ? 'the downhill' : 'all ' + downhills + ' downhills');
  });

  const SITUATIONS = $derived([
    { key: 'positionFight', label: 'Position fight', where: 'early race, front runners' },
    {
      key: 'rushed',
      label: 'Rushed',
      where: 'in ' + Math.round(rushChance(wit)) + '% of races, by her wit'
    },
    { key: 'paceDown', label: 'Pace down', where: 'mid race, behind the leaders' },
    { key: 'duel', label: 'Duel', where: 'final straight' }
  ] as const);
</script>

<div class="pair">
  <HpSkillCounts
    {skillCount}
    {oncount}
  />

  <SimSection
    number={4}
    title="Between runners"
  >
    <ul
      class="situations"
      aria-label="Between runners"
    >
      {#each SITUATIONS as situation (situation.key)}
        {@const item = plan[situation.key]}
        {@const usual = situationSeconds(situation.key, guts, course)}
        <li
          class:on={item.on}
          role="group"
          aria-label={situation.label}
        >
          <span class="toggle">
            <Checkbox
              id={'hp-situation-' + situation.key}
              label={situation.label}
              description={situation.where}
              checked={item.on}
              onchange={(checked) => (item.on = checked)}
            />
          </span>
          <label
            class="seconds"
            title={item.seconds == null
              ? 'The usual length. Type to change it.'
              : 'Clear to go back to the usual ' + usual + ' s'}
          >
            <input
              type="number"
              min="0.5"
              max="60"
              step="0.5"
              class:usual={item.seconds == null}
              aria-label={situation.label + ' seconds'}
              disabled={!item.on}
              value={item.seconds ?? usual}
              oninput={(event) => {
                const value = Number(event.currentTarget.value);
                item.seconds = event.currentTarget.value && value > 0 ? value : null;
              }}
            />
            <span>s</span>
          </label>
        </li>
      {/each}
      <li
        class:on={plan.downhill}
        role="group"
        aria-label="Downhill mode"
      >
        <span class="toggle">
          <Checkbox
            id="hp-situation-downhill"
            label="Downhill mode"
            description={downhillWhere}
            disabled={!downhills}
            checked={plan.downhill}
            onchange={(checked) => (plan.downhill = checked)}
          />
        </span>
      </li>
    </ul>
  </SimSection>
</div>

<style>
  /* Skills and the situations between runners side by side, as one band of the form, spaced as SimSection spaces
     the bands above it. */
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 20px;
    padding-top: 12px;
    border-top: 1px solid var(--border-subtle);
  }
  .pair > :global(.hp-section) {
    align-content: start;
    padding: 0;
    border-top: 0;
  }
  /* Situations between runners: a line each, a toggle with how long it lasts. */
  .situations {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .situations li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 32px;
    padding: 0 6px 0 2px;
    border: 1px solid transparent;
    border-radius: 6px;
  }
  .situations li.on {
    border-color: rgb(var(--accent-primary-rgb) / 0.3);
    background: rgb(var(--accent-primary-rgb) / 0.07);
  }
  .toggle {
    flex: 1;
    min-width: 0;
    padding-left: 4px;
  }
  /* The row's own height: the situations stay one compact line each. */
  .toggle :global(.checkbox) {
    min-height: 32px;
    gap: 8px;
  }
  .toggle :global(.checkbox small) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .seconds {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    font-size: 11px;
    color: var(--text-secondary);
  }
  /* Typed or arrowed: no spin buttons, so the number keeps the room. */
  .seconds input {
    appearance: textfield;
    -moz-appearance: textfield;
    width: 46px;
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--surface-1);
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .seconds input::-webkit-inner-spin-button,
  .seconds input::-webkit-outer-spin-button {
    margin: 0;
    -webkit-appearance: none;
  }
  /* Off: the usual length stays readable, as it is what turning it on will use. */
  .seconds input:disabled {
    border-color: var(--border-subtle);
    background: transparent;
  }
  /* The usual length, worked out from her stats or the course, until she types her own. */
  .seconds input.usual {
    color: var(--text-secondary);
  }
  .seconds input:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
  /* A narrow form: the two one above the other. */
  @container sim-form (max-width: 720px) {
    .pair {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
  }
  /* A phone: SimSection's closer bands and the design system's control height. */
  @media (max-width: 767px) {
    .pair {
      padding-top: 10px;
    }
    .situations li {
      min-height: var(--control-height);
    }
    .seconds input {
      height: var(--control-height);
      min-height: var(--control-height);
    }
  }
</style>
