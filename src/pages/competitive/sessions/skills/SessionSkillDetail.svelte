<script lang="ts">
  import type { MultiRaceSkillStats } from '@/lib/race/multi-race-analysis';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import { percent, rate, styleColors } from '../../analysis-view';
  import { COURSE_SECTIONS, isSmallSample, phaseCounts, sectionCounts } from '../session-insights';
  import { rateClass } from '../session-kpis';
  import { activationSpread, type SessionSkill, type SkillUse } from './session-skill-stats';

  /** The selected skill: where on the course it fired, and how each running style used it. */
  let {
    skill,
    name,
    use,
    raceDistance,
    neutralWin,
    measured
  }: {
    skill: SessionSkill;
    name: string;
    /** The runners the table is scoped to; the heatmap shows their activations. */
    use: SkillUse;
    raceDistance: number;
    /** The win rate of every runner in scope, which the win rates here are read against. */
    neutralWin: number;
    /** Resimulation results, present when some runners have detailed diagnostics. */
    measured?: MultiRaceSkillStats;
  } = $props();

  const sections = $derived(sectionCounts(use.distances, raceDistance));
  const busiestSection = $derived(Math.max(1, ...sections));
  const phases = $derived(phaseCounts(sections));
  const busiestPhase = $derived(
    [...phases].sort((a, b) => b.count - a.count).find((phase) => phase.count > 0)
  );

  const spread = $derived(activationSpread(use.distances));
  const styles = $derived([...skill.byStyle].sort(([a], [b]) => a - b));

  const position = (distance: number) =>
    Math.min(100, Math.max(0, (distance / Math.max(1, raceDistance)) * 100)) + '%';
  const metres = (distance: number) => Math.round(distance).toLocaleString() + ' m';

  const heatLabel = $derived(
    'Activations by race phase: ' +
      phases.map((phase) => phase.name.toLowerCase() + ' ' + phase.count).join(', ')
  );
</script>

<section
  class="skill-detail"
  aria-labelledby="session-skill-detail"
>
  <header>
    <h4 id="session-skill-detail">{name}</h4>
    <p>
      Activated for {use.activated} of {use.learned} learners
      {#if spread}
        · median {metres(spread.median)}
      {/if}
    </p>
  </header>

  <div class="course">
    <div
      class="heat"
      role="img"
      aria-label={heatLabel}
      style:--sections={COURSE_SECTIONS}
    >
      {#each sections as count, section (section)}
        <i
          style:--heat={(count / busiestSection) * 100 + '%'}
          title={metres((section / COURSE_SECTIONS) * raceDistance) + ': ' + count}
        ></i>
      {/each}
      {#if spread}
        <span
          class="spread"
          style:left={position(spread.low)}
          style:right={'calc(100% - ' + position(spread.high) + ')'}
        ></span>
        <b
          class="median"
          style:left={position(spread.median)}
        ></b>
      {/if}
    </div>
    <ol
      class="phases"
      style:--sections={COURSE_SECTIONS}
    >
      {#each phases as phase (phase.name)}
        <li
          class:busiest={phase === busiestPhase}
          style:grid-column={phase.start + 1 + ' / ' + (phase.end + 1)}
        >
          {phase.name.split(' ')[0]}
          <strong>{phase.count}</strong>
        </li>
      {/each}
    </ol>
  </div>
  <p class="takeaway">
    {#if busiestPhase && spread}
      Most in the {busiestPhase.name.toLowerCase()}; the middle half fired between {metres(
        spread.low
      )} and {metres(spread.high)}.
    {:else}
      No runner activated this skill here.
    {/if}
  </p>

  <table class="by-style">
    <caption class="sr-only">{name} by running style</caption>
    <thead>
      <tr>
        <th scope="col">Style</th>
        <th scope="col">Learned</th>
        <th scope="col">Activated</th>
        <th
          scope="col"
          title="Win rate of the runners whose skill activated"
        >
          Win% if active
        </th>
        <th
          scope="col"
          title="Win rate of the runners that carried the skill without activating it"
        >
          Win% if not
        </th>
      </tr>
    </thead>
    <tbody>
      {#each styles as [style, styleUse] (style)}
        {@const idle = styleUse.learned - styleUse.activated}
        <tr>
          <th
            scope="row"
            style:color={styleColors[style]}
          >
            <i style:background={styleColors[style]}></i>
            {runningStyleName(style, true)}
          </th>
          <td>{styleUse.learned}</td>
          <td class:few={isSmallSample(styleUse.learned)}>
            {percent(styleUse.activated, styleUse.learned)}
          </td>
          <td
            class={rateClass(
              rate(styleUse.activatedWins, styleUse.activated),
              styleUse.activated,
              neutralWin
            )}
          >
            {styleUse.activated ? percent(styleUse.activatedWins, styleUse.activated) : '—'}
          </td>
          <td class={rateClass(rate(styleUse.idleWins, idle), idle, neutralWin)}>
            {idle ? percent(styleUse.idleWins, idle) : '—'}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if measured && measured.measuredEntries > 0}
    <p class="footnote">
      Resimulated runners: active {(measured.durationTotal / measured.measuredEntries).toFixed(2)} s on
      average · wit check failed {measured.rollFailures} · conditions not met {measured.passedUntriggered}
    </p>
  {/if}
</section>

<style>
  @import './session-skill-detail.css';
</style>
