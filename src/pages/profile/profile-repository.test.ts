import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { appHttp } from '@/services/http/app-http';
import { profileRepository, type ProfileVisibility } from './profile-repository';
import { communityRepository } from '@/pages/clubs/community-repository';

let sequence=0;
beforeEach(()=>localStorage.setItem('auth_token',`profile-test-${++sequence}`));
afterEach(()=>vi.restoreAllMocks());

it('enriches the current circle like club rankings and retains the profile when that service fails', async () => {
  vi.spyOn(appHttp, 'request').mockResolvedValue({ trainer: { name: 'Trainer' }, circle: { circle_id: 42, name: 'Club', monthly_point: 100 } });
  const club = vi.spyOn(communityRepository, 'clubDetails').mockResolvedValue({ circle: { circle_id: 42, name: 'Club', yesterday_rank: 12, yesterday_points: 80 }, clubRank: 6, members: [] } as never);
  expect((await profileRepository.load('42', true, true)).circle).toMatchObject({ club_rank: 6, yesterday_rank: 12, monthly_point: 100 });
  club.mockRejectedValue(new Error('Club service unavailable'));
  expect((await profileRepository.load('42', true, true)).circle).toMatchObject({ name: 'Club', monthly_point: 100 });
});

it('does not reuse a previous sign-in session or cache its late profile response',async()=>{
  let release!:(value:unknown)=>void;
  const old=new Promise(resolve=>release=resolve);
  const request=vi.spyOn(appHttp,'request').mockReturnValueOnce(old).mockResolvedValue({trainer:{name:'New session'}});
  const first=profileRepository.load('123');
  localStorage.setItem('auth_token','replacement-session');
  const fresh=await profileRepository.load('123');
  release({trainer:{name:'Old session'}});await first;
  expect((await profileRepository.load('123')).trainer.name).toBe('New session');
  expect(fresh.trainer.name).toBe('New session');expect(request).toHaveBeenCalledTimes(2);
});

it('orders immutable visibility writes per account and waits for them before a new read',async()=>{
  let release!:(value:ProfileVisibility)=>void;
  const delayed=new Promise<ProfileVisibility>(resolve=>release=resolve),bodies:ProfileVisibility[]=[];
  const request=vi.spyOn(appHttp,'request').mockImplementation(async(path,options)=>{
    if(options?.method!=='PUT')return {profile_hidden:true,hidden_sections:['fan_history']};
    const body=options.body as unknown as ProfileVisibility;bodies.push(body);
    if(path.includes('/first/')&&bodies.length===1)return delayed;
    return body;
  });
  const first=profileRepository.updateVisibility('first',{profile_hidden:true,hidden_sections:[]});
  await vi.waitFor(()=>expect(bodies).toHaveLength(1));
  const next={profile_hidden:true,hidden_sections:['fan_history']};
  const second=profileRepository.updateVisibility('first',next);next.hidden_sections.push('team_stadium');
  const read=profileRepository.visibility('first');
  await profileRepository.updateVisibility('other',{profile_hidden:false,hidden_sections:[]});
  expect(request).toHaveBeenCalledTimes(2);
  release({profile_hidden:true,hidden_sections:[]});await Promise.all([first,second,read]);
  expect(bodies[2]).toEqual({profile_hidden:true,hidden_sections:['fan_history']});
  expect(request.mock.calls.at(-1)?.[1]?.method).toBeUndefined();
});

it('a failed visibility save does not block the next one, but queued work cannot cross sign-in sessions',async()=>{
  const request=vi.spyOn(appHttp,'request').mockRejectedValueOnce(new Error('Not saved')).mockResolvedValue({profile_hidden:false,hidden_sections:[]});
  const first=profileRepository.updateVisibility('first',{profile_hidden:true,hidden_sections:[]});
  const second=profileRepository.updateVisibility('first',{profile_hidden:false,hidden_sections:[]});
  await expect(first).rejects.toThrow('Not saved');await expect(second).resolves.toMatchObject({profile_hidden:false});
  const queued=profileRepository.updateVisibility('first',{profile_hidden:true,hidden_sections:[]});
  localStorage.setItem('auth_token','different-owner');
  await expect(queued).rejects.toThrow('sign-in session changed');
  expect(request).toHaveBeenCalledTimes(2);
});

it('successful Veteran ingest invalidates cached profiles and details without caching the upload payload',async()=>{
  const request=vi.spyOn(appHttp,'request').mockResolvedValue({trainer:{name:'Before upload'},id:1});
  await profileRepository.load('first');await profileRepository.veteran('v1');
  await profileRepository.ingestVeterans('first',[{trained_chara_id:1}]);
  expect(request).toHaveBeenNthCalledWith(3, '/ingest/veteran?account_id=first', { method: 'POST', body: [{ trained_chara_id: 1 }] });
  request.mockResolvedValue({trainer:{name:'After upload'},id:1});
  expect((await profileRepository.load('first')).trainer.name).toBe('After upload');
  await profileRepository.veteran('v1');
  expect(request).toHaveBeenCalledTimes(5);
});
