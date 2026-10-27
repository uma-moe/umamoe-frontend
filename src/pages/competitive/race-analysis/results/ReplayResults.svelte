<script lang="ts">
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { lastSpurtResult, raceMetricHelp } from '@/lib/race/capture/race-diagnostics';
  import {
    formatRaceTime,
    hpRemainingColor,
    moodIcon,
    moodName
  } from '@/lib/race/replay/race-display';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { portrait, stats, styleColors } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import DataTable from '@/components/data/DataTable.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import LastSpurtResult from './LastSpurtResult.svelte';
  import { n, raceResultRows } from './replay-results';

  let {
    capture,
    selectedIndex,
    oninspect
  }: { capture: ParsedRaceCapture; selectedIndex?: number; oninspect: (index: number) => void } =
    $props();

  let catalog = $state.raw(new Map<number, SkillData>());

  onMount(() => {
    void loadSkills()
      .then((v) => (catalog = v))
      .catch(() => {});
  });

  const rows = $derived(raceResultRows(capture, catalog));
  const hasModes = $derived(
    rows.some(
      (row) =>
        typeof row.duel === 'number' ||
        typeof row.downhill === 'number' ||
        typeof row.paceUp === 'number'
    )
  );

  const hasLoss = $derived(rows.some((row) => typeof row.loss === 'number'));
  const hasIncidents = $derived(
    rows.some((row) => typeof row.blocked === 'number' || typeof row.rushed === 'number')
  );

  const resultsContext = $derived(
    hasModes || hasLoss || hasIncidents
      ? 'Select a runner to inspect their race'
      : 'Select a runner to inspect their race · recorded results only, without detailed simulation'
  );

  /** HP left as a share of the starting HP, for runners that reached the line with HP to spare. */
  function hpShare(row: Record<string, string | number>) {
    if (typeof row.exhausted === 'number') return undefined;
    if (typeof row.hp !== 'number' || typeof row.startHp !== 'number') return undefined;

    return row.startHp > 0 ? (row.hp / row.startHp) * 100 : undefined;
  }

  /** Where HP ran out, or how much was left at the finish. */
  function hpResult(row: Record<string, string | number>) {
    if (typeof row.exhausted === 'number') return 'Empty at ' + n(row.exhausted, 0) + ' m';
    if (typeof row.hp === 'number') return n(row.hp, 0) + ' HP left';

    return '—';
  }

  /** Distance behind the previous finisher; the winner has none. */
  function finishGap(row: Record<string, string | number>) {
    if (row.place === 1) return 'Winner';
    if (typeof row.gap !== 'number') return '—';

    return '+' + n(row.gap, 1) + ' m';
  }

  function inspect(id: number) {
    oninspect(id);
  }
</script>

<section
  class="results"
  aria-label="Detailed race results"
