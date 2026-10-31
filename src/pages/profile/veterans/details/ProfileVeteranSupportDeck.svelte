<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadSupportCards,
    supportCardImagePath,
    type SupportCardData
  } from '@/lib/game-data/support-cards/support-cards';
  import { supportTypeName } from '@/lib/game-data/support-cards/support-card-details';
  import { veteranSupportCards } from '@/lib/veterans/records/veteran-profile';
  import LimitBreak from '@/components/game/LimitBreak.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import type { ProfileVeteran } from '../../profile-repository';

  let { veteran }: { veteran: ProfileVeteran } = $props();

  let supportCatalog = $state<readonly SupportCardData[]>([]);
  let supportError = $state('');

  const supportDeck = $derived(veteranSupportCards(veteran));

  onMount(() => {
    let active = true;
    if (supportDeck.length)
      void loadSupportCards()
        .then((cards) => {
          if (active) supportCatalog = cards;
        })
        .catch(() => {
          if (active)
            supportError = 'Support names are unavailable, so recorded card IDs are shown.';
        });
    return () => {
      active = false;
    };
  });
</script>

<section
  class="support-section"
  aria-label="Training support cards"
>
  <header>
    <h3>
      Support deck <span>{supportDeck.length}</span>
    </h3>
  </header>
  {#if supportDeck.length}
    <ul class="support-deck">
      {#each supportDeck as support}
        {@const id = support.support_card_id}
        {@const card = supportCatalog.find((card) => Number(card.id) === id)}
        {@const type = card
          ? card.type === 'group'
            ? 'Group'
            : supportTypeName(card.type)
          : undefined}
        <li title={card ? `${card.name}, ${supportTypeName(card.type)}` : `Support card ${id}`}>
          <Artwork
            src={supportCardImagePath(id)}
            fallbackSrc="/assets/images/placeholder-card.webp"
            alt={card?.name ?? `Support card ${id}`}
            kind="card"
            size="sm"
          />
          <span class="support-name">
            {#if type}
              <img
                class="support-type"
                src={'/assets/images/icon/stats/' + type.toLowerCase() + '.webp'}
                alt={type + ' support'}
                title={type + ' support'}
                width="16"
                height="16"
              />
            {/if}{card?.name ?? 'Card ' + id}
          </span>
          <div class="support-meta">
            {#if card && [1, 2, 3].includes(card.rarity)}
              {@const rarity = card.rarity === 3 ? 'SSR' : card.rarity === 2 ? 'SR' : 'R'}
              <img
                class="support-rarity"
                src={'/game-assets/support-rarity/' + rarity.toLowerCase() + '.png'}
                alt={rarity}
                width="18"
                height="18"
              />
            {/if}
            <span class="support-lb"><LimitBreak value={support.limit_break_count} /></span>
          </div>
        </li>
      {/each}
    </ul>
    {#if supportError}
      <p role="status">{supportError}</p>
    {/if}
  {:else}
    <p>No support cards recorded.</p>
  {/if}
</section>

<style>
  @import './veteran-details-shared.css';
  @import './profile-veteran-support-deck.css';
</style>
