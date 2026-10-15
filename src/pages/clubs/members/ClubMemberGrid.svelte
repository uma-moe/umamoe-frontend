<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import type { ClubMemberMetric } from '@/lib/clubs/member-metrics';
  import {
    formatClubTimeAgo,
    memberMetric,
    type clubMetrics,
    type ClubDisplayConfig
  } from '@/lib/clubs/club-display';
  import Icon from '@/components/Icon.svelte';
  import { number, signed } from '../club-format';

  type ClubMetric = (typeof clubMetrics)[number];

  interface Props {
    members: ClubMemberMetric[];
    config: ClubDisplayConfig;
    primary: ClubMetric;
    extraMetrics: ClubMetric[];
    now: number;
    oncopy: (member: ClubMemberMetric) => void;
  }

  let { members, config, primary, extraMetrics, now, oncopy }: Props = $props();

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
</script>

<div
  class="members-grid"
  use:virtualScroll={{
    items: members,
    searchText: (member) =>
      [
        member.name,
        member.viewerId,
        member.role,
        member.fanCount,
        member.fanCount.toLocaleString()
      ].join(' '),
    key: (member) => member.viewerId,
    estimate: 230,
    onrange: (range) => (virtualRange = range)
  }}
>
  {#each members.slice(virtualRange.start, virtualRange.end) as member, localIndex (member.viewerId)}
    {@const index = virtualRange.start + localIndex}
    <article
      data-virtual-index={index}
      class="member-card"
      class:inactive={!member.active}
      style:--placement-color={member.active ? ['#ffd700', '#90a4ae', '#cd7f32'][index] : undefined}
    >
      <header>
        <span class="member-rank">#{index + 1}</span>
        <div class="name-block">
          <a
            href={`/profile/${member.viewerId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {member.name}<Icon
              name="external"
              size={12}
            />
          </a>
          <button
            type="button"
            class="member-id"
            onclick={() => oncopy(member)}
          >
            ID {member.viewerId}<Icon
              name="copy"
              size={12}
            />
          </button>
        </div>
        {#if !member.active}
          <span>Left</span>
        {:else}
          <small
            class="role-badge"
            data-role={member.role}
          >
            {member.role}
          </small>
        {/if}
      </header>
      {#if config.showTotalFans && primary.key !== 'fanCount'}
        <div class="total-fans">
          <span>Total Fans</span>
          <strong>{number(member.fanCount)}</strong>
        </div>
      {/if}
      <div class="primary-metric">
        <span>{primary.label}</span>
        <strong
          class:positive={primary.key !== 'fanCount' && memberMetric(member, config) > 0}
          class:negative={memberMetric(member, config) < 0}
        >
          {primary.key === 'fanCount'
            ? number(memberMetric(member, config))
            : signed(
                memberMetric(member, config)
              )}{#if config.includePriorClubData && member.hasPriorClubData}
            <sup title={`Includes ${number(member.priorClubGain)} from prior club`}>*</sup>
          {/if}
        </strong>
      </div>
      <dl class="member-stats">
        {#each extraMetrics.filter((metric) => metric.key !== 'fanCount') as metric}
          <div>
            <dt title={metric.label}>{metric.label}</dt>
            <dd
              class:positive={member[metric.key] > 0}
              class:negative={member[metric.key] < 0}
            >
              {signed(member[metric.key])}
            </dd>
          </div>
        {/each}{#if config.showLastUpdated}
          <div>
            <dt>Last Updated</dt>
            <dd title={member.lastUpdated}>{formatClubTimeAgo(member.lastUpdated, now)}</dd>
          </div>
        {/if}
      </dl>
    </article>
  {/each}
</div>

<style>
  @import './club-member-list.css';
  @import './club-member-grid.css';
</style>
