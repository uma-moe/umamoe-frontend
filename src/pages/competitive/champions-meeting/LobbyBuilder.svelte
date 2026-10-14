<script lang="ts">
  import { simulatorUmaFromCm } from '@/pages/simulator/simulator-uma';
  import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
  import type { Summary, Performer, Build, Snapshot } from '../hakuraku-types';
  import { pct, number, buildRunner, styleNames } from './cm-data';
  import { statKeys, portrait } from '../analysis-view';
  import Artwork from '@/components/game/Artwork.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Button from '@/components/controls/Button.svelte';
  import RunnerSummary from '../runners/RunnerSummary.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import RunnerBuild from '../runners/RunnerBuild.svelte';

  let {
    data,
    colors,
    teams,
    snapshot,
    draft = $bindable({ mood: '5', seed: '', gates: {}, edits: {} }),
    onbrowse,
    onremove,
    onclear,
    onmove
  }: {
    data: Summary;
    snapshot?: Snapshot;
    colors: Record<number, string>;
    teams: Performer[];
    draft?: {
      mood: string;
      seed: string;
      gates: Record<string, string>;
      edits: Record<string, Build>;
    };
    onbrowse: () => void;
    onremove: (team: Performer) => void;
    onclear: () => void;
    onmove: (sourceId: string, sourceIndex: number, targetId: string, targetIndex: number) => void;
  } = $props();

  let simError = $state(''),
    simBusy = $state(false);

  async function simulate() {
    simBusy = true;
    simError = '';
    try {
      const umas = teams.flatMap((team, slot) =>
        team.members.map((member, index) => {
          const key = team.id + ':' + index,
            build = draft.edits[key] ?? (member as Build);
          const uma = simulatorUmaFromCm(build, data, slot + 1);
          uma.frameOrder = draft.gates[key] ? Number(draft.gates[key]) : undefined;
          uma.trainee.motivation = draft.mood.startsWith('random')
            ? String(
                (draft.mood === 'random-no-awful' ? 2 : 1) +
                  Math.floor(Math.random() * (draft.mood === 'random-no-awful' ? 4 : 5))
              )
            : draft.mood;
          return uma;
        })
      );
      await openSimulatorField(umas, {
        replace: true,
        raceInstanceId: snapshot?.raceInstanceId,
        startTimeType: snapshot?.startTimeType,
        seed: draft.seed
      });
    } catch (error) {
      simError = (error as Error).message;
    } finally {
      simBusy = false;
    }
  }

  let editing = $state(''),
    edit = $state<Build>();
  let moving = $state<{ teamId: string; index: number }>();

  const movingTeam = $derived(teams.find((team) => team.id === moving?.teamId));
  const movingBuild = $derived(
    moving && movingTeam
      ? (draft.edits[moving.teamId + ':' + moving.index] ?? movingTeam.members[moving.index])
      : undefined
  );
  const assigned = $derived(new Set(Object.values(draft.gates).filter(Boolean)));
  const invalidSeed = $derived(
    draft.seed !== '' &&
      (!/^-?\d+$/.test(draft.seed) ||
        Number(draft.seed) < -2147483648 ||
        Number(draft.seed) > 2147483647)
  );

  function editRunner(key: string, runner: Build) {
    editing = key;
    edit = structuredClone($state.snapshot(runner));
  }
</script>

