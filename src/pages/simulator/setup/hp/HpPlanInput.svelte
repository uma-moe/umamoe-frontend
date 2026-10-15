<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import { skillImage } from '@/lib/catalog/skill-catalog';
  import HpCounter from './HpCounter.svelte';
  import SimSection from '../../shell/SimSection.svelte';
  import { hpCalculator } from './hp-calculator.svelte';
  import {
    ACCEL_SKILLS,
    DEBUFF_PERCENT,
    GREEN_BONUS,
    RECOVERY_PERCENT,
    SKILL_ICONS,
    SPEED_SKILLS,
    STAT_KEYS,
    STAT_LABELS,
    UNIQUE_RECOVERY_TIERS,
    rushChance,
    situationSeconds,
    uniqueRecovery,
    type HpPlan,
    type PlanCourse
  } from './hp-plan';

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
  const KINDS = [
    ['recovery', 'Recovery', 'recovery'],
    ['speed', 'Speed', 'speed'],
    ['accel', 'Accel', 'acceleration'],
    ['debuffs', 'HP debuffs', 'HP debuff']
  ] as const;
  const TIERS = ['gold', 'white', 'unique'] as const;
  /** What one skill of a kind and tier does, for its tooltip. */
  function tierDetail(kind: (typeof KINDS)[number][0], tier: (typeof TIERS)[number]) {
    if (kind === 'recovery')
      return '+' + (tier === 'unique' ? uniqueHeal : RECOVERY_PERCENT[tier]) + '% HP';
    if (kind === 'debuffs') return '−' + DEBUFF_PERCENT[tier] + '% HP';
    return (
      '+' +
      (kind === 'speed' ? SPEED_SKILLS : ACCEL_SKILLS)[tier].add +
      (kind === 'speed' ? ' m/s' : ' m/s²')
    );
  }

  const iconUrl = (code: string) => skillImage(code + '.webp');
  // What one unique heals at its level.
  const uniqueHeal = $derived(Math.round(uniqueRecovery(plan) * 100) / 100);

  // Clear takes every count back to none, green skills too, with a way back.
  type Counts = Pick<HpPlan, 'recovery' | 'speed' | 'accel' | 'debuffs' | 'green'> & {
    counted: string;
  };
  let cleared = $state<Counts | null>(null);
  const greens = $derived(
    STAT_KEYS.flatMap((stat) =>
      (['gold', 'white'] as const).flatMap((tier) =>
        plan.green[stat][tier] > 0 ? [{ stat, tier, count: plan.green[stat][tier] }] : []
      )
    )
  );
  const total = $derived(
    [plan.recovery, plan.speed, plan.accel, plan.debuffs].reduce(
      (sum, group) => sum + group.gold + group.white + group.unique,
      0
    ) + greens.length
  );
  function clear() {
    cleared = {
      ...$state.snapshot({
        recovery: plan.recovery,
        speed: plan.speed,
        accel: plan.accel,
        debuffs: plan.debuffs,
        green: plan.green
      }),
      counted: hpCalculator.counted
    };
    for (const group of [plan.recovery, plan.speed, plan.accel, plan.debuffs]) {
      group.gold = 0;
      group.white = 0;
      group.unique = 0;
    }
    for (const stat of STAT_KEYS) plan.green[stat] = { gold: 0, white: 0 };
    hpCalculator.counted = '';
  }
  function undo() {
    if (!cleared) return;
    Object.assign(plan.recovery, cleared.recovery);
    Object.assign(plan.speed, cleared.speed);
    Object.assign(plan.accel, cleared.accel);
    Object.assign(plan.debuffs, cleared.debuffs);
    for (const stat of STAT_KEYS) plan.green[stat] = { ...cleared.green[stat] };
    hpCalculator.counted = cleared.counted;
    cleared = null;
  }
  // Once something is counted again, Undo would throw it away, so it goes.
  $effect(() => {
    if (total) cleared = null;
  });
</script>

