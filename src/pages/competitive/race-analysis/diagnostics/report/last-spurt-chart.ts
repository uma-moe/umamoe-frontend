import type { EChartsCoreOption } from 'echarts/core';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { number } from '../diagnostics-format';

export interface HpPoint {
  distance: number;
  hp: number;
  time: number;
}

export interface LastSpurtMarks {
  checkDistance?: number;
  checkHp?: number;
  needHp?: number;
  /** Where the selected spurt began, when it began later than the check. */
  delayedStart?: number;
}

export const hpColor = '#7cc6a0';
export const needColor = '#e3b35f';

/** The runner's HP by distance from the replay frames, ending at the finish line. */
export function hpByDistance(
  capture: ParsedRaceCapture,
  index: number,
  raceDistance: number
): HpPoint[] {
  const points: HpPoint[] = [];

  for (const frame of capture.frames) {
    const horse = frame.horses[index];
    if (!horse) continue;

    points.push({
      distance: Math.min(horse.distance, raceDistance),
      hp: horse.hp,
      time: frame.time
    });
    if (horse.distance >= raceDistance) break;
  }

  return points;
}

/** The replay time at which the runner first reached a distance. */
export function timeAtDistance(points: HpPoint[], distance: number): number | undefined {
  return (points.find((point) => point.distance >= distance) ?? points.at(-1))?.time;
}

/**
 * What a full spurt still needs at a distance past the check. The simulator only reports the need at
 * the check, so it is spread evenly over the distance left; a spurt at constant speed uses HP at a
 * roughly constant rate per metre.
 */
export function fullSpurtNeedAt(
  distance: number,
  marks: LastSpurtMarks,
  raceDistance: number
): number | undefined {
  const { checkDistance, needHp } = marks;
  if (checkDistance === undefined || needHp === undefined) return undefined;
  if (distance < checkDistance || raceDistance <= checkDistance) return undefined;

  return (needHp * (raceDistance - distance)) / (raceDistance - checkDistance);
}

/**
 * HP over the race beside what a full spurt needed from the check on. HP that stays above the need
 * line had enough for a full spurt.
 */
export function lastSpurtChartOption({
  points,
  marks,
  raceDistance,
  dark
}: {
  points: HpPoint[];
  marks: LastSpurtMarks;
  raceDistance: number;
  dark: boolean;
}): EChartsCoreOption {
  const text = dark ? '#a6afbd' : '#596477';
  const grid = dark ? '#ffffff12' : '#00000012';
  const { checkDistance, checkHp, needHp, delayedStart } = marks;
  const hasCheck = checkDistance !== undefined;

  // A delayed spurt shades the distance between the check and the selected start.
  const spurtDelay =
    hasCheck && delayedStart !== undefined && delayedStart > checkDistance
      ? [[{ xAxis: checkDistance }, { xAxis: delayedStart }]]
      : [];

  return {
    animation: false,
    aria: { enabled: true },
    grid: { left: 40, right: 10, top: 16, bottom: 22 },
    // Ctrl or ⌘ with the wheel zooms like the other report charts; a drag pans and two fingers pinch.
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseMove: true,
        moveOnMouseWheel: false
      }
    ],
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 11 },
      formatter: (params: unknown) => {
        const series = (Array.isArray(params) ? params : [params]) as {
          seriesName: string;
          value: [number, number];
        }[];
        const hp = series.find((entry) => entry.seriesName === 'HP')?.value;
        if (!hp) return '';

        const [distance, remaining] = hp;
        const need = fullSpurtNeedAt(distance, marks, raceDistance);
        return [
          `<strong>${number(distance)} m</strong>`,
          `HP: ${number(remaining)}`,
          ...(need === undefined ? [] : [`Full-spurt need: ${number(need)}`])
        ].join('<br>');
      }
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: raceDistance,
      // The finish is rarely a round distance; its label would crowd the last round one.
      axisLabel: {
        color: text,
        fontSize: 10,
        showMaxLabel: false,
        hideOverlap: true,
        formatter: (value: number) => number(value) + ' m'
      },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      splitNumber: 3,
      axisLabel: { color: text, fontSize: 10, formatter: (value: number) => number(value) },
      splitLine: { lineStyle: { color: grid } }
    },
    series: [
      {
        name: 'HP',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: hpColor },
        itemStyle: { color: hpColor },
        areaStyle: { color: hpColor, opacity: 0.1 },
        data: points.map((point) => [point.distance, point.hp]),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: text, type: 'dashed', width: 1 },
          label: { color: text, fontSize: 10, position: 'end', formatter: 'Check' },
          data: hasCheck ? [{ xAxis: checkDistance }] : []
        },
        markArea: {
          silent: true,
          itemStyle: { color: needColor, opacity: 0.16 },
          data: spurtDelay
        },
        markPoint:
          hasCheck && checkHp !== undefined
            ? {
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { color: hpColor },
                label: { show: false },
                data: [{ coord: [checkDistance, checkHp] }]
              }
            : undefined
      },
      ...(hasCheck && needHp !== undefined
        ? [
            {
              name: 'Full-spurt need',
              type: 'line',
              symbol: 'none',
              lineStyle: { width: 1.5, color: needColor, type: 'dashed' },
              itemStyle: { color: needColor },
              data: [
                [checkDistance, needHp],
                [raceDistance, 0]
              ]
            }
          ]
        : [])
    ]
  };
}
