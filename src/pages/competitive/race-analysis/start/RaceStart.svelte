<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import type { CourseData } from '../replay/replay-course';
  import RaceScreenshotGallery from './RaceScreenshotGallery.svelte';
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
  <div class="start-hero">
    <section
      class="upload-column"
      aria-labelledby="start-upload-title"
    >
      <h2
        id="start-upload-title"
        class="sr-only"
      >
        Start with your races
      </h2>
      <div class="upload-card">
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
      </div>
      <div class="capture-tools">
        <p>Need race files? Capture your races with HorseACT or umadump, then import them here.</p>
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
      <p>
        Uploads are automatically resimulated. Captures go to the simulator; mismatched replays go
        to Sentry for debugging.
      </p>
    </section>

    <section
      class="demo-card"
      aria-labelledby="start-demo-title"
    >
      <h2
        id="start-demo-title"
        class="sr-only"
      >
        Explore before uploading
      </h2>
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
    </section>
  </div>

  <RaceScreenshotGallery />
</div>

<style>
  @import './race-start.css';
</style>
