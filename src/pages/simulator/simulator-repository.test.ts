import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '@/services/http/http-client';
import { createSimulatorRepository } from './simulator-repository';

describe('simulator lab repository', () => {
  it('posts the body to the backend simulator route with the user key', async () => {
    const request = vi.fn(async () => '{"runs":2,"seeds":[1,2],"finish_order":[[0,1]]}');
    const repository = createSimulatorRepository(request);

    const run = await repository.monteCarlo({ key: 'uma_k_test', body: { runs: 2 } });

    expect(request).toHaveBeenCalledWith('/api/sim/monte-carlo', {
      method: 'POST',
      headers: { 'x-api-key': 'uma_k_test', accept: 'application/json' },
      body: { runs: 2 },
      responseType: 'text'
    });
    expect(run.raw).toBe('{"runs":2,"seeds":[1,2],"finish_order":[[0,1]]}');
    expect(run.result.runs).toBe(2);
  });

  it('explains a non-JSON body instead of surfacing a parse error', async () => {
    const repository = createSimulatorRepository(async () => 'msgpack bytes');

    await expect(repository.monteCarlo({ key: 'k', body: {} })).rejects.toThrow(/output_format/);
  });

  it('posts optimize runs to the backend route with the user key', async () => {    const request = vi.fn(async () => '{"schema_version":3,"mode":"cm","report":{"finalists":[]}}');
    const repository = createSimulatorRepository(request);

    const run = await repository.optimize({ key: 'uma_k_test', body: { mode: 'cm' } });

    expect(request).toHaveBeenCalledWith('/api/sim/optimize', {
      method: 'POST',
      headers: { 'x-api-key': 'uma_k_test', accept: 'application/json' },
      body: { mode: 'cm' },
      responseType: 'text'
    });
    expect(run.result.mode).toBe('cm');
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

    await expect(repository.optimize({ key: 'k', body: {} })).rejects.toThrow(
      /purchases\[0\]\.skills\[0\]/
    );
  });
});
