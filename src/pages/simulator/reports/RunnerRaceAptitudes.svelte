<script lang="ts">
  import AptitudeGrade from '@/components/game/AptitudeGrade.svelte';
  import { raceAptitudes } from './runner-profile';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import type { SimulatorUma } from '../simulator-uma';

  /** The surface, distance and style aptitudes this race applies; with a baseline, the ones that differ are marked. */
  let {
    uma,
    course,
    baseline
  }: { uma: SimulatorUma; course?: RaceCourse; baseline?: SimulatorUma } = $props();

  const aptitudes = $derived(raceAptitudes(uma, course));
  const before = $derived(baseline ? raceAptitudes(baseline, course) : undefined);
</script>

<span
  class="aptitudes"
  role="list"
  aria-label={uma.name + ' aptitudes for this race'}
>
  {#each aptitudes as aptitude, index (aptitude.key)}
    {@const previous = before?.[index]}
    {@const changedFrom =
      previous && (previous.grade !== aptitude.grade || previous.label !== aptitude.label)
        ? previous
        : undefined}
    <span
      role="listitem"
      class="aptitude"
      class:changed={changedFrom !== undefined}
      title={aptitude.label +
        ' ' +
        aptitude.grade +
        (changedFrom
          ? ' (current build: ' + changedFrom.label + ' ' + changedFrom.grade + ')'
          : '')}
    >
      {aptitude.label}
      <AptitudeGrade
        grade={aptitude.grade}
        label={aptitude.label}
        size="xs"
      />
    </span>
  {/each}
</span>

<style>
  /* Read like the stat line: label and grade together, in fixed columns so builds listed one under another line up. */
  .aptitudes {
    display: inline-grid;
    grid-template-columns: repeat(3, 66px);
    gap: 2px;
    white-space: nowrap;
  }
  .aptitude {
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 1px 3px;
    border-radius: 4px;
    font-size: 12px;
    line-height: 16px;
    color: var(--text-secondary);
  }
  .changed {
    background: rgb(var(--accent-primary-rgb) / 0.12);
    color: var(--accent-primary);
    font-weight: 600;
  }
</style>
