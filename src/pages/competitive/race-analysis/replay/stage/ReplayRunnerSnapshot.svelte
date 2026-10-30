<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import { raceFrameAtTime, replayLaneMetres } from '@/lib/race/replay/race-replay';
  import { formatRaceTime } from '@/lib/race/replay/race-display';
  import { activeSpan, diagnosticLabel, detailedSample } from '@/lib/race/capture/race-diagnostics';
  import Button from '@/components/controls/Button.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { wholeRaceSkillIds } from '../replay-callouts';
  import type { ReplayState } from '../replay-state.svelte';

  let {
    replay,
    runner,
    skillNames,
    onanalyse,
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    runner: RaceRunner;
    skillNames: Map<number, string>;
    onanalyse: () => void;
    selected?: string;
  } = $props();

  // Listed on their own, so the current skills are the ones that just activated.
  const wholeRaceSkills = $derived(wholeRaceSkillIds(replay.capture, runner.index));

  const activeSkills = $derived.by(() => {
    const { diagnostic, time } = replay;
    return diagnostic?.activeSkillSpans
      ? [
          ...new Set(
            diagnostic.activeSkillSpans
              .filter((s) => time >= s.startTime && time < s.endTime)
              .map((s) => s.skillId)
              .filter((id) => !wholeRaceSkills.includes(id))
          )
        ].map((id) => ({
          params: [runner?.index ?? 0, id],
          endTime: Math.max(
            ...diagnostic
              .activeSkillSpans!.filter(
                (s) => s.skillId === id && time >= s.startTime && time < s.endTime
              )
              .map((s) => s.endTime)
          )
        }))
      : replay.recentSkills
          .filter((e) => e.params[0] === runner?.index)
          .map((e) => ({ ...e, endTime: undefined }));
  });

  const blockedRunner = $derived(replay.capture.runners.find((r) => r.index === replay.blocker));
  const reference = $derived(
    activeSpan(replay.diagnostic?.positionKeepReferenceSpans, replay.time)?.referenceHorseIndex
  );

  const pacemaker = $derived(
    activeSpan(replay.capture.detailed?.annotations.paceMakerSpans, replay.time)?.horseIndex
  );

  const modes = $derived(
    Object.entries(replay.capture.detailed?.annotations.flags ?? {})
      .filter(
        ([, flag]) => ((activeSpan(replay.diagnostic?.spans, replay.time)?.mask ?? 0) & flag) !== 0
      )
      .map(([name]) => diagnosticLabel(name))
  );

  const rushed = $derived(
    replay.diagnostic?.temptationSpans
      ? (activeSpan(replay.diagnostic.temptationSpans, replay.time)?.mode ?? 0)
      : (replay.frame?.horses[runner?.index ?? 0]?.temptationMode ?? 0)
  );

  const targetSpeed = $derived(
    detailedSample(replay.capture.detailed, replay.diagnostic, replay.time, 'targetSpeeds')
  );

  const previousHorse = $derived(
    raceFrameAtTime(replay.capture.frames, replay.time - 1)?.horses[runner?.index ?? 0]
  );

  const laneChange = $derived(
    replay.currentHorse && previousHorse
      ? replayLaneMetres(
          replay.currentHorse.lanePosition - previousHorse.lanePosition,
          replay.laneWidth
        )
      : 0
  );

  const runnerState = $derived(
    runner && replay.hasFinished(runner)
      ? replay.ensemble
        ? 'All samples finished'
        : 'Finished' +
          (replay.finishTimes.get(runner.index) === undefined
            ? ''
            : ', ' + formatRaceTime(replay.finishTimes.get(runner.index), 2))
      : Math.abs(laneChange) < 0.05
        ? 'Holding lane'
        : (laneChange > 0 ? 'Outward +' : 'Inward ') + laneChange.toFixed(2) + ' m / last second'
  );
</script>