>
  <header>
    <div class="results-title">
      <h2>Race results</h2>
      <InspectPopover label="Reading race results">
        {#snippet trigger()}
          <span class="help">
            <Icon
              name="info"
              size={15}
            />
          </span>
        {/snippet}
        <h3>Reading race results</h3>
        <p>
          Compare finish times, the gap to the previous finisher, last-spurt delay, selected speed
          and remaining HP. Delayed spurts and speed reductions are highlighted. Delay is measured
          from the first spurt check; a speed reduction compares the selected speed with the
          full-spurt target. Select a runner to inspect their race below.
        </p>
        <p>
          Start delay, build stats and starting HP are shown for each runner. Mode durations,
          rushing and course loss appear when the capture includes those measurements. Missing
          measurements are not treated as zero.
        </p>
      </InspectPopover>
      <p class="results-context">{resultsContext}</p>
    </div>
  </header>
  <DataTable
    columnHelp={raceMetricHelp}
    plain
    compact
    caption="Race results"
    {rows}
    rowKey="id"
    onrowclick={(row) => inspect(Number(row.id))}
    columns={[
      { key: 'place', label: 'Finish', numeric: true },
      { key: 'name', label: 'Runner' },
      { key: 'time', label: 'Time / gap', numeric: true },
      { key: 'delay', label: 'Start delay', numeric: true },
      { key: 'spurt', label: 'Spurt delay', numeric: true },
      { key: 'hp', label: 'HP result', numeric: true },
      ...(hasModes
        ? [{ key: 'duel', label: 'Race modes (s)', numeric: true, sortable: false }]
        : []),
      ...(hasLoss ? [{ key: 'loss', label: 'Course loss (m)', numeric: true }] : []),
      ...(hasIncidents
        ? [{ key: 'blocked', label: 'Incidents (s)', numeric: true, sortable: false }]
        : []),
      { key: 'sp', label: 'Build', numeric: true, sortable: false },
      { key: 'popularity', label: 'Popularity', numeric: true }
    ]}
  >
    {#snippet cell(row, col)}
      {@const r = capture.runners.find((r) => r.index === Number(row.id))!}
      {#if col.key === 'name'}
        {@const mood = moodName(r.raw.motivation)}
        <span class="runner-cell">
          <button
            class="runner-name"
            class:focused={selectedIndex === r.index}
            aria-label={'Inspect ' + r.name}
            aria-pressed={selectedIndex === r.index}
            onclick={() => inspect(r.index)}
          >
            <Artwork
              src={portrait(r.cardId)}
              alt=""
              size="xs"
            />
            <span>
              <strong>{r.name}</strong>
              <small>
                Gate {row.gate},
                <span style:color={styleColors[r.result?.runningStyle ?? 0]}>{row.style}</span>
              </small>
            </span>
            <Icon
              name="arrow-right"
              size={14}
            />
          </button>
          {#if mood}
            <img
              class="mood"
              src={moodIcon(mood)}
              alt={mood + ' mood'}
              title={mood + ' mood'}
              width="20"
              height="20"
            />
          {/if}
        </span>
      {:else if col.key === 'place'}
        <strong
          class="finish"
          class:winner={row.place === 1}
        >
          {row.place}
        </strong>
      {:else if col.key === 'time'}
        <span class="value">
          {formatRaceTime(typeof row.time === 'number' ? row.time : undefined)}
        </span>
        <small title="Distance behind the previous finisher">{finishGap(row)}</small>
      {:else if col.key === 'delay'}
        {@const late = row.late === 'Late start' || row.late === 'Lost acceleration frame'}
        <span
          class="value"
          class:warning={late}
        >
          {typeof row.delay === 'number' ? n(row.delay, 1) + ' ms' : '—'}
        </span>
        {#if late}
          <small
            class="warning"
            title={String(row.late)}
          >
            Late
          </small>
        {/if}
      {:else if col.key === 'spurt'}
        <LastSpurtResult result={lastSpurtResult(capture, r.index)} />
      {:else if col.key === 'hp'}
        {@const share = hpShare(row)}
        <span
          class="value"
          class:warning={typeof row.exhausted === 'number'}
          style:color={share === undefined ? undefined : hpRemainingColor(share, $theme === 'dark')}
        >
          {hpResult(row)}
        </span>
        {#if typeof row.startHp === 'number'}
          <small
            title={'Started with ' +
              n(row.startHp, 0) +
              ' HP' +
              (typeof row.deficit === 'number' && row.deficit > 0
                ? ', ' + n(row.deficit, 0) + ' short'
                : '')}
          >
            of {n(row.startHp, 0)} HP
          </small>
        {/if}
      {:else if col.key === 'duel'}
        <dl class="mode-values">
          <div>
            <dt>Duel</dt>
            <dd>{n(row.duel)}</dd>
          </div>
          <div>
            <dt>Downhill</dt>
            <dd title={'In the late race: ' + n(row.downhillLate) + ' s'}>{n(row.downhill)}</dd>
          </div>
          <div>
            <dt>Pace ↑</dt>
            <dd>{n(row.paceUp)}</dd>
          </div>
          <div>
            <dt>Pace ↓</dt>
            <dd>{n(row.paceDown)}</dd>
          </div>
        </dl>
      {:else if col.key === 'blocked'}
        <dl class="mode-values incidents">
          <div>
            <dt>Blocked</dt>
            <dd>{n(row.blocked)}</dd>
          </div>
          <div>
            <dt>Rushed</dt>
            <dd>{n(row.rushed)}</dd>
          </div>
        </dl>
      {:else if col.key === 'sp'}
        <div class="result-stats">
          <StatStrip
            items={stats(r)}
            label={r.name + ' build stats'}
            presentation="values"
            compact
          />
        </div>
        <small>{typeof row.sp === 'number' ? n(row.sp, 0) + ' SP' : '—'}</small>
      {:else if col.key === 'popularity'}
        <span class="value">{row.popularity}</span>
      {:else}
        {typeof row[col.key] === 'number' &&
        ['duel', 'downhill', 'loss', 'blocked', 'rushed'].includes(col.key)
          ? n(row[col.key])
          : row[col.key]}
      {/if}
    {/snippet}
  </DataTable>
</section>

<style>
  @import './replay-results.css';
</style>
