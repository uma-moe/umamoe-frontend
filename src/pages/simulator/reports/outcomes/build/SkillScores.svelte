<script lang="ts">
  import { skillImage } from '@/lib/game-data/skills/skills';
  import BuildSkillRow from './BuildSkillRow.svelte';
  import type { ListedSkill, RuledOutSkill } from './build-result';

  /**
   * Every skill on offer, each in a card of its own kind: the skills the theory valued, by the lengths each gains her
   * bought on her own, those the pick does not buy dimmed; then, last, those that can never fire for her here.
   */
  interface Props {
    skills: ListedSkill[];
    ruledOut: RuledOutSkill[];
    /** The largest worth shown, a full bar. */
    scale: number;
    phaseBounds: number[];
  }

  let { skills, ruledOut, scale, phaseBounds }: Props = $props();
</script>

{#if skills.length}
  <section
    class="card"
    aria-labelledby="skill-scores"
  >
    <h4 id="skill-scores">
      Skills <span>{skills.length}</span>
    </h4>
    <ul class="skills">
      {#each skills as skill (skill.key)}
        <li class:dimmed={!skill.bought}>
          <BuildSkillRow
            offer={skill.offer}
            via={[]}
            cost={skill.cost}
            lengths={skill.lengths}
            win={skill.win}
            fire={skill.fire}
            source={skill.valuation.source}
            countGated={skill.valuation.countGated}
            locked={skill.locked}
            {scale}
            {phaseBounds}
            context="on her own"
          />
          <span class="sr-only">{skill.bought ? ', in the pick' : ', not in the pick'}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if ruledOut.length}
  <section
    class="card ruled-out"
    aria-labelledby="skill-ruled-out"
  >
    <h4 id="skill-ruled-out">
      Can’t fire here <span>{ruledOut.length}</span>
    </h4>
    <ul>
      {#each ruledOut as item (item.purchase)}
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

<style>
  @import './skill-scores.css';
</style>
