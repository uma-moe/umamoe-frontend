<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import Button from '@/components/controls/Button.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { CourseData } from './replay-course';
  import {
    defaultReplayToggles,
    replayToggleGroups,
    replayToggleHelp,
    replayToggleLabels,
    type ReplayToggle,
    type ReplayToggles
  } from './replay-display';

  let {
    capture,
    courses,
    frameIndex,
    time,
    onseek,
    open = $bindable(false),
    trackOverride = $bindable(''),
    windowMeters = $bindable(80),
    toggles = $bindable(defaultReplayToggles())
  }: {
    capture: ParsedRaceCapture;
    courses?: CourseData;
    frameIndex: number;
    time: number;
    onseek: (time: number) => void;
    open?: boolean;
    trackOverride?: string;
    windowMeters?: number;
    toggles?: ReplayToggles;
  } = $props();

  /** An emptied number field is still being edited, so it changes nothing yet. */
  function enteredNumber(event: Event): number | undefined {
    if (!(event.currentTarget instanceof HTMLInputElement)) return undefined;
    if (event.currentTarget.value === '') return undefined;

    return event.currentTarget.valueAsNumber;
  }

  function setWindowMeters(event: Event) {
    const meters = enteredNumber(event);
    if (meters !== undefined) windowMeters = meters;
  }

  const allShown = $derived(Object.values(toggles).every(Boolean));

  /** Timers extend the skill and race-mode labels, so they need one of those shown. */
  function unavailable(option: ReplayToggle) {
    return option === 'skillTimers' && !toggles.skills && !toggles.raceModes;
  }

  function toggle(option: ReplayToggle) {
    toggles = { ...toggles, [option]: !toggles[option] };
  }

  function setAll(shown: boolean) {
    toggles = Object.fromEntries(
      Object.keys(toggles).map((option) => [option, shown])
    ) as ReplayToggles;
  }

  function seekFrame(event: Event) {
    const index = enteredNumber(event);
    if (index === undefined) return;

    onseek(capture.frames[index]?.time ?? time);
  }
</script>

<Dialog
  bind:open
  title="Display options"
  maxWidth="620px"
  contentPadding="16px"
  mobileContentPadding="12px"
>
  <div
    class="replay-toolbar"
    id="replay-settings"
  >
    <section class="course-controls">
      <h3>Course & precision</h3>
      <SelectField
        id="replay-track"
        label="Track"
        bind:value={trackOverride}
        options={[
          {
            value: '',
            label: capture.courseId ? 'Auto, Course ' + capture.courseId : 'Auto-detect from replay'
          },
          ...Object.entries(courses?.courses ?? {}).map(([id, c]) => ({
            value: id,
            label:
              (courses?.names[c.raceTrackId] ?? id) +
              ', ' +
              c.distance +
              'm, ' +
              (c.surface === 1 ? 'Turf' : 'Dirt') +
              (c.turn === 1 ? ', Right' : ', Left')
          }))
        ]}
      />
      <TextField
        id="replay-window-meters"
        label="View window (m)"
        type="number"
        min={20}
        max={400}
        step={10}
        value={String(windowMeters)}
        oninput={setWindowMeters}
      />
      <TextField
        id="replay-frame"
        label={'Frame (of ' + capture.frames.length + ')'}
        type="number"
        min={0}
        max={Math.max(0, capture.frames.length - 1)}
        value={String(frameIndex)}
        oninput={seekFrame}
      />
    </section>
    {#each replayToggleGroups as group}
      <section>
        <h3>{group.title}</h3>
        <div class="options">
          {#each group.keys as option}
            <div
              class="option"
              title={replayToggleHelp[option]}
            >
              <ToggleButton
                icon="eye"
                label={replayToggleLabels[option]}
                pressed={toggles[option]}
                disabled={unavailable(option)}
                onclick={() => toggle(option)}
              />
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
  {#snippet actions()}
    <Button
      size="sm"
      variant="secondary"
      onclick={() => setAll(!allShown)}
    >
      {allShown ? 'Hide all overlays' : 'Show all overlays'}
    </Button><Button
      size="sm"
      variant="secondary"
      onclick={() => {
        toggles = defaultReplayToggles();
        windowMeters = 80;
      }}
    >
      Reset display
    </Button><Button
      size="sm"
      onclick={() => (open = false)}
    >
      Done
    </Button>
  {/snippet}
</Dialog>

<style>
  .replay-toolbar {
    --control-height: 32px;
    display: grid;
    gap: 14px;
  }
  .replay-toolbar h3 {
    font-size: 13px;
    margin: 0 0 6px;
  }
  /* Track, view window and frame share one row; the heading spans it. */
  .course-controls {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
    align-items: end;
    gap: 8px;
    min-width: 0;
  }
  .course-controls > h3 {
    grid-column: 1/-1;
    margin: 0;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px 8px;
  }
  .option {
    min-width: 0;
  }
  .option :global(.ui-toggle) {
    justify-content: space-between;
    width: 100%;
  }
  @media (max-width: 700px) {
    .course-controls {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .course-controls > :global(:nth-child(2)) {
      grid-column: 1/-1;
    }
    .options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
