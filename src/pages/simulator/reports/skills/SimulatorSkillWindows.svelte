<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { ReportSkillCatalog } from './report-skill-catalog.svelte';
  import { theme } from '@/stores/theme';
  import type { Course } from '@/pages/competitive/race-analysis/replay/replay-course';
  import SimulatorRunnerFace from '../SimulatorRunnerFace.svelte';
  import SkillWindowsTip from './SkillWindowsTip.svelte';
  import {
    HIGH,
    LOW,
    RAMP_DARK,
    RAMP_LIGHT,
    SPOT,
    describe,
    pct,
    windowGrid,
    windowSections,
    windowSkills,
    type WindowSkill,
    type WindowTip
  } from './skill-windows';
  import type { MonteCarloResult } from '../../simulator-repository';
  import type { SimulatorUma } from '../../simulator-uma';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  /**
   * The followed runner's skills as a continuous heatmap under the replay's course strip, on its clock, sorted by when they usually fire.
   * The strip's heat at each moment is the share of races in which the skill starts within a second of it, on one absolute scale
   * so rows compare directly; dots mark core trigger spots where many races start it at nearly the same moment.
   */
  let {
    result,
    umas,
    runner,
    course,
    timeAt,
    distanceMax,
    time,
    startTime,
    endTime,
    onseek
  }: {
    result: MonteCarloResult;
    umas: SimulatorUma[];
    runner: number;
    course?: Course;
    timeAt: (distance: number) => number | undefined;
    distanceMax: number;
    time: number;
    startTime: number;
    endTime: number;
    ticks?: number[];
    onseek: (time: number) => void;
  } = $props();

  let tip = $state<WindowTip>();

  const catalog = new ReportSkillCatalog(
    'Skill names could not be loaded. Observations remain available.'
  );

  const sections = $derived(windowSections(course, timeAt, startTime));
  const spurtTime = $derived(timeAt(finalSpurtSection(distanceMax).start));
  const ramp = $derived($theme === 'light' ? RAMP_LIGHT : RAMP_DARK);
  const grid = $derived(windowGrid(startTime, endTime));
  const at = (value: number) => grid.at(value);

  const owned = $derived([...new Set(umas[runner]?.skills.map((skill) => skill.skillId) ?? [])]);
  const skills = $derived(
    windowSkills(result, runner, owned, catalog.lookup, grid, sections, ramp)
  );
  const timed = $derived(
    skills
      .filter((skill) => !skill.passive)
      .sort((a, b) => a.summary.median - b.summary.median || a.id - b.id)
  );

  const always = $derived(skills.filter((skill) => skill.passive));
  const silent = $derived(owned.length - skills.length);

  const shareAt = (skill: WindowSkill, moment: number) =>
    moment < startTime || moment > endTime ? 0 : (skill.share[grid.pointOf(moment)] ?? 0);

  const live = (skill: WindowSkill) => shareAt(skill, time) >= 0.15;

  function point(event: PointerEvent, skill: WindowSkill) {
    const track = (event.currentTarget as HTMLElement).getBoundingClientRect();
    tip = {
      skill,
      moment:
        startTime +
        Math.max(0, Math.min(1, (event.clientX - track.left) / Math.max(1, track.width))) *
          grid.span,
      x: event.clientX,
      below: track.bottom,
      above: track.top
    };
  }

  /** Clicking a shaded cell shows that moment; anywhere else in the row shows the usual one. */
  const target = (skill: WindowSkill) =>
    tip?.skill === skill && shareAt(skill, tip.moment) > 0
      ? tip.moment
      : (skill.spots[0]?.time ?? skill.summary.median);
</script>

<section
  class="skill-windows"
  aria-label="Skills over the race"
