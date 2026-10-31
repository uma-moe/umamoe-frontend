<script
  module
  lang="ts"
>
  const fullFormatters = {
    unsigned: new Intl.NumberFormat('en', { signDisplay: 'auto' }),
    signed: new Intl.NumberFormat('en', { signDisplay: 'exceptZero' })
  };

  const compactFormatters = {
    unsigned: new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
      signDisplay: 'auto'
    }),
    signed: new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero'
    })
  };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import DiscordText from '../DiscordText.svelte';
  import { clubRankIcon, clubPolicyLabels as policyLabels } from '@/lib/clubs/club-display';

  export interface CircleCardData {
    circleId: number;
    name: string;
    rank?: number;
    yesterdayRank?: number;
    clubRank?: number;
    members?: number;
    leaderName?: string;
    joinStyle?: 1 | 2 | 3;
    policy?: number;
    comment?: string;
    monthlyFans?: number;
    yesterdayFans?: number;
    liveFans?: number;
    liveRank?: number;
  }

  let {
    circle: club,
    children,
    layout = 'row'
  }: { circle: CircleCardData; children?: Snippet; layout?: 'row' | 'summary' } = $props();

  const rankIcon = $derived(clubRankIcon(club.clubRank));
  const gain = $derived(
    club.liveFans == null || club.monthlyFans == null || club.liveFans < club.monthlyFans
      ? undefined
      : club.liveFans - club.monthlyFans
  );

  function format(value: number, signed = false): string {
    return fullFormatters[signed ? 'signed' : 'unsigned'].format(value);
  }

  function compact(value: number, signed = false): string {
    return compactFormatters[signed ? 'signed' : 'unsigned'].format(value);
  }

  function joinLabel(style: number): string {
    if (style === 2) return 'Approval';
    if (style === 3) return 'Closed';
    return 'Open';
  }

  function trend(club: CircleCardData): number {
    return club.yesterdayRank && club.rank != null ? club.yesterdayRank - club.rank : 0;
  }

  function fans(club: CircleCardData): number {
    return Math.max(club.monthlyFans ?? 0, club.liveFans ?? 0);
  }
</script>

{#snippet count(value: number, signed = false)}
  <span class="full-value">
    {format(value, signed)}
  </span>
  <span
    class="compact-value"
    title={format(value, signed)}
  >
    {compact(value, signed)}
  </span>
{/snippet}
<article
  class="circle-card"
  class:summary={layout === 'summary'}
  class:row={layout === 'row'}
  class:rank-1={club.rank === 1}
  class:rank-2={club.rank === 2}
  class:rank-3={club.rank === 3}
  data-circle-id={club.circleId}
>
  <div class="card-header">
    {#if layout === 'row' && club.rank != null}
      <div class="rank-section">
        <div class="rank-main">
          <strong class="rank-number">#{format(club.rank)}</strong>
          {#if trend(club)}
            <span
              class="rank-diff"
              class:positive={trend(club) > 0}
              class:negative={trend(club) < 0}
              aria-label={`${Math.abs(trend(club))} ranks ${trend(club) > 0 ? 'up' : 'down'}`}
            >
              <Icon
                name="chevron"
                size={20}
              />{Math.abs(trend(club))}
            </span>
          {/if}
        </div>
        {#if club.yesterdayRank}
          <small class="yesterday-rank">
            Yesterday: #{club.yesterdayRank}
          </small>
        {/if}
        {#if club.liveRank != null}
          <small class="live-rank">
            Live #{format(club.liveRank)}
          </small>
        {/if}
      </div>
    {/if}
    {#if rankIcon}
      <div class="club-rank-icon">
        <img
          src={rankIcon}
          alt="Club Rank"
          width="48"
          height="48"
          loading="lazy"
        />
      </div>
    {:else if layout === 'summary'}
      <div class="circle-emblem">
        <Icon
          name="community"
          size={28}
        />
      </div>
    {/if}
    <div class="circle-info">
      <a
        class="circle-name"
        title={club.name}
        href={`/circles/${club.circleId}`}
      >
        {club.name}
      </a>
      <div class="club-meta-line">
        {#if club.joinStyle || club.policy}
          <div class="circle-tags">
            {#if club.joinStyle}
              <span
                class="join-style"
                class:open={club.joinStyle === 1}
                class:approval={club.joinStyle === 2}
                class:closed={club.joinStyle === 3}
              >
                {joinLabel(club.joinStyle)}
              </span>
            {/if}
            {#if club.policy}
              <span class="policy-badge">
                {policyLabels[club.policy] ?? 'Unknown'}
              </span>
            {/if}
          </div>
        {/if}
        <div class="circle-meta">
          {#if club.leaderName}
            <span>
              <span class="label">Leader:</span>
              {club.leaderName}
            </span>
          {/if}
          {#if club.members != null}
            <span>
              <span class="label">Members:</span>
              {club.members}/30
            </span>
          {/if}
        </div>
      </div>
      {#if layout === 'row' && club.comment}
        <p
          class="comment"
          title={club.comment}
        >
          <DiscordText text={club.comment} />
        </p>
      {/if}
    </div>
    {#if layout === 'row' && (club.monthlyFans != null || club.liveFans != null)}
      <div class="fans-section">
        <strong
          class="fans-count"
          title={club.monthlyFans == null ? undefined : `Monthly fans: ${format(club.monthlyFans)}`}
        >
          {@render count(fans(club))}
          <small>Fans</small>
        </strong>
        {#if club.yesterdayFans || gain !== undefined}
          <div class="gains-row">
            {#if club.yesterdayFans}
              <span class="gain-item">
                <span class="label">Daily</span>
                <strong class="positive">
                  {@render count((club.monthlyFans ?? 0) - club.yesterdayFans, true)}
                </strong>
              </span>
            {/if}
            {#if gain !== undefined}
              <span class="gain-item">
                <span class="label">Today</span>
                <strong class:positive={gain > 0}>{@render count(gain, true)}</strong>
              </span>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
    <a
      class="actions"
      href={`/circles/${club.circleId}`}
      aria-label="Open club details"
    >
      <Icon
        name="chevron"
        size={24}
      />
    </a>
  </div>
  {#if layout === 'summary'}
    <dl class="circle-metrics">
      {#if club.monthlyFans != null || club.rank != null}
        <div>
          {#if club.monthlyFans != null}
            <dt>Monthly fans</dt>
            <dd class="fan-value">{format(club.monthlyFans)}</dd>
          {/if}
          {#if club.rank != null}
            <dt class="rank-label">Monthly rank</dt>
            <dd class="rank-value">#{format(club.rank)}</dd>
          {/if}
        </div>
      {/if}
      {#if club.liveFans != null || club.liveRank != null}
        <div>
          {#if club.liveFans != null}
            <dt>
              <span class="live-dot"></span>
              Live fans
            </dt>
            <dd class="fan-value">
              {format(club.liveFans)}{#if gain !== undefined}
                <small class:positive={gain > 0}>
                  {format(gain, true)} today
                </small>
              {/if}
            </dd>
          {/if}
          {#if club.liveRank != null}
            <dt class="rank-label">Live rank</dt>
            <dd class="rank-value">#{format(club.liveRank)}</dd>
          {/if}
        </div>
      {/if}
    </dl>
  {/if}
  {#if (layout === 'summary' && club.comment) || children}
    <div class="card-body">
      {#if layout === 'summary' && club.comment}
        <p class="comment">
          <DiscordText text={club.comment} />
        </p>
      {/if}
      {@render children?.()}
    </div>
  {/if}
</article>

<style>
  @import './circle-card.css';
</style>
