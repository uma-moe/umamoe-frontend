<script lang="ts">
  import type { EChartsCoreOption } from 'echarts/core';
  import {
    type clubDataStatus,
    clubPolicyLabels,
    clubRankIcon as rankIcon,
    formatClubTimeAgo
  } from '@/lib/clubs/club-display';
  import DiscordText from '@/components/DiscordText.svelte';
  import Icon from '@/components/Icon.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { compactNumber, number, signed } from '../club-format';
  import type { ClubDetails } from '../community-types';

  interface Props {
    details: ClubDetails;
    dataStatus?: ReturnType<typeof clubDataStatus>;
    monthlyFans: number;
    displayedRank?: number;
    clubChart: EChartsCoreOption;
    now: number;
    clubChartHeight?: number;
  }

  let {
    details,
    dataStatus,
    monthlyFans,
    displayedRank,
    clubChart,
    now,
    clubChartHeight = $bindable(280)
  }: Props = $props();
</script>

<div class="overview-grid">
  <section
    class="info-card details-card"
    aria-label="Club Information"
  >
    <header>
      <h2>Club Information</h2>
      {#if dataStatus?.updatedAt}
        <div class="updated-row">
          <span class="label">Updated</span>
          <span
            class="value"
            title={new Date(dataStatus.updatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'medium'
            })}
          >
            {formatClubTimeAgo(dataStatus.updatedAt, now)}
          </span>
        </div>
      {/if}
    </header>
    <div class="info-body">
      <div class="club-overview">
        <dl class="club-fans">
          <div class="info-row fan-metric">
            <dt class="label">Monthly Fans</dt>
            <dd class="value">
              <span>{compactNumber.format(monthlyFans)}</span>
              {#if Math.abs(monthlyFans) >= 1000}
                <small>{number(monthlyFans)}</small>
              {/if}
            </dd>
          </div>
          {#if dataStatus?.liveFresh}
            <div class="info-row fan-metric live-row">
              <dt class="label">
                <span class="live-dot"></span>
                Live Points
              </dt>
              <dd class="value">
                <span>{compactNumber.format(details.circle.live_points!)}</span>
                {#if Math.abs(details.circle.live_points!) >= 1000}
                  <small>
                    {number(details.circle.live_points!)}
                  </small>
                {/if}
              </dd>
            </div>
          {/if}
        </dl>
        {#if details.clubRank}
          <div
            class="club-rank-row"
            class:max-rank={!details.fansToNextTier}
          >
            {#if details.fansToLowerTier != null}
              <div class="tier-side lower">
                {#if rankIcon(details.clubRank - 1)}
                  <img
                    class="tier-icon"
                    src={rankIcon(details.clubRank - 1)}
                    alt="Lower Tier"
                  />
                {/if}
                <div class="tier-info">
                  <span class="tier-gap-label">
                    <span class="tier-direction">
                      <Icon
                        name="arrow-right"
                        size={16}
                      />
                    </span>
                    Tier buffer
                  </span>
                  <strong
                    class="tier-gap-value safe"
                    title={number(details.fansToLowerTier)}
                  >
                    {compactNumber.format(details.fansToLowerTier)}
                  </strong>
                  {#if details.yesterdayFansToLowerTier != null}
                    {@const delta = details.fansToLowerTier - details.yesterdayFansToLowerTier}
                    <span
                      class="tier-delta"
                      title={signed(delta)}
                      class:positive={delta > 0}
                      class:negative={delta < 0}
                    >
                      {delta > 0 ? '+' : ''}{compactNumber.format(delta)}
                    </span>
                  {/if}
                </div>
              </div>
            {/if}
            <div class="rank-center">
              {#if rankIcon(details.clubRank)}
                <img
                  class="club-rank-icon"
                  src={rankIcon(details.clubRank)}
                  alt="Club Rank"
                />
              {/if}{#if displayedRank !== undefined}
                <span class="rank-label">
                  Rank #{number(displayedRank)}
                </span>
              {/if}
            </div>
            {#if details.fansToNextTier}
              <div class="tier-side upper">
                <div class="tier-info">
                  <span class="tier-gap-label">
                    <span class="tier-direction">
                      <Icon
                        name="arrow-right"
                        size={16}
                      />
                    </span>
                    Next tier
                  </span>
                  <strong
                    class="tier-gap-value needed"
                    title={number(details.fansToNextTier)}
                  >
                    {compactNumber.format(details.fansToNextTier)}
                  </strong>
                  {#if details.yesterdayFansToNextTier != null}
                    {@const delta = details.fansToNextTier - details.yesterdayFansToNextTier}
                    <span
                      class="tier-delta"
                      title={signed(delta)}
                      class:positive={delta < 0}
                      class:negative={delta > 0}
                    >
                      {delta > 0 ? '+' : ''}{compactNumber.format(delta)}
                    </span>
                  {/if}
                </div>
                {#if rankIcon(details.clubRank + 1)}
                  <img
                    class="tier-icon"
                    src={rankIcon(details.clubRank + 1)}
                    alt="Next Tier"
                  />
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </div>
      <div class="club-details">
        <dl class="club-metadata">
          <div class="info-row leader-row">
            <dt class="label">Leader</dt>
            <dd class="value">
              {details.circle.leader_name || details.circle.leader_viewer_id || 'Unknown'}
            </dd>
          </div>
          {#if details.circle.policy && clubPolicyLabels[details.circle.policy]}
            <div class="info-row">
              <dt class="label">Playstyle</dt>
              <dd class="value">{clubPolicyLabels[details.circle.policy]}</dd>
            </div>
          {/if}
        </dl>
        {#if details.circle.comment}
          <p class="description">
            <DiscordText text={details.circle.comment} />
          </p>
        {/if}
      </div>
    </div>
  </section>
  <section
    class="details-card progression-card"
    aria-label="Club Progression"
  >
    <header><h2>Club Progression</h2></header>
    <div class="card-body">
      <div
        class="club-chart"
        bind:clientHeight={clubChartHeight}
      >
        <LazyEChartsSurface
          option={clubChart}
          label="Club progression by observed day"
          height={clubChartHeight}
          dismissTouchTooltip
        />
      </div>
    </div>
  </section>
</div>

<style>
  @import './club-details-overview.css';
</style>
