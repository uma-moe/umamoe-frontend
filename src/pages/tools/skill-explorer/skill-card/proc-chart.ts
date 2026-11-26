import { SECTIONS, wrWeightedMean } from '../skill-explorer-data';
import { procQuantiles } from '../scatter/distribution-overlay';

/** Minimum share of races a bucket needs before its per-bucket WR is trusted over single-race noise. */
export const MIN_RELIABLE_BUCKET_SHARE = 0.015;
/** Also require a bucket to hold at least this share of the skill's busiest bucket to avoid 1-race slivers. */
export const MIN_RELATIVE_BUCKET_SHARE = 0.05;

export interface ProcBucket {
  section: number;
  startShare: number;
  endShare: number;
  share: number;
  win?: number;
  reliableWin: boolean;
  centerX: number;
  winY?: number;
}

export interface ProcIqrBand {
  x: number;
  width: number;
  p25: number;
  p75: number;
}

export interface ProcChartGeometry {
  width: number;
  height: number;
  top: number;
  sectionWidth: number;
  hasSectionWins: boolean;
  buckets: ProcBucket[];
  /** Central 50% (Q1–Q3) activation window across the course, shown in the readout when firing past the start gate. */
  iqrBand?: ProcIqrBand;
  /** Connected polyline point strings across contiguous reliable buckets (1-bucket runs span that bucket). */
  wrSegments: string[];
  /** Translucent 95% confidence ribbons around each contiguous WR segment when per-proc `wrCi95` is provided. */
  wrBandPaths: string[];
  zeroY?: number;
  minWin?: number;
  maxWin?: number;
  wrMean?: number;
  peakShare: number;
}

