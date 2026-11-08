<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import type { CourseData } from '../replay/replay-course';
  import RaceTrackDisplay from './RaceTrackDisplay.svelte';

  let {
    loading,
    courses,
    onfiles,
    onexample
  }: {
    loading: boolean;
    courses?: CourseData;
    onfiles: (files: FileList) => void;
    onexample: (count: number) => void;
  } = $props();

  const HORSEACT_URL = 'https://github.com/ayaliz/horseACT#installation';
  const UMADUMP_URL = 'https://werseter.github.io/umadump/';
</script>

<div class="race-start">
  <section
    class="import-card"
    aria-labelledby="start-upload-title"
  >
    <h2 id="start-upload-title">Import races</h2>

    <FileDrop
      id="race-upload"
      label="Drop your race files here"
      description=".json or .json.gz files for one race or a whole session"
      actionLabel={loading ? 'Reading captures…' : 'Choose race files'}
      accept=".json,.gz"
      multiple
      disabled={loading}
      {onfiles}
    />

    <div
      class="capture-tools"
      role="group"
      aria-labelledby="start-capture-label"
    >
      <span id="start-capture-label">Capture races</span>
      <div class="capture-buttons">
        <Button
          href={HORSEACT_URL}
          target="_blank"
          variant="secondary"
          size="sm"
          icon="download"
        >
          Get HorseACT
        </Button>
        <Button
          href={UMADUMP_URL}
          target="_blank"
          variant="secondary"
          size="sm"
          icon="download"
        >
          Get umadump
        </Button>
      </div>
    </div>
  </section>

  <RaceTrackDisplay {courses}>
    {#snippet actions()}
      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onclick={() => onexample(1)}
      >
        Try one demo race
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onclick={() => onexample(24)}
      >
        Try 24 demo races
      </Button>
    {/snippet}
  </RaceTrackDisplay>
</div>

<style>
  @import './race-start.css';
</style>
