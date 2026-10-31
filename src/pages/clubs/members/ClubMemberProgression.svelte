<script lang="ts">
  import {
    buildClubCalendar,
    buildMemberProgression,
    formatClubGain,
    type ClubCalendarDay,
    type ClubChartMode
  } from '@/lib/clubs/club-progression';
  import type { ClubMemberSnapshot } from '@/lib/clubs/member-metrics';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import { memberProgressionOption } from '../charts/club-chart';
  import { theme } from '@/stores/theme';

  const legendHelpId = $props.id();
  let {
    snapshots,
    year,
    month,
    includePrior,
    search,
    mode = $bindable<ClubChartMode>('cumulative'),
    view = $bindable<'chart' | 'calendar'>('chart')
  }: {
    snapshots: ClubMemberSnapshot[];
    year: number;
    month: number;
    includePrior: boolean;
    search: string;
    mode?: ClubChartMode;
    view?: 'chart' | 'calendar';
  } = $props();

  let hidden = $state<number[]>([]),
    savedHidden = $state<number[] | null>(null);

  let isolated = $state<number>(),
    highlighted = $state<number>();

  let chartHeight = $state(400),
    calendarWidth = $state(800);

  const progression = $derived(
    buildMemberProgression(snapshots, year, month, includePrior, mode, search)
  );

  const weeks = $derived(buildClubCalendar(snapshots, year, month, search));
  const scale = $derived(Math.min(1, Math.max(0.5, calendarWidth / 800)));
  const option = $derived(
    memberProgressionOption(
      progression.labels,
      progression.members.filter((member) => !hidden.includes(member.viewerId)),
      mode,
      highlighted,
      $theme
    )
  );

  $effect(() => {
    progression;
    hidden = [];
    savedHidden = null;
    isolated = undefined;
    highlighted = undefined;
  });

  function toggle(id: number) {
    hidden = hidden.includes(id) ? hidden.filter((value) => value !== id) : [...hidden, id];
  }

  function isolate(id: number) {
    if (isolated === id && savedHidden !== null) {
      hidden = savedHidden;
      savedHidden = null;
      isolated = undefined;
    } else {
      savedHidden ??= [...hidden];
      isolated = id;
      hidden = progression.members
        .filter((member) => member.viewerId !== id)
        .map((member) => member.viewerId);
    }
  }

  function switchView() {
    view = view === 'chart' ? 'calendar' : 'chart';
    if (view === 'chart') {
      hidden = [];
      highlighted = undefined;
      savedHidden = null;
      isolated = undefined;
    }
  }
</script>

