<script lang="ts">
  import { skillImage } from '@/lib/game-data/skills/skills';
  import {
    barShape,
    clearOfZero,
    signed,
    spread,
    surelyWorse,
    type RuledOutSkill,
    type SkillRow,
    type ValueScale
  } from './build-result';

  /**
   * The skills she should not buy, quieter than the ones she should: those the best build leaves out, each with what it
   * would add on top on the same scale as the buy list, then those that can never fire for her here.
   */
  interface Props {
    left: SkillRow[];
    ruledOut: RuledOutSkill[];
    scale: ValueScale;
    /** Values are runners beaten in real CM fields, not seconds. */
    field: boolean;
  }

  let { left, ruledOut, scale, field }: Props = $props();
</script>

<div class="skip">
  {#if left.length}
    <section aria-labelledby="skip-left">
      <h4 id="skip-left">
        Left out <span>{left.length}</span>
      </h4>
      <ul class="left">
        {#each left as row (row.key)}
          {@const value = row.value}
          <li
            class:helps={value !== undefined && value.mean > 0 && clearOfZero(value)}
            class:loss={value !== undefined && surelyWorse(value)}
          >
            <img
              src={skillImage(row.offer.skill.icon)}
              alt=""
              width="20"
              height="20"
            />
            <span class="name">{row.offer.skill.name}</span>
            <span class="cost">{row.cost} SP</span>
            {#if value}
              {@const shape = barShape(scale, value.mean)}
              <span
                class="bar"
                aria-hidden="true"
              >
                <span
                  class="zero"
                  style:left={shape.zero + '%'}
                ></span>
                <span
                  class="fill"
                  style:left={shape.left + '%'}
                  style:width={shape.width + '%'}
                ></span>
              </span>
              <span
                class="value"
                title={spread(value) + (row.screened ? ', not raced in the best build' : '')}
              >
                {signed(value.mean)}{field ? '' : ' s'}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if ruledOut.length}
    <section
      class="ruled-out"
      aria-labelledby="skip-ruled-out"
    >
      <h4 id="skip-ruled-out">
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
</div>

<style>
  @import './skip-list.css';
</style>
