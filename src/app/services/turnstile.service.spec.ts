import { NgZone } from '@angular/core';
import { AppVersionService } from './app-version.service';
import { TurnstileService } from './turnstile.service';

describe('TurnstileService browser proof sources', () => {
  function createService(): TurnstileService {
    return new TurnstileService(
      document,
      {} as NgZone,
      {
        getCurrentVersion: () => 'test',
        getCurrentVersionLabel: () => 'test',
      } as AppVersionService,
    );
  }

  it('accepts a trusted crawler proof as a complete browser proof', () => {
    const service = createService();
    const prime = spyOn(service, 'prime').and.returnValue(Promise.resolve());

    service.storeBrowserProof('trusted-proof', 300, 'api_request', 'trusted_crawler');

    expect(service.getCachedProofToken('api_request')).toBe('trusted-proof');
    expect(service.currentProofDebug.ready).toBeTrue();
    expect(service.currentProofDebug.source).toBe('trusted_crawler');
    expect(prime).not.toHaveBeenCalled();
  });

  it('continues treating warmup proofs as temporary', () => {
    const service = createService();
    const prime = spyOn(service, 'prime').and.returnValue(Promise.resolve());

    service.storeBrowserProof('warmup-proof', 30, 'api_request', 'warmup');

    expect(service.getCachedProofToken('api_request')).toBe('');
    expect(service.getCachedProofToken('api_request', { includeWarmup: true })).toBe('warmup-proof');
    expect(service.currentProofDebug.ready).toBeFalse();
    expect(prime).toHaveBeenCalled();
  });
});
