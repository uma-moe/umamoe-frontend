<script lang="ts">
  import type { PlanMarker } from '../../setup/hp/hp-plan';
  import type { StaminaDistribution } from '../../simulator-repository';
  import { RACE_PHASES } from './stamina-report';

  /**
   * Her HP across the course over every race: the middle line is the median race at each point, the shaded band the
   * middle 80% of races. A dashed line marks the median spurt decision, with what a full spurt needs there. Under it,
   * the stretches where her skills and the situations between runners can happen.
   */
  let {
    distance,
    markers,
    band,
    max,
    decision,
    stale = false,
    height = 132
  }: {
    distance: number;
    markers: PlanMarker[];
    /** HP percentiles at evenly spaced distances. */
    band?: StaminaDistribution['hp_band'];
    /** Maximum HP, the top of the plot. */
    max?: number;
    /** The median race's spurt decision. */
    decision?: { at: number; check: number; need: number };
    stale?: boolean;
    /** Of the plot, in pixels. */
    height?: number;
  } = $props();

  let width = $state(340);
  const TOP = 14;
  const bottom = $derived(height - 2);
  const metres = (value: number) => Math.round(value).toLocaleString() + ' m';
  const hp = (value: number) => Math.round(value).toLocaleString();
  const x = (at: number) => Math.min(1, Math.max(0, at / distance)) * width;
  const top = $derived(max && max > 0 ? max : 1);
  const y = (value: number) => TOP + (1 - Math.max(0, Math.min(top, value)) / top) * (bottom - TOP);

  const line = (values: number[]) =>
    band!.distance_m
      .map((at, index) => (index ? 'L' : 'M') + x(at) + ' ' + y(values[index]!))
      .join(' ');
  const median = $derived(band ? line(band.p50) : '');
  const area = $derived(
    band
      ? line(band.p90) +
          ' ' +
          band.distance_m
            .map((at, index) => [at, band.p10[index]!] as const)
            .reverse()
            .map(([at, value]) => 'L' + x(at) + ' ' + y(value))
            .join(' ') +
          ' Z'
      : ''
  );
  const short = $derived(decision ? decision.need - decision.check : 0);
  // One thin lane per kind that has something, in race order of where they happen.
  const LANES = [
    ['state', 'Between runners'],
    ['recovery', 'Recovery'],
    ['debuff', 'HP debuffs'],
    ['accel', 'Acceleration'],
    ['speed', 'Speed']
  ] as const;
  const lanes = $derived(
    LANES.map(([kind, name]) => ({
      kind,
      name,
      items: markers.filter((marker) => marker.kind === kind)
    })).filter((lane) => lane.items.length)
  );
</script>

<figure
  class="hp-chart"
  class:stale={stale && !!band}
