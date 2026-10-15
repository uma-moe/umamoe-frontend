<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorRunnerFace from '../../SimulatorRunnerFace.svelte';
  import { runnerColor, reportNumber as n } from '../../simulation-report';
  import type { StaminaRunner } from '../stamina-report';
  import { percent, runnerStyle, whole } from './stamina-view';
  import type { SimulatorUma } from '../../../simulator-uma';

  interface Props {
    rows: StaminaRunner[];
    umas: SimulatorUma[];
    selected: number[];
    /** The runner the HP chart and race list follow. */
    focus?: number;
    distance: number;
    oninspect: (source: number) => void;
  }

  let { rows, umas, selected, focus, distance, oninspect }: Props = $props();

  // Stamina lanes share one axis: every runner's stat and the middle 80% of what her races needed.
  let axisWidth = $state(400);

  const estimated = $derived(rows.filter((row) => row.needed && row.stamina !== undefined));
  const axis = $derived.by(() => {
    if (!estimated.length) return { min: 0, max: 1 };
    const low = Math.min(...estimated.flatMap((row) => [row.needed!.p10, row.stamina!])),
      high = Math.max(...estimated.flatMap((row) => [row.needed!.p90, row.stamina!])),
      pad = Math.max(10, (high - low) * 0.06);
    return { min: Math.max(0, low - pad), max: high + pad };
  });

  const x = (value: number) =>
    Math.max(0, Math.min(100, ((value - axis.min) / Math.max(1, axis.max - axis.min)) * 100));

  const ticks = $derived.by(() => {
    const span = axis.max - axis.min,
      most = Math.max(2, Math.min(6, Math.floor(axisWidth / 70))),
      step = [25, 50, 100, 200, 250, 500].find((value) => span / value <= most) ?? 500;
    return Array.from(
      { length: Math.floor(axis.max / step) - Math.ceil(axis.min / step) + 1 },
      (_, index) => (Math.ceil(axis.min / step) + index) * step
    ).filter((tick) => tick > axis.min && tick < axis.max);
  });

  const name = (source: number) => umas[source]!.name;
  const style = (source: number) => runnerStyle(umas[source]!);
  const short = (row: StaminaRunner) =>
    row.needed && row.stamina !== undefined && row.needed.median > row.stamina;
  const staminaTitle = (row: StaminaRunner) =>
    row.needed
      ? name(row.source) +
        ': stamina ' +
        whole(row.stamina) +
        ' · the median race needs ' +
        whole(row.needed.median) +
        ' · 80% of races need ' +
        whole(row.needed.p10) +
        '–' +
        whole(row.needed.p90) +
        ' · enough in ' +
        percent(row.covered) +
        ' of races'
      : '';
  const spurtTitle = (row: StaminaRunner) =>
    row.spurt
      ? name(row.source) +
        ': full spurt from the late-race start in ' +
        percent(row.spurt.full) +
        ' · slower or later in ' +
        percent(row.spurt.late) +
        (row.spurt.late > 0
          ? ' (' +
            [
              row.speedLoss ? '−' + n(row.speedLoss, 2) + ' m/s' : '',
              row.delay ? whole(row.delay) + ' m late' : ''
            ]
              .filter(Boolean)
              .join(', ') +
            (row.spurt.recovered > 0
              ? '; recovery made ' + percent(row.spurt.recovered) + ' full later'
              : '') +
            ')'
          : '') +
        ' · none in ' +
        percent(row.spurt.none)
      : '';
</script>

