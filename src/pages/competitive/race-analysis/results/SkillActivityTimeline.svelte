<script lang="ts">
  import InfoBadge from '@/components/feedback/InfoBadge.svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { diagnosticHorse } from '@/lib/race/capture/race-diagnostics';
  import { skillActivityRows, skillIconGroups, type SkillPeriod } from './skill-activity';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';

  let {
    capture,
    index,
    skillNames,
    time,
    startTime,
    endTime,
    ticks,
    onseek
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    time: number;
    startTime: number;
    endTime: number;
    ticks: number[];
    onseek: (time: number) => void;
  } = $props();

  const instanceId = $props.id();

  let width = $state(0),
    showAll = $state(false);

  const runner = $derived(capture.runners.find((runner) => runner.index === index));
  const rows = $derived(skillActivityRows(capture, index));
  const groups = $derived(
    skillIconGroups(
      rows.map((row) => ({
        ...row,
        periods: row.periods.filter((period) => period.start <= endTime)
      })),
      startTime,
      endTime,
      width
    )
  );

  const decisions = $derived(diagnosticHorse(capture, index)?.skillActivationDecisions ?? []);
  const missing = $derived(
    [
      ...new Set([
        ...(runner?.skillIds ?? []),
        ...decisions.map((decision) => Number(decision.skillId))
      ])
    ].filter((id) => !rows.some((row) => row.id === id))
  );

  const position = (value: number) =>
    Math.max(0, Math.min(100, ((value - startTime) / Math.max(1, endTime - startTime)) * 100));

  const current = (period: SkillPeriod) =>
    period.end === undefined || period.end === period.start
      ? Math.abs(time - period.start) < 0.05
      : time >= period.start && time < period.end;

  function describe(id: number, period: SkillPeriod) {
    const name = skillNames.get(id) ?? 'Skill ' + id;
    if (period.end === period.start)
      return name + ' activated at ' + period.start.toFixed(2) + ' s (instant effect).';
    return period.end === undefined
      ? name + ' activated at ' + period.start.toFixed(2) + ' s. Duration not recorded.'
      : name +
          ' active from ' +
          period.start.toFixed(2) +
          ' to ' +
          period.end.toFixed(2) +
          ' s (' +
          (period.end - period.start).toFixed(2) +
          ' s).';
  }

  function periodLabel(period: SkillPeriod) {
    if (period.end === undefined) return period.start.toFixed(2) + ' s';
    if (period.end === period.start) return period.start.toFixed(2) + ' s · instant';

    return period.start.toFixed(2) + '–' + period.end.toFixed(2) + ' s';
  }

  function rollLabel(id: number) {
    const decision = decisions.find((decision) => Number(decision.skillId) === id);
    if (!decision) return undefined;
    if (!decision.required) return 'No wit check';
    if (typeof decision.roll !== 'number' || typeof decision.threshold !== 'number')
      return 'Wit check not recorded';

    return (
      'Wit ' +
      decision.roll.toFixed(1) +
      '% ' +
      (decision.passed ? '<' : '≥') +
      ' ' +
      decision.threshold.toFixed(1) +
      '% · ' +
      (decision.passed ? 'passed' : 'failed')
    );
  }

  function outcome(id: number) {
    const decision = decisions.find((decision) => Number(decision.skillId) === id);
    return decision?.activated
      ? 'Activated · timing unavailable'
      : decision && !decision.passed
        ? 'Wit check failed'
        : decision?.required
          ? 'Passed wit check, failed condition'
          : 'No recorded activation';
  }
</script>

