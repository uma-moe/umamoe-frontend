<script lang="ts">
  import type { raceDistanceSpread } from '@/lib/race/replay/race-ensemble';
  import { courseSegments, type Course } from '../replay-course';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  let {
    spread,
    low,
    high,
    width,
    distance,
    time,
    sampleCount,
    course,
    runnerName
  }: {
    spread: ReturnType<typeof raceDistanceSpread>;
    low: number;
    high: number;
    width: number;
    distance: number;
    time: number;
    sampleCount: number;
    course?: Course;
    runnerName: string;
  } = $props();

  let profileWidth = $state(600);

  const x = (value: number) => ((value - low) / (high - low)) * 600;
  const spurt = $derived(finalSpurtSection(distance));

  const bins = $derived.by(() => {
    const counts = Array<number>(36).fill(0);
    for (const value of spread.values)
      if (value >= low && value <= high)
        counts[Math.min(35, Math.floor(((value - low) / (high - low)) * 36))]!++;
    return counts;
  });

  const peak = $derived(Math.max(1, ...bins));
  const outline = $derived(
    'M0,66 ' +
      bins
        .map(
          (count, index) =>
            'L' + ((index + 0.5) / bins.length) * 600 + ',' + (66 - (count / peak) * 56)
        )
        .join(' ') +
      ' L600,66'
  );

  const rows = $derived([
    { label: 'Sections', segments: courseSegments(course).map((s) => ({ ...s, title: s.label })) },
    {
      label: 'Slopes',
      segments: (course?.slopes ?? [])
        .filter((s) => s.slope)
        .map((s) => ({
          start: s.start,
          end: s.start + s.length,
          label: (s.slope > 0 ? '↗ +' : '↘ ') + (s.slope / 10000).toFixed(1) + '%',
          title: s.slope > 0 ? 'Uphill' : 'Downhill',
          color: s.slope > 0 ? '#bd7581' : '#719bdd'
        }))
    },
    {
      label: 'Phase',
      segments: [
        { start: 0, end: distance / 6, label: 'Early', title: 'Early race', color: '#81c784' },
        {
          start: distance / 6,
          end: (distance * 2) / 3,
          label: 'Mid race',
          title: 'Mid race',
          color: '#69b7ee'
        },
        {
          start: (distance * 2) / 3,
          end: distance,
          label: 'Late race',
          title: 'Late race',
          color: '#c79be7'
        }
      ]
    }
  ]);
</script>