export function buildProcChart(
  sections: readonly number[],
  sectionWins: readonly number[] | undefined,
  width: number,
  wrCi95?: number
): ProcChartGeometry {
  const hasWins = sectionWins !== undefined && sectionWins.length === SECTIONS;
  const top = 13;
  const height = hasWins ? 64 : 52;
  const sectionWidth = width / SECTIONS;
  const peakShare = Math.max(0.05, ...sections);
  const totalShare = sections.reduce((sum, share) => sum + share, 0);
  // Keep 1.5% absolute cutoff for high-proc skills, but scale down proportionally for low-proc skills so valid
  // multi-bucket curves (e.g. 2–5% total proc rate) still render instead of hiding every bucket.
  const minAbsolute = Math.min(MIN_RELIABLE_BUCKET_SHARE, Math.max(0.001, totalShare * 0.15));
  const shareCutoff = Math.max(minAbsolute, peakShare * MIN_RELATIVE_BUCKET_SHARE);
  const quantiles = procQuantiles(sections);
  const iqrBand: ProcIqrBand | undefined = quantiles
    ? {
        x: quantiles.p25 * width,
        width: Math.max(3, (quantiles.p75 - quantiles.p25) * width),
        p25: quantiles.p25,
        p75: quantiles.p75
      }
    : undefined;

  if (!hasWins) {
    const buckets: ProcBucket[] = sections.map((share, section) => ({
      section,
      startShare: section / SECTIONS,
      endShare: (section + 1) / SECTIONS,
      share,
      reliableWin: false,
      centerX: (section + 0.5) * sectionWidth
    }));
    return {
      width,
      height,
      top,
      sectionWidth,
      hasSectionWins: false,
      buckets,
      iqrBand,
      wrSegments: [],
      wrBandPaths: [],
      peakShare
    };
  }

  // Fit the WR line across reliable buckets only so 1-race noise slivers never create fake peaks or zig-zags.
  const reliableWins: number[] = [];
  for (let i = 0; i < SECTIONS; i += 1) {
    const share = sections[i]!;
    const win = sectionWins[i]!;
    if (share >= shareCutoff && Number.isFinite(win)) {
      reliableWins.push(win);
    }
  }

  const bandBase = wrCi95 !== undefined && Number.isFinite(wrCi95) && wrCi95 > 0 ? wrCi95 : 0;
  const minRaw = reliableWins.length > 0 ? Math.min(0, ...reliableWins) : 0;
  const maxRaw = reliableWins.length > 0 ? Math.max(0, ...reliableWins) : 1;
  const padWin =
    bandBase > 0 ? Math.min(bandBase * 0.65, Math.max(0.3, (maxRaw - minRaw) * 0.25)) : 0;
  const axisMin = minRaw - (minRaw < 0 ? padWin : 0);
  const axisMax = maxRaw + padWin;
  const span = Math.max(axisMax - axisMin, 0.5);
  const padTop = top + 5;
  const padBottom = height - 4;
  const plotHeight = padBottom - padTop;
  const clampY = (y: number) => Math.min(Math.max(y, padTop), padBottom);
  const yOf = (win: number) => clampY(padTop + ((axisMax - win) / span) * plotHeight);
  const zeroY = yOf(0);

  const buckets: ProcBucket[] = sections.map((share, section) => {
    const win = sectionWins[section]!;
    const reliableWin = share >= shareCutoff && Number.isFinite(win);
    return {
      section,
      startShare: section / SECTIONS,
      endShare: (section + 1) / SECTIONS,
      share,
      win,
      reliableWin,
      centerX: (section + 0.5) * sectionWidth,
      winY: reliableWin ? yOf(win) : undefined
    };
  });

  const bucketHalfCi = (share: number): number => {
    if (bandBase <= 0 || share <= 0) return 0;
    const rel = Math.sqrt(peakShare / share);
    return bandBase * Math.min(1.5, Math.max(0.65, 0.65 * rel));
  };

  const wrSegments: string[] = [];
  const wrBandPaths: string[] = [];
  let run: ProcBucket[] = [];
  const flushRun = () => {
    if (run.length >= 2) {
      wrSegments.push(run.map((b) => `${b.centerX.toFixed(1)},${b.winY!.toFixed(1)}`).join(' '));
      if (bandBase > 0) {
        const upper = run.map((b) => {
          const half = bucketHalfCi(b.share);
          return `${b.centerX.toFixed(1)},${yOf(b.win! + half).toFixed(1)}`;
        });
        const lower = [...run].reverse().map((b) => {
          const half = bucketHalfCi(b.share);
          return `${b.centerX.toFixed(1)},${yOf(b.win! - half).toFixed(1)}`;
        });
        wrBandPaths.push(`M ${upper[0]} L ${upper.slice(1).join(' L ')} L ${lower.join(' L ')} Z`);
      }
    } else if (run.length === 1) {
      const only = run[0]!;
      const left = only.section * sectionWidth + 1.5;
      const right = (only.section + 1) * sectionWidth - 1.5;
      const y = only.winY!.toFixed(1);
      wrSegments.push(`${left.toFixed(1)},${y} ${right.toFixed(1)},${y}`);
      if (bandBase > 0) {
        const half = bucketHalfCi(only.share);
        const hi = yOf(only.win! + half).toFixed(1);
        const lo = yOf(only.win! - half).toFixed(1);
        wrBandPaths.push(
          `M ${left.toFixed(1)},${hi} L ${right.toFixed(1)},${hi} L ${right.toFixed(1)},${lo} L ${left.toFixed(1)},${lo} Z`
        );
      }
    }

    run = [];
  };

  for (const bucket of buckets) {
    if (bucket.reliableWin && bucket.winY !== undefined) {
      run.push(bucket);
      continue;
    }

    flushRun();
  }

  flushRun();

  return {
    width,
    height,
    top,
    sectionWidth,
    hasSectionWins: true,
    buckets,
    iqrBand,
    wrSegments,
    wrBandPaths,
    zeroY,
    minWin: reliableWins.length > 0 ? Math.min(...reliableWins) : undefined,
    maxWin: reliableWins.length > 0 ? Math.max(...reliableWins) : undefined,
    wrMean: wrWeightedMean(sections, sectionWins),
    peakShare
  };
}
