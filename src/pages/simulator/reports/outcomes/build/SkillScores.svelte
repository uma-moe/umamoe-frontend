<script lang="ts">
  import { skillImage } from '@/lib/game-data/skills/skills';
  import BuildSkillRow from './BuildSkillRow.svelte';
  import {
    contributionScale,
    type ListedSkill,
    type RuledOutSkill,
    type SkillUnit
  } from './build-result';

  /** Keep scored and inactive offers visible below the build comparison. */
  interface Props {
    skills: ListedSkill[];
    ruledOut: RuledOutSkill[];
    /** Skills the simulator cannot race yet, said apart from those that cannot fire. */
    unprocessed?: RuledOutSkill[];
    skillUnit?: SkillUnit;
    phaseBounds: number[];
  }

  let { skills, ruledOut, unprocessed = [], skillUnit = 'lengths', phaseBounds }: Props = $props();

  const scale = $derived(contributionScale(skills));
</script>

{#if skills.length}
  <section
    class="card"
    aria-labelledby="skill-scores"
  >
    <h3 id="skill-scores">
      All skill scores <span>{skills.length}</span>
    </h3>
    <ul class="skills">
      {#each skills as skill (skill.key)}
        <li class:dimmed={!skill.bought}>
          <BuildSkillRow
            offer={skill.offer}
            via={[]}
            cost={skill.cost}
            value={skill.value}
            unit={skillUnit}
            measurement={skill.measurement}
            win={skill.win}
            fire={skill.fire}
            source={skill.valuation.source}
            countGated={skill.valuation.countGated}
            locked={skill.locked}
            {scale}
            {phaseBounds}
            context={skillUnit === 'score'
              ? skill.bought
                ? 'in the pick'
                : 'added beside the pick, including prerequisites'
              : 'on her own'}
          />
          <span class="sr-only">{skill.bought ? ', in the pick' : ', not in the pick'}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#snippet leftOut(id: string, heading: string, items: RuledOutSkill[])}
  {#if items.length}
    <section
      class="card ruled-out"
      aria-labelledby={id}
    >
      <h3 {id}>
        {heading}
        <span>{items.length}</span>
      </h3>
      <ul>
        {#each items as item (item.purchase)}
          <li title={'Needs ' + item.needs}>
            <img
              src={skillImage(item.offer.skill.icon)}
              alt=""
              width="16"
              height="16"
            />
            {item.offer.skill.name}
            <span class="sr-only">, needs {item.needs}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{/snippet}

{@render leftOut('skill-ruled-out', 'Can’t fire here', ruledOut)}
{@render leftOut('skill-unprocessed', 'Can’t process', unprocessed)}

<style>
  @import './skill-scores.css';
</style>
