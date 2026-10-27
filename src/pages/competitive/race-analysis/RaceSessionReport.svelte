<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import type { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SessionAnalysis from '@/pages/competitive/sessions/SessionAnalysis.svelte';
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

  const headingId = $props.id();
</script>

<section
  class="session-report"
  aria-labelledby={headingId}
>
  <header>
    <h2 id={headingId}>Session analysis</h2>
    {#if groups.length > 1}
      <div class="scope">
        <SelectField
          id="race-group"
          label="Course and conditions"
          hideLabel
          options={[
            { value: 'all', label: `All conditions (${total} races)` },
            ...groups.map((item) => ({
              value: item.key,
              label:
                groupLabel(item.captures[0]!, courses) + ' (' + item.captures.length + ' races)'
            }))
          ]}
          bind:value={group}
        />
      </div>
    {:else if filtered[0]}
      <p title="Every race shares this course and conditions">
        {groupLabel(filtered[0], courses)}
      </p>
    {/if}
  </header>
  <SessionAnalysis
    captures={filtered}
    {skillNames}
    {pending}
    {onreplay}
  />
</section>

<style>
  .session-report {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    min-width: 0;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  p {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .scope {
    width: min(100%, 380px);
    --control-height: 30px;
  }
  .scope :global(.select-control) {
    font-size: 12px;
  }
</style>
