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
    loadSupportCardCatalog,
    type SupportCardCatalogEntry
  } from '@/lib/catalog/support-card-catalog';
  import { supportCardDisplay } from '@/lib/supports/support-card';
  import {
    loadCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import { watchFactorCatalog, decodeFactorEntry } from '@/lib/catalog/factor-catalog';
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
  const instanceId = $props.id();

  let selectedParent = $state(''),
    mobileTraining = $state(false);
  let supports = $state.raw(new Map<string, SupportCardCatalogEntry>()),
    characters = $state.raw(new Map<number, CharacterCatalogEntry>());

  $effect(() => {
    selectedParent = String(parents[0]?.positionId ?? '');
  });

  onMount(() => {
    void loadSupportCardCatalog()
      .then((rows) => (supports = new Map(rows.map((row) => [row.id, row]))))
      .catch(() => {});
    void loadCharacterCatalog()
      .then((rows) => (characters = rows))
      .catch(() => {});
    const unwatch = watchFactorCatalog(),
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
      <h3>
        Support deck <span>{deck.length} {deck.length === 1 ? 'card' : 'cards'}</span>
      </h3>
      {#if deck?.length}
        <ul class="support-deck">
          {#each deck as card}
            {@const resource = supports.get(String(card.id))}
            {@const display = resource ? supportCardDisplay(resource) : undefined}
            <li
              title={(display ? display.character + ' · ' + display.title : 'Support ' + card.id) +
                ' · limit break ' +
                card.lb}
            >
              <Artwork
                src={supportCardImagePath(card.id)}
                fallbackSrc="/assets/images/placeholder-card.webp"
                alt={display?.character ?? 'Support ' + card.id}
                kind="card"
                size="sm"
              />
              <span class="support-name">{display?.character ?? 'Card ' + card.id}</span>
              <div class="support-meta">
                {#if resource && [1, 2, 3].includes(resource.rarity)}
                  {@const rarity =
                    resource.rarity === 3 ? 'SSR' : resource.rarity === 2 ? 'SR' : 'R'}
                  <img
                    src={'/game-assets/support-rarity/' + rarity.toLowerCase() + '.png'}
                    alt={rarity}
                    width="18"
                    height="18"
                  />
                {/if}
                <span class="support-lb"><LimitBreak value={card.lb} /></span>
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
                      : 'P' + branch + ' · Grandparent ' + (parent.positionId % 10),
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
    <h3 class="training-title">Training setup</h3>
    {@render trainingSections()}
  {/if}
</section>

<style>
  .training {
    margin: 0;
    padding: 0;
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 12px;
  }
  .support-section,
  .inheritance-section {
    display: grid;
    align-content: start;
    gap: 8px;
    min-width: 0;
  }
  .mobile-training {
    min-width: 0;
  }
  .mobile-training :global(details[open] .disclosure-content) {
    display: grid;
    gap: 12px;
  }
  .training h3 {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0;
    font-size: 12px;
    font-weight: 600;
  }
  .training h3.training-title {
    font-size: 13px;
    margin-bottom: 2px;
  }
  .training h3 span {
    font-size: 10px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .training p {
    margin: 0;
  }
  .support-deck {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .support-deck li {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    column-gap: 5px;
    row-gap: 2px;
    align-items: center;
    min-width: 0;
    padding: 3px 0;
  }
  .support-deck :global(.art) {
    grid-row: 1 / 3;
    width: 34px;
    height: 44px;
    align-self: center;
    border: 0;
    background: transparent;
  }
  .support-deck :global(.art img),
  .parent-builds :global(.art img) {
    object-fit: contain;
  }
  .support-name {
    min-width: 0;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .support-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px 5px;
    min-width: 0;
  }
  .support-meta img {
    object-fit: contain;
    flex: none;
  }
  .support-lb {
    display: flex;
    align-items: center;
    gap: 0;
    font-size: 14px;
    line-height: 1;
  }
  .parent-builds {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .parent-factors {
    min-width: 0;
  }
  .parent-factors > header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .parent-factors > header p {
    font-size: 10px;
    text-align: right;
  }
  .parent-sparks {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 8px 0 0;
    min-width: 0;
  }
  .parent-sparks :global(.spark) {
    max-width: 100%;
  }
  .parent-sparks :global(.name) {
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
  }
  p {
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .training h3 {
    margin: 0;
  }
  .own-factors {
    min-width: 0;
  }
  @media (max-width: 1100px) {
    .support-deck {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 650px) {
    .support-lb {
      font-size: 12px;
    }
    .support-meta img {
      width: 16px;
      height: 16px;
    }
  }
</style>