{#snippet roll(id: number)}
  {@const decision = decisions.find((decision) => Number(decision.skillId) === id)}
  {#if decision}
    <small class="roll-details">
      {#if !decision.required}
        Wit check not required
      {:else if typeof decision.roll === 'number' && typeof decision.threshold === 'number'}
        Wit check {decision.roll.toFixed(2)}% {decision.passed ? '<' : '≥'}
        {decision.threshold.toFixed(2)}% activation chance. Passes below the chance.
      {:else}
        Wit check not recorded
      {/if}
    </small>
  {/if}
{/snippet}

<section
  class="skill-activity timeline-columns"
  aria-label="Skill activity timeline"
>
  <div class="strip-label timeline-label">
    <span>Skill activity</span>
    <InspectPopover label="Skill activity details">
      {#snippet trigger()}
        <InfoBadge />
      {/snippet}
      <h3>Gate {index + 1} · {runner?.name ?? 'Selected runner'}</h3>
      <p>
        Icons mark activation times. Select one to seek the replay. A numbered icon contains nearby
        activations; open it to choose a skill. Highlighted icons are currently active.
      </p>
      <Checkbox
        id={instanceId + '-all-skills'}
        label="All learned skills"
        bind:checked={showAll}
      />
      <div class="activity-details">
        {#each rows as row}
          <div class="detail-row">
            <RaceSkill
              id={row.id}
              name={skillNames.get(row.id)}
            />{#each row.periods as period}
              <Button
                variant="secondary"
                size="sm"
                onclick={() => onseek(period.start)}
              >
                {period.start.toFixed(2)} s{#if period.end !== undefined}
                  – {period.end.toFixed(2)} s · {(period.end - period.start).toFixed(2)} s active
                {:else}
                  · Duration not recorded
                {/if}
              </Button>
            {/each}{@render roll(row.id)}
          </div>
        {/each}
        {#if showAll}
          {#each missing as id}
            <div class="detail-row">
              <RaceSkill
                {id}
                name={skillNames.get(id)}
              />
              <small class="inactive-outcome">{outcome(id)}</small>
              {@render roll(id)}
            </div>
          {/each}
        {/if}
      </div>
      {#if !capture.detailed}
        <p>Skill durations are unavailable in the recorded replay.</p>
      {/if}
    </InspectPopover>
  </div>
  <div
    bind:clientWidth={width}
    class="period-track"
  >
    {#each ticks as value}
      <span
        class="time-grid"
        style:left={position(value) + '%'}
        aria-hidden="true"
      ></span>
    {/each}
    <span
      class="time-cursor"
      style:left={position(time) + '%'}
      aria-hidden="true"
    ></span>
    {#each groups as group}
      {@const first = group.events[0]!}
      {#if group.events.length === 1}
        <button
          class="skill-period"
          class:activation-only={first.period.end === undefined ||
            first.period.end === first.period.start}
          class:current={current(first.period)}
          style:left={group.left + '%'}
          title={describe(first.id, first.period)}
          aria-label={'Review ' + describe(first.id, first.period)}
          onclick={() => onseek(first.period.start)}
        >
          <RaceSkill
            id={first.id}
            name={skillNames.get(first.id)}
            iconOnly
          />
        </button>
      {:else}
        <div
          class="skill-group"
          class:current={group.events.some((event) => current(event.period))}
          style:left={group.left + '%'}
        >
          <InspectPopover
            label={group.events.length +
              ' skill activations near ' +
              first.period.start.toFixed(2) +
              ' seconds'}
          >
            {#snippet trigger()}
              <span class="group-icon">
                <RaceSkill
                  id={first.id}
                  name={skillNames.get(first.id)}
                  iconOnly
                />
                <b>{group.events.length}</b>
              </span>
            {/snippet}
            <h3>
              Nearby activations <small>{group.events.length}</small>
            </h3>
            <ul class="nearby-list">
              {#each group.events as event}
                {@const roll = rollLabel(event.id)}
                <li class:current={current(event.period)}>
                  <button
                    class="detail-seek"
                    aria-label={'Review ' + describe(event.id, event.period)}
                    onclick={() => onseek(event.period.start)}
                  >
                    <RaceSkill
                      id={event.id}
                      name={skillNames.get(event.id)}
                    />
                  </button>
                  <span class="nearby-time">{periodLabel(event.period)}</span>
                  {#if roll}
                    <small class="nearby-roll">{roll}</small>
                  {/if}
                </li>
              {/each}
            </ul>
          </InspectPopover>
        </div>
      {/if}
    {/each}
    {#if !groups.length}
      <span class="empty">No recorded activations</span>
    {/if}
  </div>
  <span
    class="strip-count"
    title="Recorded activations"
  >
    {rows.reduce((sum, row) => sum + row.periods.length, 0)}
  </span>
</section>

<style>
  .timeline-columns {
    display: grid;
    grid-template-columns: var(--timeline-label-width, 124px) minmax(0, 1fr) var(
        --timeline-value-width,
        60px
      );
    gap: var(--timeline-column-gap, 12px);
    align-items: center;
    min-width: 0;
  }
  .strip-label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 36px;
    z-index: 4;
    background: var(--surface-1);
  }
  .period-track {
    position: relative;
    min-width: 0;
    height: 36px;
    border-block: 1px solid var(--border-subtle);
  }
  .skill-period,
  .skill-group {
    position: absolute;
    top: 3px;
    transform: translateX(-50%);
    width: 28px;
    height: 28px;
    z-index: 2;
  }
  .skill-period {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: var(--surface-1);
    color: var(--text-primary);
    cursor: pointer;
    opacity: 0.75;
  }
  .skill-period:hover,
  .skill-period:focus-visible,
  .skill-period.current,
  .skill-group.current {
    opacity: 1;
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
  .skill-period:focus-visible {
    outline-color: var(--text-primary);
  }
  .group-icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    background: var(--surface-1);
  }
  .group-icon b {
    position: absolute;
    right: -3px;
    bottom: -2px;
    min-width: 12px;
    padding: 1px 2px;
    font-size: 9px;
    color: var(--button-primary-text);
    background: var(--accent-primary);
  }
  .time-grid {
    position: absolute;
    inset-block: 0;
    width: 1px;
    background: var(--border-subtle);
    pointer-events: none;
  }
  .time-cursor {
    position: absolute;
    inset-block: 0;
    width: 2px;
    background: var(--accent-primary);
    transform: translateX(-1px);
    pointer-events: none;
    z-index: 3;
  }
  .strip-count {
    font-size: 10px;
    color: var(--text-secondary);
    text-align: right;
  }
  .empty {
    display: flex;
    align-items: center;
    height: 100%;
    padding-left: 8px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  h3 {
    margin: 0;
    font-size: 13px;
  }
  p {
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-secondary);
  }
  .activity-details {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }
  .detail-row {
    display: grid;
    gap: 5px;
  }
  .detail-row small {
    font-size: 10px;
    line-height: 1.5;
    color: var(--text-secondary);
  }
  .detail-seek {
    display: flex;
    align-items: center;
    border: 0;
    padding: 0;
    background: none;
    text-align: left;
    color: var(--accent-primary);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .detail-seek:hover,
  .detail-seek:focus-visible {
    text-decoration: underline;
  }
  .detail-row > :global(.ui-button) {
    justify-self: start;
    min-height: 28px;
    padding-inline: 6px;
    font-size: 11px;
  }
  .roll-details {
    font-variant-numeric: tabular-nums;
  }
  h3 small {
    margin-left: 4px;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
  }
  .nearby-list {
    display: grid;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }
  .nearby-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px 12px;
    padding: 6px 0;
    border-top: 1px solid var(--border-subtle);
  }
  .nearby-list li:first-child {
    border-top: 0;
  }
  .nearby-list li.current .nearby-time {
    color: var(--accent-primary);
  }
  .nearby-time,
  .nearby-roll {
    font-size: 10px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .nearby-roll {
    grid-column: 1 / -1;
    line-height: 1.3;
  }
  .nearby-list .detail-seek {
    min-width: 0;
  }
  .skill-group :global(.trigger) {
    min-width: 28px;
    min-height: 28px;
  }
  @media (max-width: 700px) {
    .strip-label {
      position: sticky;
      left: 0;
    }
    .strip-label :global(.trigger) {
      min-width: 24px;
      min-height: 32px;
    }
  }
</style>
