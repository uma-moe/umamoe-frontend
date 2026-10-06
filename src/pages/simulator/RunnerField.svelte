<script module lang="ts">
  import { MAX_FIELD_RUNNERS, type MonteCarloRunnerInput, type MonteCarloSkillInput } from './race-sim-request';
  import { createTrainee, type Trainee } from './trainee';

  /**
   * One opponent as the field editor holds it. `name` is a display label only —
   * the simulator identifies runners by index, so it never reaches the request.
   *
   * Aptitudes are deliberately compact: `groundAptitudes` carries one grade for
   * both turf and dirt, and `distanceAptitudes`/`styleAptitudes` repeat a single
   * grade across every slot. The trainee editor is the place for a full grid.
   */
  export interface Opponent {
    id: number;
    name: string;
    trainee: Trainee;
    /** Skills the simulator should consider for this runner; empty sends none. */
    skills: Array<MonteCarloSkillInput>;
  }

  /** The trainee fills one slot, so the field editor may add at most 17 opponents. */
  export const MAX_OPPONENTS = MAX_FIELD_RUNNERS - 1;

  export function createOpponent(id: number, name = `Opponent ${id}`): Opponent {
    return { id, name, trainee: createTrainee(), skills: [] };
  }

  /** Opponents already carry everything `buildFieldRunners` reads from a runner row. */
  export function opponentToRunnerInput(opponent: Opponent): MonteCarloRunnerInput {
    return { trainee: opponent.trainee, skills: opponent.skills };
  }
</script>

<script lang="ts">
  import Button from '@/components/Button.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import SelectFieldSlim from '@/components/SelectFieldSlim.svelte';
  import TextField from '@/components/TextField.svelte';
  import { APTITUDE_GRADES } from './stamina-request';
  import { RUNNING_STYLES } from './trainee';
  import RunnerSkills from './RunnerSkills.svelte';

  interface Props {
    runners?: Array<Opponent>;
    /** Highest opponent count allowed; the trainee fills the remaining slot. */
    maxOpponents?: number;
  }

  let { runners = $bindable([]), maxOpponents = MAX_OPPONENTS }: Props = $props();

  // One editor per runner on the page, so ids must not collide.
  const uid = $props.id();

  const GRADE_OPTIONS = APTITUDE_GRADES.map((grade) => ({ value: grade, label: grade }));
  const STYLE_OPTIONS = RUNNING_STYLES.map((style) => ({ value: style, label: style }));
  const MOTIVATION_OPTIONS = [
    { value: '1', label: 'Awful' },
    { value: '2', label: 'Bad' },
    { value: '3', label: 'Normal' },
    { value: '4', label: 'Good' },
    { value: '5', label: 'Great' }
  ];

  const canAdd = $derived(runners.length < maxOpponents);
  const canRemove = $derived(runners.length > 1);

  /** Row label used by the remove action and the running-style group. */
  function runnerLabel(opponent: Opponent, index: number): string {
    return opponent.name.trim() || `Opponent ${index + 1}`;
  }

  function addOpponent(): void {
    if (!canAdd) return;
    const nextId = runners.reduce((max, runner) => Math.max(max, runner.id), 0) + 1;
    runners = [...runners, createOpponent(nextId)];
  }

  function removeOpponent(id: number): void {
    if (!canRemove) return;
    runners = runners.filter((runner) => runner.id !== id);
  }

  /** The single ground grade fills both turf and dirt. */
  function setGroundAptitude(opponent: Opponent, value: string): void {
    opponent.trainee.groundAptitudes = [value, value];
  }

  /** The single distance grade fills every distance and running-style slot. */
  function setDistanceAptitude(opponent: Opponent, value: string): void {
    opponent.trainee.distanceAptitudes = [value, value, value, value];
    opponent.trainee.styleAptitudes = [value, value, value, value];
  }
</script>

<section class="panel field" aria-labelledby="{uid}-field-title">
  <h2 id="{uid}-field-title">Opposing field</h2>
  <p class="hint">
    The field runs 2–18 runners including your trainee. Opponents share one ground grade
    for turf and dirt, and one grade for every distance and running style; edit your own
    trainee above for the full aptitude grid.
  </p>

  {#each runners as runner, index (runner.id)}
    {@const label = runnerLabel(runner, index)}
    <fieldset class="runner">
      <legend class="legend">
        <span class="legend-name">{label}</span>
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          ariaLabel={`Remove ${label}`}
          disabled={!canRemove}
          onclick={() => removeOpponent(runner.id)}
        />
      </legend>

      <div class="grid">
        <TextField id="{uid}-{runner.id}-name" label="Name" bind:value={runner.name} />
        <TextField id="{uid}-{runner.id}-speed" type="number" min={1} max={3000} label="Speed" bind:value={runner.trainee.speed} />
        <TextField id="{uid}-{runner.id}-stamina" type="number" min={1} max={3000} label="Stamina" bind:value={runner.trainee.stamina} />
        <TextField id="{uid}-{runner.id}-power" type="number" min={1} max={3000} label="Power" bind:value={runner.trainee.power} />
        <TextField id="{uid}-{runner.id}-guts" type="number" min={1} max={3000} label="Guts" bind:value={runner.trainee.guts} />
        <TextField id="{uid}-{runner.id}-wisdom" type="number" min={1} max={3000} label="Wisdom" bind:value={runner.trainee.wisdom} />
        <SelectField id="{uid}-{runner.id}-motivation" label="Motivation" options={MOTIVATION_OPTIONS} bind:value={runner.trainee.motivation} />
        <SelectFieldSlim
          id="{uid}-{runner.id}-ground"
          label="Ground (turf & dirt)"
          options={GRADE_OPTIONS}
          value={runner.trainee.groundAptitudes[0] ?? 'A'}
          onchange={(value) => setGroundAptitude(runner, value)}
        />
        <SelectFieldSlim
          id="{uid}-{runner.id}-distance"
          label="Distance & style"
          options={GRADE_OPTIONS}
          value={runner.trainee.distanceAptitudes[0] ?? 'A'}
          onchange={(value) => setDistanceAptitude(runner, value)}
        />
      </div>

      <SegmentedControl
        label={`Running style for ${label}`}
        options={STYLE_OPTIONS}
        bind:value={runner.trainee.runningStyle}
      />

      <RunnerSkills idPrefix="{uid}-{runner.id}" bind:skills={runner.skills} />
    </fieldset>
  {/each}

  <Button variant="secondary" icon="add" disabled={!canAdd} onclick={addOpponent}>
    Add opponent
  </Button>
  {#if !canAdd}
    <p class="hint">The field is full at {maxOpponents + 1} runners.</p>
  {/if}
</section>

<style>
  .panel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
  .panel h2 { margin: 0; font-size: var(--font-md); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
  .field { min-width: 0; }
  .runner { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; margin: 0; padding: var(--space-3); border: 1px solid var(--factor-field-border); border-radius: var(--radius-md); background: var(--factor-field-bg); }
  .legend { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 0 var(--space-2); }
  .legend-name { font-size: var(--font-sm); font-weight: 700; }
</style>