{#snippet movementReadings()}
  <StatStrip
    label="Runner movement"
    presentation="inline"
    items={[
      {
        id: 'lane',
        label: 'From inner rail',
        value: replay.currentHorse ? replay.laneMetres(replay.currentHorse.lanePosition) : '—',
        unit: 'm'
      },
      {
        id: 'acceleration',
        label: 'Acceleration',
        value: replay.currentHorse ? replay.acceleration(runner?.index ?? 0).toFixed(2) : '—',
        unit: 'm/s²'
      },
      ...(!replay.ensemble
        ? [
            {
              id: 'procs',
              label: 'Skill triggers',
              value: replay.activations.filter((e) => e.frameTime <= replay.time).length
            }
          ]
        : [])
    ]}
  />
{/snippet}
<section
  class="runner-snapshot"
  aria-label="Selected runner telemetry"
>
  <header>
    <div class="snapshot-identity">
      <Artwork
        src={portrait(runner.cardId)}
        alt=""
        size="xs"
      />
      <div>
        <small>{replay.ensemble ? 'Following mean' : 'Following'}</small>
        <h3>{runner.name}</h3>
      </div>
    </div>
    <div class="snapshot-actions">
      <InspectPopover
        label="Following details"
        align="end"
      >
        {#snippet trigger()}
          <span class="snapshot-details-trigger">Details</span>
        {/snippet}
        <div class="snapshot-details">
          <h3>{runner.name}</h3>
          <div class="snapshot-movement">
            <p>
              {runnerState}{#if rushed}
                , rushed
              {/if}
            </p>
            {@render movementReadings()}
          </div>
          {#if !replay.ensemble}
            {#if blockedRunner}
              <p>
                Blocked by Gate {replay.blocker + 1}:
                <Button
                  size="sm"
                  variant="secondary"
                  icon="eye"
                  onclick={() => (selected = String(replay.blocker))}
                >
                  {blockedRunner.name}
                </Button>
              </p>
            {:else}
              <p>No front blocker at this moment.</p>
            {/if}
            <h4>Current skills</h4>
            {#each activeSkills as event}
              <div class="snapshot-skill">
                <RaceSkill
                  id={event.params[1]!}
                  name={skillNames.get(event.params[1]!)}
                />{#if event.endTime !== undefined}
                  <small>
                    {Math.max(0, event.endTime - replay.time).toFixed(1)}s left
                  </small>
                {/if}
              </div>
            {:else}
              <p>No current skill activation.</p>
            {/each}
          {/if}
          {#if replay.diagnostic}
            <div class="live-diagnostics">
              <span>
                Target speed <b>{targetSpeed?.toFixed(2) ?? '—'} m/s</b>
              </span>
              <span>
                HP <b>
                  {replay.currentHorse?.hp.toFixed(0) ?? '—'} / {replay.diagnostic.maxHp?.toFixed(
                    0
                  ) ?? '—'}
                </b>
              </span>
              <span class="mode-list">{modes.join(', ') || 'No special mode'}</span>
              {#each [{ label: 'Position-keep reference', index: reference }, { label: 'Pacemaker', index: pacemaker }] as item}
                {#if item.index !== undefined && item.index >= 0}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="eye"
                    onclick={() => (selected = String(item.index))}
                  >
                    {item.label}: #{item.index + 1}
                    {replay.capture.runners.find((r) => r.index === item.index)?.name}
                  </Button>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </InspectPopover>{#if !replay.ensemble}
        <Button
          variant="secondary"
          size="sm"
          icon="chart"
          ariaLabel="Analyse this runner"
          onclick={onanalyse}
        >
          Analyse
        </Button>
      {/if}
    </div>
  </header>
  <div
    class="runner-state"
    class:runner-finished={replay.hasFinished(runner)}
  >
    <span>{runnerState}</span>
    {#if rushed}
      <b>Rushed</b>
    {/if}
  </div>
  <div class="runner-extra">{@render movementReadings()}</div>
  {#if !replay.ensemble}
    <dl class="snapshot-status">
      <div class="status-cell front-status">
        <dt>Front</dt>
        <dd>
          {#if blockedRunner}
            <button
              class="blocker-link"
              title={'Blocked by Gate ' +
                (replay.blocker + 1) +
                ', ' +
                blockedRunner.name +
                '. Select to follow them.'}
              onclick={() => (selected = String(replay.blocker))}
            >
              <Icon
                name="warning"
                size={12}
              />
              <span>
                Blocked by <strong>{blockedRunner.name}</strong>
              </span>
            </button>
          {:else}
            <span class="front-clear">Clear</span>
          {/if}
        </dd>
      </div>
      <div class="status-cell skills-status">
        <dt>Active</dt>
        <dd
          class="current-skills"
          aria-label="Current skills"
        >
          {#each activeSkills as event}
            {@const skillId = event.params[1] ?? 0}
            <span
              class="active-skill"
              title={(skillNames.get(skillId) ?? 'Skill ' + skillId) +
                (event.endTime === undefined
                  ? ''
                  : ', ' + Math.max(0, event.endTime - replay.time).toFixed(1) + ' s left')}
            >
              <RaceSkill
                id={skillId}
                name={skillNames.get(skillId)}
                iconOnly
              />
            </span>
          {:else}
            <span class="front-clear">None</span>
          {/each}
        </dd>
      </div>
      {#if wholeRaceSkills.length}
        <div class="status-cell skills-status">
          <dt>All race</dt>
          <dd
            class="current-skills"
            aria-label="Skills active for the whole race"
          >
            {#each wholeRaceSkills as skillId}
              <span
                class="active-skill"
                title={(skillNames.get(skillId) ?? 'Skill ' + skillId) + ', active all race'}
              >
                <RaceSkill
                  id={skillId}
                  name={skillNames.get(skillId)}
                  iconOnly
                />
              </span>
            {/each}
          </dd>
        </div>
      {/if}
    </dl>
  {/if}
</section>

<style>
  @import './replay-runner-snapshot.css';
</style>