{#snippet cell(day: ClubCalendarDay)}
  <span class="day-top">
    <span class="day-number">{day.day}</span>
    {#if day.hasData}
      <span
        class="day-delta-badge mono"
        class:positive={day.dailyDelta > 0}
        class:negative={day.dailyDelta < 0}
        class:neutral={!day.dailyDelta}
      >
        {day.dailyDelta ? formatClubGain(day.dailyDelta) : '-'}
      </span>
    {/if}
  </span>
  {#if day.hasData && day.memberDeltas.length}
    <span class="day-contributors">
      {#each day.memberDeltas.slice(0, 4) as member, index}
        <span class="contrib-row">
          <span
            class="rank-dot"
            class:gold={index === 0}
            class:silver={index === 1}
            class:bronze={index === 2}
          ></span>
          <span class="contrib-name">{member.name}</span>
          <span class="contrib-delta mono">{formatClubGain(member.delta)}</span>
        </span>
      {/each}
    </span>
  {/if}
{/snippet}

<section
  class="member-progression"
  aria-label="Member Progression"
>
  <header>
    <h2>Member Progression</h2>
    {#if view === 'calendar'}
      <span class="card-header-date">
        {year} / {String(month).padStart(2, '0')}
      </span>
    {/if}
    <div class="view-toggles">
      {#if view === 'chart'}
        <IconButton
          icon={mode === 'cumulative' ? 'chart' : 'rankings'}
          label={mode === 'cumulative' ? 'Show daily gains' : 'Show cumulative gains'}
          selected={mode === 'delta'}
          onclick={() => (mode = mode === 'cumulative' ? 'delta' : 'cumulative')}
        />
      {/if}
      <IconButton
        icon={view === 'chart' ? 'calendar' : 'chart'}
        label={view === 'chart' ? 'Show member calendar' : 'Show member chart'}
        onclick={switchView}
      />
    </div>
  </header>
  {#if view === 'chart'}
    <div class="chart-wrapper">
      <div
        class="chart-area"
        bind:clientHeight={chartHeight}
      >
        <LazyEChartsSurface
          {option}
          label={`Member progression (${mode})`}
          height={chartHeight}
          dismissTouchTooltip
        />
      </div>
      <p
        class="sr-only"
        id={legendHelpId}
      >
        Select members to show or hide. Double-click or Shift+Enter to isolate and restore.
      </p>
      <div
        class="chart-legend"
        aria-label="Member visibility"
      >
        {#each progression.members as member}
          <button
            type="button"
            title={(hidden.includes(member.viewerId) ? 'Show ' : 'Hide ') + member.name}
            class:hidden={hidden.includes(member.viewerId)}
            aria-pressed={!hidden.includes(member.viewerId)}
            aria-describedby={legendHelpId}
            onclick={() => toggle(member.viewerId)}
            ondblclick={() => isolate(member.viewerId)}
            onkeydown={(event) => {
              if (event.key === 'Enter' && event.shiftKey) {
                event.preventDefault();
                isolate(member.viewerId);
              }
            }}
            onmouseenter={() => (highlighted = member.viewerId)}
            onmouseleave={() => (highlighted = undefined)}
            onfocus={() => (highlighted = member.viewerId)}
            onblur={() => (highlighted = undefined)}
          >
            <i style:--member-color={member.color}>
              {#if !hidden.includes(member.viewerId)}
                <Icon
                  name="check"
                  size={11}
                />
              {/if}
            </i>
            <span>{member.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div
      class="calendar-shell"
      bind:clientWidth={calendarWidth}
      style:--calendar-scale={scale}
    >
      <div class="calendar-view">
        <div class="calendar-header">
          {#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as label}
            <span>
              {label}
            </span>
          {/each}
        </div>
        <div class="calendar-body">
          {#each weeks as week}
            <div class="calendar-week">
              {#each week as day, column}
                <div
                  class="calendar-day"
                  class:other-month={day.isOtherMonth}
                  class:has-data={day.hasData}
                  class:no-data={!day.isOtherMonth && !day.hasData}
                  data-day={day.isOtherMonth ? undefined : day.day}
                >
                  {#if day.hasData && day.memberDeltas.length}
                    <InspectPopover
                      label={`Day ${day.day} contributors`}
                      openOnHover
                      placement="over"
                      align={column >= 5 ? 'end' : 'start'}
                    >
                      {#snippet trigger()}
                        {@render cell(day)}
                      {/snippet}
                      <div class="popover-header">
                        <span>Day {day.day}</span>
                        <strong
                          class="mono"
                          class:positive={day.dailyDelta > 0}
                          class:negative={day.dailyDelta < 0}
                        >
                          {day.dailyDelta > 0 ? '+' : ''}{day.dailyDelta.toLocaleString()}
                        </strong>
                      </div>
                      <ol class="popover-list">
                        {#each day.memberDeltas as member, index}
                          <li>
                            <span
                              class="rank-dot"
                              class:gold={index === 0}
                              class:silver={index === 1}
                              class:bronze={index === 2}
                            ></span>
                            <span class="popover-rank mono">{index + 1}</span>
                            <span class="popover-name">{member.name}</span>
                            <span
                              class="popover-value mono"
                              class:negative={member.delta < 0}
                            >
                              {member.delta >= 0 ? '+' : ''}{member.delta.toLocaleString()}
                            </span>
                          </li>
                        {/each}
                      </ol>
                    </InspectPopover>
                  {:else}
                    {@render cell(day)}
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  @import './club-member-progression.css';
</style>
