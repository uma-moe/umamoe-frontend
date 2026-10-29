import { validateDetailedReplay } from '@/lib/race/capture/race-diagnostics';
import { validateReport } from './reports/simulation-report';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isFinite);
}

function matrix(value: unknown, runs: number, count: number): value is number[][] {
  return (
    Array.isArray(value) &&
    value.length === runs &&
    value.every((row) => numbers(row) && row.length === count)
  );
}

function rankings(value: unknown, runs: number, count: number): value is number[][] {
  return (
    matrix(value, runs, count) &&
    value.every(
      (order) =>
        new Set(order).size === count &&
        order.every((source) => Number.isInteger(source) && source >= 0 && source < count)
    )
  );
}

function skillTraces(value: unknown, runs: number, count: number): boolean {
  if (!Array.isArray(value) || value.length !== runs) return false;
  return value.every((trace) => {
    if (!isRecord(trace) || !Array.isArray(trace.effects) || !Array.isArray(trace.activations))
      return false;
    const effects = trace.effects;
    if (!effects.every((effect) => numbers(effect) && effect.length === 4)) return false;
    return trace.activations.every((proc) => {
      if (!numbers(proc) || proc.length !== 10) return false;
      const [source, skillId, , , time, distance, , flags, offset, length] = proc;
      return (
        Number.isInteger(source) &&
        source !== undefined &&
        source >= 0 &&
        source < count &&
        Number.isInteger(skillId) &&
        skillId !== undefined &&
        skillId > 0 &&
        time !== undefined &&
        time >= 0 &&
        distance !== undefined &&
        distance >= 0 &&
        Number.isInteger(flags) &&
        flags !== undefined &&
        flags >= 0 &&
        Number.isInteger(offset) &&
        offset !== undefined &&
        offset >= 0 &&
        Number.isInteger(length) &&
        length !== undefined &&
        length >= 0 &&
        offset + length <= effects.length
      );
    });
  });
}

function monteCarlo(value: Record<string, unknown>, body: Record<string, unknown>): boolean {
  const runs = Number(value.runs);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000 || value.schema_version !== 5)
    return false;
  if (
    typeof value.engine_build !== 'string' ||
    !numbers(value.seeds) ||
    value.seeds.length !== runs
  )
    return false;
  if (body.seeds === undefined && body.runs !== undefined && runs !== body.runs) return false;
  if (body.seeds !== undefined) {
    const seeds = value.seeds;
    if (
      !numbers(body.seeds) ||
      body.seeds.length !== runs ||
      !body.seeds.every((seed, index) => seed === seeds[index])
    )
      return false;
  }

  const firstOrder = Array.isArray(value.finish_order) ? value.finish_order[0] : undefined;
  const count = Array.isArray(firstOrder) ? firstOrder.length : 0;
  const inputCount =
    isRecord(body.input) && Array.isArray(body.input.runners)
      ? body.input.runners.length
      : undefined;

  if (count < 2 || count > 18 || (inputCount !== undefined && count !== inputCount)) return false;
  if (!rankings(value.finish_order, runs, count) || !matrix(value.finish_times, runs, count))
    return false;

  for (const key of ['final_hp', 'last_spurt_decisions', 'hp_deficit', 'max_hp']) {
    if (value[key] != null && !matrix(value[key], runs, count)) return false;
  }

  for (const key of [
    'spurt_calculation_times',
    'spurt_calculation_distances',
    'check_hp',
    'full_spurt_need_hp',
    'spurt_calculation_results'
  ]) {
    const observations = value[key];
    if (observations == null) continue;
    if (!Array.isArray(observations) || observations.length !== runs) return false;
    if (
      !observations.every((row) => Array.isArray(row) && row.length === count && row.every(numbers))
    )
      return false;
  }

  if (value.skills != null) {
    if (
      !Array.isArray(value.skills) ||
      !value.skills.every((skill) => {
        if (!isRecord(skill)) return false;
        const source = skill.source_input_index;
        return (
          typeof source === 'number' &&
          Number.isInteger(source) &&
          source >= 0 &&
          source < count &&
          ['skill_id', 'runs_triggered', 'trigger_probability', 'total_activations'].every((key) =>
            Number.isFinite(skill[key])
          ) &&
          (skill.mean_activation_distance_m == null ||
            Number.isFinite(skill.mean_activation_distance_m))
        );
      })
    )
      return false;
  }

  if (value.skill_procs != null && !skillTraces(value.skill_procs, runs, count)) return false;
  if (value.report == null) return true;
  if (!validateReport(value.report, runs, count)) return false;
  if (value.report.version !== 2) return true;
  return (
    matrix(value.max_hp, runs, count) && value.max_hp.every((row) => row.every((hp) => hp > 0))
  );
}

