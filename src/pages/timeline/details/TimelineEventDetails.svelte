<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { contentUrl, sanitizeContentHtml } from '@/lib/content-html';
  import { buildTimelinePrediction } from '@/lib/timeline/prediction/timeline-prediction';
  import type { TimelineCalculation } from '@/lib/timeline/prediction/timeline-prediction-types';
  import { timelineRaceEventFacts } from '@/lib/timeline/events/timeline-race-facts';
  import {
    timelineDisplayTitle,
    type TimelinePickupCatalog
  } from '@/lib/timeline/events/timeline-pickups';
  import type { PlannerGachaEntry } from '@/lib/carat-planner/carat-planner';
  import type { TimelineRewardSummary } from '@/lib/timeline/events/timeline-reward-summary';
  import type { TimelineRecord } from '../timeline-repository';
  import TimelineEventPrediction from './TimelineEventPrediction.svelte';
  import TimelineEventResources from './TimelineEventResources.svelte';
  import { hideImage } from './timeline-event-details';

  interface Props {
    event: TimelineRecord;
    catalog: TimelinePickupCatalog;
    calculation: TimelineCalculation | null;
    rewardSummary?: TimelineRewardSummary;
    rewardsLoading: boolean;
    rewardsError: string;
    gacha?: PlannerGachaEntry;
    ratesLoading: boolean;
    ratesError: string;
    planned: boolean;
    onplan: (event: TimelineRecord, planned: boolean) => void;
    onclose: () => void;
    onretryrates: () => void;
    onretryrewards: () => void;
  }

  let {
    event,
    catalog,
    calculation,
    rewardSummary,
    rewardsLoading,
    rewardsError,
    gacha,
    ratesLoading,
    ratesError,
    planned,
    onplan,
    onclose,
    onretryrates,
    onretryrewards
  }: Props = $props();

  const title = $derived(timelineDisplayTitle(event));
  const facts = $derived(timelineRaceEventFacts(event));
  const html = $derived(sanitizeContentHtml(event.description ?? ''));
  const prediction = $derived(buildTimelinePrediction(event, calculation));
  const banner = $derived(
    ['character_banner', 'support_card_banner'].includes(event.eventType) && Boolean(event.canPlan)
  );

  const canPlan = $derived(
    Boolean(
      event.canPlan ||
      event.plannerRewardAvailable ||
      (rewardSummary && rewardSummary.mode !== 'placement')
    )
  );

  const highlight = $derived(
    [
      'champions_meeting',
      'league_of_heroes',
      'legend_race',
      'masters_challenge',
      'trainer_skills_test'
    ].includes(event.eventType)
  );

  const dateLabel = $derived(
    event.date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    })
  );

  const endLabel = $derived(
    event.estimatedEndDate && event.estimatedEndDate > event.date
      ? event.estimatedEndDate.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC'
        })
      : ''
  );

  const freePullSource = $derived(contentUrl(gacha?.free_pulls_source_url));
</script>

<Dialog
  open
  {title}
  description={dateLabel + (endLabel ? ' – ' + endLabel : '')}
  maxWidth="560px"
  maxHeight="82dvh"
  mobileMaxHeight="88dvh"
  contentPadding="9px 12px 10px"
  mobileContentPadding="10px 12px 12px"
  {onclose}
