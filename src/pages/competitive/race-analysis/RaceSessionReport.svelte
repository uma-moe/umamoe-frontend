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
    <p>Styles, Umas, teams and skills across every loaded race.</p>
  </header>
  <SessionAnalysis
    captures={filtered}
    {skillNames}
    {pending}
    {onreplay}
  >
    {#snippet scope()}
      {#if groups.length > 1}
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
      {:else if filtered[0]}
        <div class="conditions">
          <strong>{groupLabel(filtered[0], courses)}</strong>
          <small>Every race shares this course and conditions</small>
        </div>
      {/if}
    {/snippet}
  </SessionAnalysis>
</section>

<style>
  .session-report {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px 12px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 11px;
  }
  .conditions {
    display: grid;
    gap: 1px;
    min-width: 0;
  }
  .conditions strong {
    overflow: hidden;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conditions small {
    color: var(--text-secondary);
    font-size: 11px;
  }
</style>