<section class="panel">
  <div class="heading">
    <div>
      <h2>Teams · {teams.length}/3</h2>
      <p>
        Build a nine-runner room from captured teams or individual builds. Select an Uma to edit its
        build.
      </p>
    </div>
    <div class="controls">
      <SelectField
        id="lobby-mood"
        label="Mood"
        bind:value={draft.mood}
        options={[
          { value: 'random', label: 'Random' },
          { value: 'random-no-awful', label: 'Random (no Awful)' },
          ...['Awful', 'Bad', 'Normal', 'Good', 'Great'].map((label, i) => ({
            value: String(i + 1),
            label
          }))
        ]}
      />
      <label>
        Seed
        <input
          aria-label="Lobby seed"
          type="number"
          min="-2147483648"
          max="2147483647"
          placeholder="Random"
          value={draft.seed}
          oninput={(event) => (draft.seed = event.currentTarget.value)}
        />
      </label>
      <Button
        variant="secondary"
        size="sm"
        onclick={onbrowse}
      >
        Browse teams
      </Button>{#if Object.keys(draft.edits).length}
        <Button
          size="sm"
          variant="ghost"
          onclick={() => (draft.edits = {})}
        >
          Reset edits
        </Button>
      {/if}{#if teams.length}
        <Button
          size="sm"
          variant="ghost"
          onclick={onclear}
        >
          Clear
        </Button>
      {/if}
    </div>
  </div>
  <div class="teams">
    {#each [0, 1, 2] as slot}
      {@const team = teams[slot]}{#if team}
        <article
          class="team"
          style:--team-color={['#69b7ee', '#d194df', '#e8ad63'][slot]}
        >
          <header>
            <h3>Team {slot + 1}</h3>
            {#if team.custom}
              <span class="custom-label">Custom team</span>
            {:else}
              <strong class="rate">
                {pct(team.wins / team.n)}
                <small>team win rate</small>
              </strong>
            {/if}<Button
              size="sm"
              variant="ghost"
              onclick={() => onremove(team)}
            >
              Remove
            </Button>
          </header>
          <p class="team-results">
            {#if team.custom}
              Assembled from individual captured builds · Team win rate not measured
            {:else}
              {pct(team.ci[0])}–{pct(team.ci[1])} estimated win range · {number(team.n)} races
            {/if}
          </p>
          <div class="lineup-heading">
            <span>Team lineup</span>
            <span>Starting gate</span>
          </div>
          {#each team.members as member, i}
            {@const key = team.id + ':' + i}{@const runner = draft.edits[key] ?? (member as Build)}
            <div class="gate">
              <button
                class="runner"
                aria-label={'Edit ' + data.cards[runner.card]?.name}
                onclick={() => editRunner(key, runner)}
              >
                <RunnerSummary
                  runner={buildRunner(runner, data)}
                  outfit={data.cards[runner.card]?.outfit}
                  color={colors[runner.style === 6 ? 6 : runner.racingStyle]}
                  modified={!!draft.edits[key]}
                />
              </button>
              <div class="row-controls">
                <SelectField
                  id={'gate-' + key}
                  label={data.cards[runner.card]?.name + ' gate'}
                  hideLabel
                  value={draft.gates[key] ?? ''}
                  onchange={(value) => (draft.gates = { ...draft.gates, [key]: value })}
                  options={[
                    { value: '', label: 'Random' },
                    ...Array.from({ length: 9 }, (_, i) => ({
                      value: String(i + 1),
                      label: 'Gate ' + (i + 1),
                      disabled: assigned.has(String(i + 1)) && draft.gates[key] !== String(i + 1)
                    }))
                  ]}
                /><Button
                  variant="ghost"
                  size="sm"
                  onclick={() => editRunner(key, runner)}
                >
                  Edit build
                </Button><Button
                  variant="ghost"
                  size="sm"
                  icon="swap"
                  ariaLabel={'Move ' + data.cards[runner.card]?.name + ' from Team ' + (slot + 1)}
                  disabled={teams.length < 2}
                  onclick={() => (moving = { teamId: team.id, index: i })}
                >
                  Move
                </Button>
              </div>
            </div>
          {/each}
        </article>
      {:else}
        <button
          class="empty"
          onclick={onbrowse}
        >
          <strong>Team {slot + 1}</strong>
          <span>+ Select a team</span>
          <small>Choose from evaluated builds</small>
        </button>
      {/if}
    {/each}
  </div>
  {#if teams.length}
    <p class="gate-summary">
      {assigned.size}/9 gates fixed · Unassigned runners receive a random available gate.
    </p>
  {/if}
</section>
<div class="run">
  <div>
    <strong>
      {teams.length
        ? teams.reduce((count, team) => count + team.members.length, 0) + ' Uma selected'
        : 'Choose teams to simulate'}
    </strong>
    <p>
      Review the field in the simulator, then run one race or a batch. Random mood is drawn once for
      each imported Uma.
    </p>
  </div>
  <Button
    size="sm"
    icon="race"
    loading={simBusy}
    disabled={!teams.length || invalidSeed}
    onclick={simulate}
  >
    Open in simulator
  </Button>
</div>
{#if simError}
  <p role="alert">{simError}</p>
{/if}
{#if invalidSeed}
  <p role="alert">Seed must be a whole 32-bit number.</p>
{/if}
<Dialog
  open={!!editing}
  title="Edit runner"
  maxWidth="650px"
  onclose={() => (editing = '')}
>
  {#if edit}
    <RunnerBuild runner={buildRunner(edit, data)} />
    <div class="stats">
      {#each statKeys as key, index}
        <label>
          {key}
          <input
            type="number"
            min="1"
            max="2000"
            bind:value={edit.stats[index]}
          />
        </label>
      {/each}
    </div>
    <div class="aptitudes">
      {#each ['Distance', 'Surface', 'Style'] as label, index}
        <SelectField
          id={'edit-aptitude-' + index}
          {label}
          bind:value={edit.aptitudes[index]}
          options={'SABCDEFG'.split('').map((value) => ({ value, label: value }))}
        />
      {/each}
    </div>
    <SelectField
      id="edit-style"
      label="Running style"
      value={String(edit.racingStyle)}
      onchange={(value) => (edit!.racingStyle = Number(value))}
      options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: styleNames[value]! }))}
    />
    <p>
      Edits apply to this lobby only. The published team and its win rate remain the original
      snapshot.
    </p>
  {/if}
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (editing = '')}
    >
      Cancel
    </Button><Button
      disabled={!edit || edit.stats.some((n) => !Number.isInteger(n) || n < 1 || n > 2000)}
      onclick={() => {
        if (edit) draft.edits = { ...draft.edits, [editing]: edit };
        editing = '';
      }}
    >
      Save changes
    </Button>
  {/snippet}
</Dialog>
<Dialog
  open={!!moving}
  title="Move runner"
  maxWidth="720px"
  onclose={() => (moving = undefined)}
>
  {#if moving && movingBuild}
    <p class="move-hint">
      Move <strong>{data.cards[movingBuild.card]?.name}</strong>
      from Team {teams.findIndex((team) => team.id === moving!.teamId) + 1}. Choose an Uma below to
      swap places; builds, edits and starting gates follow each Uma.
    </p>
    <div class="move-teams">
      {#each teams as team, slot}
        {#if team.id !== moving.teamId}
          <section class="move-team">
            <h3>Team {slot + 1}</h3>
            {#each team.members as member, index}
              {@const build = draft.edits[team.id + ':' + index] ?? member}
              <button
                class="move-choice"
                aria-label={'Swap with ' +
                  data.cards[build.card]?.name +
                  ' in Team ' +
                  (slot + 1) +
                  ', runner ' +
                  (index + 1)}
                onclick={() => {
                  if (moving) onmove(moving.teamId, moving.index, team.id, index);
                  moving = undefined;
                }}
              >
                <Artwork
                  src={portrait(build.card)}
                  alt=""
                  size="sm"
                />
                <span>
                  <strong>{data.cards[build.card]?.name}</strong>
                  <small>{data.cards[build.card]?.outfit} · {styleNames[build.racingStyle]}</small>
                </span>
                <span class="swap-label">Swap</span>
              </button>
            {/each}
          </section>
        {/if}
      {/each}
    </div>
  {/if}
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (moving = undefined)}
    >
      Cancel
    </Button>
  {/snippet}
</Dialog>

<style>
  @import './lobby-builder.css';
</style>
