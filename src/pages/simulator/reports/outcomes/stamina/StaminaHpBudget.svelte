<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorRunnerFace from '../../SimulatorRunnerFace.svelte';
  import { runnerColor } from '../../simulation-report';
  import { RACE_PHASES, type StaminaRunner } from '../stamina-report';
  import { whole } from './stamina-view';
  import type { SimulatorUma } from '../../../simulator-uma';

  interface Props {
    /** Runners with per-race HP telemetry. */
    budgets: StaminaRunner[];
    umas: SimulatorUma[];
    focus?: number;
    oninspect: (source: number) => void;
  }

  let { budgets, umas, focus, oninspect }: Props = $props();

  const name = (source: number) => umas[source]!.name;
  const supply = $derived(
    Math.max(1, ...budgets.map((row) => row.maxHp!.mean + (row.received ?? 0)))
  );

  const share = (value: number | undefined) => Math.max(0, ((value ?? 0) / supply) * 100) + '%';
  const segments = (row: StaminaRunner) => [
    ...RACE_PHASES.map((phase, index) => ({
      label: phase.name,
      value: row.phases![index]!,
      color: phase.color,
      kind: 'phase'
    })),
    {
      label: 'Debuffs from other runners',
      value: row.drained ?? 0,
      color: 'var(--accent-error)',
      kind: 'drain'
    },
    {
      label: 'Left at the finish',
      value: row.left ?? 0,
      color: 'var(--accent-success)',
      kind: 'left'
    }
  ];
</script>

<ChartFrame
  id="simulation-hp-budget"
  title="Where the HP goes"
  state={budgets.length ? 'ready' : 'empty'}
  emptyTitle="HP use unavailable"
  emptyDetail="This batch has no per-race telemetry. Run it again to see where the HP goes."
  description="Her average race from maximum HP to the finish. Each bar is the HP she had to spend: her maximum HP up to the white mark, plus whatever recovery skills gave back. The coloured parts are what each race phase used, what debuffs from other runners took, and what was left at the finish. All bars share one scale."
>
  <div class="budgets">
    <div
      class="budget head"
      aria-hidden="true"
    >
      <span>Runner</span>
      <span>HP used, by race phase</span>
      <span title="Maximum HP">Max</span>
      <span
        class="wide-only"
        title="Recovered from skills"
      >
        Recovered
      </span>
      <span
        class="wide-only"
        title="Taken by debuffs from other runners"
      >
        Debuffs
      </span>
      <span title="Left at the finish">Left</span>
    </div>
    {#each budgets as row (row.source)}
      <div
        class="budget"
        class:focused={row.source === focus}
        style:--runner-color={runnerColor(row.source)}
      >
        <button
          type="button"
          class="who"
          onclick={() => oninspect(row.source)}
          title={'Follow ' + name(row.source)}
        >
          <i
            class="dot"
            aria-hidden="true"
          ></i>
          <SimulatorRunnerFace
            cardId={umas[row.source]!.cardId}
            size={22}
          />
          <span>{name(row.source)}</span>
        </button>
        <div
          class="track"
          role="img"
          aria-label={name(row.source) +
            ': ' +
            segments(row)
              .map((part) => part.label + ' ' + whole(part.value) + ' HP')
              .join(', ') +
            ', from ' +
            whole(row.maxHp!.mean) +
            ' maximum HP and ' +
            whole(row.received) +
            ' HP recovered'}
        >
          <span
            class="fill"
            style:width={share(row.maxHp!.mean + (row.received ?? 0))}
          >
            {#each segments(row) as part}
              <i
                class={part.kind}
                style:flex-grow={Math.max(0, part.value)}
                style:background={part.kind === 'left' ? undefined : part.color}
                title={part.label + ': ' + whole(part.value) + ' HP'}
              ></i>
            {/each}
          </span>
          <i
            class="max"
            style:left={share(row.maxHp!.mean)}
            title={'Maximum HP ' + whole(row.maxHp!.mean)}
          ></i>
        </div>
        <span class="figure">{whole(row.maxHp!.mean)}</span>
        <span class="figure gain wide-only">+{whole(row.received)}</span>
        <span class="figure loss wide-only">−{whole(row.drained)}</span>
        <span class="figure">{whole(row.left)}</span>
      </div>
    {/each}
  </div>
  <p class="key">
    {#each RACE_PHASES as phase}
      <span>
        <i
          class="k-phase"
          style:background={phase.color}
        ></i>
        {phase.name}
      </span>
    {/each}
    <span>
      <i class="k-drain"></i>
      debuffs
    </span>
    <span>
      <i class="k-left"></i>
      left
    </span>
    <span>
      <i class="k-max"></i>
      max HP · then recovery
    </span>
  </p>
</ChartFrame>

<style>
  @import './stamina-key.css';
  @import './stamina-hp-budget.css';
</style>
