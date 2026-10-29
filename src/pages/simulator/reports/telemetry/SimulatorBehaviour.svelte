<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { runnerColor, reportMean } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';

  /** How each runner's races play out besides speed and stamina: the start, her position, traffic and race states. */
  let {
    result,
    umas,
    sources
  }: { result: MonteCarloResult; umas: SimulatorUma[]; sources: number[] } = $props();

  const rows = $derived(
    sources.flatMap((source) => {
      const diagnostics = result.report?.runners.find(
        (row) => row.source_input_index === source
      )?.diagnostics;

      if (!diagnostics?.length) return [];
      const share = (
        test: (value: number) => boolean,
        key: 'blocked_seconds' | 'rushed_seconds' | 'spot_struggle_seconds' | 'duel_seconds'
      ) => (diagnostics.filter((row) => test(row[key])).length / diagnostics.length) * 100;

      const whenHappened = (key: 'blocked_seconds' | 'rushed_seconds') =>
        reportMean(diagnostics.filter((row) => row[key] > 0).map((row) => row[key]));

      return [
        {
          source,
          start: reportMean(diagnostics.map((row) => row.start_delay_seconds)),
          mid: reportMean(diagnostics.map((row) => row.mid_place ?? undefined)),
          late: reportMean(diagnostics.map((row) => row.late_place ?? undefined)),
          blocked: share((value) => value > 0, 'blocked_seconds'),
          blockedFor: whenHappened('blocked_seconds'),
          rushed: share((value) => value > 0, 'rushed_seconds'),
          rushedFor: whenHappened('rushed_seconds'),
          downhill: reportMean(diagnostics.map((row) => row.downhill_seconds)),
          fights: share((value) => value > 0, 'spot_struggle_seconds'),
          duels: share((value) => value > 0, 'duel_seconds')
        }
      ];
    })
  );

  // A state none of the runners shown ever gets into is left out rather than shown as a column of zeros.
  const states = $derived(
    (['fights', 'duels'] as const).filter((key) => rows.some((row) => row[key] > 0))
  );

  const stateLabel = { fights: 'Position fight', duels: 'Duel' } as const;
  const peak = (key: 'blocked' | 'rushed' | 'fights' | 'duels') =>
    Math.max(1, ...rows.map((row) => row[key]));

  const seconds = (value: number | undefined, digits = 1) =>
    value == null ? '—' : value.toFixed(digits) + ' s';

  const percent = (value: number) => {
    if (value <= 0) {
      return '0%';
    }

    if (value < 1) {
      return '<1%';
    }

    return Math.round(value) + '%';
  };

  const place = (value: number | undefined) => (value == null ? '—' : value.toFixed(1));
</script>

<ChartFrame
  id="simulation-behaviour"
  title="Race behaviour"
  slim
  state={rows.length ? 'ready' : 'empty'}
  emptyTitle="Race behaviour unavailable"
  emptyDetail="This batch did not collect race diagnostics. Run it again to see them."
  description={'How each runner’s ' +
    result.runs +
    ' races play out. Start is her average start delay. Position is her average place when the mid race and the late race begin; green means she usually moves up. Blocked and rushed show how often it happens and, in those races, for how long. Downhill is the average time in downhill mode, which saves HP. Position fights and duels show how often she gets into one, and are left out when none of the runners shown does. Bars compare the runners shown.'}
>
  <div class="scroll">
    <table>
      <thead>
        <tr>
          <th
            scope="col"
            class="runner"
          >
            Runner
          </th>
          <th
            scope="col"
            class="num"
          >
            Start
          </th>
          <th scope="col">
            Position <small>mid → late</small>
          </th>
          <th scope="col">
            Blocked <small>races · length</small>
          </th>
          <th scope="col">
            Rushed <small>races · length</small>
          </th>
          <th
            scope="col"
            class="num"
          >
            Downhill
          </th>
          {#each states as key (key)}<th scope="col">{stateLabel[key]}</th>{/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.source)}
          {@const moved = row.mid != null && row.late != null ? row.mid - row.late : 0}
          <tr style:--runner={runnerColor(row.source)}>
            <th
              scope="row"
              class="runner"
            >
              <span class="who">
                <i
                  class="dot"
                  aria-hidden="true"
                ></i>
                <SimulatorRunnerFace
                  cardId={umas[row.source]!.cardId}
                  size={22}
                />
                <span>{umas[row.source]!.name}</span>
              </span>
            </th>
            <td class="num">{seconds(row.start, 3)}</td>
            <td>
              <span class="move">
                {place(row.mid)}
                <i aria-hidden="true">→</i>
                <b
                  class:up={moved >= 0.25}
                  class:down={moved <= -0.25}
                >
                  {place(row.late)}
                </b>
              </span>
            </td>
            {#each [['blocked', 'blockedFor'], ['rushed', 'rushedFor']] as const as [key, length]}
              <td>
                <span class="meter-cell">
                  <i
                    class="meter"
                    aria-hidden="true"
                  >
                    <i style:width={(row[key] / peak(key)) * 100 + '%'}></i>
                  </i>
                  <b>{percent(row[key])}</b>
                  <small>{row[key] > 0 ? seconds(row[length]) : ''}</small>
                </span>
              </td>
            {/each}
            <td class="num">{seconds(row.downhill)}</td>
            {#each states as key (key)}
              <td>
                <span class="meter-cell">
                  <i
                    class="meter"
                    aria-hidden="true"
                  >
                    <i style:width={(row[key] / peak(key)) * 100 + '%'}></i>
                  </i>
                  <b>{percent(row[key])}</b>
                </span>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</ChartFrame>

<style>
  .scroll {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 0 8px;
    text-align: left;
    white-space: nowrap;
    font-weight: 400;
  }
  thead th {
    height: 22px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-secondary);
    vertical-align: bottom;
    padding-bottom: 4px;
  }
  thead small {
    font-weight: 400;
    opacity: 0.8;
  }
  tbody tr {
    border-top: 1px solid var(--border-subtle);
  }
  tbody th,
  tbody td {
    height: 30px;
  }
  .runner {
    width: 1px;
    padding-left: 4px;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 120px;
    font-weight: 600;
  }
  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--runner);
  }
  .num {
    text-align: right;
  }
  .move {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .move i {
    font-style: normal;
    color: var(--text-secondary);
  }
  .move b {
    font-weight: 650;
  }
  .up {
    color: var(--accent-success);
  }
  .down {
    color: var(--accent-error);
  }
  .meter-cell {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .meter-cell b {
    min-width: 34px;
    text-align: right;
    font-weight: 600;
  }
  .meter-cell small {
    font-size: 10px;
    color: var(--text-secondary);
    min-width: 36px;
  }
  .meter {
    position: relative;
    flex: 1;
    min-width: 40px;
    max-width: 140px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-3, var(--border-subtle));
    overflow: hidden;
  }
  .meter > i {
    position: absolute;
    inset-block: 0;
    left: 0;
    border-radius: 3px;
    background: var(--runner);
  }
  @media (max-width: 600px) {
    th,
    td {
      padding-inline: 4px;
    }
    .who {
      min-width: 96px;
    }
    .who :global(.face) {
      display: none;
    }
    .meter {
      min-width: 28px;
      max-width: 28px;
    }
  }
</style>
