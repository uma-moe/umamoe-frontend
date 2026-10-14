<script lang="ts">
  import Icon from '../Icon.svelte';
  import type { IconName } from '../icon-types';
  import type { TimelineEventData } from '../timeline-types';

  interface Props {
    event: TimelineEventData;
    mobile?: boolean;
    loadImages?: boolean;
    planned?: boolean;
    onopen?: (event: TimelineEventData) => void;
    onplan?: (event: TimelineEventData, planned: boolean) => void;
  }

  let {
    event,
    mobile = false,
    loadImages = true,
    planned = $bindable(false),
    onopen,
    onplan
  }: Props = $props();

  let failedImage = $state<string>();
  let loadedImage = $state<string>();

  const hasImage = $derived(Boolean(event.image));

  const icons: Record<string, IconName> = {
    character_banner: 'user',
    support_card_banner: 'cards',
    paid_banner: 'paid',
    story_event: 'book',
    champions_meeting: 'trophy',
    legend_race: 'race',
    league_of_heroes: 'users',
    masters_challenge: 'star',
    trainer_skills_test: 'book',
    factor_research: 'tune',
    strongest_team: 'users',
    racing_carnival: 'race',
    scenario_release: 'home'
  };

  const hasPickups = $derived(Boolean(event.pickups?.length));
  const hasRace = $derived(Boolean(event.raceLines?.length));
  const hasRewards = $derived(Boolean(event.rewards?.length || event.rewardContext));
  const hasDetails = $derived(hasPickups || hasRace || hasRewards || event.canPlan);
  const metadata = $derived(
    [event.typeLabel, event.gachaLabel, event.rerun && 'Rerun', event.predicted && 'Predicted']
      .filter(Boolean)
      .join(' · ')
  );

  function togglePlan(clickEvent: MouseEvent) {
    clickEvent.stopPropagation();
    planned = !planned;
    onplan?.(event, planned);
  }

  function hideImage(event: Event) {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
  }
</script>

<article
  class="event-card"
  class:is-mobile={mobile}
  class:has-media={hasImage}
  class:no-pickups={!hasPickups}
  class:has-race={hasRace}
  class:can-plan={event.canPlan}
  data-event-type={event.eventType}
  data-event-id={event.id}
>
  <button
    type="button"
    class="open-action"
    aria-label={`Open details for ${event.title}`}
    onclick={(click) => {
      click.currentTarget.focus({ preventScroll: true });
      onopen?.(event);
    }}
  ></button>
  {#if hasImage}
    <div
      class="event-media"
      class:loaded={loadedImage === event.image}
    >
      {#if loadedImage !== event.image}
        <span
          class="media-placeholder"
          role="img"
          aria-label={failedImage === event.image ? 'Artwork unavailable' : 'Loading artwork'}
        >
          <Icon
            name={icons[event.eventType] ?? 'gift'}
            size={22}
          />
        </span>
      {/if}
      {#if failedImage !== event.image}
        <img
          src={loadImages ? event.image : undefined}
          alt={event.title}
          width="512"
          height="125"
          loading="lazy"
          decoding="async"
          onload={() => (loadedImage = event.image)}
          onerror={() => (failedImage = event.image)}
        />
      {/if}
    </div>
  {/if}
  <div class="event-body">
    <div
      class="metadata"
      title={metadata}
    >
      <span class="kind">
        <Icon
          name={icons[event.eventType] ?? 'gift'}
          size={13}
        />
        <span>{event.typeLabel}</span>
      </span>
      {#if event.gachaLabel}
        <span class="metadata-item">
          {event.gachaLabel}
        </span>
      {/if}{#if event.rerun}
        <span class="metadata-item rerun">Rerun</span>
      {/if}{#if event.predicted}
        <span class="metadata-item predicted">Predicted</span>
      {/if}
    </div>
    <h3>{event.title}</h3>
    <div
      class="schedule"
      title={hasRace ? event.raceLines?.join(' · ') : event.context || event.dateLabel}
    >
      <Icon
        name="calendar"
        size={13}
      />
      <time>{event.dateLabel}</time>
      {#if !hasRace && event.context}
        <span class="context">
          {event.context}
        </span>
      {/if}{#if hasDetails}
        <span
          class="details-hint"
          aria-hidden="true"
        >
          Info <Icon
            name="chevron"
            size={12}
          />
        </span>
      {/if}
    </div>
    <div class="event-footer">
      {#if !hasDetails}
        <div
          class="empty-footer"
          aria-hidden="true"
        >
          Event details <Icon
            name="arrow-right"
            size={13}
          />
        </div>
      {/if}
      {#if hasRace}
        <div
          class="race-lines"
          aria-label="Race information"
        >
          {#each event.raceLines ?? [] as line}
            <span>{line}</span>
          {/each}
        </div>
      {/if}
      {#if hasRewards}
        <div
          class="rewards"
          aria-label={`Rewards: ${event.rewardLabel ?? event.rewards?.map((reward) => reward.label).join(', ')}`}
          title={event.rewardLabel}
        >
          {#if event.rewardContext}
            <span class="reward-context">{event.rewardContext}</span>
          {/if}
          {#each event.rewards ?? [] as reward}
            <span
              class="reward-item"
              class:free-pulls={reward.freePulls}
              title={reward.label}
            >
              {#if reward.icon}
                <img
                  src={loadImages ? reward.icon : undefined}
                  alt=""
                  width="26"
                  height="26"
                  loading="lazy"
                  decoding="async"
                  onerror={hideImage}
                />
              {:else}
                <Icon
                  name={reward.fallbackIcon ?? 'gift'}
                  size={17}
                />
              {/if}
              <span>{reward.amount}</span>
            </span>
          {/each}
        </div>
      {/if}
      {#if hasPickups}
        <div
          class="pickups"
          aria-label="Featured pickups"
        >
          {#each event.pickups ?? [] as pickup}
            <a
              href={pickup.gametoraUrl}
              target="_blank"
              rel="noopener noreferrer"
              draggable="false"
              class:character={pickup.kind === 'character'}
              title={pickup.name}
            >
              <img
                src={loadImages ? pickup.image : undefined}
                alt={pickup.name}
                width={pickup.kind === 'character' ? 44 : 42}
                height={pickup.kind === 'character' ? 52 : 42}
                loading="lazy"
                decoding="async"
                onerror={hideImage}
              />
            </a>
          {/each}{#if event.overflowPickups}
            <span class="pickup-overflow">
              +{event.overflowPickups}
            </span>
          {/if}
        </div>
      {/if}
      {#if event.canPlan}
        <button
          type="button"
          class:planned
          class="plan"
          aria-pressed={planned}
          aria-label={`${planned ? 'Remove' : 'Add'} ${event.title} ${planned ? 'from' : 'to'} Carat Planner`}
          title={planned ? 'Remove from Carat Planner' : 'Add to Carat Planner'}
          onclick={togglePlan}
        >
          <Icon
            name={planned ? 'check' : 'chart'}
            size={13}
          />{planned ? 'Added' : 'Plan'}
        </button>
      {/if}
    </div>
  </div>
</article>

<style>
  @import './timeline-event-card.css';
</style>
