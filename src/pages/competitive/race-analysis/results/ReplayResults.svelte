<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import { onMount } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { lastSpurtResult, raceMetricHelp } from '@/lib/race/capture/race-diagnostics';
  import {
    formatRaceTime,
    hpRemainingColor,
    moodIcon,
    moodName,
    runningStyleName
  } from '@/lib/race/replay/race-display';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { portrait, stats, styleColors } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import DataTable from '@/components/data/DataTable.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RankBadge from '@/components/game/RankBadge.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Icon from '@/components/Icon.svelte';
  import LastSpurtResult from './LastSpurtResult.svelte';
  import { n, raceResultRows } from './replay-results';
  import SkillPoints, { LEARNED_SKILL_POINTS_NOTE } from '@/components/game/SkillPoints.svelte';

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
  const hasDuel = $derived(rows.some((row) => typeof row.duel === 'number'));
  const hasDownhill = $derived(rows.some((row) => typeof row.downhill === 'number'));
  const hasPace = $derived(rows.some((row) => typeof row.paceUp === 'number'));
  const hasLoss = $derived(rows.some((row) => typeof row.loss === 'number'));
  const hasIncidents = $derived(
    rows.some((row) => typeof row.blocked === 'number' || typeof row.rushed === 'number')
  );

  const hasMeasurements = $derived(hasDuel || hasDownhill || hasPace || hasLoss || hasIncidents);
  const resultsContext = $derived(
    hasMeasurements
      ? 'Select a runner to inspect their race'
      : 'Select a runner to inspect their race · recorded results only, without detailed simulation'
  );

  const percentOf = (value: unknown, total: unknown) =>
    typeof value === 'number' && typeof total === 'number' && total > 0
      ? (value / total) * 100
      : undefined;

  /** Distance behind the previous finisher. */
  function finishGap(row: Record<string, string | number>) {
    if (typeof row.gap !== 'number') return '—';

    return '+' + n(row.gap, 1) + 'm';
  }

  /** Seconds in a race mode; a mode the runner never entered reads as a plain dash. */
  function modeSeconds(value: unknown) {
    if (typeof value !== 'number') return '—';
    if (value === 0) return '-';

    return n(value) + 's';
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
          <InfoIcon />
        {/snippet}
        <h3>Reading race results</h3>
        <p>
          Compare finish times, the gap to the previous finisher, last-spurt delay, selected speed
          and remaining HP. Delayed spurts and speed reductions are highlighted. Delay is measured
          from the first spurt check; a speed reduction compares the selected speed with the
          full-spurt target. Select a runner to inspect their race below.
        </p>
        <p>
          Duel, downhill, pace and course-loss columns appear when the capture was resimulated. A
          short dash means the runner never entered that mode; a long dash means it was not
          measured.
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
      { key: 'gate', label: 'No.', numeric: true },
      { key: 'name', label: 'Uma' },
      { key: 'time', label: 'Time', numeric: true },
      { key: 'style', label: 'Style / mood' },
      { key: 'delay', label: 'Delay', numeric: true },
      { key: 'spurt', label: 'Last spurt', numeric: true },
      { key: 'hp', label: 'HP result', numeric: true },
      ...(hasDuel ? [{ key: 'duel', label: 'Duel (s)', numeric: true }] : []),
      ...(hasDownhill ? [{ key: 'downhill', label: 'Downhill (s)', numeric: true }] : []),
      ...(hasPace ? [{ key: 'paceUp', label: 'Pace (s)', numeric: true }] : []),
      ...(hasLoss ? [{ key: 'loss', label: 'Course loss (m)', numeric: true }] : []),
      ...(hasIncidents
        ? [{ key: 'blocked', label: 'Incidents (s)', numeric: true, sortable: false }]
        : []),
      { key: 'sp', label: 'Stats', numeric: true, sortable: false }
    ]}
  >
    {#snippet cell(row, col)}
      {@const r = capture.runners.find((r) => r.index === Number(row.id))!}
      {#if col.key === 'name'}
        <button
          class="runner-name"
          class:focused={selectedIndex === r.index}
          aria-label={'Inspect ' + r.name}
          aria-pressed={selectedIndex === r.index}
          onclick={() => inspect(r.index)}
        >
          <span class="rank-slot">
            {#if typeof row.grade === 'number'}
              <RankBadge
                rarity={row.grade}
                size="sm"
              />
            {/if}
          </span>
          <Artwork
            src={portrait(r.cardId)}
            alt=""
            size="sm"
          />
          <span>
            <strong>{r.name}</strong>
            {#if row.trainer}
              <small>[{row.trainer}]</small>
            {/if}
          </span>
          <Icon
            name="arrow-right"
            size={14}
          />
        </button>
      {:else if col.key === 'place'}
        <strong
          class="finish"
          class:winner={row.place === 1}
          class:podium={row.place === 2 || row.place === 3}
        >
          {row.place}
        </strong>
      {:else if col.key === 'gate'}
        <span class="value">{row.gate}</span>
      {:else if col.key === 'time'}
        <span class="value">
          {formatRaceTime(typeof row.time === 'number' ? row.time : undefined)}
        </span>
        {#if row.place !== 1}
          <small title="Distance behind the previous finisher">{finishGap(row)}</small>
        {/if}
      {:else if col.key === 'style'}
        {@const mood = moodName(r.raw.motivation)}
        <span class="style-mood">
          <span
            class="style-pill"
            style:--style-color={styleColors[r.result?.runningStyle ?? 0]}
            title={String(row.style)}
          >
            {runningStyleName(r.result?.runningStyle, true)}
          </span>
          {#if mood}
            <img
              class="mood"
              src={moodIcon(mood)}
              alt={mood + ' mood'}
              title={mood + ' mood'}
              width="34"
              height="34"
            />
          {/if}
        </span>
      {:else if col.key === 'delay'}
        {@const late = row.late === 'Late start' || row.late === 'Lost acceleration frame'}
        <span class="value">
          {typeof row.delay === 'number' ? n(row.delay, 1) + 'ms' : '—'}
        </span>
        {#if row.late}
          <small
            class="start-badge"
            class:late
            title={String(row.late)}
          >
            {late ? 'Late' : 'Normal'}
          </small>
        {/if}
      {:else if col.key === 'spurt'}
        <LastSpurtResult result={lastSpurtResult(capture, r.index)} />
      {:else if col.key === 'hp'}
        {#if typeof row.exhausted === 'number'}
          {@const deficitShare = percentOf(row.deficit, row.maxHp)}
          <span class="value died">
            Died{typeof row.exhaustedBeforeFinish === 'number'
              ? ' (-' + n(row.exhaustedBeforeFinish, 0) + 'm)'
              : ''}
          </span>
          <small
            class="died"
            title={'HP ran out at ' + n(row.exhausted, 0) + ' m'}
          >
            {#if typeof row.deficit === 'number'}
              -{n(row.deficit, 0)} HP{deficitShare === undefined
                ? ''
                : ' (' + n(deficitShare, 1) + '%)'}
            {:else}
              at {n(row.exhausted, 0)}m
            {/if}
          </small>
        {:else if typeof row.hp === 'number'}
          {@const share = percentOf(row.hp, row.maxHp)}
          <span class="value survived">Survived</span>
          <small
            style:color={share === undefined
              ? undefined
              : hpRemainingColor(share, $theme === 'dark')}
            title={typeof row.startHp === 'number'
              ? 'Started with ' + n(row.startHp, 0) + ' HP'
              : undefined}
          >
            {n(row.hp, 0)} HP{share === undefined ? '' : ' (' + n(share, 1) + '%)'}
          </small>
        {:else}
          <span class="value">—</span>
        {/if}
      {:else if col.key === 'duel'}
        <span
          class="value"
          class:mode-active={typeof row.duel === 'number' && row.duel > 0}
        >
          {modeSeconds(row.duel)}
        </span>
      {:else if col.key === 'downhill'}
        <span
          class="value"
          class:mode-time={typeof row.downhill === 'number' && row.downhill > 0}
        >
          {modeSeconds(row.downhill)}
        </span>
        {#if typeof row.downhill === 'number' && row.downhill > 0}
          <small>
            ({n(row.downhillEarly)}s pre-late{typeof row.downhillLate === 'number' &&
            row.downhillLate > 0
              ? ' / ' + n(row.downhillLate) + 's late'
              : ''})
          </small>
        {/if}
      {:else if col.key === 'paceUp'}
        <span
          class="value pace-up"
          title="Pace Up, Speed Up and Overtake"
        >
          ↑{modeSeconds(row.paceUp)}
        </span>
        {#if typeof row.paceDown === 'number' && row.paceDown > 0}
          <small
            class="pace-down"
            title="Pace Down"
          >
            ↓{modeSeconds(row.paceDown)}
          </small>
        {/if}
      {:else if col.key === 'loss'}
        <span class="value loss">
          {typeof row.loss === 'number' ? '-' + n(row.loss) + 'm' : '—'}
        </span>
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
          <span class="result-sp">
            <SkillPoints
              value={typeof row.sp === 'number' ? row.sp : null}
              note={LEARNED_SKILL_POINTS_NOTE}
            />
          </span>
        </div>
      {:else}
        {row[col.key]}
      {/if}
    {/snippet}
  </DataTable>
</section>

<style>
  @import './replay-results.css';
</style>
