<script lang="ts">
  import { onMount } from 'svelte';
  import type { Build } from '../hakuraku-types';
  import Artwork from '@/components/game/Artwork.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import RadioGroup from '@/components/controls/RadioGroup.svelte';
  import SparkItem from '@/components/sparks/SparkItem.svelte';
  import {
    supportCardImagePath,
    loadSupportCards,
    type SupportCardData
  } from '@/lib/game-data/support-cards/support-cards';
  import {
    supportCardDisplay,
    supportTypeName
  } from '@/lib/game-data/support-cards/support-card-details';
  import { loadCharacters, type CharacterData } from '@/lib/game-data/characters';
  import { watchFactors, decodeFactorEntry } from '@/lib/game-data/factors/factors';
  import { portrait } from '../analysis-view';

  let {
    deck = [],
    parents = [],
    ownFactors = [],
    label = 'Runner'
  }: {
    deck?: Pick<NonNullable<Build['deck']>[number], 'id' | 'lb'>[];
    parents?: Pick<NonNullable<Build['parents']>[number], 'positionId' | 'cardId' | 'factors'>[];
    ownFactors?: { id: number; level: number }[];
    label?: string;
  } = $props();

  type SupportType = ReturnType<typeof supportTypeName> | 'Group';

  const instanceId = $props.id();

  let selectedParent = $state(''),
    mobileTraining = $state(false);

  let supports = $state.raw(new Map<string, SupportCardData>()),
    characters = $state.raw(new Map<number, CharacterData>());

  $effect(() => {
    selectedParent = String(parents[0]?.positionId ?? '');
  });

  function supportType(card: SupportCardData): SupportType {
    return card.type === 'group' ? 'Group' : supportTypeName(card.type);
  }

  onMount(() => {
    void loadSupportCards()
      .then((rows) => (supports = new Map(rows.map((row) => [row.id, row]))))
      .catch(() => {});

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
    <section class="support-section">
      <h3>Support deck</h3>
      {#if deck?.length}
        <ul class="support-deck">
          {#each deck as card}
            {@const resource = supports.get(String(card.id))}
            {@const display = resource ? supportCardDisplay(resource) : undefined}
            {@const type = resource ? supportType(resource) : undefined}
            <li
              title={(display ? display.character + ', ' + display.title : 'Support ' + card.id) +
                ', limit break ' +
                card.lb}
            >
              <span class="support-art">
                <Artwork
                  src={supportCardImagePath(card.id)}
                  fallbackSrc="/assets/images/placeholder-card.webp"
                  alt={display?.character ?? 'Support ' + card.id}
                  kind="card"
                  size="sm"
                />
                {#if type}
                  <img
                    class="support-type"
                    src={'/assets/images/icon/stats/' + type.toLowerCase() + '.webp'}
                    alt={type + ' support'}
                    title={type + ' support'}
                    width="16"
                    height="16"
                  />
                {/if}
              </span>
              <div class="support-text">
                <span class="support-name">{display?.character ?? 'Card ' + card.id}</span>
                <div class="support-meta">
                  {#if resource && [1, 2, 3].includes(resource.rarity)}
                    {@const rarity =
                      resource.rarity === 3 ? 'SSR' : resource.rarity === 2 ? 'SR' : 'R'}
                    <img
                      class="support-rarity"
                      src={'/game-assets/support-rarity/' + rarity.toLowerCase() + '.png'}
                      alt={rarity}
                      width="22"
                      height="22"
                    />
                  {/if}
                  <span class="support-lb"><LimitBreak value={card.lb} /></span>
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p>No support deck was captured.</p>
      {/if}
    </section>
    <section class="inheritance-section">
      <h3>Parents & grandparents</h3>
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
      {@const activeParent =
        parents.find((parent) => String(parent.positionId) === selectedParent) ?? parents[0]!}
      <section class="parent-factors">
        <header>
          <h3>
            Sparks <span>{activeParent.factors.length}</span>
          </h3>
          <p>{characters.get(activeParent.cardId)?.name ?? activeParent.cardId}</p>
        </header>
        <div class="parent-sparks">
          {#each activeParent.factors as factor}
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
    {#if ownFactors.length}
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
