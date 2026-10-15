<script lang="ts">
  import {
    plannerNodeAffinity,
    plannerSkillSparks,
    plannerSparkChance,
    type PlannerAffinity,
    type PlannerNode,
    type PlannerPosition,
    type PlannerSpark
  } from '@/lib/lineage/planner';
  import { sparkMetrics } from '@/lib/inheritance/sparks/spark-probability';
  import Icon from '@/components/Icon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import LineageSkillCreation from './LineageSkillCreation.svelte';

  let {
    nodes,
    affinity,
    perRun = $bindable(false),
    tab = $bindable('base'),
    skillIcons = new Map<string, string>()
  }: {
    nodes: Record<PlannerPosition, PlannerNode>;
    affinity: PlannerAffinity | null;
    perRun?: boolean;
    tab?: string;
    skillIcons?: Map<string, string>;
  } = $props();

  const tabs = [
    { id: 'base', label: 'Base Odds' },
    { id: 'sources', label: 'Per Source' },
    { id: 'combined', label: 'Combined' },
    { id: 'skills', label: 'Skill Sparks' }
  ];

  const groups = [
    { label: 'Stats', tone: 'blue', type: 0 },
    { label: 'Aptitude', tone: 'pink', type: 1 },
    { label: 'Unique', tone: 'green', type: 5 },
    { label: 'Race', tone: 'white', type: 2 },
    { label: 'Skill', tone: 'white', type: 3 },
    { label: 'Scenario', tone: 'white', type: 4 }
  ];

  const positions: PlannerPosition[] = ['p1', 'p2', 'p1-1', 'p1-2', 'p2-1', 'p2-2'];

  const sources = $derived(
    affinity
      ? positions
          .filter((position) => nodes[position].characterId != null)
          .map((position) => ({
            node: nodes[position],
            label: nodes[position].layer === 1 ? position.toUpperCase() : `GP${position.slice(1)}`,
            affinity: plannerNodeAffinity(affinity, position)
          }))
      : []
  );

  const summary = $derived(
    sources
      .flatMap((source) =>
        source.node.sparks.map((spark) => ({
          ...source,
          spark,
          chance: plannerSparkChance(spark, source.affinity, perRun)
        }))
      )
      .sort((a, b) => b.chance - a.chance)
  );

  const combined = $derived.by(() => {
    const byName = new Map<string, typeof summary>();
    for (const entry of summary) {
      const entries = byName.get(entry.spark.name) ?? [];
      entries.push(entry);
      byName.set(entry.spark.name, entries);
    }

    return [...byName.values()]
      .map((entries) => ({
        spark: entries[0]!.spark,
        sources: entries,
        metrics: sparkMetrics(entries, perRun)
      }))
      .sort((a, b) => b.metrics.expected - a.metrics.expected);
  });

  const skills = $derived(plannerSkillSparks(nodes));

  function groupFor(type: number) {
    return groups.find((group) => group.type === type) ?? groups[4]!;
  }

  function base(spark: PlannerSpark) {
    return plannerSparkChance(spark, 0, false);
  }

  function chance(type: number, level: number, affinity: number, run = perRun) {
    return plannerSparkChance({ type, level, factorId: 0, name: '' }, affinity, run);
  }
</script>

<section
  class="odds-panel"
  aria-labelledby="spark-odds-title"
