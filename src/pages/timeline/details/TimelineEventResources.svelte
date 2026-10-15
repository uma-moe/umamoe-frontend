<script lang="ts">
  import { itemIconPath } from '@/lib/catalog/item-icons';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { timelinePickup, type TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
  import type { PlannerGachaEntry } from '@/lib/carat-planner/carat-planner';
  import type {
    TimelineRewardItem,
    TimelineRewardSummary
  } from '@/lib/timeline/timeline-reward-summary';
  import type { TimelineRecord } from '../timeline-repository';
  import { hideImage } from './timeline-event-details';

  interface Props {
    event: TimelineRecord;
    catalog: TimelinePickupCatalog;
    banner: boolean;
    rewardSummary?: TimelineRewardSummary;
    rewardsLoading: boolean;
    rewardsError: string;
    gacha?: PlannerGachaEntry;
    ratesLoading: boolean;
    ratesError: string;
    onretryrates: () => void;
    onretryrewards: () => void;
  }

  let {
    event,
    catalog,
    banner,
    rewardSummary,
    rewardsLoading,
    rewardsError,
    gacha,
    ratesLoading,
    ratesError,
    onretryrates,
    onretryrewards
  }: Props = $props();

  const formatRate = (rate: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(rate);

  const rarityRate = $derived(
    [...(gacha?.rarity_rates ?? [])].sort((a, b) => b.rarity - a.rarity)[0]?.rate
  );
  const rateSummary = $derived(
    [
      Number.isFinite(rarityRate)
        ? `${event.eventType === 'support_card_banner' ? 'SSR pool' : '3★ pool'} ${formatRate(rarityRate!)}`
        : '',
      gacha?.rates_confidence === 'inferred_standard'
        ? 'Standard rates (estimated)'
        : 'Published banner rates'
    ]
      .filter(Boolean)
      .join(' · ')
  );
  const pickups = $derived.by(() => {
    const kind = event.eventType === 'support_card_banner' ? 'support' : 'character';
    const rates = gacha?.featured_pickups?.length ? gacha.featured_pickups : (gacha?.pickups ?? []);
    const ordered =
      kind === 'support' ? [...rates].sort((a, b) => b.pickup_id - a.pickup_id) : rates;
    if (ordered.length)
      return ordered.map((rate) => ({
        pickup:
          event.pickups?.find((p) => p.id === String(rate.pickup_id)) ??
          timelinePickup(rate.pickup_id, catalog, rate.label, kind),
        rate: Number.isFinite(rate.rate) ? formatRate(rate.rate) + ' per pull' : ''
      }));
    return (event.pickups ?? [])
      .filter((p) => p.kind === kind)
      .map((pickup) => ({ pickup, rate: '' }));
  });
  const rewards = $derived.by(() => {
    const items: TimelineRewardItem[] = [...(rewardSummary?.items ?? [])];
    const free = Math.max(0, Number(gacha?.free_pulls) || 0);
    if (free > 0 && !items.some((item) => item.kind === 'free_pulls'))
      items.push({
        key: 'gacha-free-pulls',
        kind: 'free_pulls',
        amount: free,
        label: `${free} free pulls`,
        countLabel: String(free),
        iconPath: itemIconPath(41)
      });
    return items;
  });
</script>

{#if banner}
  <section class="detail-section">
    <div class="section-heading">
      <h3>
        <Icon
          name="chart"
          size={16}
        />Rate-up rates
      </h3>
      <span class="rates-status">
        {#if ratesLoading}
          <Spinner
            label="Loading banner rates"
            size={14}
          />
          <span>Loading rates…</span>
        {:else if gacha}
          {rateSummary}
        {/if}
      </span>
    </div>
    <div class="pickups rates">
      {#each pickups as { pickup, rate } (pickup.id)}
        <a
          href={pickup.gametoraUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={pickup.image}
            alt={pickup.name}
            width="36"
            height="36"
            onerror={hideImage}
          />
          <span>
            <strong>{pickup.name}</strong>
            <small>{pickup.subLabel}</small>
            <em>{rate || (ratesLoading ? 'Loading rate…' : 'Rate unavailable')}</em>
          </span>
        </a>
      {/each}
    </div>
    {#if ratesError}
      <Banner
        title="Banner rates could not be loaded"
        tone="danger"
      >
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          onclick={onretryrates}
        >
          Retry rates
        </Button>
      </Banner>
    {:else if !ratesLoading && (!gacha || !pickups.some((pickup) => pickup.rate))}
      <p class="resource-status">Published rates are not available for this banner yet.</p>
    {/if}
  </section>
{/if}
{#if rewardsLoading}
  <p class="resource-status">
    <Spinner
      label="Loading event rewards"
      size={14}
    /> Loading event rewards…
  </p>
{:else if rewardsError}
  <Banner
    title="Event rewards could not be loaded"
    tone="danger"
  >
    <Button
      variant="secondary"
      size="sm"
      icon="refresh"
      onclick={onretryrewards}
    >
      Retry rewards
    </Button>
  </Banner>
{/if}
{#if rewards.length || rewardSummary?.variable}
  <section class="detail-section">
    <div class="section-heading">
      <h3>
        <Icon
          name="star"
          size={16}
        />Event rewards
      </h3>
      <span>Available with this event</span>
    </div>
    {#if rewardSummary?.previewItems.length}
      <div class="reward-outcomes">
        <header>
          <strong>{rewardSummary.outcomeHeading}</strong>
          <small>{rewardSummary.previewLabel}</small>
        </header>
        <p>{rewardSummary.outcomeDescription}</p>
        <div
          class="reward-preview"
          aria-label={rewardSummary.previewLabel}
        >
          {#each rewardSummary.previewItems as item}
            <span title={item.label}>
              {#if item.iconPath}
                <img
                  src={item.iconPath}
                  alt=""
                  width="22"
                  height="22"
                  onerror={hideImage}
                />
              {:else}
                <Icon
                  name="user"
                  size={14}
                />
              {/if}
              <b>{item.countLabel}</b>
              {#if ['rainbow-crystal', 'gold-crystal'].includes(item.key)}
                shards
              {/if}
            </span>
          {/each}
        </div>
      </div>
    {:else if rewardSummary?.variable}
      <p class="resource-status">
        Reward tiers exist for this event, but a total or range is not available in the loaded
        resource.
      </p>
    {/if}
    <div class="reward-list">
      {#each rewards as reward (reward.key)}
        <div
          title={reward.label}
          aria-label={reward.label}
        >
          <img
            src={reward.kind === 'free_pulls' && event.eventType === 'support_card_banner'
              ? itemIconPath(111)
              : reward.iconPath}
            alt=""
            width="30"
            height="30"
            onerror={hideImage}
          />
          <strong>
            {reward.kind === 'free_pulls' ? reward.amount + '×' : reward.countLabel}
          </strong>
          {#if ['rainbow_crystal', 'gold_crystal'].includes(reward.kind)}
            shards
          {/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  @import './timeline-detail-section.css';
  @import './timeline-event-pickups.css';
  @import './timeline-event-resources.css';
</style>
