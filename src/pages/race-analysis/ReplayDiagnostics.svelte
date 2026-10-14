<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import {
    diagnosticHorse,
    diagnosticLabel,
    skillActiveDuration,
    hpChangeEvents,
    type DiagnosticRow,
    raceMetricHelp,
    lastSpurtResult
  } from '@/lib/race/race-diagnostics';
  import type { EChartsCoreOption } from 'echarts/core';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import { raceTimeAtDistance } from '@/lib/race/race-replay';
  import { formatRaceTime } from '@/lib/race/race-display';
  import DataTable, { type TableColumn } from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';

  let {
    capture,
    index,
    skillNames,
    distance,
    blocking,
    overview,
    onseek,
    onselect
  }: {
    capture: ParsedRaceCapture;
    index: number;
    skillNames: Map<number, string>;
    distance: number;
    blocking?: Snippet;
    overview?: Snippet;
    onseek: (time: number) => void;
    onselect: (index: number) => void;
  } = $props();
  const instanceId = $props.id();

  let rawOpen = $state(true);
  let sourceOpen = $state(false);
  let expandedMode = $state<string>();
  let spurtOpen = $state(false);

  const horse = $derived(diagnosticHorse(capture, index));
  const runner = $derived(capture.runners.find((r) => r.index === index));
  const activations = $derived(capture.events.filter((e) => e.type === 3 && e.params[0] === index));
  const skillRows = $derived(
    [
      ...new Set([
        ...(runner?.skillIds ?? []),
        ...activations.map((e) => e.params[1]!),
        ...(horse?.skillActivationDecisions ?? []).map((d) => Number(d.skillId))
      ])
    ].map((id) => {
      const events = activations.filter((e) => e.params[1] === id);
      const roll = horse?.skillActivationDecisions?.find((d) => d.skillId === id);
      return {
        id,
        count: events.length,
        first: events[0]?.frameTime ?? '—',
        duration: events.length || roll?.activated ? (skillActiveDuration(horse, id) ?? '—') : '—',
        status: roll
          ? roll.activated
            ? 'Activated'
            : !roll.passed
              ? 'Wit check failed'
              : roll.required
                ? 'Passed wit check, failed condition'
                : 'Not triggered'
          : events.length
            ? 'Activated'
            : 'Not recorded',
        witRequired: Number(roll?.required === true),
        witPassed: Number(roll?.passed === true),
        roll: typeof roll?.roll === 'number' ? roll.roll : '—',
        threshold: typeof roll?.threshold === 'number' ? roll.threshold : '—'
      };
    })
  );
  const activationThresholds = $derived([
    ...new Set(
      skillRows.flatMap((row) => (typeof row.threshold === 'number' ? [row.threshold] : []))
    )
  ]);
  const sharedThreshold = $derived(
    activationThresholds.length === 1 ? activationThresholds[0] : undefined
  );
  const activatedSkills = $derived(skillRows.filter((row) => row.status === 'Activated').length);
  const sampleRows = $derived(
    (horse?.sampleTimes ?? capture.detailed?.annotations.sampleTimes ?? []).map((time, i) => ({
      time,
      targetSpeed: horse?.targetSpeeds?.[i] ?? '—',
      acceleration: horse?.accelerationRates?.[i] ?? '—'
    }))
  );
  const speedLimit = $derived(
    Math.max(
      1,
      ...sampleRows.map((row) => (typeof row.targetSpeed === 'number' ? row.targetSpeed : 0))
    )
  );
  const accelerationLimit = $derived(
    Math.max(
      1,
      ...sampleRows.map((row) =>
        typeof row.acceleration === 'number' ? Math.abs(row.acceleration) : 0
      )
    )
  );
  const rushingPeriods = $derived(
    (horse?.temptationSpans ?? []).map((span) => ({
      ...span,
      duration: span.endTime - span.startTime
    }))
  );
  const rushing = $derived(horse?.temptationDecision);
  const spurt = $derived(horse?.lastSpurtDecision ?? horse?.lastSpurtDecisions?.at(-1));
  const spurtResult = $derived(lastSpurtResult(capture, index));
  const spurtSelected = $derived(
    spurt?.result === 'True' || spurt?.result === 'TrueExceedNeedMaximumHp'
  );
  const spurtHpBalance = $derived(
    typeof spurt?.checkHp === 'number' && typeof spurt.fullSpurtNeedHp === 'number'
      ? spurt.checkHp - spurt.fullSpurtNeedHp
      : undefined
  );
  const lateStart = $derived(
    horse?.lostStartAccelerationFrame || (runner?.result?.startDelayTime ?? 0) >= 0.08
  );
  const modeRows = $derived(
    Object.entries(capture.detailed?.annotations.flags ?? {}).flatMap(([key, flag]) => {
      const spans = horse?.spans.filter((span) => (span.mask & flag) !== 0) ?? [];
      return spans.length
        ? [
            {
              id: key,
              mode: diagnosticLabel(key),
              duration: spans.reduce((total, span) => total + span.endTime - span.startTime, 0),
              periods: spans.length,
              time: spans[0]!.startTime
            }
          ]
        : [];
    })
  );
  const hpRows = $derived(hpChangeEvents(capture, horse?.hpSkillApplications ?? []));
  const sectionSpeeds = $derived(horse?.baseTargetSpeedSections ?? []);
  const sectionRows = $derived(
    sectionSpeeds
      .map((row) => ({
        section: Number(row.sectionIndex) + 1,
        phase: display(row.phase, 'phase'),
        start: (distance * Number(row.sectionIndex)) / 24,
        end: (distance * (Number(row.sectionIndex) + 1)) / 24,
        speed: Number(row.baseTargetSpeed),
        rng: Number(row.randomPercentage),
        time:
          raceTimeAtDistance(capture.frames, (distance * Number(row.sectionIndex)) / 24, index) ??
          '—'
      }))
      .sort((a, b) => a.section - b.section)
  );
  const averageRng = $derived(
    sectionRows.length
      ? sectionRows.reduce((total, row) => total + row.rng, 0) / sectionRows.length
      : 0
  );
  const rngLimit = $derived(
    Math.max(0.1, Math.ceil(Math.max(0, ...sectionRows.map((row) => Math.abs(row.rng))) * 10) / 10)
  );
  const sectionChart = $derived.by((): EChartsCoreOption => {
    const text = $theme === 'dark' ? '#a6afbd' : '#596477';
    const grid = $theme === 'dark' ? '#ffffff12' : '#00000012';
    const speedMin = Math.floor(Math.min(...sectionRows.map((row) => row.speed)) * 2) / 2;
    const speedMax = Math.max(
      speedMin + 0.5,
      Math.ceil(Math.max(...sectionRows.map((row) => row.speed)) * 2) / 2
    );
    const xAxis = {
      type: 'category' as const,
      data: sectionRows.map((row) => row.section),
      axisLine: { lineStyle: { color: grid } },
      axisTick: { show: false },
      axisLabel: { show: false },
      axisPointer: { type: 'line' as const, lineStyle: { color: text, type: 'dashed' as const } },
      splitLine: { show: false }
    };
    const rngPoints = sectionRows.map((row) => ({
      value: row.rng,
      itemStyle: { color: row.rng > 0 ? '#87ceab' : row.rng < 0 ? '#ed8d8d' : text }
    }));
    return {
      animation: false,
      aria: { enabled: true },
      grid: [
        { left: 48, right: 12, top: 20, height: 64 },
        { left: 48, right: 12, top: 116, height: 60 }
      ],
      axisPointer: { link: [{ xAxisIndex: [0, 1] }] },
      tooltip: {
        trigger: 'axis',
        textStyle: { fontSize: 11 },
        formatter: (params: unknown) => {
          const point = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
          const row = sectionRows[point.dataIndex];
          return row
            ? `<strong>Section ${row.section}</strong><br>${row.phase}<br>${number(row.start)}–${number(row.end)} m<br>Target speed: ${row.speed.toFixed(2)} m/s<br>RNG: ${signed(row.rng)}%${row.rng === 0 ? '' : row.rng > 0 ? ' (faster)' : ' (slower)'}`
            : '';
        }
      },
      xAxis: [
        xAxis,
        {
          ...xAxis,
          gridIndex: 1,
          axisTick: {
            show: true,
            alignWithLabel: true,
            interval: (i: number) =>
              i === 0 || i === sectionRows.length - 1 || sectionRows[i]!.section % 4 === 0
          },
          axisLabel: {
            show: true,
            color: text,
            fontSize: 10,
            margin: 8,
            interval: (i: number) =>
              i === 0 || i === sectionRows.length - 1 || sectionRows[i]!.section % 4 === 0
          }
        }
      ],
      yAxis: [
        {
          type: 'value',
          min: speedMin,
          max: speedMax,
          splitNumber: 2,
          axisLabel: { color: text, fontSize: 10, formatter: (value: number) => number(value, 1) },
          splitLine: { lineStyle: { color: grid } }
        },
        {
          type: 'value',
          gridIndex: 1,
          min: -rngLimit,
          max: rngLimit,
          interval: rngLimit,
          axisLabel: {
            color: text,
            fontSize: 10,
            formatter: (value: number) => signed(value, 1) + '%'
          },
          splitLine: { lineStyle: { color: grid, type: 'dashed' } }
        }
      ],
      series: [
        {
          name: 'Base target speed',
          type: 'line',
          step: 'middle',
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2, color: '#69b7ee' },
          itemStyle: { color: '#69b7ee' },
          data: sectionRows.map((row) => row.speed)
        },
        {
          name: 'RNG stems',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          barWidth: 2,
          silent: true,
          data: rngPoints,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: { color: text, width: 1, type: 'solid', opacity: 0.5 },
            data: [{ yAxis: 0 }]
          }
        },
        {
          name: 'RNG adjustment',
          type: 'scatter',
          xAxisIndex: 1,
          yAxisIndex: 1,
          symbol: 'circle',
          symbolSize: 6,
          data: rngPoints
        }
      ]
    };
  });
  const paceChart = $derived.by((): EChartsCoreOption => {
    const text = $theme === 'dark' ? '#a6afbd' : '#596477';
    const grid = $theme === 'dark' ? '#ffffff12' : '#00000012';
    return {
      animation: false,
      aria: { enabled: true },
      grid: { left: 42, right: 46, top: 22, bottom: 25 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (value: unknown) => (typeof value === 'number' ? value.toFixed(2) : '—')
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: sampleRows.at(-1)?.time ?? 1,
        axisLabel: { color: text, fontSize: 10, formatter: (value: number) => timeLabel(value) },
        splitLine: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          name: 'm/s',
          nameTextStyle: { color: text, fontSize: 10 },
          axisLabel: { color: text, fontSize: 10 },
          splitLine: { lineStyle: { color: grid } }
        },
        {
          type: 'value',
          name: 'm/s²',
          nameTextStyle: { color: text, fontSize: 10 },
          axisLabel: { color: text, fontSize: 10 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'Target speed (m/s)',
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: '#69b7ee' },
          itemStyle: { color: '#69b7ee' },
          data: sampleRows.map((row) => [
            row.time,
            typeof row.targetSpeed === 'number' ? row.targetSpeed : null
          ])
        },
        {
          name: 'Acceleration (m/s²)',
          type: 'line',
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: { width: 1.5, color: '#df8ca1' },
          itemStyle: { color: '#df8ca1' },
          data: sampleRows.map((row) => [
            row.time,
            typeof row.acceleration === 'number' ? row.acceleration : null
          ])
        }
      ]
    };
  });

  function display(value: unknown, key = ''): string | number {
    if (value === undefined || value === null) return '—';
    if (key === 'phase' && typeof value === 'number')
      return (
        ['Early race', 'Mid race', 'Late race', 'Last spurt', 'Finished'][value] ?? String(value)
      );
    if (key === 'result' && typeof value === 'string')
      return (
        (
          {
            True: 'Spurt selected',
            TrueExceedNeedMaximumHp: 'Full spurt selected',
            False: 'No spurt selected',
            FalseBelowNeedMinimumHp: 'Insufficient HP'
          } as Record<string, string>
        )[value] ?? value
      );
    if (key === 'outcome' && typeof value === 'string')
      return (
        (
          {
            NoMode: 'No mode',
            Rejected: 'Conditions not met',
            Started: 'Started',
            FailedRoll: 'Roll failed'
          } as Record<string, string>
        )[value] ?? value
      );
    if (typeof value === 'number')
      return Number.isInteger(value) ? value : Number(value.toFixed(4));
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.map((v) => display(v)).join(', ');
    if (typeof value === 'object')
      return Object.entries(value)
        .map(([k, v]) => diagnosticLabel(k) + ': ' + display(v, k))
        .join(', ');
    return String(value);
  }

  function rows(value: unknown): Record<string, string | number>[] {
    return (Array.isArray(value) ? value : [value]).map((item, i) => {
      const row: DiagnosticRow = item && typeof item === 'object' ? item : { value: item };
      return {
        id: i,
        ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, display(v, k)]))
      };
    });
  }

  function seekRow(row: Record<string, string | number>) {
    const time = row.time ?? row.startTime;
    if (typeof time === 'number') onseek(time);
  }

  function number(value: unknown, digits = 0) {
    return typeof value === 'number'
      ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
      : '—';
  }

  function count(value: number, noun: string) {
    return `${value} ${noun}${value === 1 ? '' : 's'}`;
  }

  function timeLabel(value: number) {
    const rounded = Math.round(value * 10) / 10;
    return rounded === 0 ? '0:00' : formatRaceTime(rounded, rounded % 1 ? 1 : 0);
  }

  function signed(value: number, digits = 2) {
    const rounded = Number(value.toFixed(digits));
    return (rounded > 0 ? '+' : '') + rounded.toFixed(digits);
  }

  function seekSection(value: number) {
    const time = sectionRows[Math.round(value)]?.time;
    if (typeof time === 'number') onseek(time);
  }

  function runnerName(value: unknown) {
    return capture.runners.find((r) => r.index === Number(value))?.name ?? 'Unknown runner';
  }

  function percentPosition(value: unknown) {
    return typeof value === 'number' ? Math.min(100, Math.max(0, value)) : 0;
  }
