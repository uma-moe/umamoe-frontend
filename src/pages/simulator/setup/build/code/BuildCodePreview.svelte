<script lang="ts">
  import { describeCourse, trackName, type RaceCourse } from '@/lib/game-data/racing/courses';
  import type { SkillData } from '@/lib/game-data/skills/skills';
  import { simulatorRoster } from '../../../simulator-roster.svelte';
  import {
    GROUND_OPTIONS,
    SEASON_OPTIONS,
    TIME_OPTIONS,
    WEATHER_OPTIONS
  } from '../../../simulator-session.svelte';
  import type { SkillOffer } from '../skill-offers';
  import { buildCodeConditions, buildCodeGoal, buildCodeUma, type BuildCode } from './build-code';
  import BuildCodePreviewRunner from './BuildCodePreviewRunner.svelte';

  interface Props {
    code: BuildCode;
    target: 'race' | 'stamina' | 'build';
    course?: RaceCourse;
    conditions: ReturnType<typeof buildCodeConditions>;
    runners: ReturnType<typeof buildCodeUma>[];
    offers: SkillOffer[];
    goal: ReturnType<typeof buildCodeGoal>;
    skills: Map<number, SkillData>;
    /** The code was copied from this tab and restores all of it. */
    whole?: boolean;
  }

  let {
    code,
    target,
    course,
    conditions,
    runners,
    offers,
    goal,
    skills,
    whole = false
  }: Props = $props();

  const MODES: Record<string, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };

  const WHOLE: Record<Props['target'], (runners: number) => string> = {
    race: (count) =>
      'Replaces the whole race field with these ' +
      count +
      (count === 1 ? ' runner' : ' runners') +
      ', their teams and gates, the course, the seed and the race options.',
    stamina: () =>
      'Replaces the whole HP calculator: her build, the course, the HP plan and its race options.',
    build: () =>
      'Replaces the whole Skill planner: her build, the course, the goal, what she can buy with hints and locks, and the HP debuffs she takes.'
  };

  const dropped = $derived(runners.reduce((sum, runner) => sum + runner.dropped, 0));
  const label = (options: Array<{ value: string; label: string }>, value?: string) =>
    options.find((option) => option.value === value)?.label;

  const conditionText = $derived(
    [
      label(GROUND_OPTIONS, conditions.ground),
      label(WEATHER_OPTIONS, conditions.weather),
      label(SEASON_OPTIONS, conditions.season),
      label(TIME_OPTIONS, conditions.startTime)
    ]
      .filter(Boolean)
      .join(' · ')
  );

  /** What loading it changes on this tab, in a sentence. */
  const changes = $derived.by(() => {
    if (whole) return WHOLE[target](runners.length);

    if (target === 'race') {
      return (
        (simulatorRoster.configured ? 'Adds ' : 'Replaces the example field with ') +
        (runners.length === 1 ? 'her' : 'both runners') +
        (simulatorRoster.configured ? ' to the race field' : '') +
        ' and sets the course.'
      );
    }

    if (target === 'build') {
      return 'Replaces her build, the course, the goal and what she can buy.';
    }

    return 'Replaces her build and the course.';
  });
</script>

<dl class="preview">
  <div>
    <dt>Course</dt>
    <dd>
      {#if course}
        <strong>{trackName(course.race_track_id)} · {describeCourse(course)}</strong>
        {#if conditionText}<span>{conditionText}</span>{/if}
      {:else if code.courseId}
        <span class="warn">
          Course {code.courseId} isn’t in the race data, so the course stays as it is.
        </span>
      {:else}
        <span>Not in the code; the course stays as it is.</span>
      {/if}
    </dd>
  </div>
  <div>
    <dt>{runners.length > 1 ? 'Runners' : 'Runner'}</dt>
    <dd class="runners">
      {#each runners as { uma } (uma.id)}
        <BuildCodePreviewRunner
          {uma}
          {skills}
        />
      {/each}
    </dd>
  </div>
  {#if target === 'build'}
    <div>
      <dt>To buy</dt>
      <dd>
        <strong>{offers.length} {offers.length === 1 ? 'skill' : 'skills'}</strong>
        <span>
          {[
            offers.filter((offer) => offer.hint > 0).length + ' with a hint',
            goal.sp !== undefined ? goal.sp.toLocaleString('en-US') + ' SP' : '',
            goal.fastLearner ? 'Fast Learner' : ''
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </dd>
    </div>
    {#if goal.mode}
      <div>
        <dt>Goal</dt>
        <dd>
          <strong>{MODES[goal.mode]}</strong>
          {#if goal.mode !== 'cm' && goal.tracks}<span>
              on {goal.tracks.length}
              {goal.tracks.length === 1 ? 'track' : 'tracks'}
            </span>{/if}
        </dd>
      </div>
    {/if}
  {/if}
</dl>
<p class="changes">
  {changes}
  {#if dropped}{dropped}
    {dropped === 1 ? 'skill isn’t' : 'skills aren’t'} in the skill data and
    {dropped === 1 ? 'is' : 'are'} left out.{/if}
</p>

<style>
  .preview {
    display: grid;
    margin: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md, 8px);
  }
  .preview > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: baseline;
    padding: 8px 10px;
  }
  .preview > div + div {
    border-top: 1px solid var(--border-subtle);
  }
  dt {
    font-size: 12px;
    color: var(--text-secondary);
  }
  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    min-width: 0;
    margin: 0;
    font-size: 13px;
  }
  dd > span {
    font-size: 12px;
    color: var(--text-secondary);
  }
  dd .warn {
    color: var(--accent-warning);
  }
  .runners {
    display: grid;
    gap: 8px;
  }
  .changes {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  @media (max-width: 560px) {
    .preview > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
    }
  }
</style>
