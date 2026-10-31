<script lang="ts">
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import SessionKpis from '../SessionKpis.svelte';
  import SessionUmaRecords from './SessionUmaRecords.svelte';
  import SessionDiagnostics from './SessionDiagnostics.svelte';
  import type { KpiTone, SessionKpi } from '../session-kpis';
  import { formatRate, SMALL_SAMPLE } from '../session-insights';
  import { percent, rate } from '../../analysis-view';
  import { largestSwing, playerUmaRecords, RUN_CONDITIONS, shareOf } from './session-uma-records';

  /** The Runners view: how your own Umas raced, then every entry's measured race. */
  let {
    captures,
    skillNames,
    pending,
    onuma,
    onreplay,
    onbuild
  }: {
    captures: ParsedRaceCapture[];
    skillNames: Map<number, string>;
    pending: boolean;
    onuma: (key: string) => void;
    onreplay?: (race: number, runner?: number, time?: number) => void;
    onbuild: (runner: RaceRunner, race: number) => void;
  } = $props();

  /** Top three of a field, the place every runner would share at even strength. */
  const PODIUM = 3;

  const records = $derived(playerUmaRecords(captures));
  const fieldEntries = $derived(
    captures.reduce((total, capture) => total + capture.runners.length, 0)
  );
  const neutral = $derived({
    win: rate(captures.length, fieldEntries),
    top3: Math.min(100, rate(captures.length * PODIUM, fieldEntries))
  });
  const runs = $derived(records.flatMap((record) => record.runs));

  const kpis = $derived.by(() => {
    if (runs.length === 0) return [];

    const list = [
      conditionKpi('spurt', 'Full last spurts'),
      conditionKpi('survived', 'Finished with HP'),
      conditionKpi('rushed', 'Rushed')
    ];

    const swing = largestSwing(runs, SMALL_SAMPLE);
    if (swing) {
      const { split, gap, condition } = swing;
      const tone: KpiTone = gap > 0 ? 'over' : 'under';

      list.push({
        id: 'swing',
        label: 'Moved your wins most',
        value: (gap > 0 ? '+' : '') + gap.toFixed(1) + ' pts',
        subjects: [{ text: condition.label }],
        tone,
        comparison: {
          tone,
          text:
            'won ' +
            percent(split.with.wins, split.with.runs) +
            ' with, ' +
            percent(split.without.wins, split.without.runs) +
            ' without'
        }
      });
    }

    return list;
  });

  function conditionKpi(id: string, label: string): SessionKpi {
    const condition = RUN_CONDITIONS.find((item) => item.id === id);
    const share = condition ? shareOf(runs, condition) : undefined;

    if (!share)
      return {
        id,
        label,
        value: pending ? '…' : '—',
        detail: pending ? 'resimulating the races' : 'appears once the races are resimulated'
      };

    return {
      id,
      label,
      value: formatRate(share.rate),
      detail: share.held + ' of ' + share.measured + ' measured runs'
    };
  }
</script>

<div class="runners">
  <SessionKpis
    label="Your runners at a glance"
    {kpis}
  />
  <SessionUmaRecords
    {records}
    {neutral}
    {pending}
    {onuma}
  />
  <SessionDiagnostics
    {captures}
    {skillNames}
    {onreplay}
    {pending}
    {onbuild}
  />
</div>

<style>
  .runners {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
  }
</style>
