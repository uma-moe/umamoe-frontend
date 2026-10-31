<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Icon from '@/components/Icon.svelte';
  import { describeCourse, trackName } from '@/lib/game-data/racing/courses';
  import { cmGet, type Manifest } from '@/pages/competitive/champions-meeting/cm-data';
  import type { Snapshot } from '@/pages/competitive/hakuraku-types';
  import { loadCmBenchmark, type CmBenchmark } from '../courses/cm-benchmark';
  import SimulatorRunnerFace from '../reports/SimulatorRunnerFace.svelte';

  /**
   * The leading teams of a Champions Meeting, from CM Data: pick the CM, and see its course, conditions and the teams
   * as portraits. The race is on the CM's course, so the teams race where they were built to.
   */
  let {
    snapshotId = $bindable(''),
    benchmark = $bindable(),
    loading = $bindable(false),
    initialSnapshot = '',
    disabled = false,
    note = ''
  }: {
    snapshotId?: string;
    benchmark?: CmBenchmark;
    loading?: boolean;
    initialSnapshot?: string;
    disabled?: boolean;
    /** How the teams are raced, under them. */
    note?: string;
  } = $props();

  const uid = $props.id();
  let snapshots = $state.raw<Snapshot[]>([]),
    error = $state(''),
    attempt = $state(0);

  $effect(() => {
    attempt;
    const controller = new AbortController();
    error = '';
    loading = true;
    cmGet<Manifest>('/manifest', controller.signal)
      .then((manifest) => {
        if (controller.signal.aborted) return;
        if (!manifest.snapshots?.length) throw Error('No CM datasets are available.');
        snapshots = manifest.snapshots;
        if (!manifest.snapshots.some((snapshot) => snapshot.snapshotId === snapshotId))
          snapshotId =
            manifest.snapshots.find((snapshot) => snapshot.snapshotId === initialSnapshot)
              ?.snapshotId ?? manifest.snapshots[0]!.snapshotId;
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        error = reason instanceof Error ? reason.message : 'Could not load CM opponents.';
        loading = false;
      });

    return () => controller.abort();
  });

  $effect(() => {
    const snapshot = snapshots.find((item) => item.snapshotId === snapshotId);
    attempt;
    if (!snapshot) return;
    const controller = new AbortController();
    benchmark = undefined;
    loading = true;
    error = '';
    loadCmBenchmark(snapshot, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) benchmark = value;
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          error = reason instanceof Error ? reason.message : 'Could not load CM opponents.';
      })
      .finally(() => {
        if (!controller.signal.aborted) loading = false;
      });

    return () => controller.abort();
  });
</script>

<div class="cm-opponents">
  <div class="dataset">
    <SelectFieldSlim
      id="{uid}-dataset"
      label="CM dataset"
      hideLabel
      bind:value={snapshotId}
      {disabled}
      options={snapshots.map((snapshot) => ({
        value: snapshot.snapshotId,
        label: snapshot.label
      }))}
    />
    {#if benchmark}<a
        class="explore"
        href={'/competitive/cm-data?snapshot=' + encodeURIComponent(snapshotId) + '&tab=archetypes'}
      >
        Their builds <Icon
          name="external"
          size={12}
        />
      </a>{/if}
  </div>
  {#if loading && !benchmark}
    <Spinner
      centered
      minHeight="120px"
      label="Loading CM teams…"
    />
  {:else if error}
    <p
      class="note bad"
      role="alert"
    >
      {error}
      <Button
        size="sm"
        variant="secondary"
        onclick={() => attempt++}
      >
        Try again
      </Button>
    </p>
  {:else if benchmark}
    <p class="course">
      <strong>
        {trackName(benchmark.course.race_track_id)}
        {describeCourse(benchmark.course)}
      </strong>
      <span>{benchmark.snapshot.meta.conditions}</span>
    </p>
    <ol
      class="teams"
      aria-label="The {benchmark.teams.length} leading teams"
    >
      {#each benchmark.teams as team, index (team.id)}
        <li title={team.umas.map((uma) => uma.name).join(', ')}>
          <span class="number">{index + 1}</span>
          {#each team.umas as uma (uma.id)}
            <SimulatorRunnerFace
              cardId={uma.cardId}
              size={26}
            />
          {/each}
        </li>
      {/each}
    </ol>
    {#if note}<p class="note">{note}</p>{/if}
  {/if}
</div>

<style>
  .cm-opponents {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .dataset {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dataset > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }
  .dataset :global(button.select-control) {
    min-height: 34px;
    font-size: 13px;
  }
  .explore {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    white-space: nowrap;
  }
  .course {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    margin: 0;
    font-size: 13px;
  }
  .course span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .teams {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .teams li {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    background: var(--surface-2);
  }
  .number {
    width: 14px;
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .note.bad {
    color: var(--accent-error);
  }
</style>
