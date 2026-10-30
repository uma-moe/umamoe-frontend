<script lang="ts">
  import { formatWinPoints } from '../scatter/scatter-scale';
  import { SECTIONS, type SkillPoint } from '../skill-explorer-data';
  import type { CountGate } from './skill-requirements';
  import type { SkillEffectDetails } from './skill-effects';
  import type { SkillProvider, SkillProviders } from './skill-providers';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import PickupImages from '@/components/cards/PickupImages.svelte';
  import SkillPoints from '@/components/game/SkillPoints.svelte';

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
    effects?: SkillEffectDetails[];
    spCost?: number;
    providers?: SkillProviders;
    providerStatus?: 'loading' | 'ready' | 'error';
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
    effects = [],
    spCost,
    providers,
    providerStatus = 'ready',
    requirements,
    partners,
    gate,
    scopeCourses,
    course,
    inBuild
  }: Props = $props();
  const sourcesId = $props.id();

  // The final leg is the last sixth; a runner's spurt can begin earlier, in late race.
  const PHASES = [
    { label: 'Early', from: 0, to: 4 },
    { label: 'Middle', from: 4, to: 16 },
    { label: 'Late', from: 16, to: 20 },
    { label: 'Final', from: 20, to: 24 }
  ];
  const WIDTH = 276;
  const HEIGHT = 48;
  const TOP = 14;
  const SECTION_WIDTH = WIDTH / SECTIONS;
  const spurt = finalSpurtSection(1);
  const NUMBER = /([+−-]?\d+(?:\.\d+)?%?)/;

  /** A passive (or a gate skill) takes hold at the start: its proc point says nothing, so no chart is drawn. */
  const fromGate = $derived(point.rate > 0 && point.mean * SECTIONS < 0.05);
  /** Forced on every course: `rate` is how often it fires when forced, not in her build, where it never does. */
  const neverFires = $derived(point.forced > 0 && point.forced >= point.courses);
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
        <p>{@render numberText(description)}</p>
      {/if}
    </div>
  </header>

  <dl class="worth">
    <div>
      <dt>In build</dt>
      <dd
        class:positive={point.win > 0}
        class:negative={point.win < 0}
      >
        {formatWinPoints(point.win)}
        <small>win rate</small>
      </dd>
    </div>
    <div>
      <dt>Alone</dt>
      <dd
        class:positive={point.winAlone > 0}
        class:negative={point.winAlone < 0}
      >
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
        {:else if neverFires}
          Never
          <small>{Math.round(point.rate * 100)}% if forced</small>
        {:else}
          {Math.round(point.rate * 100)}%
          <small>mean {meanLabel}</small>
        {/if}
      </dd>
    </div>
  </dl>

  <section class="effects">
    <div class="effect-heading">
      <h4>Base effect</h4>
      {#if spCost !== undefined}
        <span class="sp-cost">
          <SkillPoints
            value={spCost}
            note="Base cost before hint discounts"
          />
        </span>
      {/if}
    </div>
    {#each effects as alternative, index (alternative.effects.join('|') + alternative.duration)}
      {#if index > 0}
        <span class="or">or</span>
      {/if}
      <p>{@render numberText(alternative.effects.join(' · '))}</p>
      <small>{@render numberText(alternative.duration)}</small>
    {:else}
      <p class="unavailable">Numeric effect data unavailable.</p>
    {/each}
  </section>

  {#if point.forced > 0}
    <p class="forced">
      Never procs for her{point.courses > 1
        ? ` on ${point.forced} of ${point.courses} courses`
        : ''}: valued forced to proc where the course lets it. Scaled by proc rate, it counts 0
      there.
    </p>
  {/if}

  {#if requirements.length > 0}
    <section class="needs">
      <h4>Needs</h4>
      {#each requirements as alternative, index (alternative.join('|'))}
        {#if index > 0}
          <span class="or">or</span>
        {/if}
        <p>{@render numberText(alternative.join(' · '))}</p>
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
        <span class="number">{gate.gate.count}</span>
        of her {gate.gate.counted === 'recovery' ? 'recovery skills' : 'skills'} must fire {gate
          .gate.where} first. Skills that fire there:
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

  <section
    class="sources"
    aria-label="Skill sources"
  >
    {#if providers && providers.umas.length > 0}
      <div class="provider-group">
        <Disclosure
          id={`${sourcesId}-umas`}
          title="Uma trainees"
          description={`${providers.umas.length}`}
          compact
          open
        >
          {@render providerList(providers.umas, 'uma')}
        </Disclosure>
      </div>
    {/if}
    {#if providers && providers.supports.length > 0}
      <div class="provider-group">
        <Disclosure
          id={`${sourcesId}-supports`}
          title="Support cards"
          description={`${providers.supports.length}`}
          compact
          open
        >
          {@render providerList(providers.supports, 'support')}
        </Disclosure>
      </div>
    {/if}
    {#if providerStatus === 'loading'}
      <p>Loading skill sources…</p>
    {:else if providerStatus === 'error'}
      <p>Skill sources could not load.</p>
    {:else if !providers || (providers.umas.length === 0 && providers.supports.length === 0)}
      <p>No sources listed in this data.</p>
    {/if}
  </section>

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

{#snippet numberText(value: string)}
  {#each value.split(NUMBER) as part, index}
    <span class:number={index % 2 === 1}>{part}</span>
  {/each}
{/snippet}

{#snippet providerList(sources: SkillProvider[], kind: 'uma' | 'support')}
  <PickupImages
    items={sources.map((source) => ({
      id: String(source.id),
      name: source.name,
      subLabel: source.detail,
      image: source.image,
      gametoraUrl: source.href,
      kind: kind === 'uma' ? 'character' : 'support'
    }))}
    label={kind === 'uma' ? 'Uma trainees' : 'Support cards'}
    wrap
    grow
  />
{/snippet}

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
