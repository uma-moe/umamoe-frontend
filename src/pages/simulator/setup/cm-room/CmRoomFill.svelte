<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import { loadCmSummary } from '@/pages/competitive/champions-meeting/cm-data';
  import {
    LOBBY_SIZE,
    LOBBY_TEAMS
  } from '@/pages/competitive/champions-meeting/archetypes/lobby/lobby-slots';
  import {
    MAX_FIELD,
    isDrawnOpponent,
    roomRunners,
    seatCmRoom,
    simulatorRoster
  } from '../../simulator-roster.svelte';
  import { selectedCourse, simulatorSession } from '../../simulator-session.svelte';
  import {
    closestCmDataset,
    courseName,
    drawCmTeams,
    fillNotice,
    loadCmDatasets,
    meetingName,
    simulatorTeams,
    type CmDataset
  } from './cm-room';

  let { error = $bindable('') }: { error?: string } = $props();

  const lifetime = new AbortController();

  let datasets = $state.raw<CmDataset[]>(),
    datasetsError = $state(''),
    filling = $state(false);

  const course = $derived(selectedCourse());
  const dataset = $derived(datasets && course ? closestCmDataset(datasets, course) : undefined);
  const hasRoom = $derived(roomRunners().length + LOBBY_SIZE <= MAX_FIELD);
  const redraws = $derived(simulatorRoster.umas.some(isDrawnOpponent));
  const unavailableReason = $derived.by(() => {
    if (datasetsError) return datasetsError;
    if (!datasets) return 'Looking for CM data…';
    if (!course) return 'Choose a course first.';
    if (!dataset) return 'Hakuraku has no CM data yet.';
    if (!hasRoom) return 'Three teams need nine places. Remove runners to make room.';

    return '';
  });

  const description = $derived.by(() => {
    if (unavailableReason || !dataset || !course) return unavailableReason;

    const action = redraws ? 'Replace the drawn teams with three new' : 'Add three';
    const meeting = meetingName(dataset.snapshot);
    if (dataset.course.course_id === course.course_id)
      return action + ' real ' + meeting + ' teams from Hakuraku, each from a different player';

    return (
      action +
      ' real teams from ' +
      meeting +
      ' on ' +
      courseName(dataset.course) +
      ', the closest course with CM data'
    );
  });

  async function fill() {
    if (!dataset || !course || unavailableReason) return;

    const chosen = dataset;
    const raceCourse = course;
    filling = true;
    error = '';
    try {
      const [summary, teams] = await Promise.all([
        loadCmSummary(chosen.snapshot.snapshotId, lifetime.signal),
        drawCmTeams({
          snapshotId: chosen.snapshot.snapshotId,
          count: LOBBY_TEAMS,
          signal: lifetime.signal
        })
      ]);

      // A course picked during the draw may call for another meeting's teams.
      if (selectedCourse()?.course_id !== raceCourse.course_id) return;

      seatCmRoom(
        simulatorTeams({ teams, data: summary, course: chosen.course }),
        chosen.snapshot.snapshotId
      );
      simulatorSession.importNotice = fillNotice(chosen, raceCourse, teams.length);
    } catch (reason) {
      if (lifetime.signal.aborted) return;

      error = reason instanceof Error ? reason.message : 'Could not draw real CM teams.';
    } finally {
      filling = false;
    }
  }

  onMount(() => {
    loadCmDatasets(lifetime.signal)
      .then((value) => (datasets = value))
      .catch((reason: unknown) => {
        if (lifetime.signal.aborted) return;

        datasetsError =
          reason instanceof Error ? reason.message : 'CM data is unavailable. Reload to try again.';
      });

    return () => lifetime.abort();
  });
</script>

<span
  class="fill-control"
  title={description}
>
  <Button
    variant="secondary"
    size="sm"
    icon={redraws ? 'refresh' : 'users-add'}
    loading={filling}
    disabled={Boolean(unavailableReason) || filling}
    onclick={fill}
  >
    {redraws ? 'Redraw CM teams' : 'Add real CM teams'}
  </Button>
</span>

<style>
  .fill-control {
    display: flex;
  }
</style>
