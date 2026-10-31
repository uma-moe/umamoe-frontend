<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { reportNumber as n } from '../../simulation-report';
  import { staminaRaces } from '../stamina-report';
  import { staminaInput, whole } from './stamina-view';
  import type { MonteCarloResult } from '../../../simulator-repository';
  import type { MonteCarloInput } from '../../../requests/race-sim-request';
  import type { SimulatorUma } from '../../../simulator-uma';

  interface Props {
    result: MonteCarloResult;
    input?: MonteCarloInput;
    umas: SimulatorUma[];
    /** Runners on the HP chart, offered in the runner picker. */
    charted: number[];
    focus?: number;
    distance: number;
    oninspect: (source: number) => void;
    onreplay: (index: number) => void;
  }

  let { result, input, umas, charted, focus, distance, oninspect, onreplay }: Props = $props();

  const name = (source: number) => umas[source]!.name;

  // Race by race for one runner.
  let racesOpen = $state(false),
    page = $state(0);

  const races = $derived(
    racesOpen && focus !== undefined
      ? staminaRaces(result, focus, staminaInput(input, umas, focus), distance)
      : []
  );

  $effect(() => {
    void focus;
    page = 0;
  });

  const spurtLabel = (race: ReturnType<typeof staminaRaces>[number]) => {
    if (race.spurt === 'full') {
      return 'Full';
    }

    if (race.spurt === 'none') {
      return 'None';
    }

    if (race.spurt === 'late') {
      return (
        (race.recovered ? 'Full after recovery' : 'Slower or later') +
        (race.speedLoss || race.delay
          ? ' (' +
            [
              race.speedLoss ? '−' + n(race.speedLoss, 2) + ' m/s' : '',
              race.delay ? whole(race.delay) + ' m late' : ''
            ]
              .filter(Boolean)
              .join(', ') +
            ')'
          : '')
      );
    }

    return '—';
  };
</script>

<div class="section-gap">
  <Disclosure
    id="simulation-stamina-races"
    title="Race by race"
    description="Spurt check, recovery, debuffs and HP left in every race"
    icon="tune"
    bind:open={racesOpen}
  >
    {#if racesOpen && focus !== undefined}
      <div class="race-tools">
        <div class="runner-select">
          <SelectField
            id="simulation-stamina-runner"
            label="Runner"
            hideLabel
            value={String(focus)}
            onchange={(value) => oninspect(Number(value))}
            options={charted.map((source) => ({
              value: String(source),
              label: name(source) + ' (#' + (source + 1) + ')',
              image: portrait(umas[source]!.cardId)
            }))}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onclick={() => page--}
        >
          Previous
        </Button>
        <span>{page * 25 + 1}–{Math.min(result.runs, (page + 1) * 25)} of {result.runs}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={(page + 1) * 25 >= result.runs}
          onclick={() => page++}
        >
          Next
        </Button>
      </div>
      <div class="scroll">
        <table class="races">
          <thead>
            <tr>
              <th scope="col">Race</th>
              <th
                scope="col"
                class="num"
                title="HP when the late race starts"
              >
                HP at late race
              </th>
              <th
                scope="col"
                class="num"
                title="HP the full spurt from there costs"
              >
                Full spurt costs
              </th>
              <th scope="col">Last spurt</th>
              <th
                scope="col"
                class="num"
              >
                Recovered
              </th>
              <th
                scope="col"
                class="num"
              >
                Debuffs
              </th>
              <th
                scope="col"
                class="num"
              >
                HP left
              </th>
              <th
                scope="col"
                class="num"
                title="Stamina this race needed"
              >
                Stamina needed
              </th>
              <th scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {#each races.slice(page * 25, (page + 1) * 25) as race (race.run)}
              <tr>
                <td>
                  {race.run + 1}
                  <small>seed {result.seeds[race.run]}</small>
                </td>
                <td class="num">{whole(race.check)}</td>
                <td
                  class="num"
                  class:warn={race.check != null && race.need != null && race.need > race.check}
                >
                  {whole(race.need)}
                </td>
                <td class:warn={race.spurt !== 'full'}>{spurtLabel(race)}</td>
                <td class="num">{race.received ? '+' + whole(race.received) : '—'}</td>
                <td class="num">{race.drained ? '−' + whole(race.drained) : '—'}</td>
                <td
                  class="num"
                  class:warn={race.exhaustedAt != null}
                >
                  {race.exhaustedAt != null
                    ? 'Ran out, ' + whole(distance - race.exhaustedAt) + ' m to go'
                    : whole(race.finalHp)}
                </td>
                <td class="num">{whole(race.needed)}</td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onclick={() => onreplay(race.run)}
                  >
                    Watch
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Disclosure>
</div>

<style>
  @import './stamina-table.css';
  .race-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 11px;
    padding: 8px 0;
  }
  .runner-select {
    min-width: 220px;
  }
  .races td small {
    font-size: 10px;
    color: var(--text-secondary);
  }
  .races tbody tr {
    cursor: default;
  }
  .section-gap {
    min-width: 0;
  }
</style>
