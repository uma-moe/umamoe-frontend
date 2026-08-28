import { HttpClient } from '@angular/common/http';
import { NgZone } from '@angular/core';
import { of } from 'rxjs';

import { AuthService } from './auth.service';
import { PartnerLookupCreateResponse, PartnerService } from './partner.service';
import { TurnstileService } from './turnstile.service';

describe('PartnerService', () => {
  const response: PartnerLookupCreateResponse = {
    task_id: 42,
    status: 'pending',
    will_persist: true,
  };

  function createService(token: string | null) {
    const http = jasmine.createSpyObj<HttpClient>('HttpClient', ['post']);
    http.post.and.returnValue(of(response));

    const auth = jasmine.createSpyObj<AuthService>('AuthService', ['getToken']);
    auth.getToken.and.returnValue(token);
    Object.defineProperty(auth, 'user$', { value: of(null) });

    const service = new PartnerService(
      http,
      auth,
      new NgZone({ enableLongStackTrace: false }),
      {} as TurnstileService,
    );

    return { service, http };
  }

  it('requires persistence when an auth token exists', () => {
    const { service, http } = createService('signed-token');

    service.createLookup(' 123456789 ', ' example ').subscribe();

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      {
        partner_id: '123456789',
        label: 'example',
        require_persistence: true,
      },
    );
  });

  it('allows the anonymous non-persistent path without a token', () => {
    const { service, http } = createService(null);

    service.createLookup('123456789').subscribe();

    expect(http.post).toHaveBeenCalledWith(
      jasmine.any(String),
      {
        partner_id: '123456789',
        label: null,
        require_persistence: false,
      },
    );
  });
});
