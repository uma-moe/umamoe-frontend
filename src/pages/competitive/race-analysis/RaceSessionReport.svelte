<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import type { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import SelectField from '@/components/controls/SelectField.svelte';
  import RaceStatistics from '@/pages/competitive/sessions/RaceStatistics.svelte';
  import type { CourseData } from './replay/replay-course';
  import { groupLabel } from './race-session';

  let {
    total,
    groups,
    filtered,
    group = $bindable(),
    courses,
    skillNames,
    pending,
    onreplay
  }: {
    total: number;
    groups: ReturnType<typeof groupMultiRaceCaptures>;
    filtered: ParsedRaceCapture[];
    group: string;
    courses: CourseData | undefined;
    skillNames: Map<number, string>;
    pending: boolean;
    onreplay: (index: number, runner?: number, time?: number) => void;
  } = $props();
</script>

<section
  class="session-analysis"
  aria-label="Session statistics"
>
  <header class="section-heading">
    <div>
      <h2>Session analysis</h2>
      <p>
        Compare runners, styles, builds and skills across {filtered.length} races.
      </p>
    </div>
    {#if groups.length > 1}
      <SelectField
        id="race-group"
        label="Course and conditions"
        hideLabel
        options={[
          { value: 'all', label: `All conditions (${total} races)` },
          ...groups.map((item) => ({
            value: item.key,
            label: groupLabel(item.captures[0]!, courses) + ' (' + item.captures.length + ' races)'
          }))
        ]}
        bind:value={group}
      />
    {/if}
  </header>
  <div class="session-simulation">
    <span>
      {filtered.filter((c) => c.detailed).length} / {filtered.length} races with detailed simulation
    </span>
  </div>
  <RaceStatistics
    captures={filtered}
    {skillNames}
    {pending}
    {onreplay}
  />
</section>

<style>
  .session-analysis {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-block: 8px;
  }
  .section-heading :global(.field) {
    width: 340px;
    max-width: 100%;
  }
  h2 {
    font-size: 20px;
    margin: 0;
  }
  p {
    font-size: 12px;
    margin: 4px 0 0;
    color: var(--text-secondary);
    line-height: 1.6;
  }
  .session-simulation {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 11px;
    color: var(--text-secondary);
  }
  @media (max-width: 767px) {
    .section-heading {
      flex-wrap: wrap;
    }
    .section-heading :global(.field) {
      width: 100%;
    }
  }
</style>
