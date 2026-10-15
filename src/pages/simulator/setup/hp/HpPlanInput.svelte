<script lang="ts">
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
          <button
            type="button"
            class="toggle"
            aria-pressed={item.on}
            onclick={() => (item.on = !item.on)}
          >
            <span
              class="check"
              aria-hidden="true"
            ></span>
            {situation.label}
            <small>{situation.where}</small>
          </button>
          <label
            class="seconds"
            title={item.seconds == null
              ? 'The usual length; type to change it'
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
        <button
          type="button"
          class="toggle"
          aria-pressed={plan.downhill}
          disabled={!downhills}
          onclick={() => (plan.downhill = !plan.downhill)}
        >
          <span
            class="check"
            aria-hidden="true"
          ></span>
          Downhill mode
          <small>
            {downhills
              ? 'on ' + (downhills === 1 ? 'the downhill' : 'all ' + downhills + ' downhills')
              : 'no downhills here'}
          </small>
        </button>
      </li>
    </ul>
  </SimSection>
</div>

<style>
  /* Skills and the situations between runners side by side, as one band of the form. */
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 20px;
    padding-top: 10px;
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
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    align-self: stretch;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .toggle:hover {
    background: var(--surface-2);
  }
  .toggle:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .toggle small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .check {
    display: grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--border-primary);
    border-radius: 4px;
  }
  .toggle[aria-pressed='true'] .check {
    border-color: var(--accent-primary);
    background: var(--accent-primary);
  }
  .toggle[aria-pressed='true'] .check:after {
    content: '';
    width: 4px;
    height: 8px;
    margin-top: -2px;
    border: solid var(--surface-1);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
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
  /* Touch-sized on a phone. */
  @media (max-width: 767px) {
    .situations li {
      min-height: 44px;
    }
    .seconds input {
      height: 36px;
      min-height: 36px;
    }
  }
</style>
