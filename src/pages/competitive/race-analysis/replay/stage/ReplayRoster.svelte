<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import Icon from '@/components/Icon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { theme } from '@/stores/theme';
  import type { ReplayState } from '../replay-state.svelte';
  import ReplayPacemakerBadge from '../ReplayPacemakerBadge.svelte';
  import type { ClipLayerDraw } from '../clip/canvas-clip';
  import { fieldRows } from './field-rows';
  import { measureFieldPanel } from './field-panel-layout';
  import { drawFieldPanel } from './canvas/draw-field-panel';
  import { StageImages } from './canvas/stage-images';
  import { readStagePalette } from './canvas/stage-palette';

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

  let panel = $state<HTMLElement>();
  const images = new StageImages(() => {});

  const anyHidden = $derived(Object.values(visibility).some((value) => value > 0));
  const rows = $derived(fieldRows({ replay, visibility, showBlocked, dark: $theme === 'dark' }));

  function cycle(r: RaceRunner, focus = false) {
    if (focus)
      visibility = Object.fromEntries(
        replay.capture.runners.map((item) => [item.index, item.index === r.index ? 0 : 1])
      );
    else visibility = { ...visibility, [r.index]: ((visibility[r.index] ?? 0) + 1) % 3 };
  }

  /**
   * Measures the list floating over the stage and loads its portraits, then returns its clip frame
   * drawing, which reads the replay afresh on each call. A list below the stage stays out of clips.
   */
  export async function prepareClip(stage: DOMRect): Promise<ClipLayerDraw | undefined> {
    const layout = overlay && panel ? measureFieldPanel(panel, stage) : undefined;
    if (!panel || !layout) return undefined;

    const palette = readStagePalette(panel, $theme === 'dark');
    await images.preload(rows.flatMap((row) => (row.portrait === undefined ? [] : [row.portrait])));

    return (context) => drawFieldPanel(context, rows, layout, { palette, images });
  }
</script>

<aside
  class="live-roster"
  class:overlay
  data-clip-layer={overlay ? 'overlay' : undefined}
  aria-label="Race field"
  bind:clientWidth={width}
  bind:this={panel}
>
  <div class="field-runners">
    {#each rows as row (row.runner.index)}
      {@const r = row.runner}
      <div
        class="field-runner"
        class:finished={row.finished}
        class:chosen={row.chosen}
        class:front-blocked={row.blocked}
        class:dimmed={row.visibility === 1}
        class:hidden-runner={row.visibility === 2}
        style:--team-color={replay.teamColor(r)}
        data-runner-index={r.index}
      >
        <button
          class="runner-pick"
          aria-pressed={row.chosen}
          aria-label={'Follow ' + r.name}
          onclick={() => (selected = String(r.index))}
        >
          <span
            class="field-place"
            class:podium={row.place !== undefined && row.place <= 3}
            title={row.finished ? 'Final placing' : 'Current position'}
          >
            {row.place ?? '—'}
          </span>
          <Artwork
            src={row.portrait}
            alt=""
            size="xs"
          />
          <span class="field-name">
            <span class="field-identity">
              <strong>{r.name}</strong>
              {#if row.pacemaker}
                <ReplayPacemakerBadge />
              {/if}
            </span>
            <small class="field-meta">
              <span>Gate {r.index + 1}</span>
              <span style:color={row.styleColor}>{row.styleName}</span>
            </small>
          </span>
          <span
            class="field-hp"
            title="HP remaining relative to maximum HP"
          >
            <strong style:color={row.hpColor ?? 'var(--text-secondary)'}>{row.hpText}</strong>
            <small>HP</small>
          </span>
          <span
            class="field-gap"
            title={row.gapTitle}
          >
            {row.gapText}
            <small class:finish-status={row.finished}>
              {#if row.finished}
                <Icon
                  name="check"
                  size={10}
                />
              {/if}
              {row.detail}
            </small>
          </span>
        </button>
        <IconButton
          size="sm"
          icon={row.visibility === 2 ? 'eye-off' : 'eye'}
          label={r.name +
            ': ' +
            ['visible', 'dimmed', 'hidden'][row.visibility] +
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