>
  {#snippet eyebrow()}
    <div class="metadata">
      <Icon
        name={event.eventType === 'character_banner'
          ? 'user'
          : event.eventType === 'support_card_banner'
            ? 'grid'
            : 'calendar'}
        size={15}
      />{event.typeLabel}{event.gachaLabel ? ', ' + event.gachaLabel : ''}{event.rerun
        ? ', rerun'
        : ''}{event.predicted ? ', predicted' : ''}{#if prediction?.fitLabel}
        <span>
          {prediction.fitLabel} date fit
        </span>
      {/if}
    </div>
  {/snippet}
  <div
    class="event-details"
    data-event-type={event.eventType}
  >
    {#if event.image}
      <img
        class="banner"
        src={event.image}
        alt={title}
        width="512"
        height="125"
        decoding="async"
        onerror={hideImage}
      />
    {/if}
    <TimelineEventResources
      {event}
      {catalog}
      {banner}
      {rewardSummary}
      {rewardsLoading}
      {rewardsError}
      {gacha}
      {ratesLoading}
      {ratesError}
      {onretryrates}
      {onretryrewards}
    />
    {#if facts.length}
      <section class="detail-section">
        <div class="section-heading">
          <h3>
            <Icon
              name="race"
              size={16}
            />Race details
          </h3>
        </div>
        <dl class="facts">
          {#each facts as fact}
            <div>
              <Icon
                name={fact.label === 'Course'
                  ? 'race'
                  : fact.label === 'Conditions'
                    ? 'sun'
                    : 'timeline'}
                size={16}
              />
              <dt>{fact.label}</dt>
              <dd>
                <strong>{fact.primary}</strong>
                {#if fact.secondary}
                  <span>{fact.secondary}</span>
                {/if}
              </dd>
            </div>
          {/each}
        </dl>
      </section>
    {/if}
    {#if html}
      <section
        class="detail-section description"
        class:highlight
      >
        <div class="section-heading">
          {#if highlight}
            <h3>
              <Icon
                name="info"
                size={16}
              />Event information
            </h3>
          {/if}
        </div>
        <div class="description-scroll">{@html html}</div>
        {#if /(?:\.\.\.|…)\s*(?:<[^>]+>\s*)*$/.test(event.description ?? '') && event.newsUrl}
          <a
            class="full-article"
            href={event.newsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Full article <Icon
              name="external"
              size={12}
            />
          </a>
        {/if}
      </section>
    {/if}
    {#if !banner}
      {#each ['character', 'support'] as kind}
        {@const items = event.pickups?.filter((p) => p.kind === kind) ?? []}{#if items.length}
          <section class="detail-section">
            <div class="section-heading">
              <h3>
                <Icon
                  name={kind === 'character' ? 'user' : 'grid'}
                  size={16}
                />{kind === 'character' ? 'Characters' : 'Support cards'}
              </h3>
            </div>
            <div class="pickups">
              {#each items as item (item.id)}
                <a
                  href={item.gametoraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    width="48"
                    height="50"
                    onerror={hideImage}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.subLabel}</small>
                  </span>
                </a>
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    {/if}
    {#if prediction}
      <TimelineEventPrediction
        {prediction}
        predicted={event.predicted}
        {dateLabel}
      />
    {/if}
  </div>
  {#snippet actions()}
    <div class="actions">
      <nav aria-label="Event sources">
        {#if event.newsUrl}
          <a
            href={event.newsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            News post <Icon
              name="external"
              size={13}
            />
          </a>
        {/if}{#if freePullSource && freePullSource !== event.newsUrl}
          <a
            href={freePullSource}
            target="_blank"
            rel="noopener noreferrer"
          >
            Free-pull source <Icon
              name="external"
              size={13}
            />
          </a>
        {/if}{#if event.gametoraUrl}
          <a
            href={event.gametoraUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            GameTora <Icon
              name="external"
              size={13}
            />
          </a>
        {/if}
      </nav>
      {#if canPlan}
        <div class:planned>
          <Button
            size="sm"
            variant={planned ? 'secondary' : 'primary'}
            icon={planned ? 'minus' : 'add'}
            ariaPressed={planned}
            onclick={() =>
              onplan(
                {
                  ...event,
                  plannerRewardAvailable:
                    event.plannerRewardAvailable ||
                    Boolean(rewardSummary && rewardSummary.mode !== 'placement')
                },
                !planned
              )}
          >
            {planned ? 'Remove from planner' : 'Add to planner'}
          </Button>
        </div>
      {/if}
    </div>
  {/snippet}
</Dialog>

<style>
  @import './timeline-detail-section.css';
  @import './timeline-event-pickups.css';
  @import './timeline-event-details.css';
</style>
