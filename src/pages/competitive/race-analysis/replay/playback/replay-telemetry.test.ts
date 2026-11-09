import { expect, it } from 'vitest';
import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { telemetryOption, telemetrySignals, type TelemetryChart } from './replay-telemetry';

const runner: RaceRunner = {
  index: 0,
  name: 'Test Uma',
  isPlayer: true,
  stats: {},
  aptitudes: {},
  skillIds: [],
  raw: {}
};

/** A 2000 m race whose runner dashes out of the gate at 24 m/s², then races between -0.8 and 0.4 m/s². */
function gateStartChart(signals = ['acceleration']): TelemetryChart {
  const speeds: [number, number][] = [
    [0, 300],
    [0.5, 1500],
    [0.6, 1720],
    [1.6, 1740],
    [2.6, 1780],
    [3.6, 1700],
    [4.6, 1700]
  ];

  const capture: ParsedRaceCapture = {
    source: 'api',
    fileName: 'race.json',
    track: {},
    events: [],
    runners: [runner],
    frames: speeds.map(([time, speed]) => ({
      time,
      horses: [
        {
          distance: 0,
          lanePosition: 0,
          speed,
          hp: 1000,
          temptationMode: 0,
          blockFrontHorseIndex: -1
        }
      ]
    }))
  };

  return {
    capture,
    raceDistance: 2000,
    runner,
    chartRunners: [runner],
    signals: telemetrySignals(true, false).filter((signal) => signals.includes(signal.value)),
    startTime: 0,
    endTime: 4.6,
    telemetryEnd: 4.6,
    finishTimes: new Map(),
    chartEvents: false,
    markers: [],
    phases: [],
    blocking: [],
    dark: true,
    axisScales: true
  };
}

type ChartOption = {
  yAxis: { min?: number; max?: number }[];
  series: { data: (number | null)[][] }[];
};

it('scales acceleration to the race after the start dash and keeps the dash in the data', () => {
  const chart = gateStartChart();

  const option = telemetryOption(chart, false) as unknown as ChartOption;

  expect(option.yAxis[0]).toMatchObject({ min: -1, max: 0.5 });
  expect(option.series[0]?.data[0]).toEqual([0, 24]);
});

it('keeps acceleration to the bottom of the plot beside speed', () => {
  const chart = gateStartChart(['speed', 'acceleration']);

  const option = telemetryOption(chart, false) as unknown as ChartOption;
  const [speedAxis, accelerationAxis] = option.yAxis;

  expect(speedAxis).toMatchObject({ min: 0 });
  // The racing range, -1 to 0.5 m/s², fills the bottom 40% of the axis.
  expect(accelerationAxis).toMatchObject({ min: -1, max: 2.75 });
});
