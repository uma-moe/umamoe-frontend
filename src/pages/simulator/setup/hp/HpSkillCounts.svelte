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
    uniqueRecovery,
    type HpPlan
  } from './hp-plan';

  /** How many skills of each kind and tier she has, with Clear and a way back. */
  interface Props {
    /** How many skills her full build has, to count them into the plan. */
    skillCount?: number;
    oncount?: () => void;
  }

  let { skillCount = 0, oncount }: Props = $props();

  const plan = $derived(hpCalculator.plan);
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

<style>
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
  /* Touch-sized on a phone. */
  @media (max-width: 767px) {
    .table {
      --tile-height: 44px;
      grid-template-columns: 64px repeat(3, minmax(0, 1fr));
    }
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