>
  {#if catalog.error}
    <p role="alert">{catalog.error}</p>
  {/if}
  <div class="line head">
    <div class="label">
      <span class="title">Skills</span>
      <SimulatorRunnerFace
        cardId={umas[runner]?.cardId}
        size={18}
      />
      <span class="who">{umas[runner]?.name}</span>
      <InspectPopover label="How to read the skill rows">
        {#snippet trigger()}
          <InfoIcon />
        {/snippet}
        <h3>Skills over the race</h3>
        <p>
          One row per skill of the runner you follow, on the same clock as the replay and sorted by
          when it usually fires. Pick another runner in the field to see hers.
        </p>
        <p>
          The strip runs from dark purple, where only a few races start the skill within a second of
          that moment, through pink and orange to cream, where most races do, on the same scale for
          every row. A long faint strip means it can start anywhere in that stretch, gaps under the
          straights or corners mean it only fires there, and a dot marks a core trigger spot where
          at least {pct(SPOT * 100)} of races start it at nearly the same moment.
        </p>
        <p>
          Hover a row for its timing, its duration and the share of races per course section. Click
          to watch it in the replay. The thin lines are the course sections from the Course strip.
        </p>
      </InspectPopover>
    </div>
    <div
      class="key"
      aria-hidden="true"
    >
      <span class="ramp">
        <i
          style:background={'linear-gradient(to right,' +
            ramp.map((stop) => 'rgba(' + stop.join(',') + ')').join(',') +
            ')'}
        ></i>
        <small>{pct(LOW * 100)}</small>
        <small>8%</small>
        <small>{pct(HIGH * 100)}+</small>
      </span>
      <span>of races start it within a second of that moment</span>
      <span>
        <i class="k-spot"></i>
        core trigger spot
      </span>
    </div>
    <div
      class="value"
      title="Share of races in which the skill activates at least once"
    >
      Fires in
    </div>
  </div>
  {#each timed as skill (skill.id)}
    <div
      class="line row"
      class:live={live(skill)}
    >
      <span class="label">
        {#if skill.icon}
          <img
            src={skill.icon}
            alt=""
            width="14"
            height="14"
          />
        {:else}
          <i class="no-icon"></i>
        {/if}
        <span class="name">{skill.name}</span>
      </span>
      <span
        class="track"
        role="button"
        tabindex="0"
        aria-label={describe(skill) + ' Select to watch it in the replay.'}
        onpointermove={(event) => point(event, skill)}
        onpointerleave={() => (tip = undefined)}
        onclick={() => onseek(target(skill))}
        onkeydown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onseek(skill.summary.median);
          }
        }}
      >
        {#each sections as section (section.start)}
          {#if section.start > 0}
            <i
              class="section"
              style:left={at(section.from) + '%'}
            ></i>
          {/if}
        {/each}
        <i class="lane"></i>
        {#if spurtTime !== undefined}
          <i
            class="spurt-window"
            style:left={at(spurtTime) + '%'}
            title={FINAL_SPURT_HELP}
          ></i>
        {/if}
        <i
          class="heat"
          style:background={skill.gradient}
        ></i>
        {#each skill.spots as spot (spot.time)}
          <i
            class="spot"
            style:left={at(spot.time) + '%'}
          ></i>
        {/each}
        <i
          class="cursor"
          style:left={at(time) + '%'}
        ></i>
      </span>
      <span class="value">{pct(skill.rate)}</span>
    </div>
  {:else}
    {#if !always.length}
      <p class="empty">
        {umas[runner]?.name ?? 'This runner'} has no skill that fired in these races.
      </p>
    {/if}
  {/each}
  {#if always.length}
    <div class="line always">
      <span class="label">Always active</span>
      <span class="list">
        {#each always as skill (skill.id)}
          <span class="item">
            {#if skill.icon}
              <img
                src={skill.icon}
                alt=""
                width="14"
                height="14"
              />
            {/if}{skill.name}
          </span>
        {/each}
      </span>
      <span class="value"></span>
    </div>
  {/if}
  {#if silent > 0}
    <p class="silent">
      {silent} learned {silent === 1 ? 'skill' : 'skills'} never fired.
    </p>
  {/if}
  <SkillWindowsTip
    {tip}
    {shareAt}
  />
</section>

<style>
  @import './simulator-skill-windows.css';
</style>
