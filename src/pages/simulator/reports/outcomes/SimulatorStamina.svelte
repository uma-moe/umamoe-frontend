<script lang="ts">
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { runningStyleName } from '@/lib/race/race-display';
  import { theme } from '@/stores/theme';
  import { RUNNING_STYLES } from '../../setup/trainee';
  import {
    RACE_PHASES,
    hpByDistance,
    staminaRaces,
    staminaReport,
    type StaminaRunner
  } from './stamina-report';
  import { hpCourseChart } from '../report-chart';
  import { runnerColor, reportNumber as n } from '../simulation-report';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { MonteCarloInput } from '../../requests/race-sim-request';
  import type { SimulatorUma } from '../../simulator-uma';

  /** Stamina, the last spurt and where each runner's HP goes, measured over every race in the batch. */
  let {
    result,
    input,
    umas,
    sources,
    selected,
    distance,
    inspected = $bindable(),
    onreplay
  }: {
    result: MonteCarloResult;
    input?: MonteCarloInput;
    umas: SimulatorUma[];
    sources: number[];
    selected: number[];
    distance: number;
    inspected?: number;
    onreplay: (index: number) => void;
  } = $props();

  // The stamina estimate needs the stat, style and motivation the batch ran with.
  function runnerInput(source: number) {
    const runner = input?.runners.find((row) => row.source_input_index === source);
    if (runner) return runner;
    const trainee = umas[source]?.trainee;
    return trainee
      ? ({
          stats: { stamina: Number(trainee.stamina) },
          running_style: trainee.runningStyle,
          motivation: Number(trainee.motivation)
        } as Pick<NonNullable<typeof runner>, 'stats' | 'running_style' | 'motivation'>)
      : undefined;
  }

  const reports = $derived(
    new Map(
      umas.map((_, source) => [
        source,
        staminaReport(result, source, runnerInput(source), distance)
      ])
    )
  );
  const rows = $derived(sources.map((source) => reports.get(source)!).filter(Boolean));

  const name = (source: number) => umas[source]!.name;
  const style = (source: number) =>
    runningStyleName(
      RUNNING_STYLES.findIndex((value) => value === umas[source]!.trainee.runningStyle) + 1
    );
  const whole = (value: number | undefined) =>
    value == null || !Number.isFinite(value) ? '—' : Math.round(value).toLocaleString('en-US');
  const percent = (value: number | undefined) =>
    value == null ? '—' : (value > 0 && value < 1 ? '<1' : Math.round(value)) + '%';

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

  // Where the HP goes: one scale for every bar, so a longer bar is more HP.
  const budgets = $derived(rows.filter((row) => row.phases && row.maxHp));
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

  // HP over the course: picked runners, with the inspected runner's middle 80% shaded.
  const charted = $derived(
    selected
      .filter((source) => sources.includes(source))
      .concat(sources.filter((source) => !selected.includes(source)))
      .slice(0, 18)
  );
  const curves = $derived(
    charted.flatMap((source) => {
      const data = hpByDistance(result, source, distance);
      return data ? [{ source, name: name(source), x: data.x, bands: data.bands }] : [];
    })
  );
  const focus = $derived(
    inspected !== undefined && charted.includes(inspected) ? inspected : charted[0]
  );
  const chart = $derived(
    curves.length
      ? hpCourseChart(curves[0]!.x, curves, RACE_PHASES, $theme === 'dark', focus)
      : undefined
  );

  // Race by race for one runner.
  let racesOpen = $state(false),
    page = $state(0);

  const races = $derived(
    racesOpen && focus !== undefined
      ? staminaRaces(result, focus, runnerInput(focus), distance)
      : []
  );

  $effect(() => {
    void focus;
    page = 0;
  });

  const spurtLabel = (race: ReturnType<typeof staminaRaces>[number]) =>
    race.spurt === 'full'
      ? 'Full'
      : race.spurt === 'none'
        ? 'None'
        : race.spurt === 'late'
          ? (race.recovered ? 'Full after recovery' : 'Slower or later') +
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
          : '—';
</script>

<div class="stamina">
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
              onclick={() => (inspected = row.source)}
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

  <div class="pair">
    <ChartFrame
      id="simulation-hp-budget"
      title="Where the HP goes"
      slim
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
              onclick={() => (inspected = row.source)}
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

    <ChartFrame
      id="simulation-hp-course"
      title="HP over the race"
      slim
      state={chart ? 'ready' : 'empty'}
      emptyTitle="HP by distance unavailable"
      emptyDetail="This batch has no per-race telemetry. Run it again to see HP over the race."
      description="HP left as a share of maximum HP at every point of the course, for each runner's median race. The followed runner's middle 80% of races is shaded; select a runner in either table to follow her. The coloured bands are the race phases; the last spurt is decided when the late race starts."
    >
      {#if chart}
        <LazyEChartsSurface
          option={chart}
          label="HP left by course distance for each runner"
          height={Math.max(190, Math.min(260, 92 + budgets.length * 30))}
        />
      {/if}
    </ChartFrame>
  </div>

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
              onchange={(value) => (inspected = Number(value))}
              options={charted.map((source) => ({
                value: String(source),
                label: name(source) + ' · #' + (source + 1),
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
                    <small>· seed {result.seeds[race.run]}</small>
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
</div>

<style>
  @import './simulator-stamina.css';
</style>