<div class="profile">
  <div class="view-heading">
    <h3>Course cross-section</h3>
    <span>{time.toFixed(1)} s elapsed</span>
  </div>
  <div class="profile-plot">
    <div class="row-labels">
      <span>
        Samples
        <small>{((peak / sampleCount) * 100).toFixed(0)}% peak</small>
      </span>
      {#each rows as row}
        <span>{row.label}</span>
      {/each}
    </div>
    <div
      class="distance-plot"
      bind:clientWidth={profileWidth}
    >
      <svg
        viewBox="0 0 600 174"
        preserveAspectRatio="none"
        role="img"
        aria-label={runnerName + ' sampled distance distribution with corners, slopes and phases'}
      >
        {#each [0, 0.25, 0.5, 0.75, 1] as tick}
          <line
            class="grid"
            x1={tick * 600}
            x2={tick * 600}
            y1="8"
            y2="166"
          />
        {/each}
        <path
          d={outline + ' Z'}
          class="sample-area"
        />
        {#each bins as count, index}
          {#if count}
            <rect
              class="sample-bin"
              x={(index * 600) / 36 + 0.5}
              y={66 - (count / peak) * 56}
              width={600 / 36 - 1}
              height={(count / peak) * 56}
            >
              <title>
                {Math.round(low + (index / 36) * width)}–{Math.round(
                  low + ((index + 1) / 36) * width
                )} m: {count} races ({((count / sampleCount) * 100).toFixed(1)}%)
              </title>
            </rect>
          {/if}
        {/each}
        <path
          d={outline}
          class="sample-curve"
        />
        <line
          class="profile-range outer"
          x1={x(spread.p10)}
          x2={x(spread.p90)}
          y1="77"
          y2="77"
        />
        <line
          class="profile-range inner"
          x1={x(spread.p25)}
          x2={x(spread.p75)}
          y1="77"
          y2="77"
        />
        {#each rows as row, index}
          <rect
            class="band-base"
            x="0"
            y={90 + index * 25}
            width="600"
            height="20"
          />
          {#each row.segments.filter((s) => s.end >= low && s.start <= high) as segment}
            {@const left = Math.max(0, x(segment.start))}{@const right = Math.min(
              600,
              x(segment.end)
            )}
            <rect
              x={left}
              y={90 + index * 25}
              width={right - left}
              height="20"
              fill={segment.color}
              fill-opacity=".2"
            >
              <title>
                {segment.title}: {Math.round(segment.start)}–{Math.round(segment.end)} m
              </title>
            </rect>
            <line
              x1={left}
              x2={right}
              y1={110 + index * 25}
              y2={110 + index * 25}
              stroke={segment.color}
              stroke-width="2"
            />
            {#if ((right - left) / 600) * profileWidth > 65}
              <text
                transform={'translate(' +
                  (left + right) / 2 +
                  ' ' +
                  (104 + index * 25) +
                  ') scale(' +
                  600 / Math.max(1, profileWidth) +
                  ' 1)'}
                text-anchor="middle"
              >
                {segment.label}
              </text>
            {/if}
          {/each}{#if row.label === 'Slopes' && !row.segments.some((s) => s.end >= low && s.start <= high)}
            <text
              transform={'translate(300 ' +
                (104 + index * 25) +
                ') scale(' +
                600 / Math.max(1, profileWidth) +
                ' 1)'}
              text-anchor="middle"
            >
              Level ground
            </text>
          {/if}
        {/each}
        <line
          class="mean-line"
          x1={x(spread.mean)}
          x2={x(spread.mean)}
          y1="4"
          y2="164"
        >
          <title>Mean distance {spread.mean.toFixed(1)} m</title>
        </line>
        {#if spurt.start >= low && spurt.start <= high}
          <line
            x1={x(spurt.start)}
            x2={x(spurt.start)}
            y1="4"
            y2="164"
            stroke={spurt.color}
            stroke-dasharray="4 3"
          >
            <title>Final spurt window from {Math.round(spurt.start)} m. {FINAL_SPURT_HELP}</title>
          </line>
        {/if}
        <circle
          cx={x(spread.mean)}
          cy="77"
          r="3"
          class="mean-dot"
        />
      </svg>
      <div class="axis">
        {#each [0, 0.25, 0.5, 0.75, 1] as tick}
          <span style:left={tick * 100 + '%'}>
            {Math.round(low + width * tick)} m
          </span>
        {/each}
      </div>
    </div>
  </div>
  <div
    class="course-overview"
    role="img"
    aria-label={'Inspected course window ' +
      Math.round(low) +
      ' to ' +
      Math.round(high) +
      ' metres of ' +
      distance +
      ' metres'}
  >
    <b
      class="spurt-window"
      style:left={(spurt.start / distance) * 100 + '%'}
      title={FINAL_SPURT_HELP}
    ></b>
    <span
      style:left={(low / distance) * 100 + '%'}
      style:width={(width / distance) * 100 + '%'}
    ></span>
    <i style:left={(spread.mean / distance) * 100 + '%'}></i>
  </div>
  <div class="overview-labels">
    <span>Start</span>
    <span>
      Final spurt from {Math.round(spurt.start).toLocaleString()} m · {distance.toLocaleString()} m course
    </span>
    <span>Finish</span>
  </div>
</div>

<style>
  @import './outcome-view-heading.css';
  @import './replay-outcome-profile.css';
</style>
