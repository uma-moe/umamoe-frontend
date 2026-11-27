<script lang="ts">
  import { formatWinPoints } from '../scatter/scatter-scale';
  import {
    headlinePoint,
    mostWorth,
    type GatedSetup,
    type GatedValues,
    type SkillPoint
  } from '../skill-explorer-data';
  import type { SkillCostBreakdown, YMode } from '../skill-explorer-view';
  import { buildProcChart, type ProcBucket } from './proc-chart';
  import type { CountGate } from './skill-requirements';
  import type { SkillEffectDetails } from './skill-effects';
  import type { SkillProvider, SkillProviders } from './skill-providers';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import PickupImages from '@/components/cards/PickupImages.svelte';
  import SkillPoints from '@/components/game/SkillPoints.svelte';
  import SkillChipList, { type RelatedSkill } from '../SkillChipList.svelte';
  import ValueHelp from './ValueHelp.svelte';

  export interface TerrainSegment {
    start: number;
    end: number;
    label: string;
    color: string;
  }

  interface Props {
    point: SkillPoint;
    name: string;
    /** The skill's icon, or a unique's character. */
    image?: string;
    /** A unique's own skill icon, shown on its character. */
    badge?: string;
    description?: string;
    effects?: SkillEffectDetails[];
    spCost?: SkillCostBreakdown;
    providers?: SkillProviders;
    providerStatus?: 'loading' | 'ready' | 'error';
    /** What it needs to fire, in words: one list per alternative, any of which will do. */
    requirements: string[][];
    /** Skills that raise its value most beside it, on a single course. */
    partners: RelatedSkill[];
    /** For a skill gated on others' activations: the gate, and the scope's best skills that fire where it counts. */
    gate?: { gate: CountGate; feeders: RelatedSkill[] };
    /** Courses the scope averages; the skill fires on `point.courses` of them. */
    scopeCourses: number;
    /** A single course: its distance in metres and terrain, for a metre axis. */
    course?: { distance: number; terrain: TerrainSegment[] };
    /** In the build the values are measured in. */
    inBuild: boolean;
    /** The value the chart shows: in build, optimal or alone. */
    mode: YMode;
    /** True when chart values are scaled by activation rate (over all races) rather than per activation. */
    procScaled?: boolean;
    /** Skills named with their icons, for a gated skill's setup. */
    nameSkills: (skillIds: number[]) => RelatedSkill[];
    /** Evolved versions of this base gold skill valued in this scope. */
    evolutions?: RelatedSkill[];
    /** True when this skill's evolved versions are currently plotted on the chart. */
    evolutionsShown?: boolean;
    /** Toggle displaying this skill's evolved versions on the chart. */
    ontoggleevolutions?: () => void;
    /** Base gold skill that this evolved skill evolves from. */
    evolvesFrom?: RelatedSkill;
  }

  let {
    point,
    name,
    image,
    badge,
    description,
    effects = [],
    spCost,
    providers,
    providerStatus = 'ready',
    requirements,
    partners,
    gate,
    scopeCourses,
    course,
    inBuild,
    mode,
    procScaled = true,
    nameSkills,
    evolutions = [],
    evolutionsShown = false,
    ontoggleevolutions,
    evolvesFrom
  }: Props = $props();
  const sourcesId = $props.id();

  /** What each of the card's values means, behind its label's info button. */
  const VALUE_HELP = $derived({
    'In build': procScaled
      ? 'Win rate added to the reference build, normalized for proc rate (value × activation rate). The ± range is its 95% confidence or model error interval.'
      : 'Win rate added to the reference build when it activates (per proc). For a skill already in the build, what removing it costs. The ± range is its 95% interval per proc.',
    'Set up': procScaled
      ? 'Win rate added (normalized for proc rate) when up to four cheap skills open its window as early as they can. What those skills add on their own does not count.'
      : 'Win rate added per proc when up to four cheap skills open its window as early as they can. What those skills add on their own does not count.',
    Optimal: procScaled
      ? 'Win rate added (normalized for proc rate) activating at the best tested point of its window.'
      : 'Win rate added per proc when activating at the best tested point of its window.',
    Alone: procScaled
      ? 'Win rate added (normalized for proc rate) to a runner carrying no other skills.'
      : 'Win rate added per proc to a runner carrying no other skills.',
    Activates:
      'Share of races the skill activates in for runners of this style, and where it first activates on average.'
  });

  // The race phases in course sections, as in the simulator's course breakdown; the final spurt can begin when late race starts.
  const PHASES = [
    { label: 'Early', from: 0, to: 4 },
    { label: 'Mid race', from: 4, to: 16 },
    { label: 'Late race', from: 16, to: 24 }
  ];
  const WIDTH = 276;
  const spurt = finalSpurtSection(1);
  const NUMBER = /([+−-]?\d+(?:\.\d+)?%?)/;

  let hoveredSection = $state<number>();

  /** A passive (or a gate skill) takes hold at the start: its proc point says nothing, so no chart is drawn. */
  const fromGate = $derived(point.rate > 0 && point.mean * 24 < 0.05);
  /** Forced on every course: `rate` is how often it fires when forced; in her build it never does. */
  const neverFires = $derived(point.forced > 0 && point.forced >= point.courses);
  const perProcCi95 = $derived(
    point.ci95 !== undefined && point.ci95 > 0 ? point.ci95 / Math.max(point.rate, 0.05) : undefined
  );
  const chart = $derived(buildProcChart(point.sections, point.sectionWins, WIDTH, perProcCi95));
  const meanLabel = $derived(placeLabel(point.mean));
  const wrMeanLabel = $derived(chart.wrMean !== undefined ? placeLabel(chart.wrMean) : undefined);
  const iqrWindowLabel = $derived(
    chart.iqrBand !== undefined
      ? `${placeLabel(chart.iqrBand.p25)}–${placeLabel(chart.iqrBand.p75)}`
      : undefined
  );
  const hoveredBucket = $derived(
    hoveredSection !== undefined ? chart.buckets[hoveredSection] : undefined
  );

  /** A skill that waits on her other skills: forced to fire at points of its gate. */
  const gated = $derived(point.gated);
  const worthLabel = $derived(gated ? 'Set up' : 'In build');
  /** The forced points the Set up value is (its setup's, or with none its best) and the Optimal value is (its best). */
  const setUpPoint = $derived(gated ? headlinePoint(gated) : undefined);
  const bestPoint = $derived(mostWorth(gated?.points ?? []));

  /** Scales a per-activation value to match the chart's active proc-scaling mode (`plottedY`). */
  function displayedValue(perFiring: number, expected?: number): number {
    if (!procScaled) return perFiring;
    if (point.forced > 0) return perFiring * point.rate;
    if (expected !== undefined) return expected;
    if (point.win === 0) return 0;
    return perFiring * (point.expected / point.win);
  }

  const shownInBuild = $derived(displayedValue(point.win, point.expected));
  const shownOptimal = $derived(
    gated ? (procScaled ? gated.forced.expected : gated.forced.win) : undefined
  );
  const shownAlone = $derived(displayedValue(point.winAlone));
  const activeWorth = $derived(
    mode === 'alone'
      ? shownAlone
      : mode === 'forced' && shownOptimal !== undefined
        ? shownOptimal
        : shownInBuild
  );
  const wrPer100Sp = $derived(
    spCost !== undefined && spCost.total > 0 && !(gated && neverFires && mode !== 'alone')
      ? activeWorth * (100 / spCost.total)
      : undefined
  );
  const spCostNote = $derived.by(() => {
    if (spCost === undefined) return undefined;
    if (spCost.prerequisite > 0) {
      const origin = spCost.fromBase ? ' via base skill' : '';
      return `${spCost.total} SP total${origin} (${spCost.direct} + ${spCost.prerequisite} prereq), before hint discounts`;
    }
    if (spCost.fromBase) {
      return `${spCost.total} SP via base skill, before hint discounts`;
    }
    return 'Base cost before hint discounts';
  });
  const shownCi95 = $derived(
    point.ci95 !== undefined && point.ci95 > 0
      ? procScaled
        ? point.ci95
        : point.ci95 / Math.max(point.rate, 0.05)
      : undefined
  );
  const ciTooltip = $derived.by(() => {
    if (shownCi95 === undefined) return undefined;
    const iqrHalf = shownCi95 * (0.6745 / 1.96);
    const q1 = formatWinPoints(shownInBuild - iqrHalf);
    const q3 = formatWinPoints(shownInBuild + iqrHalf);
    const low = formatWinPoints(shownInBuild - shownCi95);
    const high = formatWinPoints(shownInBuild + shownCi95);
    const source = point.raced ? 'paired races' : 'model estimate';
    return `50% box: ${q1} to ${q3}, 95% extremes: ${low} to ${high} (${source})`;
  });
  const showAltScale = $derived(point.rate > 0 && point.rate < 0.995 && !neverFires);

  function percent(share: number): string {
    return `${Math.round(share * 100)}%`;
  }

  function bucketPercent(share: number): string {
    const pct = share * 100;
    return pct > 0 && pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
  }

  function placeLabel(share: number): string {
    return course ? `${Math.round(share * course.distance)} m` : `${Math.round(share * 100)}%`;
  }

  function bucketRangeLabel(bucket: ProcBucket): string {
    if (course) {
      const from = Math.round(bucket.startShare * course.distance);
      const to = Math.round(bucket.endShare * course.distance);
      return `${from}–${to} m`;
    }

    return `${Math.round(bucket.startShare * 100)}–${Math.round(bucket.endShare * 100)}%`;
  }

  function bucketTitle(bucket: ProcBucket): string {
    const base = `${bucketRangeLabel(bucket)}: ${bucketPercent(bucket.share)} proc`;
    if (!chart.hasSectionWins || !bucket.reliableWin || bucket.win === undefined) return base;

    return `${base}, ${formatWinPoints(bucket.win)} WR per proc`;
  }

  function barHeight(share: number): number {
    return (share / chart.peakShare) * (chart.height - (chart.top + 4));
  }

  function handleChartPointerMove(event: PointerEvent) {
    const svg = event.currentTarget as SVGSVGElement;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const share = (event.clientX - bounds.left) / bounds.width;
    const section = Math.floor(share * chart.buckets.length);
    hoveredSection = section >= 0 && section < chart.buckets.length ? section : undefined;
  }
