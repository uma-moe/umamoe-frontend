import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/services/http/http-client';
import { createSimulatorRepository } from './simulator-repository';

describe('simulator lab repository', () => {
  it('rejects changed sample mapping and malformed HP/spurt columns',async()=>{
    const result:Record<string,unknown>={schema_version:5,engine_build:'fixture',runs:1,seeds:[42],finish_order:[[0,1]],finish_times:[[80,81]]};
    const repository=createSimulatorRepository(async()=>JSON.stringify(result));
    await expect(repository.monteCarlo({body:{seeds:[43]}})).rejects.toThrow(/incompatible results/);
    result.max_hp=[[1200]];
    await expect(repository.monteCarlo({body:{}})).rejects.toThrow(/incompatible results/);
    delete result.max_hp;result.check_hp=[[[800],['invalid']]];
    await expect(repository.monteCarlo({body:{}})).rejects.toThrow(/incompatible results/);
  });
  it('validates compact skill traces before displaying distributions',async()=>{
    const result={schema_version:5,engine_build:'fixture',runs:1,seeds:[1],finish_order:[[0,1]],finish_times:[[80,81]],
      skill_procs:[{activations:[[0,200101,0,0,1,20,4,1,0,1]],effects:[[0,1,2,3]]}]};
    const repository=createSimulatorRepository(async()=>JSON.stringify(result));
    expect((await repository.monteCarlo({body:{}})).result.skill_procs).toHaveLength(1);
    result.skill_procs[0]!.activations[0]![8]=1;
    await expect(repository.monteCarlo({body:{}})).rejects.toThrow(/incompatible results/);
    result.skill_procs[0]!.activations[0]![8]=0;
    result.skill_procs[0]!.activations[0]![0]=2;
    await expect(repository.monteCarlo({body:{}})).rejects.toThrow(/incompatible results/);
  });
  it('posts the body to the backend simulator route without browser-supplied credentials', async () => {
    const raw = JSON.stringify({schema_version:5,engine_build:'fixture',runs:2,seeds:[1,2],finish_order:[[0,1],[1,0]],finish_times:[[80,81],[81,80]]});
    const request = vi.fn(async () => raw);
    const repository = createSimulatorRepository(request);

    const run = await repository.monteCarlo({ body: { runs: 2 } });

    expect(request).toHaveBeenCalledWith('/api/sim/monte-carlo', {
      method: 'POST',
      headers: { accept: 'application/json' },
      browserProof: false,
      body: { runs: 2 },
      responseType: 'text'
    });
    expect(run.raw).toBe(raw);
    expect(run.result.runs).toBe(2);
  });

  it('explains a non-JSON body instead of surfacing a parse error', async () => {
    const repository = createSimulatorRepository(async () => 'msgpack bytes');

    await expect(repository.monteCarlo({ body: {} })).rejects.toThrow(/incompatible response body/);
  });

  it('posts optimize runs to the backend route without browser-supplied credentials', async () => {    const request = vi.fn(async () => '{"schema_version":3,"mode":"cm","report":{"finalists":[]}}');
    const repository = createSimulatorRepository(request);

    const run = await repository.optimize({ body: { mode: 'cm' } });

    expect(request).toHaveBeenCalledWith('/api/sim/optimize', {
      method: 'POST',
      headers: { accept: 'application/json' },
      browserProof: false,
      body: { mode: 'cm' },
      responseType: 'text'
    });
    expect(run.result.mode).toBe('cm');
  });

  it('rejects malformed rankings and explains an unavailable service', async () => {
    const repository = createSimulatorRepository(async () => JSON.stringify({schema_version:5,engine_build:'fixture',runs:1,seeds:[1],finish_order:[[0,0]],finish_times:[[80,81]]}));
    await expect(repository.monteCarlo({body:{}})).rejects.toThrow(/incompatible results/);
    const unavailable = createSimulatorRepository(async () => { throw new HttpError(404,'Not Found','/api/sim/stamina','',new Response(null,{status:404})); });
    await expect(unavailable.stamina({body:{}})).rejects.toThrow(/backend does not provide the simulator API/);
  });

  it('explains local authentication failures without asking for a browser API key', async () => {
    const repository = createSimulatorRepository(async () => {
      throw new HttpError(401, 'Unauthorized', '/api/sim/stamina', '', new Response(null, {status: 401}));
    });
    await expect(repository.stamina({body: {}})).rejects.toThrow(/SIMULATOR_API_KEY in \.env\.development\.local/);
  });

  it('keeps a plain-text framework rejection instead of only the status line', async () => {
    const repository = createSimulatorRepository(async () => {
      throw new HttpError(
        422,
        'Unprocessable Entity',
        '/api/sim/optimize',
        'Failed to deserialize the JSON body: purchases[0].skills[0] expected struct OwnedSkill',
        new Response(null, { status: 422 })
      );
    });

    await expect(repository.optimize({ body: {} })).rejects.toThrow(
      /purchases\[0\]\.skills\[0\]/
    );
  });
});
