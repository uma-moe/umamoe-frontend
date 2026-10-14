import {describe,it,expect} from 'vitest';
import {telemetrySample,telemetryLeaders,prepareRunnerTelemetry,promptSpurtRate} from './report-telemetry';
import {normalizeReportResponse} from '../simulation-report';
import type {SimulationReport,ReportTelemetry} from '../simulation-report';

const t:ReportTelemetry={interval_seconds:1,offsets:[0,2,4,6,8],finish_seconds:[1.5,1.5,1.8,1.8],finish_values:[[100,1,20,10],[100,2,22,20],[100,3,19,5],[100,4,21,15]],columns:[Float32Array.from([0,80,0,40,0,50,0,90]),Float32Array.from([1,1,2,2,3,3,4,4]),Float32Array.from([20,20,22,22,19,19,21,21]),Float32Array.from([100,50,200,100,100,40,200,80])]};
const report={version:2,clock:'simulation_elapsed',samples:2,elapsed_seconds:[0,1,2],runners:[{source_input_index:0},{source_input_index:1}],telemetry:t} as SimulationReport;

describe('Monte Carlo telemetry',()=>{
  it('keeps forward and lateral observations paired and holds a finisher at its crossing',()=>{
    expect(telemetrySample(t,0,1.25,0)).toBe(90);
    expect(telemetrySample(t,0,20,0)).toBe(100);
    expect(telemetrySample(t,0,20,2)).toBe(20);
    expect(telemetrySample(t,1,1.25,1)).toBe(2);
  });
  it('maxes each actual race before averaging gaps and normalizes each run separately',()=>{
    t.leaders=telemetryLeaders(report);
    expect(Array.from(t.leaders)).toEqual([0,80,100,0,90,100]);
    const runner=prepareRunnerTelemetry(report,0,[100,200]);
    expect(runner.bands[1]![2]![0]).toBe(25);
    expect(runner.bands[1]![1]![0]).toBe(50);
    expect(runner.bands[2]!.map(b=>b[4])).toEqual([0,0,0]);
    expect(runner.curves[0]).toHaveLength(6);
    expect(runner.curves[0]!.at(-1)).toBe(22);
    expect(runner.finish).toEqual([1.5,1.5]);
  });
  it('decodes binary columns without rounding and rejects truncated floats',()=>{
    const raw={...t,columns:t.columns.map(c=>new Uint8Array(c.buffer))};
    const decoded=normalizeReportResponse({report:{telemetry:raw}}) as {report:{telemetry:ReportTelemetry}};
    expect(decoded.report.telemetry.columns[0]).toEqual(t.columns[0]);
    expect(()=>normalizeReportResponse({report:{telemetry:{...raw,columns:[new Uint8Array(3),...raw.columns.slice(1)]}}})).toThrow(/Truncated/);
  });
  it('separates a full-speed decision from starting that spurt promptly',()=>{
    const result={runs:2,last_spurt_decisions:[[1],[1]],spurt_calculation_distances:[[[100]],[[100]]],report:{runners:[{source_input_index:0,diagnostics:[{spurt_start_m:100},{spurt_start_m:120}]}]}};
    expect(promptSpurtRate(result as never,0)).toBe(50);
  });
});
