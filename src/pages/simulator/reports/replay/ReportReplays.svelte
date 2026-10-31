<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import SimulatorCourseProfile from '../../courses/SimulatorCourseProfile.svelte';
  import SimulatorRaceBrowser from './SimulatorRaceBrowser.svelte';
  import type { ReportSample } from './report-sample.svelte';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import type { SimulatorUma } from '../../simulator-uma';
  import type { MonteCarloInput } from '../../requests/race-sim-request';

  /** Sampled races to replay, any seed to look up, the full results to download and the exact request. */
  interface Props {
    result: MonteCarloResult;
    input?: MonteCarloInput;
    umas: SimulatorUma[];
    course?: RaceCourse;
    selected: number[];
    suspended: boolean;
    sample: ReportSample;
  }

  let { result, input, umas, course, selected, suspended, sample }: Props = $props();

  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify({ input, umas, course, result }, (_, v) =>
            v instanceof Float32Array || v instanceof Float64Array ? Array.from(v) : v
          )
        ],
        { type: 'application/json' }
      )
    );

    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation-' + result.seeds[0] + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function representative(source: number, index: number) {
    const recorded = result.report?.runners.find((r) => r.source_input_index === source)
      ?.representative_runs[index];

    if (recorded !== undefined) return recorded;
    const values = result.finish_times.map((row) => row[source]!);
    const sorted = [...values].sort((a, b) => a - b),
      mid = (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2;

    let target = mid;
    if (index === 1) target = sorted[0]!;
    else if (index !== 0) target = sorted.at(-1)!;
    return values.reduce(
      (best, v, i) => (Math.abs(v - target) < Math.abs(values[best]! - target) ? i : best),
      0
    );
  }
</script>

<section
  id="report-replays"
  class="report-section report-anchor"
  aria-label="Sampled races and reproducibility"
>
  <header class="section-heading">
    <div>
      <h2>Watch races & data</h2>
      <p>Replay real races from this batch, look up any seed, or download the full results.</p>
    </div>
    <span class="section-tools">
      <Button
        variant="secondary"
        size="sm"
        icon="download"
        onclick={download}
      >
        Download data
      </Button>
    </span>
  </header>
  <div id="simulation-samples">
    <SimulatorRaceBrowser
      {result}
      {umas}
      sources={selected}
      active={sample.open ? sample.index : undefined}
      busy={sample.loading}
      {representative}
      onwatch={(index) => sample.replay(index)}
    >
      {#if sample.open}<div class="sample">
          <header class="sample-heading">
            <strong>Race {sample.index + 1} of {result.runs}</strong>
            <span>seed {result.seeds[sample.index]}</span>
            <small>The replay clock counts simulation seconds.</small>
            <span class="sample-tools">
              {#if sample.capture && sample.simulation.status === 'running'}
                <span
                  class="simulation-status"
                  role="status"
                >
                  Loading detailed simulation…
                </span>
              {/if}<Button
                variant="ghost"
                size="sm"
                onclick={() => sample.close()}
              >
                Close replay
              </Button>
            </span>
          </header>
          {#if sample.loading}<p role="status">Loading this race…</p>{:else if sample.error}<p
              role="alert"
            >
              {sample.error}
            </p>{:else if sample.capture && sample.Replay}<sample.Replay
              capture={sample.capture}
              suspended={suspended || !sample.open}
              simulation={sample.simulation}
              onretrysimulation={() => sample.retrySimulation()}
            />{/if}
        </div>{/if}
    </SimulatorRaceBrowser>
  </div>
  <div class="section-gap">
    <Disclosure
      id="simulation-engine"
      title="Setup, clocks and engine"
      description="Engine build, response schema and the exact request"
      icon="info"
    >
      <p class="report-note">
        {result.engine_build}, response schema {result.schema_version}, report {result.report
          ?.version ?? 'not collected'}, {result.runs} races. Simulation traces use elapsed simulation
        seconds, and finish comparisons use official seconds. Rates describe this field and seed population.
        Changing a build can change later random draws even with matched seeds.
      </p>
      {#if course}<SimulatorCourseProfile
          {course}
          compact
        />{/if}
      <pre>{JSON.stringify(input, null, 2)}</pre>
    </Disclosure>
  </div>
</section>
