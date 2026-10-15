<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { RaceRunner } from '@/lib/race/race-capture-parser';
  import { formatRaceTime, runningStyleName, hpRemainingColor } from '@/lib/race/race-display';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from '../replay-state.svelte';

  let {
    replay,
    showBlocked,
    visibility = $bindable({}),
    selected = $bindable('0'),
    children
  }: {
    replay: ReplayState;
    showBlocked: boolean;
    visibility?: Record<number, number>;
    selected?: string;
    children?: Snippet;
  } = $props();

  const hpColor = (value?: number) => hpRemainingColor(value, $theme === 'dark');

  function formatHp(value?: number) {
    if (value === undefined) return '—';
    const percent = Math.round(value * 10) / 10;
    return (percent === 0 || percent === 100 ? String(percent) : percent.toFixed(1)) + '%';
  }

  function cycle(r: RaceRunner, focus = false) {
    if (focus)
      visibility = Object.fromEntries(
        replay.capture.runners.map((item) => [item.index, item.index === r.index ? 0 : 1])
      );
    else visibility = { ...visibility, [r.index]: ((visibility[r.index] ?? 0) + 1) % 3 };
  }
</script>

<aside
  class="live-roster"
  aria-label="Race field"
>
  <header>
    <div class="field-heading">
      <h3>
        Race field <span>{replay.capture.runners.length}</span>
      </h3>
      <span class="field-order">
        {replay.ensemble
          ? 'Mean position'
          : replay.finishedCount === replay.capture.runners.length
            ? 'Finish order'
            : 'Live order'}
      </span>
      {#if Object.values(visibility).some((value) => value > 0)}
        <IconButton
          size="sm"
          icon="eye"
          label="Show all runners"
          onclick={() => (visibility = {})}
        />
      {/if}
    </div>
    <p>
      {replay.finishedCount
        ? replay.finishedCount + ' / ' + replay.capture.runners.length + ' finished'
        : 'Select a runner to follow'}
    </p>
  </header>
  <div class="field-runners">
    {#each replay.fieldOrder as r, index (r.index)}
      {@const horse = replay.frame?.horses[r.index]}
      {@const finished = replay.hasFinished(r)}
      {@const place = finished
        ? replay.ensemble
          ? undefined
          : replay.finishRanks.get(r.index)
        : replay.frame
          ? index + 1
          : undefined}
      {@const gap = horse ? Math.max(0, replay.leader - horse.distance) : undefined}
      {@const finish = replay.finishTimes.get(r.index)}
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
            <strong>{r.name}</strong>
            <small class="field-meta">
              <span>Gate {r.index + 1}</span>
              <span>
                {runningStyleName(r.result?.runningStyle ?? Number(r.raw.runningStyle))}
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
            title={finished
              ? replay.ensemble
                ? 'All samples finished'
                : 'Finish time'
              : 'Distance behind the leader'}
          >
            {finished
              ? replay.ensemble
                ? 'At line'
                : finish === undefined
                  ? '—'
                  : formatRaceTime(finish, 2)
              : gap === undefined
                ? '—'
                : gap < 0.05
                  ? 'Lead'
                  : gap.toFixed(1) + ' m'}
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
          title="Click to dim, then hide; Shift-click to focus"
          onclick={(event) => cycle(r, event.shiftKey)}
        />
      </div>
    {/each}
  </div>
  {@render children?.()}
</aside>

<style>
  @import './replay-roster.css';
</style>