>
  <!-- Before a result there is no line to draw, so only where things happen shows. -->
  {#if band}
    <div
      class="plot"
      bind:clientWidth={width}
    >
      <div
        class="phases"
        aria-hidden="true"
      >
        {#each RACE_PHASES as phase, index}<span
            style:left={phase.start * 100 + '%'}
            style:width={((RACE_PHASES[index + 1]?.start ?? 1) - phase.start) * 100 + '%'}
            style:--phase={phase.color}
          >
            {phase.name}
          </span>{/each}
      </div>
      <svg
        viewBox="0 0 {width} {height}"
        {width}
        {height}
        role="img"
        aria-label={band && max
          ? 'HP across the race: ' +
            hp(max) +
            ' at the start' +
            (decision
              ? ', ' +
                hp(decision.check) +
                ' at the median spurt decision with ' +
                hp(decision.need) +
                ' needed'
              : '') +
            ', ' +
            hp(band.p50.at(-1) ?? 0) +
            ' left at the finish in the median race and ' +
            hp(band.p10.at(-1) ?? 0) +
            ' in the lowest tenth'
          : 'Her HP across the race shows after calculating'}
      >
        <line
          class="grid"
          x1="0"
          x2={width}
          y1={TOP}
          y2={TOP}
        />
        <line
          class="grid base"
          x1="0"
          x2={width}
          y1={bottom}
          y2={bottom}
        />
        {#if band}
          <path
            class="band"
            d={area}
          />
          {#if decision}
            <line
              class="decision"
              x1={x(decision.at)}
              x2={x(decision.at)}
              y1={TOP - 4}
              y2={bottom}
            />
            {#if short > 0}<line
                class="gap"
                x1={x(decision.at)}
                x2={x(decision.at)}
                y1={y(decision.need)}
                y2={y(decision.check)}
              />{/if}
            <line
              class="need"
              x1={x(decision.at) - 7}
              x2={x(decision.at) + 7}
              y1={y(decision.need)}
              y2={y(decision.need)}
            />
          {/if}
          <path
            class="line"
            d={median}
          />
          {#if decision}<circle
              class="dot"
              class:short={short > 0}
              cx={x(decision.at)}
              cy={y(decision.check)}
              r="3.5"
            />{/if}
        {/if}
        <text
          class="tick"
          x="2"
          y={TOP - 4}
        >
          {band && max ? hp(max) + ' HP' : 'Max HP'}
        </text>
      </svg>
      {#if band && decision}
        <span
          class="label"
          class:right={x(decision.at) > width * 0.55}
          style:left={x(decision.at) + 'px'}
          style:top={Math.min(y(decision.check), y(decision.need)) + 12 + 'px'}
        >
          <strong class:short={short > 0}>{hp(decision.check)}</strong>
          of {hp(decision.need)}
        </span>
      {/if}
    </div>{/if}
  {#if lanes.length}<div
      class="lanes"
      role="group"
      aria-label="Where it happens on the course"
    >
      {#each lanes as lane (lane.kind)}<div
          class="lane"
          title={lane.name}
        >
          {#each lane.items as marker}<i
              class={marker.kind}
              style:left={(marker.at / distance) * 100 + '%'}
              style:width={Math.max(0.8, ((marker.length ?? 0) / distance) * 100) + '%'}
              role="img"
              aria-label={marker.label + ', from ' + metres(marker.at)}
              title={marker.label}
            ></i>{/each}
        </div>{/each}
    </div>{/if}
  <div class="axis">
    <span>0 m</span>
    <span
      class="mid"
      style:left={(2 / 3) * 100 + '%'}
    >
      {metres((distance * 2) / 3)}
    </span>
    <span>{metres(distance)}</span>
  </div>
  {#if band || lanes.length}<figcaption class="key">
      {#if band}<span class="k-line">median race</span>
        <span class="k-band">8 in 10 races</span>{/if}
      {#each lanes as lane (lane.kind)}<span class="k-{lane.kind}">{lane.name}</span>{/each}
    </figcaption>{/if}
</figure>

<style>
  .hp-chart {
    display: grid;
    gap: 3px;
    min-width: 0;
    margin: 0;
  }
  .plot {
    position: relative;
    min-width: 0;
    padding-top: 16px;
  }
  .phases {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .phases span {
    position: absolute;
    top: 0;
    bottom: 0;
    padding: 0 4px;
    overflow: hidden;
    border-left: 1px solid color-mix(in srgb, var(--phase) 40%, transparent);
    background: linear-gradient(
      color-mix(in srgb, var(--phase) 16%, transparent) 0 16px,
      color-mix(in srgb, var(--phase) 4%, transparent) 16px
    );
    font-size: 10px;
    line-height: 16px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  svg {
    position: relative;
    display: block;
    overflow: visible;
  }
  .grid {
    stroke: var(--border-subtle);
    stroke-dasharray: 3 3;
  }
  .grid.base {
    stroke: var(--border-primary);
    stroke-dasharray: none;
  }
  .tick {
    fill: var(--text-secondary);
    font-size: 10px;
  }
  .band {
    fill: rgb(var(--accent-primary-rgb) / 0.2);
  }
  .line {
    fill: none;
    stroke: var(--accent-primary);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .decision {
    stroke: var(--text-secondary);
    stroke-dasharray: 2 3;
  }
  .need {
    stroke: var(--text-primary);
    stroke-width: 2;
  }
  .gap {
    stroke: var(--accent-error);
    stroke-width: 3;
  }
  .dot {
    fill: var(--accent-primary);
    stroke: var(--surface-1);
    stroke-width: 2;
  }
  .dot.short {
    fill: var(--accent-error);
  }
  .label {
    position: absolute;
    padding: 0 3px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--surface-1) 85%, transparent);
    transform: translateX(6px);
    font-size: 11px;
    color: var(--text-secondary);
    white-space: nowrap;
    pointer-events: none;
  }
  .label.right {
    transform: translateX(calc(-100% - 6px));
  }
  .label strong {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .label strong.short {
    color: var(--accent-error);
  }
  .stale svg,
  .stale .label {
    opacity: 0.45;
  }
  /* A thin lane per kind: where it can happen, as a stretch of the course. */
  .lanes {
    display: grid;
    gap: 2px;
    margin-top: 2px;
  }
  .lane {
    position: relative;
    height: 5px;
    border-radius: 2px;
    background: var(--surface-2);
  }
  .lane i {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: 2px;
  }
  .recovery,
  .k-recovery:before {
    background: var(--accent-success);
  }
  .debuff,
  .k-debuff:before {
    background: var(--accent-error);
  }
  .speed,
  .k-speed:before {
    background: var(--accent-primary);
  }
  .accel,
  .k-accel:before {
    background: var(--accent-purple, #bd91d1);
  }
  .state,
  .k-state:before {
    background: repeating-linear-gradient(
      135deg,
      var(--accent-warning) 0 3px,
      color-mix(in srgb, var(--accent-warning) 35%, transparent) 3px 6px
    );
  }
  .axis {
    position: relative;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .axis .mid {
    position: absolute;
    transform: translateX(-50%);
  }
  .key {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  .key span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .key span:before {
    content: '';
    width: 10px;
    height: 5px;
    border-radius: 2px;
  }
  .key .k-line:before {
    height: 2px;
    background: var(--accent-primary);
  }
  .key .k-band:before {
    height: 8px;
    background: rgb(var(--accent-primary-rgb) / 0.2);
  }
</style>
