<script lang="ts">
  import { onDestroy } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SimulatorUmaEditor from '../../../setup/runner/SimulatorUmaEditor.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { buildFieldRunners, type MonteCarloInput } from '../../../requests/race-sim-request';
  import { simulatorRepository, type MonteCarloResult } from '../../../simulator-repository';
  import { compareOutcomes, reportNumber as n } from '../../simulation-report';
  import type { SimulatorUma } from '../../../simulator-uma';
  let {
    input,
    result,
    umas,
    source
  }: { input: MonteCarloInput; result: MonteCarloResult; umas: SimulatorUma[]; source: number } =
    $props();
  let alternatives = $state<
      { source: number; uma: SimulatorUma; outcome?: ReturnType<typeof compareOutcomes> }[]
    >([]),
    editing = $state<SimulatorUma>(),
    editingIndex = $state(-1),
    editingSource = 0,
    open = $state(false),
    busy = $state(false),
    error = $state('');
  let request: AbortController | undefined;
  onDestroy(() => request?.abort());
  const rows = $derived(alternatives.filter((row) => row.source === source));
  function aptitudes(uma: SimulatorUma) {
    const grids = [
      ['groundAptitudes', ['Turf', 'Dirt']],
      ['distanceAptitudes', ['Sprint', 'Mile', 'Medium', 'Long']],
      ['styleAptitudes', ['Front runner', 'Pace chaser', 'Late surger', 'End closer']]
    ] as const;
    return grids
      .flatMap(([key, names]) =>
        uma.trainee[key].flatMap((grade, i) =>
          grade === umas[source]!.trainee[key][i]
            ? []
            : [names[i] + ': ' + umas[source]!.trainee[key][i] + ' → ' + grade]
        )
      )
      .join(' · ');
  }
  function add() {
    editingSource = source;
    editing = structuredClone($state.snapshot(umas[source]!));
    editing.name += ' · alternative ' + (rows.length + 1);
    editingIndex = -1;
    open = true;
  }
  function save(uma: SimulatorUma) {
    if (editingIndex < 0) alternatives = [...alternatives, { source: editingSource, uma }];
    else
      alternatives = alternatives.map((row, i) =>
        i === editingIndex ? { ...row, uma, outcome: undefined } : row
      );
  }
  async function run() {
    if (!rows.length || busy) return;
    busy = true;
    error = '';
    const snapshot = source,
      variants = [...rows];
    request?.abort();
    request = new AbortController();
    try {
      const response = await simulatorRepository.comparison({
        body: {
          input,
          seeds: result.seeds,
          source_input_index: snapshot,
          alternatives: variants.map(({ uma }) => ({
            name: uma.name,
            runner: buildFieldRunners(umas.map((u, i) => (i === snapshot ? uma : u)))[snapshot]
          }))
        },
        signal: request.signal
      });
      const measured = response.result.alternatives.map(([, value]) =>
        compareOutcomes(result, value, snapshot)
      );
      alternatives = alternatives.map((row) => {
        const at = variants.indexOf(row);
        return at < 0 ? row : { ...row, outcome: measured[at] };
      });
    } catch (reason) {
      if (!request.signal.aborted)
        error = reason instanceof Error ? reason.message : 'Could not compare builds.';
    } finally {
      busy = false;
    }
  }
</script>

<ChartFrame
  id="simulation-build-comparison"
  title={'Try a different build · ' + umas[source]!.name}
  slim
  description={'Change ' +
    umas[source]!.name +
    '’s stats, aptitudes, style or skills and rerun the exact same races: opponents, gates, conditions and seeds stay fixed, so the difference comes from the build. Time gained is how much earlier the alternative finishes on average; wins and full spurt are the change in percentage points. Native random draws can diverge once a build changes, so small differences are noise. Pick another runner in the field to try builds for her.'}
