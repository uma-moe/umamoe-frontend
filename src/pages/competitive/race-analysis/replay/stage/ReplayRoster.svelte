<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import {
    formatRaceTime,
    runningStyleName,
    hpRemainingColor
  } from '@/lib/race/replay/race-display';
  import Icon from '@/components/Icon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait, styleColors } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayPacemakerBadge from '../ReplayPacemakerBadge.svelte';

  let {
    replay,
    showBlocked,
    overlay = false,
    width = $bindable(0),
    visibility = $bindable({}),
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    showBlocked: boolean;
    /** Floats over the top-right corner of the replay stage instead of following it. */
    overlay?: boolean;
    width?: number;
    visibility?: Record<number, number>;
    selected?: string;
  } = $props();

  const hpColor = (value?: number) => hpRemainingColor(value, $theme === 'dark');
  const anyHidden = $derived(Object.values(visibility).some((value) => value > 0));

  function formatHp(value?: number) {
    if (value === undefined) return '—';
    const percent = Math.round(value * 10) / 10;
    return (percent === 0 || percent === 100 ? String(percent) : percent.toFixed(1)) + '%';
  }

  function formatGap(finished: boolean, gap: number | undefined, finish: number | undefined) {
    if (finished) {
      if (replay.ensemble) return 'At line';

      return finish === undefined ? '—' : formatRaceTime(finish, 2);
    }

    if (gap === undefined) return '—';

    return gap < 0.05 ? 'Lead' : gap.toFixed(1) + ' m';
  }

  function gapTitle(finished: boolean) {
    if (!finished) return 'Distance behind the leader';

    return replay.ensemble ? 'All samples finished' : 'Finish time';
  }

  function placeOf(runner: RaceRunner, order: number, finished: boolean) {
    if (finished) return replay.ensemble ? undefined : replay.finishRanks.get(runner.index);

    return replay.readoutFrame ? order + 1 : undefined;
  }

  function cycle(r: RaceRunner, focus = false) {
    if (focus)
      visibility = Object.fromEntries(
        replay.capture.runners.map((item) => [item.index, item.index === r.index ? 0 : 1])
      );
    else visibility = { ...visibility, [r.index]: ((visibility[r.index] ?? 0) + 1) % 3 };
  }

  const runningStyle = (runner: RaceRunner) =>
    runner.result?.runningStyle ?? Number(runner.raw.runningStyle);
</script>

<aside
  class="live-roster"
  class:overlay
  aria-label="Race field"
  bind:clientWidth={width}
>
  <div class="field-runners">
    {#each replay.fieldOrder as r, index (r.index)}
      {@const horse = replay.readoutFrame?.horses[r.index]}
      {@const finished = replay.hasFinished(r)}
      {@const place = placeOf(r, index, finished)}
      {@const gap = horse ? Math.max(0, replay.readoutLeader - horse.distance) : undefined}
      <div
        class="field-runner"
        class:finished
        class:chosen={replay.runner?.index === r.index}
        class:front-blocked={showBlocked &&
          replay.blockingNow.some((b) => b.horseIndex === r.index)}
        class:dimmed={visibility[r.index] === 1}
        class:hidden-runner={visibility[r.index] === 2}
        style:--team-color={replay.teamColor(r)}
        data-runner-index={r.index}
      >
        <button
          class="runner-pick"
          aria-pressed={replay.runner?.index === r.index}
          aria-label={'Follow ' + r.name}
          onclick={() => (selected = String(r.index))}
        >
          <span
            class="field-place"
            class:podium={place !== undefined && place <= 3}
            title={finished ? 'Final placing' : 'Current position'}
          >
            {place ?? '—'}
          </span>
          <Artwork
            src={portrait(r.cardId)}
            alt=""
            size="xs"
          />
          <span class="field-name">
            <span class="field-identity">
              <strong>{r.name}</strong>
              {#if replay.pacemaker === r.index}
                <ReplayPacemakerBadge />
              {/if}
            </span>
            <small class="field-meta">
              <span>Gate {r.index + 1}</span>
              <span style:color={styleColors[runningStyle(r)]}>
                {runningStyleName(runningStyle(r))}
              </span>
            </small>
          </span>
          <span
            class="field-hp"
            title="HP remaining relative to maximum HP"
          >
            <strong style:color={hpColor(replay.fieldHp(r.index, finished))}>
              {formatHp(replay.fieldHp(r.index, finished))}
            </strong>
            <small>HP</small>
          </span>
          <span
            class="field-gap"
            title={gapTitle(finished)}
          >
            {formatGap(finished, gap, replay.finishTimes.get(r.index))}
            <small class:finish-status={finished}>
              {#if finished}
                <Icon
                  name="check"
                  size={10}
                />{replay.ensemble ? 'All finished' : 'Finished'}
              {:else}
                {horse ? (horse.speed / 100).toFixed(1) + ' m/s' : 'No frame'}
              {/if}
            </small>
          </span>
        </button>
        <IconButton
          size="sm"
          icon={visibility[r.index] === 2 ? 'eye-off' : 'eye'}
          label={r.name +
            ': ' +
            ['visible', 'dimmed', 'hidden'][visibility[r.index] ?? 0] +
            '. Change visibility'}
          title="Click to dim, click again to hide, Shift-click to focus"
          onclick={(event) => cycle(r, event.shiftKey)}
        />
      </div>
    {/each}
  </div>
  {#if anyHidden}
    <Button
      variant="secondary"
      size="sm"
      icon="eye"
      onclick={() => (visibility = {})}
    >
      Show all runners
    </Button>
  {/if}
</aside>

<style>
  @import './replay-roster.css';
</style>
