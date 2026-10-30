<script lang="ts">
  import { formatRaceTime, hpRemainingColor } from '@/lib/race/replay/race-display';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import DataTable from '@/components/data/DataTable.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import RunnerReference from '../../runners/RunnerReference.svelte';
  import { percent, rate } from '../../analysis-view';
  import { formatRate, isSmallSample } from '../session-insights';
  import { rateClass } from '../session-kpis';
  import { average, RUN_CONDITIONS, shareOf, splitBy, type UmaRecord } from './session-uma-records';
  import { theme } from '@/stores/theme';

  /** Hakuraku's personal Uma analysis: each of your Umas in one row, what decided its runs on expand. */
  /** How a rate column is coloured: against a neutral rate, on the HP scale, as a cost, or not at all. */
  type RateColour =
    { kind: 'baseline'; neutral: number } | { kind: 'hp' } | { kind: 'cost' } | { kind: 'plain' };

  let {
    records,
    neutral,
    pending,
    onuma
  }: {
    records: UmaRecord[];
    /** The win and top-three rates every runner would share if all were equally strong. */
    neutral: { win: number; top3: number };
    pending: boolean;
    onuma: (key: string) => void;
  } = $props();

  const conditionHelp = {
    'Full spurt':
      'Runs whose last spurt started within 3 m of the first check at full target speed, among runs with a spurt measurement.',
    Survived: 'Runs that reached the line with HP left, among runs with an HP measurement.',
    Rushed: 'Runs where the runner became rushed (kakari) at least once.',
    Dueled: 'Runs with a duel on the final straight.',
    'Spot struggle': 'Runs with a spot struggle for the lead early in the race.',
    'Avg. time': 'Average finish time; the best time is in the tooltip.'
  };

  let expanded = $state<string>();

  /** The columns that hold a rate of the Uma's runs, and how each is coloured. */
  const rateColours = $derived<Record<string, RateColour>>({
    winrate: { kind: 'baseline', neutral: neutral.win },
    top3: { kind: 'baseline', neutral: neutral.top3 },
    spurt: { kind: 'hp' },
    survived: { kind: 'hp' },
    rushed: { kind: 'cost' },
    dueled: { kind: 'plain' },
    spot: { kind: 'plain' }
  });

  const rows = $derived(
    records.map((record) => {
      const wins = record.runs.filter((run) => run.finishOrder === 1).length;
      const top3 = record.runs.filter((run) => run.finishOrder <= 3).length;
      const times = record.runs.flatMap((run) =>
        run.finishTime === undefined ? [] : [run.finishTime]
      );

      const conditionRates = Object.fromEntries(
        RUN_CONDITIONS.map((condition) => [
          condition.id,
          shareOf(record.runs, condition)?.rate ?? '—'
        ])
      );

      return {
        id: record.key,
        name: record.name,
        cardId: record.cardId ?? '—',
        runs: record.runs.length,
        winrate: rate(wins, record.runs.length),
        top3: rate(top3, record.runs.length),
        score: record.score ?? '—',
        ...conditionRates,
        time: average(times) ?? '—',
        best: times.length ? Math.min(...times) : '—'
      };
    })
  );

  function toggle(key: string) {
    expanded = expanded === key ? undefined : key;
  }

  function finishCounts(record: UmaRecord) {
    const field = Math.max(...record.runs.map((run) => run.finishOrder));
    const counts = Array<number>(Math.max(field, 1)).fill(0);
    for (const run of record.runs)
      counts[run.finishOrder - 1] = (counts[run.finishOrder - 1] ?? 0) + 1;

    return counts;
  }
</script>

