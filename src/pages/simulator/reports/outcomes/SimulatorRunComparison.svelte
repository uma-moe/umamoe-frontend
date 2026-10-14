<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import SimulatorDistributionRow, {
    type BinTone,
    type DistributionTile
  } from '../SimulatorDistributionRow.svelte';
  import { formatRaceTime } from '@/lib/race/race-display';
  import { simulatorSampleSummary } from '../../simulator-results';
  import { runnerColor } from '../simulation-report';
  import {
    finishTimeAxis,
    formatMarginValue,
    headToHead,
    histogramCounts,
    marginAxis,
    placeAxis,
    runnerOutcome,
    signedLengths,
    signedSeconds,
    STAMINA_THRESHOLDS,
    SPURT_THRESHOLDS,
    type HeadToHead,
    type HistogramAxis,
    type MarginUnit
  } from '../simulation-comparison';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';

  /** The overview section: the course timeline (lead) and who finishes ahead of the baseline. */
  let {
    result,
    umas,
    course,
    sources,
    reference,
    scope,
    unit = 'lengths',
    focus = $bindable(),
    lead,
    children
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    course?: CourseCatalogEntry;
    sources: number[];
    reference: number;
    scope: 'picked' | 'field';
    /** Leading unit for margins; the other unit follows in brackets. */
    unit?: MarginUnit;
    focus?: number;
    /** Content shown first in the section, directly under its heading. */
    lead?: Snippet;
    children?: Snippet;
  } = $props();

  const field = $derived(scope === 'field');
  // Up to four picked runners each get a full row of figures and a tall histogram; the whole field gets one table line each.
  const compact = $derived(field || sources.length > 4);
  const distance = $derived(course?.distance ?? result.report?.distance_m.at(-1) ?? 2000);

  const label = (source: number) => umas[source]!.name;
  const person = (source: number) => ({
    name: label(source),
    cardId: umas[source]!.cardId,
    color: runnerColor(source)
  });
  const percent = (value: number) =>
    (value >= 99.95 || value <= 0.05 ? value.toFixed(0) : value.toFixed(1)) + '%';
  const races = (count: number) =>
    count.toLocaleString('en-US') +
    ' race' +
    (count === 1 ? '' : 's') +
    ' (' +
    ((count / Math.max(1, result.runs)) * 100).toFixed(1) +
    '%)';
  const ordinal = (place: number) =>
    place +
    (place % 100 >= 11 && place % 100 <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th'));

  let finishView = $state('lengths');

  const finishOptions = [
    { value: 'lengths', label: 'Margin', title: 'Margin to the baseline' },
    { value: 'time', label: 'Time', title: 'Finish time' },
    { value: 'place', label: 'Place', title: 'Finishing position' }
  ];

  const seconds = $derived(unit === 'seconds');
  // Margin: every runner against the baseline in the same race. Seconds are binned as seconds ahead so right stays ahead.
  const pairs = $derived(
    new Map(
      sources
        .filter((source) => source !== reference)
        .map((source) => [source, headToHead(result, source, reference, distance)])
    )
  );
  const marginRows = $derived(
    [...pairs.values()].sort((a, b) => (compact ? b.lengths.median - a.lengths.median : 0))
  );
  const marginScale = $derived(marginAxis([...pairs.values()], unit));

  const margin = (pair: HeadToHead, key: 'min' | 'max' | 'mean' | 'median') =>
    formatMarginValue(pair.lengths[key], pair.seconds[key], unit, 2);
  const otherUnit = (pair: HeadToHead, key: 'min' | 'max' | 'mean' | 'median') =>
    seconds ? signedLengths(pair.lengths[key], 2) : signedSeconds(-pair.seconds[key]);
  const ahead = (value: number) => (value > 1e-9 ? ('ahead' as const) : ('' as const));

  function marginTiles(pair: HeadToHead): DistributionTile[] {
    if (compact)
      return [
        {
          label: 'Ahead in',
          value: percent(pair.rate),
          detail: pair.ahead + ' of ' + pair.runs + ' races',
          tone: pair.rate > 50 ? 'ahead' : ''
        },
        {
          label: 'Median',
          value: margin(pair, 'median'),
          detail: otherUnit(pair, 'median'),
          tone: ahead(pair.lengths.median)
        }
      ];
    return [
      ...(
        [
          ['Worst', 'min'],
          ['Best', 'max'],
          ['Mean', 'mean'],
          ['Median', 'median']
        ] as const
      ).map(([name, key]) => ({
        label: name,
        value: margin(pair, key),
        detail: otherUnit(pair, key),
        tone: ahead(pair.lengths[key]),
        main: key === 'median'
      })),
      {
        label: 'Ahead in',
        value: pair.rate.toFixed(1) + '%',
        detail: pair.ahead.toLocaleString('en-US') + ' of ' + pair.runs.toLocaleString('en-US'),
        tone: pair.rate > 50 ? 'ahead' : ''
      }
    ];
  }

  const marginAmount = (value: number) =>
    seconds
      ? Math.abs(value).toFixed(Math.abs(value * 100 - Math.round(value * 100)) > 1e-6 ? 3 : 2) +
        ' s'
      : Number(Math.abs(value).toFixed(2)) + ' L';

  function marginTitle(pair: HeadToHead, counts: number[], index: number) {
    const from = marginScale.min + index * marginScale.width,
      to = from + marginScale.width,
      front = from + to > 0;
    const near = Math.min(Math.abs(from), Math.abs(to)),
      far = Math.max(Math.abs(from), Math.abs(to));
    const open = (index === 0 && !front) || (index === marginScale.bins - 1 && front);
    return (
      (front ? label(pair.source) : label(reference)) +
      ' ahead by ' +
      (open
        ? marginAmount(near) + ' or more'
        : (near === 0 ? 'up to ' : marginAmount(near).replace(/ [Ls]$/, '') + '–') +
          marginAmount(far)) +
      ': ' +
      races(counts[index]!)
    );
  }

  const marginTick = (value: number) =>
    Math.abs(value) < 1e-9
      ? '0'
      : seconds
        ? signedSeconds(
            -value,
            marginScale.ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) ? 2 : 1
          )
        : signedLengths(value, marginScale.ticks.some((t) => !Number.isInteger(t)) ? 1 : 0);

  // Time: every runner's own finish times on one clock.
  const times = $derived(
    new Map(
      sources.map((source) => [
        source,
        result.finish_times.map((row) => row[source]!).filter(Number.isFinite)
      ])
    )
  );
  const timeSummaries = $derived(
    new Map([...times].map(([source, values]) => [source, simulatorSampleSummary(values)!]))
  );
  const timeScale = $derived(finishTimeAxis([...times.values()].flat()));
  const timeRows = $derived(
    compact
      ? [...sources].sort((a, b) => timeSummaries.get(a)!.median - timeSummaries.get(b)!.median)
      : sources
  );
  const bestTime = $derived(
    Math.min(...[...timeSummaries.values()].map((summary) => summary.median))
  );

  const behindBest = (value: number) =>
    value - bestTime < 0.005 ? 'fastest' : '+' + (value - bestTime).toFixed(2) + ' s';
  const clock = (value: number) => formatRaceTime(value, 2);

  function timeTiles(source: number): DistributionTile[] {
    const summary = timeSummaries.get(source)!;
    if (compact)
      return [
        { label: 'Median', value: clock(summary.median), detail: 'average ' + clock(summary.mean) },
        {
          label: 'vs best',
          value: behindBest(summary.median),
          detail: 'behind the fastest median shown'
        }
      ];
    return [
      { label: 'Fastest', value: clock(summary.min) },
      { label: 'Slowest', value: clock(summary.max) },
      { label: 'Mean', value: clock(summary.mean) },
      {
        label: 'Median',
        value: clock(summary.median),
        detail: behindBest(summary.median),
        main: true
      },
      {
        label: 'Spread',
        value: (summary.p90 - summary.p10).toFixed(2) + ' s',
        detail: 'middle 80%'
      }
    ];
  }

  const timeTick = (value: number) =>
    formatRaceTime(
      value,
      timeScale.ticks.some((t) => Math.abs(t * 10 - Math.round(t * 10)) > 1e-6)
        ? 2
        : timeScale.ticks.some((t) => !Number.isInteger(t))
          ? 1
          : 0
    );

  function timeTitle(counts: number[], index: number) {
    const from = timeScale.min + index * timeScale.width,
      to = from + timeScale.width;
    return (
      (index === 0
        ? clock(to) + ' or faster'
        : index === timeScale.bins - 1
          ? clock(from) + ' or slower'
          : clock(from) + '–' + clock(to)) +
      ': ' +
      races(counts[index]!)
    );
  }

  // Place: how often each runner finishes in each position.
  const places = $derived(
    new Map(
      sources.map((source) => [
        source,
        result.finish_order.map((order) => order.indexOf(source) + 1).filter((place) => place > 0)
      ])
    )
  );
  const placeScale = $derived(placeAxis(umas.length));
  const outcomes = $derived(
    new Map(sources.map((source) => [source, runnerOutcome(result, source)]))
  );
  const placeRows = $derived(
    compact
      ? [...sources].sort(
          (a, b) =>
            outcomes.get(b)!.winRate - outcomes.get(a)!.winRate ||
            outcomes.get(b)!.top3 - outcomes.get(a)!.top3
        )
      : sources
  );

  function placeTiles(source: number): DistributionTile[] {
    const outcome = outcomes.get(source)!,
      summary = simulatorSampleSummary(places.get(source)!)!;
    const wins = {
      label: 'Wins',
      value: percent(outcome.winRate),
      detail: Math.round((outcome.winRate / 100) * result.runs) + ' of ' + result.runs,
      tone: outcome.winRate > 0 ? ('ahead' as const) : ('' as const)
    };
    if (compact) return [wins, { label: 'Top 3', value: percent(outcome.top3) }];
    return [
      wins,
      { label: 'Top 3', value: percent(outcome.top3) },
      { label: 'Average', value: summary.mean.toFixed(2) },
      { label: 'Median', value: ordinal(Math.round(summary.median)), main: true },
      {
        label: 'Worst',
        value: ordinal(summary.max),
        detail: percent(
          (places.get(source)!.filter((place) => place === summary.max).length / result.runs) * 100
        )
      }
    ];
  }

  const placeTone = (index: number): BinTone =>
    index === 0 ? 'strong' : index < 3 ? 'runner' : 'muted';
  const counts = (samples: number[], scale: HistogramAxis) => histogramCounts(samples, scale);

  const unitNote = $derived(
    seconds
      ? 'in seconds as a finish-time difference (negative = earlier)'
      : 'in lengths (1 L = 2.5 m)'
  );
  const finishDescription = $derived(
    finishView === 'lengths'
      ? 'Each runner against ' +
          label(reference) +
          ' over the same races, ' +
          unitNote +
          '. ' +
          (compact
            ? 'Ahead in is how often she finishes ahead; median is the typical margin.'
            : 'The tiles give her worst and best race, the average and the typical (median) race, and how often she finishes ahead.') +
          ' Each bar counts the races that ended with that margin: bars right of zero are races she finished ahead, in her colour, and bars left of zero are races ' +
          label(reference) +
          ' finished ahead, in grey. The dashed line marks the median. Hover a bar for its races.'
      : finishView === 'time'
        ? 'Each runner’s own finish times over every race, on one shared clock: left is faster. ' +
          (compact
            ? 'Median is the typical race; vs best is how far her median is behind the fastest median shown.'
            : 'The tiles give her fastest and slowest race, the average, the typical (median) race and the spread: how many seconds the middle 80% of her races cover.') +
          ' The dashed line marks the median. Hover a bar for its races.'
        : 'How often each runner finishes in each position, 1st on the left. ' +
          (compact
            ? ''
            : 'The tiles give her wins, top-three finishes, average and typical (median) position and her worst finish. ') +
          'Wins are drawn strongest, the other top-three places in her colour and the rest in grey. Hover a bar for its races.'
  );