<ChartFrame
  id="simulation-stamina-table"
  title="Stamina & last spurt"
  slim
  description="Stamina needed is the stamina at which a race would have allowed her full last spurt from the start of the late race and still reached the finish with HP left. It changes from race to race with skills, recovery, debuffs from other runners and rushing, so each lane shows the middle 80% of her races as a bar, the median race as a dot and her own stamina as a line: when the line sits right of the bar, nearly every race has enough. Full spurt splits her races into a full spurt from the late-race start, a slower or later spurt because HP was short, and no spurt."
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
            title="Her stamina stat"
          >
            Stamina
          </th>
          <th
            scope="col"
            class="num"
            title="Stamina the median race needed"
          >
            Needs
          </th>
          <th
            scope="col"
            class="lane-cell wide-only"
          >
            Stamina needed in each race
          </th>
          <th
            scope="col"
            class="num wide-only"
            title="Races her stamina covers"
          >
            Enough in
          </th>
          <th
            scope="col"
            class="spurt-cell"
          >
            Full spurt
          </th>
          <th
            scope="col"
            class="num"
            title="Races where her HP ran out before the finish"
          >
            HP ran out
          </th>
          <th
            scope="col"
            class="num wide-only"
            title="Average HP left at the finish"
          >
            HP left
          </th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.source)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions (Row clicks only follow a runner; the HP chart and the race list also pick runners.) -->
          <tr
            class:picked={selected.includes(row.source)}
            class:focused={row.source === focus}
            style:--runner-color={runnerColor(row.source)}
            onclick={() => oninspect(row.source)}
          >
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
                  size={24}
                />
                <span class="name">
                  <strong>{name(row.source)}</strong>
                  <small>#{row.source + 1} · {style(row.source)}</small>
                </span>
              </span>
            </th>
            <td class="num"><strong>{whole(row.stamina)}</strong></td>
            <td
              class="num"
              class:warn={short(row)}
              title={staminaTitle(row)}
            >
              {whole(row.needed?.median)}
            </td>
            <td class="lane-cell wide-only">
              {#if row.needed && row.stamina !== undefined}
                <div
                  class="lane"
                  role="img"
                  aria-label={staminaTitle(row)}
                  title={staminaTitle(row)}
                >
                  {#each ticks as tick}
                    <i
                      class="grid"
                      style:left={x(tick) + '%'}
                    ></i>
                  {/each}
                  <i
                    class="bar"
                    style:left={x(row.needed.p10) + '%'}
                    style:width={Math.max(0.4, x(row.needed.p90) - x(row.needed.p10)) + '%'}
                  ></i>
                  <i
                    class="mid"
                    style:left={x(row.needed.median) + '%'}
                  ></i>
                  <i
                    class="own"
                    style:left={x(row.stamina) + '%'}
                  ></i>
                </div>
              {:else}
                <span class="muted">Not measured</span>
              {/if}
            </td>
            <td class="num wide-only">{percent(row.covered)}</td>
            <td
              class="spurt-cell"
              title={spurtTitle(row)}
            >
              {#if row.spurt}
                <span class="spurt">
                  <span
                    class="spurt-bar"
                    role="img"
                    aria-label={spurtTitle(row)}
                  >
                    <i
                      class="full"
                      style:width={row.spurt.full + '%'}
                    ></i>
                    <i
                      class="late"
                      style:width={row.spurt.late + '%'}
                    ></i>
                    <i
                      class="none"
                      style:width={row.spurt.none + '%'}
                    ></i>
                  </span>
                  <b>{percent(row.spurt.full)}</b>
                </span>
              {:else}
                —
              {/if}
            </td>
            <td
              class="num"
              title={row.exhausted?.at
                ? 'Usually at ' +
                  whole(row.exhausted.at) +
                  ' m, ' +
                  whole(distance - row.exhausted.at) +
                  ' m before the finish'
                : ''}
            >
              {percent(row.exhausted?.rate)}{#if row.exhausted?.at}
                <small class="wide-only">
                  · {whole(distance - row.exhausted.at)} m to go
                </small>
              {/if}
            </td>
            <td
              class="num wide-only"
              title={row.finishPercent
                ? 'Median ' +
                  whole(row.finishHp?.median) +
                  ' HP (' +
                  n(row.finishPercent.median, 1) +
                  '% of her maximum)'
                : ''}
            >
              {whole(row.left)}
            </td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="wide-only">
        <tr>
          <td></td>
          <td></td>
          <td></td>
          <td class="lane-cell">
            <div
              class="axis"
              aria-hidden="true"
              bind:clientWidth={axisWidth}
            >
              {#each ticks as tick}
                <span
                  style:left={x(tick) + '%'}
                  class:end={x(tick) > 94}
                  class:start={x(tick) < 6}
                >
                  {tick.toLocaleString('en-US')}
                </span>
              {/each}
            </div>
          </td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>
  <p class="key stamina-key">
    <span class="wide-only">
      <i class="k-bar"></i>
      80% of her races need this much
    </span>
    <span class="wide-only">
      <i class="k-mid"></i>
      median race
    </span>
    <span class="wide-only">
      <i class="k-own"></i>
      her stamina
    </span>
    <span>
      <i class="k-full"></i>
      full spurt
    </span>
    <span>
      <i class="k-late"></i>
      slower or later
    </span>
    <span>
      <i class="k-none"></i>
      none
    </span>
  </p>
</ChartFrame>

<style>
  @import './stamina-table.css';
  @import './stamina-key.css';
  @import './stamina-spurt-table.css';
</style>
