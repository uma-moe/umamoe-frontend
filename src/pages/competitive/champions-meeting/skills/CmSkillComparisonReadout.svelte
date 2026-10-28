<script lang="ts">
  import IconButton from '@/components/controls/IconButton.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RaceSkill from '../../runners/RaceSkill.svelte';
  import { number, pct } from '../cm-data';
  import { skillBucketMetrics, type BucketRange } from './cm-skill-analysis';
  import type { comparisonLines } from './cm-skill-comparison';
  import type { CmSkillDetails } from './cm-skill-details.svelte';

  let {
    series,
    details,
    style,
    cursor,
    range,
    skillName,
    onremove
  }: {
    series: ReturnType<typeof comparisonLines>['lines'];
    details: CmSkillDetails;
    style: string;
    cursor: number;
    range?: BucketRange;
    skillName: (id: number) => string;
    onremove: (id: number) => void;
  } = $props();

  const rows = $derived(
    series.map((entry) => ({
      ...entry,
      reading: entry.detail
        ? skillBucketMetrics(entry.detail.styles, style, range ?? { start: cursor, end: cursor })
        : undefined
    }))
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable results must be keyboard accessible.) -->
<div
  class="comparison-table"
  role="region"
  aria-label="Compared skills at inspected distance"
  tabindex="0"
>
  <table>
    <caption class="sr-only">
      Colour and line legend, activation counts and outcomes at the shared distance cursor
    </caption>
    <thead>
      <tr>
        <th scope="col">Skill</th>
        <th
          scope="col"
          title="Actual events at the inspected distance; percentage of this skill’s total events."
        >
          Activation events
        </th>
        <th scope="col">First activations</th>
        <th scope="col">Individual wins</th>
        <th scope="col">Team wins</th>
        <th scope="col">Mean / median</th>
        <th scope="col">Total events</th>
        <th scope="col"><span class="sr-only">Remove</span></th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.id)}
        <tr data-skill={row.id}>
          <th scope="row">
            <span class="legend-skill skill-chip-cell">
              <svg
                class="series-swatch"
                viewBox="0 0 28 10"
                aria-hidden="true"
              >
                <path
                  d="M0,5H28"
                  stroke={row.color}
                  stroke-dasharray={row.dash}
                />
              </svg>
              <RaceSkill
                id={row.id}
                fill
              />
            </span>
          </th>
          {#if details.errors[row.id]}
            <td
              colspan="6"
              class="load-state"
            >
              <span role="alert">{details.errors[row.id]}</span>
              <Button
                size="sm"
                variant="ghost"
                onclick={() => details.load(row.id)}
              >
                Retry {skillName(row.id)}
              </Button>
            </td>
          {:else if !row.reading}
            <td
              colspan="6"
              class="load-state"
            >
              <span role="status">Loading activation data…</span>
            </td>
          {:else}
            <td>
              {number(row.reading.procs)}
              <small>{pct(row.reading.procs / Math.max(1, row.total))}</small>
            </td>
            <td>{number(row.reading.entries)}</td>
            <td>
              {number(row.reading.wins)}
              <small>
                {row.reading.entries ? pct(row.reading.wins / row.reading.entries) : '—'}
              </small>
            </td>
            <td>
              {number(row.reading.teamWins)}
              <small>
                {row.reading.entries ? pct(row.reading.teamWins / row.reading.entries) : '—'}
              </small>
            </td>
            <td>
              {row.timing
                ? '~' +
                  number(Math.round(row.timing.mean)) +
                  ' / ~' +
                  number(Math.round(row.timing.median)) +
                  ' m'
                : '—'}
            </td>
            <td>{number(row.total)}</td>
          {/if}
          <td>
            <IconButton
              icon="close"
              size="sm"
              label={'Remove ' + skillName(row.id) + ' from comparison'}
              onclick={() => onremove(row.id)}
            />
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  @import '../../runners/skill-chip-cell.css';
  @import './cm-skill-comparison-readout.css';
</style>
