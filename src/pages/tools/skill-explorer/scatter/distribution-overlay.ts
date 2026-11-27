import { SECTIONS } from '../skill-explorer-data';

/** Standard normal z-scores for the 95% extremes and the central 50% (Q1–Q3) interquartile box. */
export const CI95_Z = 1.96;
export const IQR_Z = 0.6745;

export interface ProcQuantiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface ViolinGeometry {
  /** Closed SVG path for the full ±1.96σ Gaussian violin silhouette. */
  fullPath: string;
  /** Closed SVG path for the central ±0.6745σ (50% IQR) shaded core inside the violin. */
  iqrPath: string;
  topY: number;
  bottomY: number;
  q3Y: number;
  q1Y: number;
  q3HalfWidth: number;
  q1HalfWidth: number;
}

/**
 * Continuous activation-position quantiles (`0..1` race share) from a 24-section activation histogram, interpolating
 * linearly inside the section where cumulative activation share crosses each quantile. Returns `undefined` for empty
 * histograms or start-gate passives that only fire in section 0.
 */
export function procQuantiles(sections: readonly number[] | undefined): ProcQuantiles | undefined {
  if (!sections || sections.length !== SECTIONS) return undefined;

  let total = 0;
  let activeOutsideStart = 0;
  for (let i = 0; i < SECTIONS; i += 1) {
    const share = Math.max(0, sections[i]!);
    total += share;
    if (i > 0) activeOutsideStart += share;
  }

  if (total <= 0 || activeOutsideStart <= total * 0.02) return undefined;

  const at = (quantile: number): number => {
    const target = quantile * total;
    let cumulative = 0;
    for (let i = 0; i < SECTIONS; i += 1) {
      const share = Math.max(0, sections[i]!);
      if (cumulative + share >= target && share > 0) {
        const within = (target - cumulative) / share;
        return (i + Math.min(Math.max(within, 0), 1)) / SECTIONS;
      }

      cumulative += share;
    }

    return 1;
  };

  return {
    p5: at(0.05),
    p25: at(0.25),
    p50: at(0.5),
    p75: at(0.75),
    p95: at(0.95)
  };
}

/**
 * Builds a vertical Gaussian density violin spanning `z ∈ [-1.96, +1.96]` around `(cx, cy)` using `yAtZ` to respect
 * the chart's nonlinear square-root Y axis. `maxHalfWidth` is the waist half-width at `z = 0` (chosen wider than half
 * the icon size so the dense 50% core reads unmistakably around the icon while the outer 95% tails taper to hairline tips).
 */
export function buildGaussianViolin(
  cx: number,
  yAtZ: (z: number) => number,
  maxHalfWidth: number,
  minY: number,
  maxY: number
): ViolinGeometry {
  const clampY = (y: number) => Math.min(Math.max(y, minY), maxY);
  const halfAt = (z: number) => 1.2 + (maxHalfWidth - 1.2) * Math.exp(-0.5 * z * z);

  const sampleBand = (fromZ: number, toZ: number, steps: number): string => {
    const right: string[] = [];
    const left: string[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const z = fromZ + ((toZ - fromZ) * i) / steps;
      const y = clampY(yAtZ(z));
      const w = halfAt(z);
      right.push(`${(cx + w).toFixed(1)},${y.toFixed(1)}`);
      left.push(`${(cx - w).toFixed(1)},${y.toFixed(1)}`);
    }

    left.reverse();
    return `M ${right[0]} L ${right.slice(1).join(' L ')} L ${left.join(' L ')} Z`;
  };

  const topY = clampY(yAtZ(CI95_Z));
  const bottomY = clampY(yAtZ(-CI95_Z));
  const q3Y = clampY(yAtZ(IQR_Z));
  const q1Y = clampY(yAtZ(-IQR_Z));

  return {
    fullPath: sampleBand(-CI95_Z, CI95_Z, 24),
    iqrPath: sampleBand(-IQR_Z, IQR_Z, 12),
    topY: Math.min(topY, bottomY),
    bottomY: Math.max(topY, bottomY),
    q3Y: Math.min(q3Y, q1Y),
    q1Y: Math.max(q3Y, q1Y),
    q3HalfWidth: halfAt(IQR_Z),
    q1HalfWidth: halfAt(-IQR_Z)
  };
}
