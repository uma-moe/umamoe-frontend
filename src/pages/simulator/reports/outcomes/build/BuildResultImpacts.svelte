<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import { skillImage } from '@/lib/catalog/skill-catalog';
  import type { OptimizeEstimate, OptimizeScreenStats } from '../../../simulator-repository';
  import {
    amount,
    signed,
    spread,
    stoppedShort,
    surelyWorse,
    type InertOffer,
    type ScreenedImpact
  } from './build-result';

  interface Props {
    impacts: ScreenedImpact[];
    inert: InertOffer[];
    /** Purchases in the best build. */
    bought: Set<number>;
    /** Gains are runners beaten in real CM fields, not seconds. */
    field: boolean;
    screen?: OptimizeScreenStats;
    /** Seeds the search raced on; a value with fewer samples stopped early. */
    seeds: number;
  }

  let { impacts, inert, bought, field, screen, seeds }: Props = $props();

  /** The impacts carry what real CM races say about each skill. */
  const evidence = $derived(impacts.some((impact) => !!impact.evidence));
  const short = (estimate: OptimizeEstimate) => stoppedShort(estimate, seeds);
  const anyShort = $derived(
    impacts.some((impact) => short(impact.alone) || (!!impact.together && short(impact.together)))
  );
</script>

<section
  class="impacts"
  aria-label="Every skill on offer"
>
  <h3>Every skill on offer</h3>
  <p class="note">
    {field ? 'Runners each one beats more of' : 'Seconds each saves her'}: bought alone, and as the
    last one in with everything else on offer.
    {#if evidence}CM is what recorded CM races say it adds, before any race here.{/if}
    {#if anyShort}Grey values stopped racing early, once more races could not change the pick.{/if}
    {#if screen}With everything ({screen.full_cost.toLocaleString()} SP) {field
        ? 'she beats ' +
          Math.abs(screen.full.mean).toFixed(2) +
          (screen.full.mean < 0 ? ' fewer' : ' more') +
          ' runners'
        : 'she saves ' + amount(screen.full.mean, field)}.{/if}
  </p>
  <div
    class="impact-table"
    role="table"
    aria-label="Skill impacts"
  >
    <div
      class="impact-row head"
      class:evidence
      role="row"
    >
      <span
        class="skill"
        role="columnheader"
      >
        Skill
      </span>
      <span role="columnheader">Alone</span>
      <span role="columnheader">With all</span>
      {#if evidence}<span role="columnheader">CM</span>{/if}
    </div>
    {#each impacts as impact (impact.purchase)}
      <div
        class="impact-row"
        class:bought={bought.has(impact.purchase)}
        class:evidence
        role="row"
      >
        <span
          class="skill"
          role="cell"
        >
          <img
            src={skillImage(impact.offer!.skill.icon)}
            alt=""
            width="18"
            height="18"
          />
          <span>{impact.offer!.skill.name}</span>
          {#if bought.has(impact.purchase)}<Icon
              name="check"
              size={14}
              label="Bought"
            />{/if}
        </span>
        <span
          role="cell"
          class:short={short(impact.alone)}
          class:loss={surelyWorse(impact.alone)}
          title={spread(impact.alone)}
        >
          {signed(impact.alone.mean)}
        </span>
        <span
          role="cell"
          class:short={!!impact.together && short(impact.together)}
          class:loss={!!impact.together && surelyWorse(impact.together)}
          title={impact.together ? spread(impact.together) : undefined}
        >
          {impact.together ? signed(impact.together.mean) : '—'}
        </span>
        {#if evidence}<span
            role="cell"
            class="cm"
            title={impact.evidence
              ? 'What recorded CM races say it adds, ± ' + impact.evidence.error.toFixed(2)
              : undefined}
          >
            {impact.evidence ? signed(impact.evidence.mean) : '—'}
          </span>{/if}
      </div>
    {/each}
    {#each inert as item (item.purchase)}
      <div
        class="impact-row inert"
        class:evidence
        role="row"
      >
        <span
          class="skill"
          role="cell"
        >
          <img
            src={skillImage(item.offer!.skill.icon)}
            alt=""
            width="18"
            height="18"
          />
          <span>{item.offer!.skill.name}</span>
        </span>
        <span
          role="cell"
          class="never"
        >
          Never fires here: needs {item.reason}
        </span>
      </div>
    {/each}
  </div>
</section>

<style>
  .impacts h3 {
    margin: 0 0 2px;
    font-size: 12px;
    font-weight: 650;
    color: var(--text-secondary);
  }
  .impacts .note {
    margin: 0 0 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .impact-table {
    display: grid;
    font-size: 12px;
  }
  .impact-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 60px;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    border-top: 1px solid var(--border-subtle);
    font-variant-numeric: tabular-nums;
  }
  .impact-row.evidence {
    grid-template-columns: minmax(0, 1fr) 52px 60px 52px;
  }
  .impact-row > span:not(.skill) {
    text-align: right;
  }
  /* Evidence from recorded races, set apart from what this search raced. */
  .impact-row .cm {
    color: var(--text-secondary);
  }
  /* A skill that cannot fire here: its reason spans the number columns. */
  .impact-row.inert {
    color: var(--text-secondary);
  }
  .impact-row .never {
    grid-column: 2 / -1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .impact-row.head {
    border-top: 0;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .impact-row .skill {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .impact-row .skill span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .impact-row .skill img {
    flex: none;
    width: 18px;
    height: 18px;
    object-fit: contain;
  }
  .impact-row .skill :global(svg) {
    flex: none;
    color: var(--accent-success);
  }
  .impact-row.bought .skill span {
    font-weight: 650;
  }
  /* Raced only until more races could not change the pick. */
  .impact-row .short {
    color: var(--text-secondary);
  }
  .impact-row .loss {
    color: var(--accent-error);
  }
  :global(.stale) .impacts {
    opacity: 0.5;
  }
</style>