function comparison(value: Record<string, unknown>, body: Record<string, unknown>): boolean {
  if (!numbers(body.seeds) || !isRecord(body.input) || !Array.isArray(body.input.runners))
    return false;
  const seeds = body.seeds;
  const count = body.input.runners.length;
  if (value.version !== 1 || value.source_input_index !== body.source_input_index) return false;
  if (
    !Array.isArray(value.alternatives) ||
    value.alternatives.length < 1 ||
    value.alternatives.length > 4
  )
    return false;
  return value.alternatives.every((alternative) => {
    if (!Array.isArray(alternative) || alternative.length !== 2) return false;
    const [name, result] = alternative;
    if (typeof name !== 'string' || !isRecord(result)) return false;
    if (
      result.schema_version !== 5 ||
      result.runs !== seeds.length ||
      typeof result.engine_build !== 'string'
    )
      return false;
    if (
      !numbers(result.seeds) ||
      result.seeds.length !== seeds.length ||
      !result.seeds.every((seed, index) => seed === seeds[index])
    )
      return false;
    return (
      matrix(result.finish_times, seeds.length, count) &&
      rankings(result.finish_order, seeds.length, count) &&
      matrix(result.last_spurt_decisions, seeds.length, count)
    );
  });
}

function stamina(value: Record<string, unknown>): boolean {
  if (
    typeof value.model !== 'string' ||
    typeof value.survived !== 'boolean' ||
    typeof value.full_spurt !== 'boolean'
  )
    return false;
  const fields = [
    'course_id',
    'seed',
    'max_hp',
    'remaining_hp',
    'hp_deficit',
    'minimum_hp',
    'consumed_hp',
    'recovered_hp',
    'debuff_hp_loss',
    'wasted_recovery_hp',
    'effects_applied',
    'finish_time_seconds',
    'last_spurt_decision'
  ];

  if (!fields.every((key) => Number.isFinite(value[key]))) return false;
  const checkHp = value.check_hp;
  if (!numbers(checkHp)) return false;
  const columns = [
    'spurt_calculation_times',
    'spurt_calculation_distances',
    'full_spurt_need_hp',
    'spurt_calculation_results'
  ];

  if (!columns.every((key) => numbers(value[key]) && value[key].length === checkHp.length))
    return false;
  if (
    value.last_spurt_start_distance_m !== null &&
    !Number.isFinite(value.last_spurt_start_distance_m)
  )
    return false;
  if (value.exhausted_at === null) return true;
  return (
    isRecord(value.exhausted_at) &&
    Number.isFinite(value.exhausted_at.time_seconds) &&
    Number.isFinite(value.exhausted_at.distance_m)
  );
}

export function validateSimulatorResponse(
  path: string,
  body: Record<string, unknown>,
  result: unknown
): void {
  const incompatible = 'The simulator returned incomplete or incompatible results.';
  if (!isRecord(result)) throw new Error(incompatible);
  let valid = true;
  if (path.endsWith('/monte-carlo')) valid = monteCarlo(result, body);
  else if (path.endsWith('/comparison')) valid = comparison(result, body);
  else if (path.endsWith('/race')) {
    const input = body.input;
    if (!isRecord(input) || !Array.isArray(input.runners)) throw new Error(incompatible);
    validateDetailedReplay(result, input.runners.length);
  } else if (path.endsWith('/stamina')) valid = stamina(result);
  else if (path.endsWith('/optimize'))
    valid =
      typeof result.mode === 'string' &&
      isRecord(result.report) &&
      Array.isArray(result.report.finalists);
  else if (path.endsWith('/batch'))
    valid = result.schema_version === 3 && Array.isArray(result.results);
  if (!valid) throw new Error(incompatible);
}
