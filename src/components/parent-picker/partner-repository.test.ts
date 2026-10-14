import { expect, it, vi } from 'vitest';
import { readPartnerStream } from './partner-repository';
import { createHttpClient, HttpError } from '@/services/http/http-client';

it('streams split SSE events through authenticated HTTP without consuming the body',async()=>{
  const encoder=new TextEncoder();const phase=vi.fn();
  const response=new Response(new ReadableStream({start(controller){for(const part of [':keepalive\r\n\r\nevent: pend','ing\r\ndata: {}\r\n\r\nevent: processing\ndata: {}\n\nevent: completed\ndata: {"inheritance":null}\n\n'])controller.enqueue(encoder.encode(part));controller.close();}}));
  const fetcher=vi.fn(async()=>response);
  const client=createHttpClient({fetcher,getAuthToken:()=> 'token'});
  const result=await client.request<Response>('/api/v4/partner/lookup/7/stream',{responseType:'response',headers:{accept:'text/event-stream'}});
  expect(result.bodyUsed).toBe(false);await expect(readPartnerStream(result,phase)).resolves.toBeNull();
  expect(phase.mock.calls).toEqual([['pending'],['processing']]);
  expect(new Headers((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].headers).get('authorization')).toBe('Bearer token');
});
it('reports failed, malformed and prematurely closed streams and HTTP errors',async()=>{
  await expect(readPartnerStream(new Response('event: failed\ndata: {"error":"No partner"}\n\n'),()=>{})).rejects.toThrow('No partner');
  await expect(readPartnerStream(new Response('event: pending\ndata: {}\n\n'),()=>{})).rejects.toThrow('disconnected');
  await expect(readPartnerStream(new Response('event: timeout\ndata: {}\n\n'),()=>{})).rejects.toMatchObject({name:'TimeoutError',message:'The worker did not respond in time. Please try again.'});
  await expect(readPartnerStream(new Response('event: completed\ndata: invalid\n\n'),()=>{})).rejects.toThrow();
  const client=createHttpClient({fetcher:vi.fn(async()=>new Response('{"error":"bad"}',{status:400}))});
  await expect(client.request('/api/v4/partner/lookup/7/stream',{responseType:'response'})).rejects.toMatchObject({status:400,body:{error:'bad'},name:HttpError.name});
});
