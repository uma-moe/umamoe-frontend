<script lang="ts">
  import Badge from '@/components/Badge.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import Icon from '@/components/Icon.svelte';
  import { timelineDisplayTitle } from '@/lib/timeline/events/timeline-pickups';
  import type { GachaBanner } from './gacha-simulator-repository';

  interface Props {
    banners: GachaBanner[];
    value?: string;
    onselect?: (eventId: string) => void;
  }

  let { banners, value = $bindable(''), onselect }: Props = $props();
  let query = $state('');

  const bannersById = $derived(new Map(banners.map((banner) => [banner.event.id, banner])));
  const options = $derived(
    banners.map(({ event }) => ({
      value: event.id,
      label: timelineDisplayTitle(event),
      keywords: [
        event.title,
        event.dateLabel,
        event.gachaLabel,
        ...(event.pickups?.flatMap((pickup) => [pickup.name, ...(pickup.searchTerms ?? [])]) ?? [])
      ]
        .filter(Boolean)
        .join(' ')
    }))
  );
</script>

<div class="picker">
  <Combobox
    id="gacha-banner"
    label="Choose a banner"
    hideLabel
    prefixIcon="search"
    batchSize={40}
    bind:value
    bind:query
    {options}
    placeholder="Search banners or featured names…"
    clearLabel="Clear banner search"
    emptyText="No banners match this search."
    onchange={onselect}
  >
    {#snippet optionContent(option)}
      {@const banner = bannersById.get(option.value)}
      {#if banner}
        <span class="banner-option">
          <span class="banner-art">
            {#if banner.event.image}
              <img
                src={banner.event.image}
                alt=""
                loading="lazy"
              />
            {:else}
              <Icon name={banner.pool.kind === 'support' ? 'cards' : 'user'} />
            {/if}
          </span>
          <span class="banner-copy">
            <span class="option-title">
              <strong>{option.label}</strong>
              {#if banner.pool.source !== 'live'}
                <Badge tone="warning">
                  {banner.pool.source === 'preliminary' ? 'Preliminary' : 'Estimated'}
                </Badge>
              {/if}
            </span>
            <time>{banner.event.dateLabel}</time>
          </span>
        </span>
      {/if}
    {/snippet}
  </Combobox>
</div>

<style>
  .picker {
    min-width: 0;
    position: relative;
  }
  .picker :global(.combo-panel) {
    max-height: min(320px, 46dvh);
  }
  .banner-option {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    display: grid;
    grid-template-columns: 132px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding-block: 4px;
  }
  .banner-art {
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-subtle);
    background: var(--surface-2);
  }
  .banner-art img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
  .banner-copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .option-title {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .option-title strong,
  .banner-copy time {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .option-title :global(.badge) {
    min-height: 17px;
    flex: none;
    padding: 2px 5px;
    font-size: 8px;
  }
  .banner-copy time {
    color: var(--text-secondary);
    font-size: 10px;
  }
  @media (max-width: 480px) {
    .banner-option {
      grid-template-columns: 104px minmax(0, 1fr);
      gap: 6px;
    }
    .banner-art {
      height: 28px;
    }
  }
</style>
