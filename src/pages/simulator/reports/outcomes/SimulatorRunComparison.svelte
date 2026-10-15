<script lang="ts">
  import type { Snippet } from 'svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { STAMINA_THRESHOLDS, SPURT_THRESHOLDS, type MarginUnit } from '../simulation-comparison';
  import RunComparisonMargins from './RunComparisonMargins.svelte';
  import RunComparisonPlaces from './RunComparisonPlaces.svelte';
  import RunComparisonTimes from './RunComparisonTimes.svelte';
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
  let finishView = $state('lengths');

  const finishOptions = [
    { value: 'lengths', label: 'Margin', title: 'Margin to the baseline' },
    { value: 'time', label: 'Time', title: 'Finish time' },
    { value: 'place', label: 'Place', title: 'Finishing position' }
  ];

  const seconds = $derived(unit === 'seconds');
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
          <RunComparisonMargins
            {result}
            {umas}
            {sources}
            {compact}
            onselect={(source) => (focus = source)}
            {reference}
            {distance}
            {unit}
          />
        {:else if finishView === 'time'}
          <RunComparisonTimes
            {result}
            {umas}
            {sources}
            {compact}
            onselect={(source) => (focus = source)}
          />
        {:else}
          <RunComparisonPlaces
            {result}
            {umas}
            {sources}
            {compact}
            onselect={(source) => (focus = source)}
          />
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
</style>