</script>

<section
  id="simulation-verdict"
  class="report-section"
  aria-label="At a glance"
>
  <header class="section-heading">
    <div>
      <h2>The race at a glance</h2>
      <p>
        {field ? 'Every runner on the same terms' : 'Your picked runners'} over the same {result.runs.toLocaleString()}
        races. Margins are measured from the baseline, {label(reference)}.
      </p>
    </div>
    <span class="section-tools">
      <InspectPopover
        label="How the outcomes are decided"
        align="end"
      >
        {#snippet trigger()}
          <span class="help">
            <Icon
              name="info"
              size={15}
            />
          </span>
        {/snippet}
        <h3>Reading the outcomes</h3>
        <p>
          HP lasts is green when she still has HP at the finish in at least {STAMINA_THRESHOLDS.safe}%
          of races and amber from {STAMINA_THRESHOLDS.marginal}%. Full spurt is green from {SPURT_THRESHOLDS.safe}%
          and amber from {SPURT_THRESHOLDS.marginal}%.
        </p>
        <p>
          Head-to-head compares two runners inside the same race. It reads “level with” while the
          95% interval of how often she finishes ahead still contains 50%.
        </p>
        <p>
          Margins are in lengths: 1 L = 2.5 m. The baseline runner is zero; every other runner is
          measured from her.
        </p>
      </InspectPopover>
    </span>
  </header>
  {@render lead?.()}
  <div
    id="simulation-finish"
    class="finish-card"
    aria-label="Finish comparison"
    role="region"
  >
    <ChartFrame
      id="simulation-finish-chart"
      title="Who finishes ahead"
      description={finishDescription}
      slim
    >
      {#snippet actions()}
        <SegmentedControl
          compact
          label="Finish comparison view"
          options={finishOptions}
          bind:value={finishView}
        />
      {/snippet}
      <div
        class="rows"
        class:compact
      >
        {#if finishView === 'lengths'}
          {#each marginRows as pair, index (pair.source)}
            {@const binned = counts(seconds ? pair.secondsSamples : pair.samples, marginScale)}
            <SimulatorDistributionRow
              runner={person(pair.source)}
              tiles={marginTiles(pair)}
              counts={binned}
              axis={marginScale}
              tick={marginTick}
              zero
              binTitle={(bin) => marginTitle(pair, binned, bin)}
              binTone={(bin) =>
                marginScale.min + (bin + 0.5) * marginScale.width > 0 ? 'runner' : 'muted'}
              marker={{
                value: seconds ? pair.seconds.median : pair.lengths.median,
                label: 'Median ' + margin(pair, 'median')
              }}
              sides={{
                left: label(reference) + ' ahead',
                leftCard: umas[reference]!.cardId,
                right: label(pair.source) + ' ahead',
                rightCard: umas[pair.source]!.cardId
              }}
              {compact}
              header={index === 0}
              footer={!compact || index === marginRows.length - 1}
              chartLabel={'Margin to ' + label(reference) + ' in every race'}
              onselect={() => (focus = pair.source)}
            >
              {#snippet heading()}
                <i
                  class="dot"
                  style:background={runnerColor(pair.source)}
                  aria-hidden="true"
                ></i>
                <SimulatorRunnerFace
                  cardId={umas[pair.source]!.cardId}
                  size={18}
                />
                <strong>{label(pair.source)}</strong>
                <span
                  class={pair.call === 'ahead' ? 'clean' : pair.call === 'behind' ? 'error' : ''}
                >
                  {pair.call === 'close'
                    ? 'is level with'
                    : pair.call === 'ahead'
                      ? 'beats'
                      : 'loses to'}
                </span>
                <SimulatorRunnerFace
                  cardId={umas[reference]!.cardId}
                  size={18}
                />
                <strong>{label(reference)}</strong>
              {/snippet}
            </SimulatorDistributionRow>
          {:else}
            <p class="empty">
              Pick a second runner to compare her with {label(reference)}.
            </p>
          {/each}
        {:else if finishView === 'time'}
          {#each timeRows as source, index (source)}
            {@const binned = counts(times.get(source)!, timeScale)}
            <SimulatorDistributionRow
              runner={person(source)}
              tiles={timeTiles(source)}
              counts={binned}
              axis={timeScale}
              tick={timeTick}
              binTitle={(bin) => timeTitle(binned, bin)}
              marker={{
                value: timeSummaries.get(source)!.median,
                label: 'Median ' + clock(timeSummaries.get(source)!.median)
              }}
              sides={{ left: 'faster', right: 'slower' }}
              {compact}
              header={index === 0}
              footer={!compact || index === timeRows.length - 1}
              chartLabel="Finish time in every race"
              onselect={() => (focus = source)}
            >
              {#snippet heading()}
                <i
                  class="dot"
                  style:background={runnerColor(source)}
                  aria-hidden="true"
                ></i>
                <SimulatorRunnerFace
                  cardId={umas[source]!.cardId}
                  size={18}
                />
                <strong>{label(source)}</strong>
                <span class="muted">
                  {behindBest(timeSummaries.get(source)!.median) === 'fastest'
                    ? 'fastest typical race'
                    : behindBest(timeSummaries.get(source)!.median) +
                      ' behind the fastest typical race'}
                </span>
              {/snippet}
            </SimulatorDistributionRow>
          {/each}
        {:else}
          {#each placeRows as source, index (source)}
            {@const binned = counts(places.get(source)!, placeScale)}
            <SimulatorDistributionRow
              runner={person(source)}
              tiles={placeTiles(source)}
              counts={binned}
              axis={placeScale}
              tick={(value) => String(value)}
              binTitle={(bin) => ordinal(bin + 1) + ': ' + races(binned[bin]!)}
              binTone={placeTone}
              sides={{ left: 'better', right: 'worse' }}
              {compact}
              header={index === 0}
              footer={!compact || index === placeRows.length - 1}
              chartLabel="Finishing position in every race"
              onselect={() => (focus = source)}
            >
              {#snippet heading()}
                <i
                  class="dot"
                  style:background={runnerColor(source)}
                  aria-hidden="true"
                ></i>
                <SimulatorRunnerFace
                  cardId={umas[source]!.cardId}
                  size={18}
                />
                <strong>{label(source)}</strong>
                <span class="muted">
                  wins {percent(outcomes.get(source)!.winRate)} of races
                </span>
              {/snippet}
            </SimulatorDistributionRow>
          {/each}
        {/if}
      </div>
    </ChartFrame>
  </div>
  {@render children?.()}
</section>

<style>
  .help {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    color: var(--text-secondary);
  }
  .finish-card {
    min-width: 0;
  }
  .rows {
    display: grid;
    min-width: 0;
  }
  .dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
  }
  .muted {
    color: var(--text-secondary);
  }
  .empty {
    margin: 8px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .clean {
    color: var(--accent-success);
  }
  .error {
    color: var(--accent-error);
  }
</style>