</script>

{#snippet metricHelp(label: string)}
  {@const help = raceMetricHelp[label]}
  {#if help}
    <span class="metric-help">
      <InspectPopover
        label={'About ' + label}
        openOnHover
      >
        {#snippet trigger()}
          <Icon
            name="info"
            size={12}
          />
        {/snippet}
        <p>{help}</p>
      </InspectPopover>
    </span>
  {/if}
{/snippet}

{#snippet runnerReference(value: number)}
  {#if value >= 0}
    <button
      class="runner-reference detail-runner"
      type="button"
      onclick={() => onselect(value)}
    >
      <Artwork
        src={portrait(capture.runners.find((r) => r.index === value)?.cardId)}
        alt=""
        size="xs"
      />{value === index ? 'Self' : runnerName(value)}
    </button>
  {:else}
    <span class="muted">None</span>
  {/if}
{/snippet}

{#snippet eventTable(value: unknown, title: string, tableColumns: TableColumn[])}
  {#if Array.isArray(value) && !value.length}
    <p class="empty">No observations recorded for this runner.</p>
  {:else}
    <DataTable
      columnHelp={raceMetricHelp}
      plain
      compact
      caption={title}
      rows={rows(value)}
      columns={tableColumns}
      maxHeight={Array.isArray(value) && value.length > 12 ? 300 : undefined}
      onrowclick={seekRow}
      emptyMessage="No observations recorded for this runner."
    >
      {#snippet cell(row, column)}
        {#if /^(time|startTime|endTime)$/.test(column.key) && typeof row[column.key] === 'number'}
          <Button
            variant="ghost"
            size="sm"
            onclick={() => onseek(Number(row[column.key]))}
          >
            {Number(row[column.key]).toFixed(3)} s ↗
          </Button>
        {:else if /^(horseIndex|.*HorseIndex)$/.test(column.key) && Number(row[column.key]) >= 0}
          {@render runnerReference(Number(row[column.key]))}
        {:else if column.key === 'referenceHorseIndex'}
          <span class="muted">None</span>
        {:else if column.key === 'skillId'}
          <RaceSkill
            id={Number(row[column.key])}
            name={skillNames.get(Number(row[column.key]))}
          />
          {#if Number(row.detailIndex) > 0}
            <small class="effect-index">
              Effect {Number(row.detailIndex) + 1}
            </small>
          {/if}
        {:else if column.key === 'attemptedMode'}
          {['None', 'Speed up', 'Overtake', 'Pace up', 'Pace down', 'Pace up (extended)'][
            Number(row.attemptedMode)
          ] ?? row.attemptedMode}
        {:else if column.key === 'outcome'}
          <span
            class:activated={row.outcome === 'Started'}
            class:failed={row.outcome === 'Roll failed'}
          >
            {row.outcome}
          </span>
        {:else if column.key === 'mode'}
          {[
            'None',
            'Late Surger position',
            'Pace Chaser position',
            'Front Runner position',
            'Boost'
          ][Number(row.mode)] ?? row.mode}
        {:else if column.key === 'duration'}
          {Number(row.duration).toFixed(2)}
        {:else if column.key === 'roll' && typeof row.roll === 'number' && typeof row.threshold === 'number'}
          <span
            class:activated={Number(row.roll) < Number(row.threshold)}
            class:failed={Number(row.roll) >= Number(row.threshold)}
          >
            {Number(row.roll).toFixed(2)}% {Number(row.roll) < Number(row.threshold) ? '<' : '≥'}
            {Number(row.threshold).toFixed(2)}%
          </span>
        {:else if /^(roll|threshold)$/.test(column.key)}
          {typeof row[column.key] === 'number' ? Number(row[column.key]).toFixed(2) + '%' : '—'}
        {:else if column.key === 'mask'}
          {Object.entries(capture.detailed?.annotations.flags ?? {})
            .filter(([, flag]) => (Number(row.mask) & flag) !== 0)
            .map(([name]) => diagnosticLabel(name))
            .join(', ') || 'None'}
        {:else}
          {typeof row[column.key] === 'number' ? number(row[column.key], 2) : row[column.key]}
        {/if}
      {/snippet}
    </DataTable>
  {/if}
{/snippet}

{#snippet outcomeSummary()}
  {#if horse}
    <dl
      class="outcome-summary"
      aria-label="Runner outcome summary"
    >
      <div
        class="outcome"
        class:danger={typeof horse.finalHp === 'number' && horse.finalHp <= 0}
      >
        <dt>HP at finish{@render metricHelp('HP at finish')}</dt>
        <dd>
          <strong>
            {number(horse.finalHp)}
            <small>HP</small>
          </strong>
          <span class="outcome-detail">
            {#if typeof horse.hpExhaustedDistance === 'number'}
              Exhausted at {number(horse.hpExhaustedDistance)} m
            {:else if typeof horse.startHp === 'number'}
              Started with {number(horse.startHp)} HP
            {/if}
          </span>
        </dd>
      </div>
      <div
        class="outcome"
        class:caution={spurtResult.noSpurt || (spurtResult.delay ?? 0) >= 0.05}
      >
        <dt>Spurt delay{@render metricHelp('Spurt delay')}</dt>
        <dd>
          <strong>
            {spurtResult.noSpurt
              ? 'No spurt'
              : spurtResult.delay === undefined
                ? 'Not recorded'
                : number(spurtResult.delay, 1)}{#if spurtResult.delay !== undefined}
              {' '}
              <small>m</small>
            {/if}
          </strong>
          <span
            class="outcome-detail"
            class:caution={spurtResult.speedPenalty}
          >
            {#if spurtResult.speed !== undefined}
              Speed {number(spurtResult.speed, 2)} m/s{#if (spurtResult.reduction ?? 0) >= 0.005}
                {' '}(−{number(spurtResult.reduction, 2)})
              {/if}
            {/if}
          </span>
        </dd>
      </div>
      <div class="outcome">
        <dt>Course loss{@render metricHelp('Course loss')}</dt>
        <dd>
          <strong>
            {number(horse.worldTransformDistanceLoss, 2)}
            <small>m</small>
          </strong>
          <span class="outcome-detail">Extra distance travelled</span>
        </dd>
      </div>
      <div
        class="outcome"
        class:caution={lateStart}
      >
        <dt>Start{@render metricHelp('Start')}</dt>
        <dd>
          <strong>
            {lateStart
              ? 'Delayed'
              : horse.lostStartAccelerationFrame === undefined &&
                  runner?.result?.startDelayTime === undefined
                ? 'Not recorded'
                : 'Clean'}
          </strong>
          <span class="outcome-detail">
            {#if runner?.result?.startDelayTime !== undefined}
              <span>
                {number(runner.result.startDelayTime * 1000, 1)} ms delay
              </span>
            {/if}{#if horse.lostStartAccelerationFrame}
              <span>Lost acceleration frame</span>
            {/if}
          </span>
        </dd>
      </div>
    </dl>
  {:else}
    <p class="fallback">
      Detailed simulation data is unavailable. Showing recorded skill activations and blocking
      events.
    </p>
  {/if}
{/snippet}

<section
  class="diagnostics"
  aria-label={(runner?.name ?? 'Runner') + ' detailed diagnostics'}
>
  {#if overview}
    <div class="runner-overview">
      {@render overview()}{@render outcomeSummary()}
    </div>
  {:else}
    {@render outcomeSummary()}
  {/if}

  <div class="report-grid">
    <section
      class="report-block skills-report"
      aria-label="Runner skill performance"
    >
      <header class="section-heading">
        <h3>
          Skill performance <small>{activatedSkills}/{skillRows.length} activated</small>
        </h3>
        {#if sharedThreshold !== undefined}
          <span class="activation-threshold">
            Wit checks pass below <strong>{sharedThreshold.toFixed(2)}%</strong>
            {@render metricHelp('Wit check threshold')}
          </span>
        {/if}
      </header>
      <DataTable
        columnHelp={raceMetricHelp}
        plain
        compact
        caption="Runner skill analysis"
        rows={skillRows}
        columns={[
          { key: 'id', label: 'Skill' },
          { key: 'status', label: 'Outcome' },
          { key: 'count', label: 'Triggers', numeric: true },
          { key: 'first', label: 'First (s)', numeric: true },
          ...(horse
            ? [
                { key: 'duration', label: 'Active (s)', numeric: true },
                { key: 'roll', label: 'Wit check', numeric: true }
              ]
            : [])
        ]}
      >
        {#snippet cell(row, column)}
          {#if column.key === 'id'}
            <RaceSkill
              id={Number(row.id)}
              name={skillNames.get(Number(row.id))}
            />
          {:else if column.key === 'status'}
            <span
              class="skill-status"
              class:activated={row.status === 'Activated'}
              class:failed={row.status === 'Wit check failed'}
              class:caution={row.status === 'Passed wit check, failed condition'}
            >
              {row.status}
            </span>
          {:else if column.key === 'roll'}
            <span
              class="wit-check"
              class:failed={row.witRequired === 1 && row.witPassed === 0}
            >
              {#if row.witRequired !== 1}
                <span
                  class="muted"
                  title="No wit check required"
                >
                  —
                </span>
              {:else if typeof row.roll === 'number' && typeof row.threshold === 'number'}
                {Number(row.roll).toFixed(2)}%{#if sharedThreshold === undefined}
                  <small>
                    Pass below {Number(row.threshold).toFixed(2)}%
                  </small>
                {/if}
              {:else}
                <span class="muted">Not recorded</span>
              {/if}
            </span>
          {:else if column.key === 'first' && typeof row.first === 'number'}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => onseek(Number(row.first))}
            >
              {Number(row.first).toFixed(3)} s ↗
            </Button>
          {:else}
            {typeof row[column.key] === 'number'
              ? Number(row[column.key]).toFixed(column.key === 'count' ? 0 : 2)
              : row[column.key]}
          {/if}
        {/snippet}
      </DataTable>
    </section>
    {#if horse}
      <div class="behaviour-report">
        <section
          class="report-block"
          aria-label="Runner race modes"
        >
          <header class="section-heading">
            <h3>
              Race behaviour <small>{modeRows.length} active</small>
            </h3>
          </header>
          <DataTable
            columnHelp={raceMetricHelp}
            plain
            compact
            caption="Race modes"
            rows={modeRows}
            maxHeight={220}
            emptyMessage="No race modes recorded."
            columns={[
              { key: 'mode', label: 'Mode' },
              { key: 'duration', label: 'Active time (s)', numeric: true },
              { key: 'periods', label: 'Periods', numeric: true },
              { key: 'time', label: 'First (s)', numeric: true }
            ]}
            onrowclick={seekRow}
            rowKey="id"
            expandedRow={expandedMode}
          >
            {#snippet cell(row, column)}
              {#if column.key === 'time'}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => onseek(Number(row.time))}
                >
                  {Number(row.time).toFixed(3)} s ↗
                </Button>
              {:else if column.key === 'periods'}
                <button
                  class="period-toggle"
                  type="button"
                  aria-label={'Show ' + row.mode + ' periods'}
                  aria-expanded={expandedMode === row.id}
                  onclick={() =>
                    (expandedMode = expandedMode === row.id ? undefined : String(row.id))}
                >
                  {row.periods}
                  <span class:opened={expandedMode === row.id}>
                    <Icon
                      name="chevron"
                      size={12}
                    />
                  </span>
                </button>
              {:else if column.key === 'duration'}
                {Number(row.duration).toFixed(2)}
              {:else}
                {row[column.key]}
              {/if}
            {/snippet}
            {#snippet rowDetail(row)}
              <ol
                class="mode-periods"
                aria-label={row.mode + ' periods'}
              >
                {#each horse.spans.filter((span) => (span.mask & (capture.detailed?.annotations.flags[String(row.id)] ?? 0)) !== 0) as span}
                  <li>
                    <span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => onseek(span.startTime)}
                      >
                        {span.startTime.toFixed(3)} s ↗
                      </Button>
                      <span class="period-arrow">→</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => onseek(span.endTime)}
                      >
                        {span.endTime.toFixed(3)} s ↗
                      </Button>
                    </span>
                    <span>{display(span.phase, 'phase')}</span>
                    <small>{(span.endTime - span.startTime).toFixed(2)} s</small>
                  </li>
                {/each}
              </ol>
            {/snippet}
          </DataTable>
        </section>
        {#if spurt}
          <section
            class="report-block spurt-report"
            aria-label="Last-spurt decision"
          >
            <header class="section-heading">
              <h3>Last-spurt decision</h3>
              {#if typeof spurt.time === 'number'}
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => onseek(Number(spurt.time))}
                >
                  {spurt.time.toFixed(3)} s ↗
                </Button>
              {/if}
              <button
                class="calculation-toggle"
                type="button"
                aria-label="Last-spurt calculation"
                aria-expanded={spurtOpen}
                aria-controls={instanceId + '-spurt-calculation'}
                onclick={() => (spurtOpen = !spurtOpen)}
              >
                Calculation <span class:opened={spurtOpen}>
                  <Icon
                    name="chevron"
                    size={12}
                  />
                </span>
              </button>
            </header>
            {#if !spurtOpen}
              <dl class="spurt-summary">
                <div>
                  <dt>HP at decision{@render metricHelp('HP at decision')}</dt>
                  <dd>{number(spurt.checkHp)}</dd>
                </div>
                <div>
                  <dt>HP for full spurt{@render metricHelp('HP for full spurt')}</dt>
                  <dd>{number(spurt.fullSpurtNeedHp)}</dd>
                </div>
                <div>
                  <dt>Full spurt speed{@render metricHelp('Full spurt speed')}</dt>
                  <dd>
                    {number(spurt.fullSpurtTargetSpeed, 2)}
                    <small>m/s</small>
                  </dd>
                </div>
              </dl>
              {#if typeof spurt.checkHp === 'number' && typeof spurt.fullSpurtNeedHp === 'number'}
                <p
                  class="decision-note"
                  class:caution={spurt.checkHp < spurt.fullSpurtNeedHp}
                >
                  {spurt.checkHp < spurt.fullSpurtNeedHp
                    ? number(spurt.fullSpurtNeedHp - spurt.checkHp) + ' HP short of a full spurt'
                    : 'Enough HP for a full spurt'}{#if spurt.speedPenalty}
                    ; speed reduced
                  {/if}{#if spurt.delayPenalty}
                    ; spurt delayed
                  {/if}
                </p>
              {/if}
            {/if}
            <div
              class="spurt-calculation"
              id={instanceId + '-spurt-calculation'}
              hidden={!spurtOpen}
            >
              {#if spurtHpBalance !== undefined}
                <div
                  class="hp-equation"
                  aria-label="HP available minus HP required for a full spurt"
                >
                  <span>
                    <small>Available HP</small>
                    <strong>{number(spurt.checkHp, 2)}</strong>
                  </span>
                  <b aria-hidden="true">−</b>
                  <span>
                    <small>Required HP</small>
                    <strong>{number(spurt.fullSpurtNeedHp, 2)}</strong>
                  </span>
                  <b aria-hidden="true">=</b>
                  <span class:shortfall={spurtHpBalance < 0}>
                    <small>{spurtHpBalance < 0 ? 'HP shortfall' : 'HP spare'}</small>
                    <strong>{signed(spurtHpBalance)}</strong>
                  </span>
                </div>
              {/if}
              <table class="spurt-comparison">
                <caption class="sr-only">Full and selected spurt</caption>
                <thead>
                  <tr>
                    <th scope="col">Spurt</th>
                    <th scope="col">Full</th>
                    <th scope="col">Selected</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">
                      Start <small>m</small>
                    </th>
                    <td>{number(spurt.checkDistance, 2)}</td>
                    <td>{spurtSelected ? number(spurt.selectedStartDistance, 2) : '—'}</td>
                  </tr>
                  <tr>
                    <th scope="row">
                      Speed <small>m/s</small>
                    </th>
                    <td>{number(spurt.fullSpurtTargetSpeed, 2)}</td>
                    <td>{spurtSelected ? number(spurt.selectedTargetSpeed, 2) : '—'}</td>
                  </tr>
                </tbody>
              </table>
              <p class="spurt-result">
                <strong>
                  {spurtSelected
                    ? spurt.speedPenalty || spurt.delayPenalty
                      ? 'Reduced spurt selected'
                      : display(spurt.result, 'result')
                    : display(spurt.result, 'result')}
                </strong>
                {#if spurtSelected && typeof spurt.selectedStartDistance === 'number' && typeof spurt.checkDistance === 'number'}
                  <span>
                    {spurt.delayPenalty
                      ? number(spurt.selectedStartDistance - spurt.checkDistance, 2) + ' m delay'
                      : 'No delay'}
                  </span>
                {/if}
                {#if spurtSelected && typeof spurt.selectedTargetSpeed === 'number' && typeof spurt.fullSpurtTargetSpeed === 'number'}
                  <span>
                    {spurt.speedPenalty
                      ? number(spurt.fullSpurtTargetSpeed - spurt.selectedTargetSpeed, 2) +
                        ' m/s slower'
                      : 'Full speed'}
                  </span>
                {/if}
                {#if typeof spurt.calculationCount === 'number'}
                  <span>
                    {count(spurt.calculationCount, 'calculation')}
                  </span>
                {/if}
              </p>
              {#if (horse.lastSpurtDecisions?.length ?? 0) > 1}
                <h4>Decision history</h4>
                {@render eventTable(horse.lastSpurtDecisions, 'Last-spurt decisions', [
                  { key: 'time', label: 'Time (s)' },
                  { key: 'checkDistance', label: 'Distance (m)', numeric: true },
                  { key: 'checkHp', label: 'HP available', numeric: true },
                  { key: 'fullSpurtNeedHp', label: 'HP required', numeric: true },
                  { key: 'fullSpurtTargetSpeed', label: 'Full speed (m/s)', numeric: true },
                  { key: 'selectedStartDistance', label: 'Start (m)', numeric: true },
                  { key: 'selectedTargetSpeed', label: 'Speed (m/s)', numeric: true },
                  { key: 'result', label: 'Result' },
                  { key: 'delayPenalty', label: 'Delayed' },
                  { key: 'speedPenalty', label: 'Slower' },
                  { key: 'calculationCount', label: 'Calculations', numeric: true }
                ])}
              {/if}
            </div>
          </section>
        {/if}
        {#if blocking}
          <div class="blocking-summary">{@render blocking()}</div>
        {/if}
        <div class="incident-status">
          {#if !hpRows.length}
            <span>No recovery or HP debuffs</span>
          {/if}
          {#if !horse.temptationDecision && !rushingPeriods.length}
            <span>No rushing</span>
          {/if}
        </div>
      </div>
    {:else if blocking}
      <div class="blocking-summary">{@render blocking()}</div>
    {/if}
  </div>
  {#if horse}
    <div
      class="measurements"
      aria-label="Runner pace and speed"
    >
      <div class="measurement-grid">
        <section class="report-block pace-report">
          <header class="section-heading">
            <h4>
              Pace over time{@render metricHelp('Pace over time')}
              <small>{count(sampleRows.length, 'sample')}</small>
            </h4>
          </header>
          <div class="measurement-legend">
            <span class="target-key">Target speed (m/s)</span>
            <span class="accel-key">Acceleration (m/s²)</span>
            <small>Select a time to watch it in replay.</small>
          </div>
          {#if sampleRows.some((row) => typeof row.targetSpeed === 'number' || typeof row.acceleration === 'number')}
            <div class="pace-chart">
              <LazyEChartsSurface
                option={paceChart}
                label="Simulator pace over time"
                height={180}
                onaxisclick={onseek}
              />
            </div>
          {:else}
            <p class="empty">No pace samples recorded.</p>
          {/if}
        </section>
        {#if sectionSpeeds.length}
          <section class="report-block section-speeds">
            <header class="section-heading">
              <h4>
                Base target speed{@render metricHelp('Base target speed')}
                <small>{count(sectionSpeeds.length, 'section')}</small>
              </h4>
            </header>
            <div class="section-chart">
              <span class="chart-lane-label speed">Target speed (m/s)</span>
              <span class="chart-lane-label rng">RNG adjustment (%)</span>
              <LazyEChartsSurface
                option={sectionChart}
                label="Base target speed and RNG by course section"
                height={200}
                onaxisclick={seekSection}
              />
            </div>
            <div class="rng-summary">
              <span class="rng-key">
                <span class="rng-value negative">− Slower</span>
                <span class="rng-value positive">+ Faster</span>
              </span>
              <span>
                Average RNG <strong
                  class="rng-value"
                  class:positive={averageRng > 0}
                  class:negative={averageRng < 0}
                >
                  {signed(averageRng)}%
                </strong>
              </span>
            </div>
          </section>
        {/if}
      </div>
      <Disclosure
        id={instanceId + '-raw'}
        title="Detailed measurements & simulation data"
        description={count(sampleRows.length, 'sample') +
          ', ' +
          count(sectionRows.length, 'section')}
        compact
        bind:open={rawOpen}
      >
        {#if rawOpen}
          <div class="measurement-data">
            <div class="measurement-details-grid">
              <section
                class="detail-panel pace-samples"
                aria-label="Exact telemetry samples"
              >
                <header class="section-heading">
                  <h4>
                    Pace samples <small>{count(sampleRows.length, 'sample')}</small>
                  </h4>
                  <span class="detail-hint">Select a time to replay</span>
                </header>
                <DataTable
                  columnHelp={raceMetricHelp}
                  plain
                  compact
                  caption="Simulator telemetry samples"
                  rows={sampleRows}
                  columns={[
                    { key: 'time', label: 'Time (s)' },
                    { key: 'targetSpeed', label: 'Target (m/s)', numeric: true },
                    { key: 'acceleration', label: 'Accel. (m/s²)', numeric: true }
                  ]}
                  maxHeight={262}
                  onrowclick={seekRow}
                >
                  {#snippet cell(row, column)}
                    {#if column.key === 'time'}
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={() => onseek(Number(row.time))}
                      >
                        {Number(row.time).toFixed(3)} s ↗
                      </Button>
                    {:else if typeof row[column.key] === 'number'}
                      <span class="sample-value">
                        {#if column.key === 'targetSpeed'}
                          <span
                            class="speed-meter"
                            aria-hidden="true"
                          >
                            <span
                              style:width={(Number(row.targetSpeed) / speedLimit) * 100 + '%'}
                            ></span>
                          </span>
                        {:else}
                          <span
                            class="rng-meter acceleration-meter"
                            aria-hidden="true"
                          >
                            <span
                              style:left={(Number(row.acceleration) < 0
                                ? 50 - (Math.abs(Number(row.acceleration)) / accelerationLimit) * 50
                                : 50) + '%'}
                              style:width={(Math.abs(Number(row.acceleration)) /
                                accelerationLimit) *
                                50 +
                                '%'}
                            ></span>
                          </span>
                        {/if}
                        <strong>
                          {column.key === 'targetSpeed'
                            ? Number(row.targetSpeed).toFixed(2)
                            : signed(Number(row.acceleration))}
                        </strong>
                      </span>
                    {:else}
                      <span class="muted">—</span>
                    {/if}
                  {/snippet}
                </DataTable>
              </section>
              {#if sectionRows.length}
                <section
                  class="detail-panel section-details"
                  aria-label="Course section speed details"
                >
                  <header class="section-heading">
                    <h4>
                      Base speed & RNG <small>{count(sectionRows.length, 'section')}</small>
                    </h4>
                    <span class="detail-hint">Select a section to replay</span>
                  </header>
                  <DataTable
                    columnHelp={raceMetricHelp}
                    plain
                    compact
                    caption="Base target speed by section"
                    rows={sectionRows}
                    columns={[
                      { key: 'section', label: 'Section' },
                      { key: 'start', label: 'Distance (m)' },
                      { key: 'phase', label: 'Phase' },
                      { key: 'speed', label: 'Target (m/s)', numeric: true },
                      { key: 'rng', label: 'RNG (%)', numeric: true }
                    ]}
                    maxHeight={262}
                  >
                    {#snippet cell(row, column)}
                      {#if column.key === 'section'}
                        {#if typeof row.time === 'number'}
                          <Button
                            variant="ghost"
                            size="sm"
                            ariaLabel={'Section ' + row.section + ' ↗'}
                            onclick={() => onseek(Number(row.time))}
                          >
                            {row.section} ↗
                          </Button>
                        {:else}
                          {row.section}
                        {/if}
                      {:else if column.key === 'start'}
                        <span class="muted">
                          {number(row.start)}–{number(row.end)}
                        </span>
                      {:else if column.key === 'rng'}
                        <span class="rng-cell">
                          <span
                            class="rng-meter"
                            aria-hidden="true"
                          >
                            <span
                              class:negative={Number(row.rng) < 0}
                              style:left={(Number(row.rng) < 0
                                ? 50 - (Math.abs(Number(row.rng)) / rngLimit) * 50
                                : 50) + '%'}
                              style:width={(Math.abs(Number(row.rng)) / rngLimit) * 50 + '%'}
                            ></span>
                          </span>
                          <span
                            class="rng-value"
                            class:positive={Number(row.rng) > 0}
                            class:negative={Number(row.rng) < 0}
                          >
                            {signed(Number(row.rng))}%
                          </span>
                        </span>
                      {:else if column.key === 'speed'}
                        {Number(row.speed).toFixed(2)}
                      {:else}
                        {String(row[column.key]).replace(' race', '')}
                      {/if}
                    {/snippet}
                  </DataTable>
                </section>
              {/if}
            </div>
            <div class="detail-traces">
              <section class="detail-panel reference-panel">
                {#each [{ title: 'Position keeping', spans: horse.positionKeepReferenceSpans ?? [], key: 'referenceHorseIndex' }, { title: 'Race pacemakers', spans: capture.detailed?.annotations.paceMakerSpans ?? [], key: 'horseIndex' }] as group}
                  <div class="reference-group">
                    <Disclosure
                      id={instanceId + '-' + group.key}
                      title={group.title}
                      description={count(group.spans.length, 'period')}
                      compact
                      open
                    >
                      {#if group.spans.length}
                        <ol
                          class="reference-periods"
                          aria-label={group.title + ' periods'}
                        >
                          {#each group.spans as span}
                            <li>
                              <Button
                                variant="ghost"
                                size="sm"
                                onclick={() => onseek(span.startTime)}
                              >
                                {span.startTime.toFixed(3)}–{span.endTime.toFixed(3)} s ↗
                              </Button>
                              {#if Number(span[group.key]) >= 0}
                                <button
                                  class="runner-reference"
                                  type="button"
                                  onclick={() => onselect(Number(span[group.key]))}
                                >
                                  <Artwork
                                    src={portrait(
                                      capture.runners.find(
                                        (r) => r.index === Number(span[group.key])
                                      )?.cardId
                                    )}
                                    alt=""
                                    size="xs"
                                  />{runnerName(span[group.key])}
                                </button>
                              {:else}
                                <span>No reference runner</span>
                              {/if}
                              <small>{number(span.endTime - span.startTime, 2)} s</small>
                            </li>
                          {/each}
                        </ol>
                      {:else}
                        <p class="empty">
                          No {group.title.toLowerCase()} periods recorded.
                        </p>
                      {/if}
                    </Disclosure>
                  </div>
                {/each}
              </section>
              <section class="detail-panel detail-table position-decisions">
                <Disclosure
                  id={instanceId + '-position-decisions'}
                  title="Position-keep decisions"
                  description={count(horse.positionKeepDecisions?.length ?? 0, 'decision')}
                  compact
                  open
                >
                  {@render eventTable(
                    horse.positionKeepDecisions ?? [],
                    'Position-keep decisions',
                    [
                      { key: 'time', label: 'Time (s)' },
                      { key: 'attemptedMode', label: 'Mode' },
                      { key: 'outcome', label: 'Result' },
                      { key: 'referenceHorseIndex', label: 'Reference' },
                      { key: 'roll', label: 'Check / chance', numeric: true }
                    ]
                  )}
                </Disclosure>
              </section>
              {#if horse.hpSkillApplications?.length}
                <section class="detail-panel detail-table hp-application-details">
                  <Disclosure
                    id={instanceId + '-hp-applications'}
                    title="Recovery & HP changes"
                    description={count(hpRows.length, 'event')}
                    compact
                    open
                  >
                    <DataTable
                      columnHelp={{
                        ...raceMetricHelp,
                        Source:
                          'The runner who activated this skill. Self means the selected runner. Select a name to inspect that runner.'
                      }}
                      plain
                      compact
                      caption="HP change details"
                      rows={rows(hpRows)}
                      columns={[
                        { key: 'time', label: 'Time (s)' },
                        { key: 'skillId', label: 'Skill' },
                        { key: 'casterHorseIndex', label: 'Source' },
                        { key: 'before', label: 'HP before → after', numeric: true },
                        { key: 'appliedHpDelta', label: 'HP change', numeric: true }
                      ]}
                      maxHeight={hpRows.length > 8 ? 300 : undefined}
                      onrowclick={seekRow}
                    >
                      {#snippet cell(row, column)}
                        {#if column.key === 'time'}
                          <Button
                            variant="ghost"
                            size="sm"
                            onclick={() => onseek(Number(row.time))}
                          >
                            {Number(row.time).toFixed(3)} s ↗
                          </Button>
                        {:else if column.key === 'skillId'}
                          <RaceSkill
                            id={Number(row.skillId)}
                            name={skillNames.get(Number(row.skillId))}
                          />
                        {:else if column.key === 'casterHorseIndex'}
                          {@render runnerReference(
                            Number(row.casterHorseIndex)
                          )}{#if Number(row.targetHorseIndex) !== index}
                            <span class="muted">
                              → {runnerName(row.targetHorseIndex)}
                            </span>
                          {/if}
                        {:else if column.key === 'before'}
                          <span class="detail-transition">
                            {typeof row.before === 'number' && typeof row.after === 'number'
                              ? `${row.estimated === 'Yes' ? '≈ ' : ''}${number(row.before)} → ${number(row.after)}`
                              : '—'}
                          </span>
                        {:else if column.key === 'appliedHpDelta'}
                          <span
                            class="application-change"
                            class:recovery={Number(row.appliedHpDelta) > 0}
                            class:debuff={Number(row.appliedHpDelta) < 0}
                          >
                            <span>
                              <strong>{signed(Number(row.appliedHpDelta))}</strong>
                              {#if typeof row.percent === 'number'}
                                <span class="change-percent">({signed(row.percent, 1)}%)</span>
                              {/if}
                            </span>
                            {#if signed(Number(row.requestedHpDelta)) !== signed(Number(row.appliedHpDelta))}
                              <small>
                                Requested {signed(Number(row.requestedHpDelta))}
                              </small>
                            {/if}
                          </span>
                        {/if}
                      {/snippet}
                    </DataTable>
                    <p class="detail-footnote">
                      ≈ Estimated HP. Change percentages use maximum HP.
                    </p>
                  </Disclosure>
                </section>
              {/if}
              {#if horse.temptationDecision || horse.temptationSpans?.length}
                <section class="detail-panel rushing-details">
                  <Disclosure
                    id={instanceId + '-rushing'}
                    title="Rushing details"
                    description={count(rushingPeriods.length, 'period')}
                    compact
                    open
                  >
                    {#if rushing}
                      <div class="rushing-summary">
                        <div class="rushing-status">
                          <strong>
                            {rushing.enabled
                              ? 'Rushing enabled'
                              : rushing.preventedByModifier
                                ? 'Prevented by modifier'
                                : 'No rushing'}
                          </strong>
                          <small>
                            {rushing.enabled
                              ? 'Check passed'
                              : rushing.preventedByModifier
                                ? 'Modifier prevented activation'
                                : 'Check failed'}
                          </small>
                        </div>
                        <div class="rushing-roll">
                          <div>
                            <span>
                              Check <strong>
                                {number(rushing.roll, 2)}% {typeof rushing.roll === 'number' &&
                                typeof rushing.threshold === 'number'
                                  ? rushing.roll < rushing.threshold
                                    ? '<'
                                    : '≥'
                                  : ''}
                              </strong>
                            </span>
                            <span>
                              Rushing chance <strong>{number(rushing.threshold, 2)}%</strong>
                            </span>
                          </div>
                          <span
                            class="roll-meter"
                            aria-hidden="true"
                          >
                            <span style:width={percentPosition(rushing.threshold) + '%'}></span>
                            <i style:left={percentPosition(rushing.roll) + '%'}></i>
                          </span>
                          <small>The check must be below the rushing chance to pass.</small>
                        </div>
                        <dl class="rushing-facts">
                          <div>
                            <dt>Start section</dt>
                            <dd>
                              {typeof rushing.startSection === 'number' && rushing.startSection > 0
                                ? 'Section ' + rushing.startSection
                                : 'Not scheduled'}
                            </dd>
                          </div>
                          <div>
                            <dt>Prevented by modifier</dt>
                            <dd>{display(rushing.preventedByModifier)}</dd>
                          </div>
                        </dl>
                      </div>
                    {/if}
                    {#if rushingPeriods.length}
                      <div class="detail-table">
                        {@render eventTable(rushingPeriods, 'Rushing periods', [
                          { key: 'startTime', label: 'Start (s)' },
                          { key: 'endTime', label: 'End (s)' },
                          { key: 'duration', label: 'Active (s)', numeric: true },
                          { key: 'mode', label: 'Mode' }
                        ])}
                      </div>
                    {/if}
                  </Disclosure>
                </section>
              {/if}
            </div>
            <footer class="simulation-meta">
              <span>
                Engine <strong>{capture.detailed?.engineBuild}</strong>
              </span>
              <span>
                Seed <strong>{capture.detailed?.seed}</strong>
              </span>
              <span>
                Schema <strong>{capture.detailed?.annotations.schemaVersion}</strong>
              </span>
              {#if typeof horse.popularity === 'number'}
                <span>
                  Popularity <strong>{horse.popularity}</strong>
                </span>
              {/if}
            </footer>
            <Disclosure
              id={instanceId + '-source'}
              title="Raw simulator response"
              compact
              bind:open={sourceOpen}
            >
              {#if sourceOpen}
                <pre>{JSON.stringify(capture.detailed, null, 2)}</pre>
              {/if}
            </Disclosure>
          </div>
        {/if}
      </Disclosure>
    </div>
  {/if}
</section>

<style>
  @import './replay-diagnostics.css';
</style>
