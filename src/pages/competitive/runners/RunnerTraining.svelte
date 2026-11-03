<script lang="ts">
  import { onMount } from 'svelte';
  import type { Build } from '../hakuraku-types';
  import Artwork from '@/components/game/Artwork.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import RadioGroup from '@/components/controls/RadioGroup.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import RunnerSupportDeck from './RunnerSupportDeck.svelte';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import {
    watchFactors,
    decodeFactorEntry,
    factorLoadingState
  } from '@/lib/game-data/factors/factors';
  import { parentSparkTotals } from './parent-spark-totals';
  import { portrait } from '../analysis-view';

  let {
    deck = [],
    parents = [],
    ownFactors = [],
    showOwnSparks = true,
    label = 'Runner'
  }: {
    deck?: Pick<NonNullable<Build['deck']>[number], 'id' | 'lb'>[];
    parents?: Pick<NonNullable<Build['parents']>[number], 'positionId' | 'cardId' | 'factors'>[];
    ownFactors?: { id: number; level: number }[];
    showOwnSparks?: boolean;
    label?: string;
  } = $props();

  const instanceId = $props.id();

  let selectedParent = $state('total'),
    mobileTraining = $state(false);

  let characters = $state.raw(new Map<number, CharacterData>());

  const activeParent = $derived(
    parents.find((parent) => String(parent.positionId) === selectedParent)
  );
  const selectedSparks = $derived.by(() => {
    $factorLoadingState;
    return selectedParent === 'total'
      ? parentSparkTotals(parents)
      : (activeParent?.factors ?? []).map((factor) => decodeFactorEntry(factor.id, factor.level));
  });

  $effect(() => {
    parents;
    selectedParent = 'total';
  });

  onMount(() => {
    void loadCharacters()
      .then((rows) => (characters = rows))
      .catch(() => {});

    const unwatch = watchFactors(),
      media = matchMedia('(max-width:767px)'),
      adapt = () => (mobileTraining = media.matches);

    adapt();
    media.addEventListener('change', adapt);
    return () => {
      unwatch();
      media.removeEventListener('change', adapt);
    };
  });
</script>

<section
  class="training"
  aria-label={label + ' training setup'}
>
  {#snippet trainingSections()}
    <RunnerSupportDeck {deck} />
    <section class="inheritance-section">
      <header class="inheritance-heading">
        <h3>Parents & grandparents</h3>
        {#if parents.length}
          <Button
            size="sm"
            variant={selectedParent === 'total' ? 'primary' : 'secondary'}
            ariaPressed={selectedParent === 'total'}
            onclick={() => (selectedParent = 'total')}
          >
            Total
          </Button>
        {/if}
      </header>
      {#if parents?.length}
        <div class="parent-builds">
          {#each [1, 2] as branch}
            {@const branchParents = parents
              .filter((parent) => Math.floor(parent.positionId / 10) === branch)
              .toSorted((a, b) => a.positionId - b.positionId)}
            {#if branchParents.length}
              <RadioGroup
                id={instanceId + '-inheritance-' + branch}
                legend={'Parent ' + branch}
                cards
                compact
                bind:value={selectedParent}
                options={branchParents.map((parent) => ({
                  value: String(parent.positionId),
                  label: characters.get(parent.cardId)?.name ?? String(parent.cardId),
                  shortLabel:
                    parent.positionId === branch * 10
                      ? 'P' + branch
                      : 'GP' + (parent.positionId % 10),
                  description:
                    parent.positionId === branch * 10
                      ? 'Parent ' + branch
                      : 'Grandparent ' + (parent.positionId % 10) + ' of parent ' + branch,
                  image: portrait(parent.cardId)
                }))}
              />
            {/if}
          {/each}
        </div>
      {:else}
        <p>No inheritance setup was captured.</p>
      {/if}
    </section>
    {#if parents?.length}
      <section class="parent-factors">
        <header>
          <h3>
            Sparks <span>{selectedSparks.length}</span>
          </h3>
          <p>
            {selectedParent === 'total'
              ? 'Total'
              : activeParent
                ? (characters.get(activeParent.cardId)?.name ?? activeParent.cardId)
                : ''}
          </p>
        </header>
        <div class="parent-sparks">
          {#each selectedSparks as spark}
            <SparkItem
              name={spark.name}
              level={spark.level}
              tone={spark.category === 'stats'
                ? 'blue'
                : spark.category === 'aptitude'
                  ? 'pink'
                  : spark.category === 'unique'
                    ? 'green'
                    : 'white'}
              compact
            />
          {/each}
        </div>
      </section>
    {/if}
    {#if showOwnSparks && ownFactors.length}
      <section class="own-factors">
        <h3>
          Own sparks <span>{ownFactors.length}</span>
        </h3>
        <div class="parent-sparks">
          {#each ownFactors as factor}
            {@const spark = decodeFactorEntry(factor.id, factor.level)}<SparkItem
              name={spark.name}
              level={spark.level}
              tone={spark.category === 'stats'
                ? 'blue'
                : spark.category === 'aptitude'
                  ? 'pink'
                  : spark.category === 'unique'
                    ? 'green'
                    : 'white'}
              compact
            />
          {/each}
        </div>
      </section>
    {/if}
  {/snippet}
  <!-- Phones fold the setup away under its own toggle; wider cards show it as part of the build. -->
  {#if mobileTraining}
    <div class="mobile-training">
      <Disclosure
        id={instanceId + '-training'}
        title="Training setup"
        compact
      >
        {@render trainingSections()}
      </Disclosure>
    </div>
  {:else}
    {@render trainingSections()}
  {/if}
</section>

<style>
  @import './runner-training.css';
</style>
