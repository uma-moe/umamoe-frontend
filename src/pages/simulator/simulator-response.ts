import {validateReport,type BuildComparison} from './reports/simulation-report';
import {validateDetailedReplay} from '@/lib/race/race-diagnostics';

export function validateSimulatorResponse(path:string,body:Record<string,unknown>,result:unknown) {
    const value = result as Record<string, unknown>;
    const numbers = (array: unknown): array is number[] => Array.isArray(array) && array.every(Number.isFinite);
    const matrix = (array: unknown, runs: number, count: number): boolean => Array.isArray(array) && array.length === runs
      && array.every(row => numbers(row) && row.length === count);
    let valid = value !== null && typeof value === 'object' && !Array.isArray(value);
    if (valid && path.endsWith('/monte-carlo')) {
      const runs = Number(value.runs), count = Array.isArray(value.finish_order) ? value.finish_order[0]?.length ?? 0 : 0;
      const inputCount = (body.input as { runners?: unknown[] } | undefined)?.runners?.length;
      valid = Number.isInteger(runs) && runs >= 1 && runs <= 1000 && value.schema_version === 5
        && typeof value.engine_build === 'string' && numbers(value.seeds) && value.seeds.length === runs
        && (body.seeds !== undefined || body.runs === undefined || runs === body.runs)
        && (body.seeds === undefined || numbers(body.seeds) && body.seeds.length === runs && body.seeds.every((seed,i)=>seed===(value.seeds as number[])[i]))
        && count >= 2 && count <= 18 && (inputCount === undefined || count === inputCount)
        && matrix(value.finish_order, runs, count) && (value.finish_order as number[][]).every(order =>
          new Set(order).size === count && order.every(source => Number.isInteger(source) && source >= 0 && source < count))
        && matrix(value.finish_times, runs, count)
        && ['final_hp','last_spurt_decisions','hp_deficit','max_hp'].every(key => value[key] == null || matrix(value[key], runs, count))
        && ['spurt_calculation_times','spurt_calculation_distances','check_hp','full_spurt_need_hp','spurt_calculation_results'].every(key => value[key] == null || Array.isArray(value[key]) && value[key].length===runs && value[key].every(row=>Array.isArray(row)&&row.length===count&&row.every(numbers)))
        && (value.skills == null || Array.isArray(value.skills) && value.skills.every(skill => skill && typeof skill === 'object'
          && Number.isInteger(skill.source_input_index) && skill.source_input_index >= 0 && skill.source_input_index < count
          && Number.isFinite(skill.skill_id) && Number.isFinite(skill.runs_triggered) && Number.isFinite(skill.trigger_probability)
          && Number.isFinite(skill.total_activations) && (skill.mean_activation_distance_m == null || Number.isFinite(skill.mean_activation_distance_m))));
      if(valid && value.skill_procs != null) {
        valid=Array.isArray(value.skill_procs)&&value.skill_procs.length===runs&&value.skill_procs.every(trace=>
          trace&&Array.isArray(trace.effects)&&trace.effects.every((effect:unknown)=>numbers(effect)&&effect.length===4)
          &&Array.isArray(trace.activations)&&trace.activations.every((proc:unknown)=>numbers(proc)&&proc.length===10
            &&Number.isInteger(proc[0])&&proc[0]!>=0&&proc[0]!<count&&Number.isInteger(proc[1])&&proc[1]!>0
            &&proc[4]!>=0&&proc[5]!>=0&&Number.isInteger(proc[7])&&proc[7]!>=0
            &&Number.isInteger(proc[8])&&proc[8]!>=0&&Number.isInteger(proc[9])&&proc[9]!>=0&&proc[8]!+proc[9]!<=trace.effects.length));
      }
      if(valid&&value.report!=null)valid=validateReport(value.report,runs,count);
      if(valid&&(value.report as {version?:number}|undefined)?.version===2)valid=matrix(value.max_hp,runs,count)&&(value.max_hp as number[][]).every(row=>row.every(hp=>hp>0));
    } else if(valid&&path.endsWith('/comparison')) {
      const comparison=value as unknown as BuildComparison;
      const seeds=body.seeds as number[];
      const count=(body.input as {runners:unknown[]}).runners.length;
      valid=comparison.version===1&&comparison.source_input_index===body.source_input_index&&Array.isArray(comparison.alternatives)
        &&comparison.alternatives.length>=1&&comparison.alternatives.length<=4&&comparison.alternatives.every(([name,r])=>typeof name==='string'&&r.schema_version===5&&r.runs===seeds.length&&typeof r.engine_build==='string'&&numbers(r.seeds)&&r.seeds.every((seed,i)=>seed===seeds[i])&&matrix(r.finish_times,seeds.length,count)&&matrix(r.finish_order,seeds.length,count)&&r.finish_order.every(order=>new Set(order).size===count&&order.every(i=>Number.isInteger(i)&&i>=0&&i<count))&&matrix(r.last_spurt_decisions,seeds.length,count));
    } else if (valid && path.endsWith('/replay/detailed')) {
      validateDetailedReplay(value,(body.runners as unknown[]).length);
    } else if (valid && path.endsWith('/stamina')) {
      const arrays = ['spurt_calculation_times','spurt_calculation_distances','check_hp','full_spurt_need_hp','spurt_calculation_results'];
      valid = typeof value.model === 'string' && typeof value.survived === 'boolean' && typeof value.full_spurt === 'boolean'
        && ['course_id','seed','max_hp','remaining_hp','hp_deficit','minimum_hp','consumed_hp','recovered_hp','debuff_hp_loss',
          'wasted_recovery_hp','effects_applied','finish_time_seconds','last_spurt_decision'].every(key => Number.isFinite(value[key]))
        && arrays.every(key => numbers(value[key])) && arrays.every(key => (value[key] as number[]).length === (value.check_hp as number[]).length)
        && (value.last_spurt_start_distance_m === null || Number.isFinite(value.last_spurt_start_distance_m))
        && (value.exhausted_at === null || typeof value.exhausted_at === 'object' && value.exhausted_at !== null
          && Number.isFinite((value.exhausted_at as Record<string, unknown>).time_seconds)
          && Number.isFinite((value.exhausted_at as Record<string, unknown>).distance_m));
    } else if (valid && path.endsWith('/optimize')) {
      const report = value.report as Record<string, unknown> | undefined;
      valid = typeof value.mode === 'string' && !!report && Array.isArray(report.finalists);
    } else if (valid && path.endsWith('/batch')) valid = value.schema_version === 3 && Array.isArray(value.results);
    if (!valid) throw new Error('The simulator returned incomplete or incompatible results.');

}
