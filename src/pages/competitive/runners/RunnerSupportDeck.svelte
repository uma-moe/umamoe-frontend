<script lang="ts">
  import { onMount } from 'svelte';
  import type { Build } from '../hakuraku-types';
  import Artwork from '@/components/game/Artwork.svelte';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import {
    supportCardImagePath,
    loadSupportCards,
    type SupportCardData
  } from '@/lib/game-data/support-cards/support-cards';
  import {
    supportCardDisplay,
    supportTypeName
  } from '@/lib/game-data/support-cards/support-card-details';

  let {
    deck = [],
    compact = false
  }: {
    deck?: Pick<NonNullable<Build['deck']>[number], 'id' | 'lb'>[];
    compact?: boolean;
  } = $props();

  let supports = $state.raw(new Map<string, SupportCardData>());

  function supportType(card: SupportCardData) {
    return card.type === 'group' ? 'Group' : supportTypeName(card.type);
  }

  onMount(() => {
    void loadSupportCards()
      .then((rows) => (supports = new Map(rows.map((row) => [row.id, row]))))
      .catch(() => {});
  });
</script>

<section
  class="support-section"
  class:compact
  aria-label="Support deck"
>
  <h3>Support deck</h3>
  {#if deck?.length}
    <ul class="support-deck">
      {#each deck as card}
        {@const resource = supports.get(String(card.id))}
        {@const display = resource ? supportCardDisplay(resource) : undefined}
        {@const type = resource ? supportType(resource) : undefined}
        <li
          class="tile"
          title={(display ? display.character + ', ' + display.title : 'Support ' + card.id) +
            ', limit break ' +
            card.lb}
        >
          <span class="tile-art">
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
          <div class="tile-text">
            <span class="tile-name">{display?.character ?? 'Card ' + card.id}</span>
            <div class="tile-meta">
              {#if resource && [1, 2, 3].includes(resource.rarity)}
                {@const rarity = resource.rarity === 3 ? 'SSR' : resource.rarity === 2 ? 'SR' : 'R'}
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

<style>
  @import './runner-support-deck.css';
</style>
