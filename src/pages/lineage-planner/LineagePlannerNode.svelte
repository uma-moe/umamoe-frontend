<script lang="ts">
  import type { Snippet } from 'svelte';
  import { decodeFactor, factorOptions, factorCatalogState } from '@/lib/catalog/factor-catalog';
  import {
    plannerSparkChance,
    type plannerAffinityBreakdown,
    type plannerAffinityFlows,
    type PlannerNode,
    type PlannerSpark
  } from '@/lib/lineage/planner';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SparkAddControl from '@/components/sparks/SparkAddControl.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';

  interface Props {
    node: PlannerNode;
    breakdown?: ReturnType<typeof plannerAffinityBreakdown>;
    flows?: ReturnType<typeof plannerAffinityFlows>;
    active?: boolean;
    perRun?: boolean;
    children?: Snippet;
    onmodechange?: () => void;
    onsparkschange?: (sparks: PlannerSpark[]) => void;
    onclick?: () => void;
    onclear?: () => void;
    onveteran?: () => void;
    onraces?: () => void;
  }

  let {
    node,
    breakdown = null,
    flows = null,
    active = false,
    perRun = false,
    children,
    onmodechange,
    onsparkschange,
    onclick,
    onclear,
    onveteran,
    onraces
  }: Props = $props();

  const affinity = $derived(breakdown?.total ?? 0);
  const factors = $derived(
    factorOptions().map((factor) => ({ value: factor.id, label: factor.text, type: factor.type }))
  );
  const filled = $derived(Boolean(node.characterId));
  const sortedSparks = $derived(
    node.sparks
      .map((spark, index) => ({ spark, index }))
      .sort((a, b) => {
        const order = (type: number) => (type === 0 ? 0 : type === 1 ? 1 : type === 5 ? 2 : 3);
        return order(a.spark.type) - order(b.spark.type) || b.spark.level - a.spark.level;
      })
  );

  function tone(type: number): 'blue' | 'pink' | 'green' | 'white' {
    return type === 0 ? 'blue' : type === 1 ? 'pink' : type === 5 ? 'green' : 'white';
  }

  function addSpark(value: string, level: number): void {
    const factor = factors.find((factor) => factor.value === value);
    if (!factor) return;
    onsparkschange?.([
      ...node.sparks,
      { factorId: Number(value), name: factor.label, type: factor.type, level }
    ]);
  }
</script>

<article
  class="node layer-{node.layer}"
  class:filled
  class:active
  aria-label={node.label}
  data-position={node.position}
