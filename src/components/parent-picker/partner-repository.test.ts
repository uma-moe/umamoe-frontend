import { afterEach, expect, it, vi } from 'vitest';
import { partnerRepository, readPartnerStream } from './partner-repository';
import { createHttpClient, HttpError } from '@/services/http/http-client';
import { appHttp } from '@/services/http/app-http';

afterEach(() => vi.restoreAllMocks());

it('streams split SSE events through authenticated HTTP without consuming the body', async () => {
  const encoder = new TextEncoder();
  const phase = vi.fn();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        for (const part of [
          ':keepalive\r\n\r\nevent: pend',
          'ing\r\ndata: {}\r\n\r\nevent: processing\ndata: {}\n\nevent: completed\ndata: {"inheritance":null}\n\n'
        ])
          controller.enqueue(encoder.encode(part));
        controller.close();
      }
    })
  );

  const fetcher = vi.fn(async () => response);
  const client = createHttpClient({ fetcher, getAuthToken: () => 'token' });
  const result = await client.request<Response>('/api/v4/partner/lookup/7/stream', {
    responseType: 'response',
    headers: { accept: 'text/event-stream' }
  });

  expect(result.bodyUsed).toBe(false);
  await expect(readPartnerStream(result, phase)).resolves.toBeNull();
  expect(phase.mock.calls).toEqual([['pending'], ['processing']]);
  expect(
    new Headers((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get(
      'authorization'
    )
  ).toBe('Bearer token');
});

it('reports failed, malformed and prematurely closed streams and HTTP errors', async () => {
  await expect(
    readPartnerStream(new Response('event: failed\ndata: {"error":"No partner"}\n\n'), () => {})
  ).rejects.toThrow('No partner');

  await expect(
    readPartnerStream(new Response('event: pending\ndata: {}\n\n'), () => {})
  ).rejects.toThrow('disconnected');

  await expect(
    readPartnerStream(new Response('event: timeout\ndata: {}\n\n'), () => {})
  ).rejects.toMatchObject({
    name: 'TimeoutError',
    message: 'The worker did not respond in time. Please try again.'
  });

  await expect(
    readPartnerStream(new Response('event: completed\ndata: invalid\n\n'), () => {})
  ).rejects.toThrow();

  const client = createHttpClient({
    fetcher: vi.fn(async () => new Response('{"error":"bad"}', { status: 400 }))
  });

  await expect(
    client.request('/api/v4/partner/lookup/7/stream', { responseType: 'response' })
  ).rejects.toMatchObject({ status: 400, body: { error: 'bad' }, name: HttpError.name });
});

it.each([
  null,
  [],
  { inheritance: 'invalid' },
  { inheritance: { account_id: '123456789', main_parent_id: '1001' } }
])('rejects malformed completion data without treating it as a parent: %j', async (data) => {
  const response = new Response(`event: completed\ndata: ${JSON.stringify(data)}\n\n`);
  await expect(readPartnerStream(response, () => {})).rejects.toThrow('invalid');
});

it('normalizes the saved-partner identifier from completed events', async () => {
  const inheritance = {
    id: 7,
    account_id: '123456789',
    main_parent_id: 100101,
    parent_left_id: 100201,
    parent_right_id: 100301,
    parent_rank: 1000,
    parent_rarity: 3
  };

  const response = new Response(`event: completed\ndata: ${JSON.stringify({ inheritance })}\n\n`);
  await expect(readPartnerStream(response, () => {})).resolves.toEqual({
    ...inheritance,
    inheritance_id: 7
  });
});

it('validates lookup metadata before opening its event stream', async () => {
  const request = vi
    .spyOn(appHttp, 'request')
    .mockResolvedValue({ task_id: 1, will_persist: 'yes' });

  await expect(
    partnerRepository.lookup('123456789', new AbortController().signal, () => {})
  ).rejects.toThrow('invalid response');

  expect(request).toHaveBeenCalledTimes(1);
});