>
  <header>
    <Icon
      name="star"
      size={17}
    />
    <h2 id="spark-odds-title">Spark Proc Odds</h2>
    {#if sources.length}
      <span
        class="mode"
        title={perRun ? 'Showing per-run chance (2 rolls)' : 'Showing per-inheritance chance'}
      >
        <Button
          variant="secondary"
          size="sm"
          ariaPressed={perRun}
          onclick={() => (perRun = !perRun)}
        >
          {perRun ? 'Per Run' : 'Per Inh.'}
        </Button>
      </span>
    {/if}
  </header>
  {#if !sources.length}
    <p class="empty">Add at least one parent to see spark inheritance odds</p>
  {:else}
    <Tabs
      items={tabs}
      bind:value={tab}
      variant="underline"
      label="Spark odds views"
    />
    {#if tab === 'base'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables need keyboard focus for horizontal navigation.) -->
      <div
        class="odds-scroll desktop-base"
        role="region"
        aria-label="Base odds table"
        tabindex="0"
      >
        <table
          class="odds-table"
          aria-label="Base spark inheritance odds"
        >
          <thead>
            <tr class="group-row">
              <th
                rowspan="2"
                scope="col"
              >
                Source / Base odds
              </th>
              {#each groups as group}
                <th
                  colspan="3"
                  scope="colgroup"
                  data-tone={group.tone}
                >
                  {group.label}
                </th>
              {/each}
            </tr>
            <tr class="base-row">
              {#each groups as group}
                {#each [1, 2, 3] as level}
                  <th
                    class:group-start={level === 1}
                    data-tone={group.tone}
                    scope="col"
                    aria-label={`${group.label} ${level} star base chance`}
                  >
                    {chance(group.type, level, 0, false)}%
                    <span>{level}★</span>
                  </th>
                {/each}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each sources as source}
              <tr>
                <th>
                  <span class="odds-source">
                    {#if source.node.image}
                      <img
                        src={source.node.image}
                        alt=""
                      />
                    {/if}
                    <span>
                      <b>{source.node.name}</b>
                      <small>♥ {source.affinity}</small>
                    </span>
                  </span>
                </th>
                {#each groups as group}
                  {#each [1, 2, 3] as level}
                    <td data-tone={group.tone}>
                      {chance(group.type, level, source.affinity).toFixed(2)}%
                    </td>
                  {/each}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables need keyboard focus for horizontal navigation.) -->
      <div
        class="odds-scroll mobile-base"
        role="region"
        aria-label="Base odds by character"
        tabindex="0"
      >
        <table aria-label="Base spark inheritance odds by character">
          <thead>
            <tr>
              <th scope="col">Spark</th>
              {#each sources as source}
                <th
                  scope="col"
                  title={`${source.node.name} (${source.label}) ♥ ${source.affinity}`}
                >
                  {#if source.node.image}
                    <img
                      src={source.node.image}
                      alt={`${source.node.name} ♥ ${source.affinity}`}
                    />
                  {/if}
                  <span>{source.label}</span>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each groups as group}
              {#each [1, 2, 3] as level}
                <tr
                  data-tone={group.tone}
                  class:group-end={level === 3}
                >
                  <th scope="row">
                    {#if level === 1}
                      <small>{group.label}</small>
                    {/if}{level}★
                  </th>
                  {#each sources as source}
                    <td>
                      {chance(group.type, level, source.affinity).toFixed(2)}%
                    </td>
                  {/each}
                </tr>
              {/each}
            {/each}
          </tbody>
        </table>
      </div>
    {:else if tab === 'sources'}
      <div class="summary-list">
        {#if summary.length}
          <div class="summary-row summary-header">
            <span class="sum-rank">#</span>
            <span class="sum-spark">Spark</span>
            <span class="sum-type">Type</span>
            <span class="sum-base">Base</span>
            <span class="sum-src">Source</span>
            <span class="sum-chance-col">{perRun ? 'Per Run' : 'Per Inh.'}</span>
          </div>
        {/if}
        {#each summary as item, index}
          <article
            class="summary-row"
            data-tone={groupFor(item.spark.type).tone}
          >
            <span class="sum-rank">{index + 1}</span>
            <span class="sum-spark">
              <b class="sum-star">{item.spark.level}★</b>
              <span class="sum-name">{item.spark.name}</span>
            </span>
            <span class="sum-type">{groupFor(item.spark.type).label}</span>
            <span class="sum-base">{base(item.spark)}%</span>
            <span
              class="sum-src"
              title={`${item.node.name} (${item.label}) ♥ ${item.affinity}`}
            >
              {#if item.node.image}
                <img
                  src={item.node.image}
                  alt=""
                />
              {/if}
              <span class="sum-src-name">{item.node.name}</span>
              <span class="sum-src-chip">{item.label} ♥ {item.affinity}</span>
            </span>
            <span class="sum-chance-col">
              <span class="meter"><i style:width={`${item.chance}%`}></i></span>
              <strong class="sum-pct">{item.chance.toFixed(2)}%</strong>
            </span>
          </article>
        {:else}
          <p class="empty">
            No sparks available. Add characters with factors to see spark summary.
          </p>
        {/each}
      </div>
    {:else if tab === 'combined'}
      <div class="summary-list">
        {#if combined.length}
          <div class="summary-row combined-row summary-header">
            <span class="sum-spark">Spark</span>
            <span class="sum-type">Type</span>
            <span class="sum-base">Base</span>
            <span class="sum-sources">Sources</span>
            <span class="sum-chance-col">Proc Chance</span>
            <span class="sum-expected">Exp. Procs</span>
          </div>
        {/if}
        {#each combined as item}
          <article
            class="summary-row combined-row"
            data-tone={groupFor(item.spark.type).tone}
          >
            <span class="sum-spark">
              <span class="sum-name">{item.spark.name}</span>
              <small>×{item.sources.length}</small>
            </span>
            <span class="sum-type">{groupFor(item.spark.type).label}</span>
            <span class="sum-base">{base(item.spark)}%</span>
            <span class="sum-sources">
              {#each item.sources as source}
                <span
                  class="comb-source"
                  title={`${source.node.name} (${source.label}) ${source.spark.level}★ ${source.chance}%`}
                >
                  {#if source.node.image}
                    <img
                      src={source.node.image}
                      alt={`${source.node.name} (${source.label})`}
                    />
                  {/if}
                  <b>{source.spark.level}★</b>
                </span>
              {/each}
            </span>
            <span class="sum-chance-col">
              <span class="meter"><i style:width={`${item.metrics.chance}%`}></i></span>
              <strong class="sum-pct">{item.metrics.chance.toFixed(2)}%</strong>
            </span>
            <strong class="sum-expected">{item.metrics.expected.toFixed(2)}x</strong>
          </article>
        {:else}
          <p class="empty">No sparks available.</p>
        {/each}
      </div>
    {:else}
      {#if skills.length}
        <p class="skill-note">Chance of developing spark when skill is learned during training</p>
        <LineageSkillCreation
          {skills}
          {skillIcons}
        />
      {:else}
        <p class="empty">No white sparks in lineage.</p>
      {/if}
    {/if}
  {/if}
</section>

<style>
  @import './lineage-spark-odds.css';
</style>
