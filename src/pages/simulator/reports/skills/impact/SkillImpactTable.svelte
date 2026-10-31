<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import { formatMarginValue, type MarginUnit, type SkillValue } from '../../simulation-comparison';
  import {
    gainOf,
    help,
    makeScale,
    place,
    range,
    tickLabel,
    type SkillImpactRow,
    type SortDirection
  } from './skill-impact-gains';

  interface Props {
    /** Learned skills in display order. */
    rows: SkillImpactRow[];
    runnerName: string;
    color: string;
    unit: MarginUnit;
    value: (id: number) => SkillValue | undefined;
    unique: (id: number) => boolean;
    sortKey: string;
    sortDirection: SortDirection;
  }

  let {
    rows,
    runnerName,
    color,
    unit,
    value,
    unique,
    sortKey = $bindable(),
    sortDirection = $bindable()
  }: Props = $props();

  const listScale = $derived(
    makeScale(
      rows
        .filter((row) => row.measured)
        .flatMap((row) => {
          const measured = value(row.id);
          return measured ? [gainOf(measured, unit)] : [];
        }),
      unit
    )
  );

  const sortBy = (key: string) => {
    if (sortKey === key) sortDirection = sortDirection === 'ascending' ? 'descending' : 'ascending';
    else sortDirection = key === 'id' ? 'ascending' : 'descending';
    sortKey = key;
  };

  const arrow = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'ascending') {
        return '↑';
      }

      return '↓';
    }

    return '↕';
  };
</script>

{#snippet about(label: string, text: string)}<span class="column-help">
    <InspectPopover
      label={'About ' + label}
      openOnHover
      align="end"
    >
      {#snippet trigger()}<InfoIcon />{/snippet}
      <p>{text}</p>
    </InspectPopover>
  </span>{/snippet}

<div
  class="gain-table"
  style:--runner={color}
>
  <div
    class="gain-list"
    role="table"
    aria-label={'Skill impact for ' + runnerName}
  >
    <div
      class="gain-row head"
      role="row"
    >
      <span role="columnheader">
        <button
          type="button"
          class="sort"
          onclick={() => sortBy('id')}
        >
          Skill <span aria-hidden="true">{arrow('id')}</span>
        </button>
      </span>
      <span
        class="gain-head"
        role="columnheader"
      >
        <button
          type="button"
          class="sort"
          onclick={() => sortBy('value')}
        >
          Gain <span aria-hidden="true">{arrow('value')}</span>
        </button>
        <small>line = 95% range</small>
        {@render about('Gain', help.Gain)}
      </span>
      {#each [['per100', 'Gain / 100 SP'], ['win', 'Win rate change']] as const as [key, label]}<span
          class="num secondary"
          role="columnheader"
        >
          <button
            type="button"
            class="sort"
            onclick={() => sortBy(key)}
          >
            {label}
            <span aria-hidden="true">{arrow(key)}</span>
          </button>
          {@render about(label, help[label])}
        </span>{/each}
    </div>
    {#each rows as row (row.id)}
      {@const measured = value(row.id)}
      {@const bar = measured ? gainOf(measured, unit) : undefined}
      <div
        class="gain-row"
        role="row"
        title={measured ? range(measured, unit) : 'Not measured yet'}
      >
        <span
          class="skill-name"
          role="rowheader"
        >
          <RaceSkill
            id={row.id}
            fill
            level={unique(row.id) || row.level > 1 ? 'Lv ' + row.level : undefined}
          />
        </span>
        <span
          class="track"
          role="cell"
          aria-hidden="true"
        >
          {#each listScale.ticks as tick}<i
              class="grid"
              class:zero={Math.abs(tick) < 1e-9}
              style:left={place(listScale, tick) + '%'}
            ></i>{/each}
          {#if bar}<i
              class="bar"
              class:negative={bar.gain < 0}
              style:left={place(listScale, Math.min(0, bar.gain)) + '%'}
              style:width={Math.abs(place(listScale, bar.gain) - place(listScale, 0)) + '%'}
            ></i>
            {#if bar.low != null && bar.high != null}<i
                class="range"
                style:left={place(listScale, bar.low) + '%'}
                style:width={Math.max(0.3, place(listScale, bar.high) - place(listScale, bar.low)) +
                  '%'}
              ></i>{/if}{/if}
        </span>
        <span
          class="num value"
          role="cell"
        >
          {#if measured}<strong
              class:clean={measured.low != null && measured.low > 0}
              class:warning={measured.lengths < 0}
            >
              {formatMarginValue(
                measured.lengths,
                measured.seconds,
                unit,
                2
              )}{#if measured.preliminary}<sup
                  title={'Quick measurement on ' +
                    measured.count +
                    ' races. Switch to All and measure again to refine.'}
                >
                  *
                </sup>{/if}
            </strong>
            <small>
              {unit === 'seconds'
                ? formatMarginValue(measured.lengths, 0, 'lengths', 2)
                : formatMarginValue(0, measured.seconds, 'seconds')}
            </small>{:else}<small title="Not measured yet">—</small>{/if}
        </span>
        <span
          class="num secondary"
          role="cell"
        >
          {Number.isFinite(row.per100)
            ? formatMarginValue(row.per100, row.per100Seconds, unit, 2)
            : unique(row.id)
              ? 'Unique'
              : '—'}
        </span>
        <span
          class="num secondary"
          role="cell"
        >
          {measured
            ? (measured.winChange > 0 ? '+' : '') + measured.winChange.toFixed(1) + ' pp'
            : '—'}
        </span>
      </div>
    {/each}
  </div>
  <div
    class="gain-axis"
    aria-hidden="true"
  >
    <div class="gain-row foot">
      <span></span>
      <span class="axis">
        {#each listScale.ticks as tick}<span
            style:left={place(listScale, tick) + '%'}
            class:start={place(listScale, tick) < 3}
            class:end={place(listScale, tick) > 97}
          >
            {tickLabel(tick, unit)}
          </span>{/each}
      </span>
    </div>
  </div>
</div>

<style>
  @import './skill-impact-table.css';
</style>