{#snippet rateCell(value: string | number, runs: number, colour: RateColour)}
  {#if typeof value !== 'number'}
    <span
      class="unmeasured"
      title={pending ? 'Resimulating the races' : 'Not measured in these captures'}
    >
      {pending ? '…' : '—'}
    </span>
  {:else if isSmallSample(runs)}
    <span class="few">{formatRate(value)}</span>
  {:else if colour.kind === 'baseline'}
    <span class={rateClass(value, runs, colour.neutral)}>{formatRate(value)}</span>
  {:else if colour.kind === 'hp'}
    <span style:color={hpRemainingColor(value, $theme === 'dark')}>{formatRate(value)}</span>
  {:else if colour.kind === 'cost'}
    <span class:tone-cost={value > 0}>{formatRate(value)}</span>
  {:else}
    {formatRate(value)}
  {/if}
{/snippet}

{#snippet detail(record: UmaRecord)}
  {@const counts = finishCounts(record)}
  {@const most = Math.max(1, ...counts)}
  {@const finishHp = average(record.runs.map((run) => run.finishHp))}
  {@const finishPercent = average(record.runs.map((run) => run.finishHpPercent))}
  {@const delay = average(record.runs.map((run) => run.spurtDelay))}
  <div class="uma-detail">
    <section aria-label={record.name + ' finishing places'}>
      <h4>Finishes</h4>
      <ol class="places">
        {#each counts as count, place (place)}
          <li title={count + ' × ' + (place + 1) + '.'}>
            <span
              class="bar"
              class:win={place === 0}
              style:height={(count / most) * 100 + '%'}
            ></span>
            <small>{place + 1}</small>
          </li>
        {/each}
      </ol>
    </section>
    <section aria-label={record.name + ' win rate by condition'}>
      <h4>Win rate by what happened in the run</h4>
      <table class="splits">
        <thead>
          <tr>
            <td></td>
            <th scope="col">When it did</th>
            <th scope="col">When it did not</th>
          </tr>
        </thead>
        <tbody>
          {#each RUN_CONDITIONS as condition (condition.id)}
            {@const split = splitBy(record.runs, condition)}
            {#if split.with.runs + split.without.runs > 0}
              <tr>
                <th scope="row">{condition.label}</th>
                <td>
                  <span
                    class={rateClass(
                      rate(split.with.wins, split.with.runs),
                      split.with.runs,
                      neutral.win
                    )}
                  >
                    {split.with.runs ? percent(split.with.wins, split.with.runs) : '—'}
                  </span>
                  <small>{split.with.wins}/{split.with.runs}</small>
                </td>
                <td>
                  <span
                    class={rateClass(
                      rate(split.without.wins, split.without.runs),
                      split.without.runs,
                      neutral.win
                    )}
                  >
                    {split.without.runs ? percent(split.without.wins, split.without.runs) : '—'}
                  </span>
                  <small>{split.without.wins}/{split.without.runs}</small>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </section>
    <section aria-label={record.name + ' averages'}>
      <dl>
        <div>
          <dt>Avg. finish HP</dt>
          <dd style:color={hpRemainingColor(finishPercent, $theme === 'dark')}>
            {finishHp === undefined ? '—' : Math.round(finishHp).toLocaleString()}
            {#if finishPercent !== undefined}
              <small>{finishPercent.toFixed(1)}%</small>
            {/if}
          </dd>
        </div>
        <div>
          <dt>Avg. spurt delay</dt>
          <dd>{delay === undefined ? '—' : delay.toFixed(1) + ' m'}</dd>
        </div>
      </dl>
      <Button
        size="sm"
        variant="secondary"
        icon="community"
        onclick={() => onuma(record.key)}
      >
        Compare in Umas
      </Button>
    </section>
  </div>
{/snippet}

<ChartFrame
  plain
  surface
  compact
  id="session-hp"
  title="Your Umas"
>
  <DataTable
    plain
    compact
    caption="Your Umas"
    columnHelp={conditionHelp}
    maxHeight={460}
    emptyMessage="No player runners were identified in these captures."
    {rows}
    rowKey="id"
    expandedRow={expanded}
    columns={[
      { key: 'name', label: 'Your Uma' },
      { key: 'runs', label: 'Runs', numeric: true },
      { key: 'winrate', label: 'Win rate', numeric: true },
      { key: 'top3', label: 'Top 3', numeric: true },
      { key: 'score', label: 'Score', numeric: true },
      { key: 'spurt', label: 'Full spurt', numeric: true },
      { key: 'survived', label: 'Survived', numeric: true },
      { key: 'rushed', label: 'Rushed', numeric: true },
      { key: 'dueled', label: 'Dueled', numeric: true },
      { key: 'spot', label: 'Spot struggle', numeric: true },
      { key: 'time', label: 'Avg. time', numeric: true }
    ]}
  >
    {#snippet cell(row, column)}
      {@const colour = rateColours[column.key]}
      {#if column.key === 'name'}
        <button
          class="uma-toggle"
          aria-expanded={expanded === row.id}
          aria-label={(expanded === row.id ? 'Hide ' : 'Show ') + row.name + ' details'}
          onclick={() => toggle(String(row.id))}
        >
          <span
            class="chevron"
            class:open={expanded === row.id}
          >
            <Icon
              name="chevron"
              size={12}
            />
          </span>
          <RunnerReference
            name={String(row.name)}
            cardId={typeof row.cardId === 'number' ? row.cardId : undefined}
            compact
          />
        </button>
      {:else if colour}
        {@render rateCell(row[column.key] ?? '—', Number(row.runs), colour)}
      {:else if column.key === 'score'}
        {typeof row.score === 'number' ? row.score.toLocaleString() : '—'}
      {:else if column.key === 'time'}
        <span title={typeof row.best === 'number' ? 'Best ' + formatRaceTime(row.best) : undefined}>
          {typeof row.time === 'number' ? formatRaceTime(row.time) : '—'}
        </span>
      {:else}
        {row[column.key]}
      {/if}
    {/snippet}
    {#snippet rowDetail(row)}
      {@const record = records.find((item) => item.key === row.id)}
      {#if record}
        {@render detail(record)}
      {/if}
    {/snippet}
  </DataTable>
</ChartFrame>

<style>
  @import './session-uma-records.css';
</style>