</script>

<article class="skill-card">
  <header>
    {#if image}
      <span
        class="portrait"
        class:character={badge !== undefined}
      >
        <img
          src={image}
          alt=""
        />
        {#if badge}
          <img
            class="badge"
            src={badge}
            alt=""
          />
        {/if}
      </span>
    {/if}
    <div>
      <h3>{name}</h3>
      {#if description}
        <p>{@render numberText(description)}</p>
      {/if}
    </div>
  </header>

  <dl
    class="worth"
    class:gated={gated !== undefined}
  >
    <div class:shown={mode === 'value' || (mode === 'forced' && !gated)}>
      <dt>
        {worthLabel}<ValueHelp
          label={worthLabel}
          help={VALUE_HELP[worthLabel]}
        />
      </dt>
      {#if gated && neverFires}
        <dd>
          N/A
          <small>can't be set up</small>
        </dd>
      {:else}
        <dd
          class:positive={shownInBuild > 0}
          class:negative={shownInBuild < 0}
        >
          <span class="value-line">
            <span>{formatWinPoints(shownInBuild)}</span>
            {#if shownCi95 !== undefined}
              <span
                class="ci"
                class:model={!point.raced}
                title={ciTooltip}
              >
                ±{shownCi95.toFixed(1)}%
              </span>
            {/if}
          </span>
          <small>
            {#if setUpPoint}
              from {placeLabel(setUpPoint.at)}
            {:else if gated?.setup}
              mean {placeLabel(point.mean)}
            {:else if showAltScale}
              {procScaled
                ? `${formatWinPoints(point.win)} per proc`
                : `${formatWinPoints(point.expected)} normalized`}
            {:else}
              {procScaled ? 'proc-normalized' : 'per proc'}
            {/if}
          </small>
        </dd>
      {/if}
    </div>
    {#if gated && shownOptimal !== undefined}
      <div class:shown={mode === 'forced'}>
        <dt>
          Optimal<ValueHelp
            label="Optimal"
            help={VALUE_HELP.Optimal}
          />
        </dt>
        <dd
          class:positive={shownOptimal > 0}
          class:negative={shownOptimal < 0}
        >
          {formatWinPoints(shownOptimal)}
          <small>
            {bestPoint
              ? `from ${placeLabel(bestPoint.at)}`
              : `mean ${placeLabel(gated.forced.mean)}`}
          </small>
        </dd>
      </div>
    {/if}
    <div class:shown={mode === 'alone'}>
      <dt>
        Alone<ValueHelp
          label="Alone"
          help={VALUE_HELP.Alone}
        />
      </dt>
      <dd
        class:positive={shownAlone > 0}
        class:negative={shownAlone < 0}
      >
        {formatWinPoints(shownAlone)}
        <small>{procScaled ? 'normalized' : 'per proc'}</small>
      </dd>
    </div>
    <div>
      <dt>
        Activates<ValueHelp
          label="Activates"
          help={VALUE_HELP.Activates}
        />
      </dt>
      <dd>
        {#if fromGate}
          {point.rate >= 0.995 ? 'Always' : `${Math.round(point.rate * 100)}%`}
          <small>from the gate</small>
        {:else if neverFires}
          {Math.round(point.rate * 100)}%
          <small>{gated ? 'optimal' : 'if forced'}, mean {meanLabel}</small>
        {:else}
          {Math.round(point.rate * 100)}%
          <small>mean {meanLabel}</small>
        {/if}
      </dd>
    </div>
  </dl>

  <section class="effects">
    <div class="effect-heading">
      <h4>Base effect</h4>
      {#if spCost !== undefined}
        <span class="sp-meta">
          <span class="sp-cost">
            <SkillPoints
              value={spCost.total}
              note={spCostNote}
            />
          </span>
          {#if wrPer100Sp !== undefined}
            <span
              class="sp-efficiency"
              class:positive={wrPer100Sp > 0}
              class:negative={wrPer100Sp < 0}
              title={`Win rate per 100 SP (${procScaled ? 'proc-normalized' : 'per proc'}, before hint discounts)`}
            >
              {formatWinPoints(wrPer100Sp)} / 100 SP
            </span>
          {/if}
        </span>
      {/if}
    </div>
    {#each effects as alternative, index (alternative.effects.join('|') + alternative.duration)}
      {#if index > 0}
        <span class="or">or</span>
      {/if}
      <p>{@render numberText(alternative.effects.join(', '))}</p>
      <small>{@render numberText(alternative.duration)}</small>
    {:else}
      <p class="unavailable">No effect data.</p>
    {/each}
  </section>

  {#if point.forced > 0 && gated}
    <p class="forced">
      {point.courses > 1
        ? `Can't be set up on ${point.forced} of ${point.courses} courses, so those count its optimal timing.`
        : "Four cheap skills can't open its gate here, so only its optimal timing has a value."}
    </p>
  {:else if point.forced > 0}
    <p class="forced">
      Needs a different ground, weather or season{point.courses > 1
        ? ` on ${point.forced} of ${point.courses} courses`
        : ''}, so it is valued as if the race day had it.
    </p>
  {/if}

  {#if requirements.length > 0}
    <section class="needs">
      <h4>Needs</h4>
      {#each requirements as alternative, index (alternative.join('|'))}
        {#if index > 0}
          <span class="or">or</span>
        {/if}
        <p>{@render numberText(alternative.join(', '))}</p>
      {/each}
    </section>
  {/if}

  {#if !fromGate}
    {@render procChart()}
  {/if}

  {#if gated}
    {@render timing(gated)}
  {/if}

  {#if gated?.setup}
    {@render setUp(gated.setup)}
  {/if}

  {#if gate && !gated?.setup}
    <section class="related">
      <h4>Fed by</h4>
      <SkillChipList skills={gate.feeders} />
    </section>
  {/if}

  {#if evolutions.length > 0}
    <section class="related evolutions">
      <div class="effect-heading">
        <h4>{evolutions.length === 1 ? 'Evolved version' : 'Evolved versions'}</h4>
        {#if ontoggleevolutions}
          <button
            type="button"
            class="evo-toggle"
            class:active={evolutionsShown}
            aria-pressed={evolutionsShown}
            onclick={ontoggleevolutions}
          >
            {evolutionsShown ? 'Hide on chart' : 'Display evo'}
          </button>
        {/if}
      </div>
      <SkillChipList skills={evolutions} />
    </section>
  {/if}

  {#if evolvesFrom}
    <section class="related">
      <h4>Evolves from</h4>
      <SkillChipList skills={[evolvesFrom]} />
    </section>
  {/if}

  {#if partners.length > 0}
    <section class="related">
      <h4>Works best with</h4>
      <SkillChipList skills={partners} />
    </section>
  {/if}

  <section
    class="sources"
    aria-label="Skill sources"
  >
    {#if providers && providers.umas.length > 0}
      <div class="provider-group">
        <Disclosure
          id={`${sourcesId}-umas`}
          title="Uma trainees"
          description={`${providers.umas.length}`}
          compact
          open
        >
          {@render providerList(providers.umas, 'uma')}
        </Disclosure>
      </div>
    {/if}
    {#if providers && providers.supports.length > 0}
      <div class="provider-group">
        <Disclosure
          id={`${sourcesId}-supports`}
          title="Support cards"
          description={`${providers.supports.length}`}
          compact
          open
        >
          {@render providerList(providers.supports, 'support')}
        </Disclosure>
      </div>
    {/if}
    {#if providerStatus === 'loading'}
      <p>Loading skill sources…</p>
    {:else if providerStatus === 'error'}
      <p>Skill sources could not load.</p>
    {:else if !providers || (providers.umas.length === 0 && providers.supports.length === 0)}
      <p>No sources listed in this data.</p>
    {/if}
  </section>

  {#if inBuild || scopeCourses > 1}
    <ul class="notes">
      {#if inBuild}
        <li>Part of the reference build</li>
      {/if}
      {#if scopeCourses > 1}
        <li>Activates on {point.courses - point.forced} of {scopeCourses} courses</li>
      {/if}
    </ul>
  {/if}
</article>

{#snippet numberText(value: string)}
  {#each value.split(NUMBER) as part, index}
    <span class:number={index % 2 === 1}>{part}</span>
  {/each}
{/snippet}

{#snippet providerList(sources: SkillProvider[], kind: 'uma' | 'support')}
  <PickupImages
    items={sources.map((source) => ({
      id: String(source.id),
      name: source.name,
      subLabel: source.detail,
      image: source.image,
      gametoraUrl: source.href,
      kind: kind === 'uma' ? 'character' : 'support'
    }))}
    label={kind === 'uma' ? 'Uma trainees' : 'Support cards'}
    wrap
    grow
  />
{/snippet}

{#snippet timing(values: GatedValues)}
  {@const points = values.points ?? []}
  {@const highlighted = mode === 'forced' ? bestPoint : setUpPoint}
  <section class="timing">
    <h4>Forced gate timing</h4>
    {#if points.length > 0}
      <!-- Each timing is its own body, so the highlight strip covers the whole row. -->
      <table>
        <tbody class="group">
          <tr>
            <th scope="colgroup">Gate forced from</th>
            <th scope="col">Win rate</th>
            <th scope="col">Activates</th>
            <th scope="col">Mean activation</th>
          </tr>
        </tbody>
        {#each points as forcedPoint (forcedPoint.at)}
          {@const tags = [
            forcedPoint.at === values.setup?.at ? 'set up' : '',
            forcedPoint === bestPoint ? 'optimal' : ''
          ].filter(Boolean)}
          <tbody class:chosen={forcedPoint === highlighted}>
            <tr>
              <th scope="row">
                {placeLabel(forcedPoint.at)}
                {#if tags.length > 0}
                  <small
                    class="tag"
                    title={forcedPoint.raced
                      ? "Measured in fresh races, not the model's read"
                      : undefined}
                  >
                    {tags.join(', ')}
                  </small>
                {/if}
              </th>
              {@render numbers(forcedPoint.win, forcedPoint.rate, forcedPoint.mean)}
            </tr>
          </tbody>
        {/each}
      </table>
    {:else}
      <small class="legend">Pick one course to see timings.</small>
    {/if}
  </section>
{/snippet}

<!-- The skills bought so the gate opens where the Set up value fires from. -->
{#snippet setUp(setup: GatedSetup)}
  <section class="related set-up">
    <div class="effect-heading">
      <h4>Set up with</h4>
      {#if setup.feeders.length > 0}
        <span class="sp-cost">
          <SkillPoints
            value={setup.sp}
            note="Base cost of the skills added, before hint discounts"
          />
        </span>
      {/if}
    </div>
    {#if setup.feeders.length > 0}
      <SkillChipList skills={nameSkills(setup.feeders)} />
      <p class="note">They open its gate around {placeLabel(setup.at)}.</p>
    {:else}
      <p class="note">
        Nothing extra: the reference build opens its gate around {placeLabel(setup.at)}.
      </p>
    {/if}
  </section>
{/snippet}

{#snippet numbers(win: number, rate: number, mean: number)}
  <td
    class="value"
    class:positive={win > 0}
    class:negative={win < 0}
  >
    {formatWinPoints(win)}
  </td>
  <td>{percent(rate)}</td>
  <td>{placeLabel(mean)}</td>
{/snippet}

{#snippet procChart()}
  <figure class="procs">
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      role="img"
      aria-label={wrMeanLabel !== undefined
        ? `Where ${name} first activates and its win rate by bucket: avg proc at ${meanLabel}, avg WR proc at ${wrMeanLabel}`
        : `Where ${name} first activates: mean at ${meanLabel}`}
      onpointermove={handleChartPointerMove}
      onpointerleave={() => (hoveredSection = undefined)}
    >
      {#each PHASES as phase, index (phase.label)}
        <rect
          class={`phase phase-${index}`}
          x={phase.from * chart.sectionWidth}
          y="0"
          width={(phase.to - phase.from) * chart.sectionWidth}
          height={chart.height}
        />
        <text
          class="phase-label"
          x={phase.from * chart.sectionWidth + 3}
          y="9"
        >
          {phase.label}
        </text>
      {/each}

      {#if chart.hasSectionWins && chart.zeroY !== undefined && chart.minWin !== undefined && chart.minWin < 0}
        <line
          class="wr-zero"
          x1="0"
          x2={chart.width}
          y1={chart.zeroY}
          y2={chart.zeroY}
        />
      {/if}

      {#if hoveredBucket !== undefined}
        <rect
          class="bucket-highlight"
          x={hoveredBucket.section * chart.sectionWidth}
          y={chart.top}
          width={chart.sectionWidth}
          height={chart.height - chart.top}
        />
      {/if}

      <line
        class="spurt-boundary"
        x1={spurt.start * chart.width}
        x2={spurt.start * chart.width}
        y1={chart.top}
        y2={chart.height}
      >
        <title>{FINAL_SPURT_HELP}</title>
      </line>

      {#each chart.buckets as bucket (bucket.section)}
        <rect
          class="bar"
          class:with-wr={chart.hasSectionWins}
          class:hovered={hoveredSection === bucket.section}
          x={bucket.section * chart.sectionWidth + 1}
          y={chart.height - barHeight(bucket.share)}
          width={Math.max(1, chart.sectionWidth - 2)}
          height={barHeight(bucket.share)}
          rx="1.5"
        />
      {/each}

      {#if chart.hasSectionWins}
        {#each chart.wrBandPaths as bandPath (bandPath)}
          <path
            class="wr-band"
            d={bandPath}
          />
        {/each}

        {#each chart.wrSegments as segment (segment)}
          <polyline
            class="wr-line"
            points={segment}
          />
        {/each}

        {#if chart.maxWin !== undefined}
          <text
            class="wr-scale-label"
            x={chart.width - 2}
            y={chart.top + 8}
          >
            {formatWinPoints(chart.maxWin)}
          </text>
          {#if chart.minWin !== undefined && chart.minWin < 0}
            <text
              class="wr-scale-label"
              x={chart.width - 2}
              y={chart.height - 2}
            >
              {formatWinPoints(chart.minWin)}
            </text>
          {/if}
        {/if}

        {#if hoveredBucket?.reliableWin && hoveredBucket.winY !== undefined && hoveredBucket.win !== undefined}
          <circle
            class="wr-hover-dot"
            class:positive={hoveredBucket.win > 0}
            class:negative={hoveredBucket.win < 0}
            cx={hoveredBucket.centerX}
            cy={hoveredBucket.winY}
            r="2.8"
          />
        {/if}
      {/if}

      {#if point.rate > 0}
        <line
          class="mean"
          x1={point.mean * chart.width}
          x2={point.mean * chart.width}
          y1={chart.top - 1}
          y2={chart.height}
        />
      {/if}

      {#if chart.wrMean !== undefined && Math.abs(chart.wrMean - point.mean) >= 0.02}
        <line
          class="wr-mean"
          x1={chart.wrMean * chart.width}
          x2={chart.wrMean * chart.width}
          y1={chart.top - 1}
          y2={chart.height}
        />
      {/if}

      {#each chart.buckets as bucket (bucket.section)}
        <rect
          class="bucket-hit"
          x={bucket.section * chart.sectionWidth}
          y={chart.top}
          width={chart.sectionWidth}
          height={chart.height - chart.top}
        >
          <title>{bucketTitle(bucket)}</title>
        </rect>
      {/each}
    </svg>

    {#if course}
      <div
        class="terrain"
        aria-hidden="true"
      >
        {#each course.terrain as segment (segment.start)}
          <span
            style:left={`${(segment.start / course.distance) * 100}%`}
            style:width={`${((segment.end - segment.start) / course.distance) * 100}%`}
            style:background={segment.color}
          ></span>
        {/each}
      </div>
    {/if}

    <div class="proc-readout">
      {#if hoveredBucket !== undefined}
        <span>{bucketRangeLabel(hoveredBucket)}</span>
        <span>{bucketPercent(hoveredBucket.share)} proc</span>
        {#if chart.hasSectionWins && hoveredBucket.reliableWin && hoveredBucket.win !== undefined}
          <span
            class="wr-readout"
            class:positive={hoveredBucket.win > 0}
            class:negative={hoveredBucket.win < 0}
          >
            {formatWinPoints(hoveredBucket.win)} WR/proc
          </span>
        {/if}
      {:else}
        <span>Avg proc {meanLabel}</span>
        {#if iqrWindowLabel !== undefined}
          <span class="iqr-readout">50% {iqrWindowLabel}</span>
        {/if}
        {#if wrMeanLabel !== undefined}
          <span class="wr-avg-readout">Avg WR proc {wrMeanLabel}</span>
        {/if}
      {/if}
    </div>

    <figcaption>
      <span
        class="key spurt"
        title={FINAL_SPURT_HELP}
      >
        Spurt {placeLabel(spurt.start)}
      </span>
      <span class="key theory">Proc rate</span>
      {#if chart.hasSectionWins}
        <span class="key wr-curve">WR / proc</span>
      {/if}
      <span class="ends">
        <span>{placeLabel(0)}</span>
        <span>{course ? `${course.distance} m` : '100%'}</span>
      </span>
    </figcaption>
  </figure>
{/snippet}

<style>
  @import './skill-card.css';
</style>
