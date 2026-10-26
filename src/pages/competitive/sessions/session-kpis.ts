import type { MultiRaceCharacterStats } from '@/lib/race/multi-race-analysis';
import { runningStyleName } from '@/lib/race/replay/race-display';
import { rate } from '../analysis-view';
import {
  formatRate,
  isSmallSample,
  timesNeutral,
  type PlayerRecord,
  type ScoreAverages,
  type SessionBaseline,
  type StyleShare
} from './session-insights';
import type { SessionComposition, SessionTeam } from './session-statistics';

export type KpiTone = 'over' | 'under' | 'even';

/** What a tile's value belongs to: a running style, an Uma, or each style of a lineup. */
export interface KpiSubject {
  text: string;
  style?: number;
  cardId?: number;
}

/** One glanceable answer: a value, what it belongs to, and the baseline it beats or misses. */
export interface SessionKpi {
  id: string;
  label: string;
  value: string;
  subjects?: KpiSubject[];
  comparison?: { tone: KpiTone; text: string };
  /** Colours the value itself, when the value is the thing that beats or misses the baseline. */
  tone?: KpiTone;
  /** The count behind the value. */
  detail?: string;
  /** The value comes from a small sample, so it is shown muted. */
  few?: boolean;
  /** Opens the view or list that explains the value. */
  action?: { label: string; onselect: () => void };
}

type KpiAction = SessionKpi['action'];

/** Differences under this many points read as "about even" rather than above or below. */
const EVEN_MARGIN = 2;

/** A ratio this close to 1× reads as even. */
const EVEN_RATIO = 0.1;

/** How a rate compares with its baseline, as the tone its text is coloured in. */
export function toneAgainst(value: number, neutral: number): KpiTone {
  if (Math.abs(value - neutral) < EVEN_MARGIN) return 'even';
  return value > neutral ? 'over' : 'under';
}

/**
 * The class a listed rate takes: muted for a small sample, otherwise green above its baseline and
 * stepped back below it. Rates without a baseline are only muted.
 */
export function rateClass(value: number, sample: number, neutral?: number) {
  if (isSmallSample(sample)) return 'few';
  if (neutral === undefined) return undefined;

  const tone = toneAgainst(value, neutral);
  return tone === 'even' ? undefined : 'tone-' + tone;
}

function ratioTone(times: number): KpiTone {
  if (times >= 1 + EVEN_RATIO) return 'over';
  if (times <= 1 - EVEN_RATIO) return 'under';
  return 'even';
}

function againstEven(value: number, neutral: number) {
  const tone = toneAgainst(value, neutral);
  const direction = tone === 'even' ? 'about' : tone === 'over' ? 'above' : 'below';

  return { tone, text: direction + ' the even ' + formatRate(neutral) };
}

export function playerKpi(
  player: PlayerRecord,
  baseline: SessionBaseline,
  action?: KpiAction
): SessionKpi {
  const winRate = rate(player.wins, player.races);
  const comparison = baseline.team === undefined ? undefined : againstEven(winRate, baseline.team);

  return {
    id: 'player',
    label: baseline.team === undefined ? 'Your runners won' : 'Your team won',
    value: formatRate(winRate),
    comparison,
    tone: comparison?.tone,
    detail: player.wins + ' of ' + player.races + ' races',
    few: isSmallSample(player.races),
    action
  };
}

export function styleKpi(row: StyleShare, label: string, action?: KpiAction): SessionKpi {
  const times = timesNeutral(row.winShare, row.fieldShare);
  const comparison =
    times === undefined
      ? undefined
      : {
          tone: ratioTone(times),
          text: times.toFixed(1) + '× its ' + formatRate(row.fieldShare) + ' field share'
        };

  return {
    id: 'style-' + row.style,
    label,
    value: formatRate(row.winShare),
    subjects: [{ text: runningStyleName(row.style), style: row.style }],
    comparison,
    tone: comparison?.tone,
    detail: row.wins + ' wins',
    action
  };
}

export function umaKpi(
  uma: MultiRaceCharacterStats,
  baseline: SessionBaseline,
  label: string,
  action?: KpiAction
): SessionKpi {
  const winRate = rate(uma.wins, uma.races);
  const times = timesNeutral(winRate, baseline.uma);
  const comparison =
    times === undefined
      ? undefined
      : {
          tone: ratioTone(times),
          text: times.toFixed(1) + '× the neutral ' + formatRate(baseline.uma)
        };

  return {
    id: 'uma-' + uma.key,
    label,
    value: formatRate(winRate),
    subjects: [{ text: uma.name, cardId: uma.cardId }],
    comparison,
    tone: comparison?.tone,
    detail: uma.wins + ' of ' + uma.races + ' races',
    few: isSmallSample(uma.races),
    action
  };
}

export function compositionKpi(
  composition: SessionComposition,
  baseline: SessionBaseline,
  action?: KpiAction
): SessionKpi {
  const winRate = rate(composition.wins, composition.appearances);
  const comparison = baseline.team === undefined ? undefined : againstEven(winRate, baseline.team);

  return {
    id: 'composition',
    label: 'Best team styles',
    value: formatRate(winRate),
    subjects: composition.styles.map((style) => ({
      text: runningStyleName(style, true),
      style
    })),
    comparison,
    tone: comparison?.tone,
    detail: composition.wins + ' of ' + composition.appearances + ' team races',
    few: isSmallSample(composition.appearances),
    action
  };
}

export function teamKpi(
  team: SessionTeam,
  baseline: SessionBaseline,
  action?: KpiAction
): SessionKpi {
  const winRate = rate(team.wins, team.appearances);
  const comparison = baseline.team === undefined ? undefined : againstEven(winRate, baseline.team);

  return {
    id: 'team-' + team.key,
    label: 'Best team build',
    value: formatRate(winRate),
    subjects: [{ text: team.trainer }],
    comparison,
    tone: comparison?.tone,
    detail: team.wins + ' of ' + team.appearances + ' races',
    few: isSmallSample(team.appearances),
    action
  };
}

/** Score gaps within this share of the opponents' average read as an even match. */
const EVEN_SCORE_SHARE = 0.01;

export function opponentScoreKpi(scores: ScoreAverages): SessionKpi | undefined {
  const { player, opponents, bestOpponents } = scores;
  if (opponents === undefined) return undefined;

  let comparison: SessionKpi['comparison'];
  if (player !== undefined) {
    const gap = player - opponents;
    const tone: KpiTone =
      Math.abs(gap) < opponents * EVEN_SCORE_SHARE ? 'even' : gap > 0 ? 'over' : 'under';

    comparison = { tone, text: 'yours ' + Math.round(player).toLocaleString() };
  }

  return {
    id: 'opponent-score',
    label: 'Average opponent score',
    value: Math.round(opponents).toLocaleString(),
    comparison,
    detail:
      bestOpponents === undefined
        ? undefined
        : 'best-placed opponent ' + Math.round(bestOpponents).toLocaleString()
  };
}

/** Plain text for a tile, as a screen reader or a test reads it. */
export function kpiText(kpi: SessionKpi) {
  return [
    kpi.label,
    ...(kpi.subjects ?? []).map((subject) => subject.text),
    kpi.value,
    kpi.comparison?.text,
    kpi.detail
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}