>
  {#snippet actions()}<Button
      size="sm"
      variant="secondary"
      icon="add"
      disabled={rows.length >= 3 || busy}
      onclick={add}
    >
      Add alternative
    </Button>{#if rows.length}<Button
        size="sm"
        loading={busy}
        onclick={run}
      >
        Compare {rows.length} build{rows.length === 1 ? '' : 's'}
      </Button>{/if}{#if busy}<Button
        size="sm"
        variant="ghost"
        onclick={() => request?.abort()}
      >
        Cancel
      </Button>{/if}{/snippet}
  {#if error}<p
      role="alert"
      class="note"
    >
      {error}
    </p>{/if}
  {#if !rows.length}<p class="note">
      No alternatives yet. Add one to copy {umas[source]!.name}’s build, change it, and compare it
      on the same {result.runs} races.
    </p>
  {:else}
    {#each alternatives as row, i}{#if row.source === source}
        {@const stats = (['speed', 'stamina', 'power', 'guts', 'wisdom'] as const).filter(
          (k) => row.uma.trainee[k] !== umas[source]!.trainee[k]
        )}
        {@const added = row.uma.skills.filter(
          (s) =>
            !umas[source]!.skills.some((old) => old.skillId === s.skillId && old.level === s.level)
        )}
        {@const removed = umas[source]!.skills.filter(
          (s) => !row.uma.skills.some((next) => next.skillId === s.skillId)
        )}
        <div class="build-row">
          <div class="change">
            <strong>{row.uma.name}</strong>
            <div class="chips">
              {#each stats as k}<span class="stat">
                  {k[0]!.toUpperCase() + k.slice(1)}
                  {umas[source]!.trainee[k]} →
                  <b>{row.uma.trainee[k]}</b>
                </span>{/each}
              {#if row.uma.trainee.runningStyle !== umas[source]!.trainee.runningStyle}<span
                  class="stat"
                >
                  Style → <b>{row.uma.trainee.runningStyle}</b>
                </span>{/if}
              {#if aptitudes(row.uma)}<span class="stat">{aptitudes(row.uma)}</span>{/if}
              {#each added as skill}<span
                  class="skill added"
                  title="Added or changed"
                >
                  <b>+</b>
                  <RaceSkill id={skill.skillId} />
                </span>{/each}
              {#each removed as skill}<span
                  class="skill removed"
                  title="Removed"
                >
                  <b>−</b>
                  <RaceSkill id={skill.skillId} />
                </span>{/each}
              {#if !stats.length && !added.length && !removed.length && !aptitudes(row.uma) && row.uma.trainee.runningStyle === umas[source]!.trainee.runningStyle}<span
                  class="stat"
                >
                  Same build
                </span>{/if}
            </div>
          </div>
          <dl class="tiles">
            {#if row.outcome}
              <div
                class:good={row.outcome.mean > 0}
                class:bad={row.outcome.mean < 0}
              >
                <dt>Time gained</dt>
                <dd>
                  <strong>{(row.outcome.mean > 0 ? '+' : '') + n(row.outcome.mean, 3)} s</strong>
                  <small>
                    {row.outcome.interval
                      ? '95%: ' + row.outcome.interval.map((v) => n(v, 3)).join(' to ')
                      : row.outcome.count + ' races'}
                  </small>
                </dd>
              </div>
              <div
                class:good={row.outcome.winChange > 0}
                class:bad={row.outcome.winChange < 0}
              >
                <dt>Wins</dt>
                <dd>
                  <strong>
                    {(row.outcome.winChange > 0 ? '+' : '') + n(row.outcome.winChange, 1)} pp
                  </strong>
                </dd>
              </div>
              <div
                class:good={(row.outcome.spurtChange ?? 0) > 0}
                class:bad={(row.outcome.spurtChange ?? 0) < 0}
              >
                <dt>Full spurt</dt>
                <dd>
                  <strong>
                    {row.outcome.spurtChange == null
                      ? '—'
                      : (row.outcome.spurtChange > 0 ? '+' : '') +
                        n(row.outcome.spurtChange, 1) +
                        ' pp'}
                  </strong>
                </dd>
              </div>
            {:else}<div class="pending">
                <dt>Result</dt>
                <dd>
                  <strong>Not compared yet</strong>
                  <small>Press Compare</small>
                </dd>
              </div>{/if}
          </dl>
          <div class="row-actions">
            <Button
              size="sm"
              variant="ghost"
              icon="edit"
              ariaLabel={'Edit ' + row.uma.name}
              disabled={busy}
              onclick={() => {
                editing = row.uma;
                editingIndex = i;
                editingSource = row.source;
                open = true;
              }}
            /><Button
              size="sm"
              variant="ghost"
              icon="trash"
              ariaLabel={'Remove ' + row.uma.name}
              disabled={busy}
              onclick={() => (alternatives = alternatives.filter((_, at) => at !== i))}
            />
          </div>
        </div>
      {/if}{/each}
  {/if}
</ChartFrame>
{#if editing}<SimulatorUmaEditor
    uma={editing}
    bind:open
    onsave={save}
  />{/if}

<style>
  .note {
    margin: 2px 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .build-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px 16px;
    align-items: center;
    border-top: 1px solid var(--border-subtle);
    padding: 8px 0;
    font-size: 12px;
  }
  .build-row:first-of-type {
    border-top: 0;
  }
  .change {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .change strong {
    font-weight: 650;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .stat {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--surface-2, transparent);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .stat b {
    color: var(--text-primary);
    font-weight: 600;
  }
  .skill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
  .skill b {
    font-size: 12px;
    width: 10px;
    text-align: center;
  }
  .added b {
    color: var(--accent-success);
  }
  .removed b {
    color: var(--accent-error);
  }
  .removed :global(.skill-chip) {
    opacity: 0.65;
    text-decoration: line-through;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 96px);
    gap: 4px;
    margin: 0;
  }
  .tiles > div {
    display: grid;
    gap: 1px;
    padding: 5px 6px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    text-align: center;
  }
  .tiles > div.pending {
    grid-column: 1/-1;
  }
  .tiles dt {
    font-size: 9px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }
  .tiles dd {
    display: grid;
    margin: 0;
    line-height: 1.15;
  }
  .tiles strong {
    font-size: 13px;
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .tiles small {
    font-size: 9px;
    color: var(--text-secondary);
    white-space: nowrap;
  }
  .good strong {
    color: var(--accent-success);
  }
  .bad strong {
    color: var(--accent-error);
  }
  .row-actions {
    display: flex;
    gap: 2px;
  }
  @media (max-width: 760px) {
    .build-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .tiles {
      grid-column: 1/-1;
      grid-row: 2;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
