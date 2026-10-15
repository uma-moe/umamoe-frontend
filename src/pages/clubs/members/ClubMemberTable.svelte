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
  import { number } from '../club-format';

  type ClubMetric = (typeof clubMetrics)[number];

  interface Props {
    members: ClubMemberMetric[];
    config: ClubDisplayConfig;
    primary: ClubMetric;
    extraMetrics: ClubMetric[];
    expandedMembers: number[];
    now: number;
    oncopy: (member: ClubMemberMetric) => void;
  }

  let {
    members,
    config,
    primary,
    extraMetrics,
    expandedMembers = $bindable(),
    now,
    oncopy
  }: Props = $props();

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
</script>

<div class="member-table-scroll">
  <table>
    <thead>
      <tr>
        <th class="table-rank">#</th>
        <th>Trainer</th>
        {#if config.showRole}
          <th class="desktop-cell">Role</th>
        {/if}
        <th class="member-primary">{primary.label}</th>
        {#each extraMetrics as metric, metricIndex}
          <th
            class="member-extra"
            class:mobile-summary={metricIndex === 0}
          >
            {metric.label}
          </th>
        {/each}{#if config.showLastUpdated}
          <th class="desktop-cell">Updated</th>
        {/if}
      </tr>
    </thead>
    <tbody
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
        estimate: 45,
        onrange: (range) => (virtualRange = range)
      }}
    >
      {#each members.slice(virtualRange.start, virtualRange.end) as member, localIndex (member.viewerId)}
        {@const index = virtualRange.start + localIndex}
        <tr
          data-virtual-index={index}
          class:inactive={!member.active}
        >
          <td class="table-rank">{index + 1}</td>
          <td class="member-identity">
            <div class="member-name-row">
              <a
                href={'/profile/' + member.viewerId}
                title={member.name}
                target="_blank"
                rel="noopener noreferrer"
              >
                {member.name}
              </a>
              <button
                class="member-expand"
                type="button"
                aria-label={(expandedMembers.includes(member.viewerId) ? 'Hide' : 'Show') +
                  ' stats for ' +
                  member.name}
                aria-expanded={expandedMembers.includes(member.viewerId)}
                aria-controls={'club-member-details-' + member.viewerId}
                onclick={() =>
                  (expandedMembers = expandedMembers.includes(member.viewerId)
                    ? expandedMembers.filter((id) => id !== member.viewerId)
                    : [...expandedMembers, member.viewerId])}
              >
                <Icon
                  name="chevron"
                  size={14}
                />
              </button>
            </div>
            <div class="identity-tools">
              <button
                class="member-id"
                onclick={() => oncopy(member)}
              >
                ID {member.viewerId}
              </button>
              {#if !member.active}
                <small>Left</small>
              {/if}
            </div>
          </td>
          {#if config.showRole}
            <td class="desktop-cell">{member.role}</td>
          {/if}
          <td
            class="member-primary"
            class:positive={primary.key !== 'fanCount' && memberMetric(member, config) > 0}
            class:negative={memberMetric(member, config) < 0}
          >
            {number(memberMetric(member, config))}
          </td>
          {#each extraMetrics as metric, metricIndex}
            <td
              class="member-extra"
              class:mobile-summary={metricIndex === 0}
              class:positive={metric.key !== 'fanCount' && member[metric.key] > 0}
              class:negative={member[metric.key] < 0}
            >
              {number(member[metric.key])}
            </td>
          {/each}
          {#if config.showLastUpdated}
            <td class="desktop-cell">
              {formatClubTimeAgo(member.lastUpdated, now)}
            </td>
          {/if}
        </tr>
        {#if expandedMembers.includes(member.viewerId)}
          <tr
            data-virtual-index={index}
            class="member-details"
            id={'club-member-details-' + member.viewerId}
          >
            <td colspan={3 + Number(extraMetrics.length > 0)}>
              <div class="member-detail-heading">
                <strong>{member.name}</strong>
                <button
                  class="member-id"
                  onclick={() => oncopy(member)}
                >
                  ID {member.viewerId}<Icon
                    name="copy"
                    size={12}
                  />
                </button>
                {#if !member.active}
                  <small>Left club</small>
                {/if}
              </div>
              <dl class="member-stats">
                {#if config.showRole}
                  <div>
                    <dt>Role</dt>
                    <dd>{member.role}</dd>
                  </div>
                {/if}{#each extraMetrics.slice(1) as metric}
                  <div>
                    <dt>{metric.label}</dt>
                    <dd
                      class:positive={metric.key !== 'fanCount' && member[metric.key] > 0}
                      class:negative={member[metric.key] < 0}
                    >
                      {number(member[metric.key])}
                    </dd>
                  </div>
                {/each}{#if config.showLastUpdated}
                  <div>
                    <dt>Updated</dt>
                    <dd>{formatClubTimeAgo(member.lastUpdated, now)}</dd>
                  </div>
                {/if}
              </dl>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
</div>

<style>
  @import './club-member-list.css';
  @import './club-member-table.css';
</style>
