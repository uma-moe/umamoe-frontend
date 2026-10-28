<script lang="ts">
  import { formatWinPoints } from '../scatter/scatter-scale';
  import { SECTIONS, type SkillPoint } from '../skill-explorer-data';
  import type { CountGate } from './skill-requirements';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  export interface TerrainSegment {
    start: number;
    end: number;
    label: string;
    color: string;
  }

  /** Another skill named on the card: a partner with what it adds beside this one, or a skill that feeds its gate. */
  export interface RelatedSkill {
    skillId: number;
    name: string;
    image?: string;
    /** Win points it raises this skill's value by, for a partner. */
    win?: number;
  }

  interface Props {
    point: SkillPoint;
    name: string;
    /** The skill's icon, or a unique's character. */
    image?: string;
    /** A unique's own skill icon, shown on its character. */
    badge?: string;
    description?: string;
    /** What it needs to fire, in words: one list per alternative, any of which will do. */
    requirements: string[][];
    /** Skills that raise its value most beside it, on a single course. */
    partners: RelatedSkill[];
    /** For a skill gated on others' activations: the gate, and the scope's best skills that fire where it counts. */
    gate?: { gate: CountGate; feeders: RelatedSkill[] };
    /** Courses the scope averages; the skill fires on `point.courses` of them. */
    scopeCourses: number;
    /** A single course: its distance in metres and terrain, for a metre axis. */
    course?: { distance: number; terrain: TerrainSegment[] };
    inBuild: boolean;
  }

  let {
    point,
    name,
    image,
    badge,
    description,
    requirements,
    partners,
    gate,
    scopeCourses,
    course,
    inBuild
  }: Props = $props();

  // The final leg is the last sixth; a runner's spurt can begin earlier, in late race.
  const PHASES = [
    { label: 'Early', from: 0, to: 4 },
    { label: 'Middle', from: 4, to: 16 },
    { label: 'Late', from: 16, to: 20 },
    { label: 'Final', from: 20, to: 24 }
  ];
  const WIDTH = 276;
  const HEIGHT = 62;
  const TOP = 14;
  const SECTION_WIDTH = WIDTH / SECTIONS;
  const spurt = finalSpurtSection(1);

  /** A passive (or a gate skill) takes hold at the start: its proc point says nothing, so no chart is drawn. */
  const fromGate = $derived(point.rate > 0 && point.mean * SECTIONS < 0.05);
  const peak = $derived(Math.max(0.05, ...point.sections));
  const meanLabel = $derived(placeLabel(point.mean));

  function placeLabel(share: number): string {
    return course ? `${Math.round(share * course.distance)} m` : `${Math.round(share * 100)}%`;
  }

  function barHeight(share: number): number {
    return (share / peak) * (HEIGHT - TOP);
  }
</script>

