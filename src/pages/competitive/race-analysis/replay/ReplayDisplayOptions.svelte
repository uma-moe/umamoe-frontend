<script lang="ts">
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import Button from '@/components/controls/Button.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import type { CourseData } from './replay-course';
  import { defaultReplayToggles, replayToggleLabels, type ReplayToggles } from './replay-display';

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
      <div class="precision-fields">
        <label>
          View window <span>
            <input
              aria-label="View window metres"
              type="number"
              min="20"
              max="400"
              step="10"
              bind:value={windowMeters}
            />
            m
          </span>
        </label>
        <label>
          Replay frame <span>
            <input
              aria-label="Replay frame"
              type="number"
              min="0"
              max={Math.max(0, capture.frames.length - 1)}
              value={frameIndex}
              onchange={(e) => onseek(capture.frames[Number(e.currentTarget.value)]?.time ?? time)}
            />
            / {capture.frames.length}
          </span>
        </label>
      </div>
    </section>
    {#each [{ title: 'Runner overlays', keys: ['skills', 'blocked', 'speed', 'accel'] }, { title: 'Course overlays', keys: ['course', 'slopes', 'positionKeep', 'cone'] }] as group}
      <section>
        <h3>{group.title}</h3>
        <div class="options">
          {#each group.keys as option}
            <ToggleButton
              icon="eye"
              label={replayToggleLabels[option as keyof typeof replayToggleLabels]}
              pressed={toggles[option as keyof typeof toggles]}
              onclick={() =>
                (toggles[option as keyof typeof toggles] =
                  !toggles[option as keyof typeof toggles])}
            />
          {/each}
        </div>
      </section>
    {/each}
  </div>
  {#snippet actions()}
    <Button
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
    gap: 20px;
  }
  .replay-toolbar h3 {
    font-size: 13px;
    margin: 0 0 8px;
  }
  .course-controls {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .precision-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .precision-fields label {
    display: grid;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  input[type='number'] {
    width: 75px;
    padding: 6px;
    border: 1px solid var(--border-primary);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font: inherit;
  }
  .options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 24px;
  }
  .options :global(.ui-toggle) {
    justify-content: space-between;
  }
  @media (max-width: 700px) {
    .course-controls {
      min-width: 0;
      width: 100%;
    }
    .options {
      gap: 4px 12px;
    }
  }
</style>