<div class="pair">
  <SimSection
    number={3}
    title="Skills"
    note={hpCalculator.counted || undefined}
  >
    {#snippet actions()}
      {#if skillCount}<Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onclick={oncount}
        >
          Count her {skillCount} skills
        </Button>{/if}
      {#if cleared && !total}<Button
          variant="ghost"
          size="sm"
          icon="back"
          onclick={undo}
        >
          Undo clear
        </Button>{:else}<Button
          variant="ghost"
          size="sm"
          disabled={!total}
          onclick={clear}
        >
          Clear
        </Button>{/if}
    {/snippet}
    <!-- How many of each kind and tier: a row per kind, a column per tier. -->
    <div
      class="table"
      role="group"
      aria-label="Skill counts"
    >
      <span></span>
      {#each TIERS as tier}<span class="tier {tier}">
          {tier[0]!.toUpperCase() + tier.slice(1)}
        </span>{/each}
      {#each KINDS as [key, kind, noun]}
        <span class="kind">{kind}</span>
        {#each TIERS as tier}
          <HpCounter
            compact
            {tier}
            icon={iconUrl(SKILL_ICONS[key][tier])}
            label={tier}
            name={tier[0]!.toUpperCase() +
              tier.slice(1) +
              ' ' +
              noun +
              (key === 'debuffs' ? 's from other runners' : ' skills')}
            detail={tierDetail(key, tier)}
            max={tier === 'unique' && key !== 'debuffs' ? 2 : undefined}
            bind:value={plan[key][tier]}
          />
        {/each}
      {/each}
      {#if plan.recovery.unique}
        <span class="kind">Unique heal</span>
        <div
          class="heal"
          role="group"
          aria-label="What the unique heals"
        >
          <SelectFieldSlim
            id="hp-unique-percent"
            label="Unique heal"
            hideLabel
            options={UNIQUE_RECOVERY_TIERS.map((tier) => ({
              value: String(tier),
              label: '+' + tier + '%'
            }))}
            value={String(plan.recovery.uniquePercent)}
            onchange={(value) => (plan.recovery.uniquePercent = Number(value))}
          />
          <SelectFieldSlim
            id="hp-unique-level"
            label="Unique level"
            hideLabel
            options={[1, 2, 3, 4, 5, 6].map((level) => ({
              value: String(level),
              label: 'Lv ' + level
            }))}
            value={String(plan.recovery.uniqueLevel)}
            onchange={(value) => (plan.recovery.uniqueLevel = Number(value))}
          />
          <small>{'+' + uniqueHeal + '% HP each'}</small>
        </div>
      {/if}
      {#if greens.length}
        <span class="kind">Greens</span>
        <div
          class="greens"
          role="group"
          aria-label="Green skills"
        >
          {#each greens as green (green.stat + green.tier)}
            {@const name = STAT_LABELS[green.stat] + (green.tier === 'gold' ? ' ◎' : ' ○')}
            <span class="green">
              <img
                src={iconUrl(SKILL_ICONS.green[green.stat])}
                alt=""
                width="18"
                height="18"
              />
              {name} +{GREEN_BONUS[green.tier]}{#if green.count > 1}<b>×{green.count}</b>{/if}
              <button
                type="button"
                aria-label={'Remove a ' + name + ' green skill'}
                onclick={() => (plan.green[green.stat][green.tier] -= 1)}
              >
                ×
              </button>
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </SimSection>

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
  /* Tier headings in the game's skill colors, as on the counters. */
  .tier.gold {
    color: #ffe08a;
  }
  .tier.unique {
    color: #ffd166;
  }
  :global(:root[data-theme='light']) .tier.gold,
  :global(:root[data-theme='light']) .tier.unique {
    color: #92400e;
  }
  /* The counts: a row per kind, a column per tier. */
  .table {
    --tile-height: 32px;
    display: grid;
    grid-template-columns: 76px repeat(3, minmax(0, 1fr));
    gap: 4px 6px;
    align-items: center;
  }
  .tier {
    font-size: 11px;
    font-weight: 650;
    text-align: center;
    color: var(--text-secondary);
  }
  .kind {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .heal,
  .greens {
    grid-column: span 3;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    min-height: 28px;
  }
  .heal :global(.select-field-slim) {
    flex: none;
  }
  .heal :global(button.select-control) {
    min-height: 28px;
    height: 28px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 12px;
  }
  .heal small {
    font-size: 11px;
    color: var(--text-secondary);
  }
  .green {
    --green: 76 175 80;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 2px 0 5px;
    border: 1px solid rgb(var(--green) / 0.55);
    border-radius: 6px;
    background: rgb(var(--green) / 0.12);
    color: #a5d6a7;
    font-size: 12px;
    font-weight: 650;
    white-space: nowrap;
  }
  :global(:root[data-theme='light']) .green {
    --green: 21 128 61;
    color: #15803d;
  }
  .green img {
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .green b {
    font-weight: 700;
  }
  .green button {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .green button:hover {
    background: rgb(var(--green) / 0.2);
  }
  .green button:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
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
    .table {
      --tile-height: 44px;
      grid-template-columns: 64px repeat(3, minmax(0, 1fr));
    }
    .situations li {
      min-height: 44px;
    }
    .seconds input,
    .heal :global(button.select-control) {
      height: 36px;
      min-height: 36px;
    }
    .green {
      height: 36px;
    }
    .green button {
      width: 32px;
      height: 32px;
    }
  }
</style>