>
  {#if filled}
    <div class="node-heading">
      <div class="node-main">
        {#if node.image}
          <img
            src={node.image}
            alt=""
            loading="lazy"
          />
        {:else}
          <span class="avatar">
            <Icon
              name="user"
              size={node.layer === 3 ? 16 : 22}
            />
          </span>
        {/if}
        <div class="copy">
          <small>{node.label}</small>
          <div class="name-row">
            <strong title={node.name}>{node.name ?? `Character ${node.characterId}`}</strong>
            {#if node.layer === 0 && breakdown}
              <span
                class="total"
                title={`Total affinity ${affinity}: ${breakdown.base} base + ${breakdown.race} race`}
              >
                <Icon
                  name="heart"
                  size={14}
                />{affinity}
              </span>
            {/if}
          </div>
          <small class="source">
            {node.veteran
              ? 'Recorded veteran'
              : node.succession
                ? 'From selected lineage'
                : 'Planned Uma'}
          </small>
        </div>
      </div>
      <div class="node-actions">
        <Button
          variant="secondary"
          size="sm"
          icon="edit"
          ariaLabel={`Change ${node.label}: ${node.name}`}
          {onclick}
        >
          <span class="action-label">Change</span>
        </Button>
        {#if node.layer < 3}
          <Button
            variant="secondary"
            size="sm"
            icon="veterans"
            ariaLabel={`Pick Veteran for ${node.label}`}
            onclick={onveteran}
          >
            <span class="action-label">Pick veteran</span>
          </Button>
        {/if}
        <IconButton
          icon="trash"
          size="sm"
          label={`Clear ${node.label}`}
          onclick={onclear}
        />
      </div>
    </div>
    {#if node.layer === 0 && flows && breakdown}
      <div
        class="composition"
        aria-label="Total affinity composition"
      >
        <span class="composition-label">Total composition</span>
        <span class="term">P1 {flows.p1}</span>
        <span>+</span>
        <span class="term shared">Shared {flows.shared}</span>
        <span>+</span>
        <span class="term">P2 {flows.p2}</span>
        <span>=</span>
        <strong>{affinity}</strong>
      </div>
    {/if}
    {#if children}
      {@render children()}
    {/if}
    {#if node.layer > 0 && node.layer < 3}
      <section
        class="sparks"
        aria-label={`Sparks for ${node.label}`}
      >
        <header class="node-toolbar">
          {#if breakdown}
            <div
              class="affinity-breakdown"
              role="group"
              aria-label="Spark affinity breakdown"
              title={`Spark affinity ${affinity}: ${breakdown.base} base + ${breakdown.race} race`}
            >
              <span class="spark-affinity">
                <strong>{affinity}</strong>
                <Icon
                  name="star"
                  size={12}
                />
              </span>
              <span>=</span>
              <span class="base">
                <b>{breakdown.base}</b>
                Base
              </span>
              <span>+</span>
              <span class="race">
                <b>{breakdown.race}</b>
                Race
              </span>
            </div>
          {/if}
          <span class="race-action">
            <Button
              variant="secondary"
              size="sm"
              icon="trophy"
              ariaLabel={`Edit race wins for ${node.label}`}
              onclick={onraces}
            >
              <span class="race-label">Race wins ·</span>
              {node.winSaddleIds.length}
            </Button><Button
              variant="secondary"
              size="sm"
              onclick={onmodechange}
            >
              {perRun ? 'Per Run' : 'Per Inh.'}
            </Button>
          </span>
        </header>
        {#each sortedSparks as { spark, index }}
          <SparkItem
            name={spark.name || decodeFactor(spark.factorId * 10 + spark.level).name}
            level={spark.level}
            tone={tone(spark.type)}
            chance={`${plannerSparkChance(spark, affinity, perRun).toFixed(2)}%`}
            compact
            removeLabel={`Remove ${spark.name} from ${node.label}`}
            onremove={() => onsparkschange?.(node.sparks.filter((_, current) => current !== index))}
          />
        {:else}
          <small>No sparks on this character</small>
        {/each}
        <SparkAddControl
          id={`spark-add-${node.position}`}
          label={node.label}
          options={factors}
          {...$factorCatalogState}
          onadd={addSpark}
        />
      </section>
    {/if}
  {:else}
    <div class="node-heading">
      <div class="empty-identity">
        <Icon
          name={node.layer === 0 ? 'user' : 'lineage'}
          size={22}
        />
        <div>
          <strong>{node.label}</strong>
          <small>
            {node.layer === 0
              ? 'Who are you training?'
              : node.layer === 1
                ? 'Import a lineage or plan your own'
                : 'Choose an ancestor'}
          </small>
        </div>
      </div>
      <div class="empty-actions">
        {#if node.layer > 0 && node.layer < 3}
          <Button
            size="sm"
            variant="secondary"
            icon="veterans"
            ariaLabel={`Pick Veteran for ${node.label}`}
            onclick={onveteran}
          >
            Pick veteran
          </Button>
        {/if}
        <Button
          size="sm"
          variant={node.layer === 0 ? 'primary' : 'secondary'}
          icon="add"
          ariaLabel={`Choose ${node.label}`}
          {onclick}
        >
          Choose Uma
        </Button>
        {#if node.layer === 0}
          <Button
            size="sm"
            variant="ghost"
            icon="veterans"
            ariaLabel={`Pick Veteran for ${node.label}`}
            onclick={onveteran}
          >
            Use veteran
          </Button>
        {/if}
      </div>
    </div>
  {/if}
</article>

<style>
  @import './lineage-planner-node.css';
</style>
