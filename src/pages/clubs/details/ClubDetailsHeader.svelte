<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Menu from '@/components/navigation/Menu.svelte';
  import { joinLabel } from '../club-format';
  import type { ClubDetails } from '../community-types';

  interface Props {
    details?: ClubDetails;
    year: number;
    month: number;
    isLive: boolean;
    refreshing: boolean;
    secondsUntilRefresh: number;
    exportBusy: boolean;
    onmonth: (offset: number) => void;
    onrefresh: () => void;
    ondownload: (format: string) => void;
  }

  let {
    details,
    year,
    month,
    isLive,
    refreshing,
    secondsUntilRefresh,
    exportBusy,
    onmonth,
    onrefresh,
    ondownload
  }: Props = $props();
</script>

<header class="club-heading">
  <div class="club-identity">
    <Button
      href="/circles"
      variant="ghost"
      icon="arrow-left"
      ariaLabel="Back to clubs"
    />
    <div class="club-title">
      <h1>{details?.circle.name ?? 'Club details'}</h1>
      <div class="heading-meta">
        <span class="membership-meta">
          <Icon
            name="users"
            size={14}
          />{details?.circle.member_count ?? 0}/30
          <span>members</span>
        </span>
        <span
          class="join-meta"
          class:open={details?.circle.join_style === 1}
          class:approval={details?.circle.join_style === 2}
        >
          {joinLabel(details?.circle.join_style ?? 3)}
        </span>
        {#if isLive}
          <span class="live-status">
            <span class="live-dot"></span>
            <span class="live-label">Live</span>
            <span class="countdown">
              {refreshing
                ? 'Updating…'
                : `${Math.floor(secondsUntilRefresh / 60)}:${String(secondsUntilRefresh % 60).padStart(2, '0')}`}
            </span>
          </span>
        {/if}
      </div>
    </div>
  </div>
  <div class="header-actions">
    <div
      class="month-nav"
      role="group"
      aria-label="Club month"
    >
      <IconButton
        icon="arrow-left"
        label="Previous month"
        onclick={() => onmonth(-1)}
      />
      <strong aria-live="polite">{year} / {String(month).padStart(2, '0')}</strong>
      <IconButton
        icon="arrow-right"
        label="Next month"
        onclick={() => onmonth(1)}
      />
    </div>
    {#if isLive}
      <div
        class="live-refresh-bar"
        class:refreshing
      >
        <IconButton
          icon="refresh"
          label="Update now"
          disabled={refreshing}
          onclick={onrefresh}
        />
      </div>
    {/if}<Menu
      label={exportBusy ? 'Exporting…' : 'Export'}
      items={[
        { id: 'xlsx', label: 'Excel (XLSX)', disabled: exportBusy },
        { id: 'csv', label: 'CSV', disabled: exportBusy },
        { id: 'json', label: 'JSON', disabled: exportBusy }
      ]}
      onselect={ondownload}
    />
  </div>
</header>

<style>
  @import './club-details-header.css';
</style>