<article class="skill-card">
  <header>
    {#if image}
      <span
        class="portrait"
        class:character={badge !== undefined}
      >
        <img
          src={image}
          alt=""
        />
        {#if badge}
          <img
            class="badge"
            src={badge}
            alt=""
          />
        {/if}
      </span>
    {/if}
    <div>
      <h3>{name}</h3>
      {#if description}
        <p>{description}</p>
      {/if}
    </div>
  </header>

  <dl class="worth">
    <div>
      <dt>In build</dt>
      <dd>
        {formatWinPoints(point.win)}
        <small>win rate</small>
      </dd>
    </div>
    <div>
      <dt>Alone</dt>
      <dd>
        {formatWinPoints(point.winAlone)}
        <small>win rate</small>
      </dd>
    </div>
    <div>
      <dt>Fires</dt>
      <dd>
        {#if fromGate}
          {point.rate >= 0.995 ? 'Always' : `${Math.round(point.rate * 100)}%`}
          <small>from the gate</small>
        {:else}
          {Math.round(point.rate * 100)}%
          <small>mean {meanLabel}</small>
        {/if}
      </dd>
    </div>
  </dl>

  {#if point.forced > 0}
    <p class="forced">
      Never procs for her{point.courses > 1
        ? ` on ${point.forced} of ${point.courses} courses`
        : ''}: valued forced to proc where the course lets it.
    </p>
  {/if}

  {#if requirements.length > 0}
    <section class="needs">
      <h4>Needs</h4>
      {#each requirements as alternative, index (alternative.join('|'))}
        {#if index > 0}
          <span class="or">or</span>
        {/if}
        <p>{alternative.join(' · ')}</p>
      {/each}
    </section>
  {/if}

  {#if !fromGate}
    {@render procChart()}
  {/if}

  {#if gate}
    <section class="related">
      <h4>Fed by</h4>
      <p class="gate">
        {gate.gate.count} of her skills must fire {gate.gate.where} first. Skills that fire there:
      </p>
      {@render relatedList(gate.feeders)}
    </section>
  {/if}

  {#if partners.length > 0}
    <section class="related">
      <h4>Works best with</h4>
      {@render relatedList(partners)}
    </section>
  {/if}

  {#if inBuild || scopeCourses > 1}
    <ul class="notes">
      {#if inBuild}
        <li>In the reference build</li>
      {/if}
      {#if scopeCourses > 1}
        <li>Fires on {point.courses} of {scopeCourses} courses</li>
      {/if}
    </ul>
  {/if}
</article>

{#snippet relatedList(skills: RelatedSkill[])}
  <ul>
    {#each skills as skill (skill.skillId)}
      <li>
        {#if skill.image}
          <img
            src={skill.image}
            alt=""
          />
        {/if}
        <span class="name">{skill.name}</span>
        {#if skill.win !== undefined}
          <span class="gain">{formatWinPoints(skill.win)}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

{#snippet procChart()}
  <figure class="procs">
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Where ${name} first procs: mean at ${meanLabel}`}
    >
      {#each PHASES as phase, index (phase.label)}
        <rect
          class={`phase phase-${index}`}
          x={phase.from * SECTION_WIDTH}
          y="0"
          width={(phase.to - phase.from) * SECTION_WIDTH}
          height={HEIGHT}
        />
        <text
          class="phase-label"
          x={phase.from * SECTION_WIDTH + 3}
          y="9"
        >
          {phase.label}
        </text>
      {/each}

      <line
        class="spurt-boundary"
        x1={spurt.start * WIDTH}
        x2={spurt.start * WIDTH}
        y1={TOP}
        y2={HEIGHT}
      >
        <title>{FINAL_SPURT_HELP}</title>
      </line>
      {#each point.sections as share, section (section)}
        <rect
          class="bar"
          x={section * SECTION_WIDTH + 1}
          y={HEIGHT - barHeight(share)}
          width={SECTION_WIDTH - 2}
          height={barHeight(share)}
          rx="1.5"
        />
      {/each}

      {#if point.rate > 0}
        <line
          class="mean"
          x1={point.mean * WIDTH}
          x2={point.mean * WIDTH}
          y1={TOP - 2}
          y2={HEIGHT}
        />
      {/if}
    </svg>

    {#if course}
      <div
        class="terrain"
        aria-hidden="true"
      >
        {#each course.terrain as segment (segment.start)}
          <span
            style:left={`${(segment.start / course.distance) * 100}%`}
            style:width={`${((segment.end - segment.start) / course.distance) * 100}%`}
            style:background={segment.color}
          ></span>
        {/each}
      </div>
    {/if}

    <figcaption>
      <span
        class="key spurt"
        title={FINAL_SPURT_HELP}
      >
        Final spurt from {placeLabel(spurt.start)}
      </span>
      <span class="key theory">Where it first procs</span>
      <span class="ends">
        <span>{placeLabel(0)}</span>
        <span>{course ? `${course.distance} m` : '100%'}</span>
      </span>
    </figcaption>
  </figure>
{/snippet}

<style>
  @import './skill-card.css';
</style>
