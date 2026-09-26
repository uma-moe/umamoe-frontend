import {afterEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resourceRepository} from '@/lib/catalog/resource-repository';
import type {ParsedRaceCapture} from '@/lib/race/race-capture-parser';
import {appHttp} from '@/services/http/app-http';
import {loadReplayCourses,loadReplayGeometry,resolveReplayCourses,courseLandmarks} from './replay-course';
import {replayTrack,trackPointAtDistance} from './replay-track';

const fixture=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString());
afterEach(()=>{resourceRepository.invalidate();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('loads published course metadata and full geometry by course ID through resources',async()=>{
  const fetch=vi.fn(async(url:string)=>{
    if(url.endsWith('manifest.json'))return Response.json({version:'test'});
    const name=url.split('/').at(-1)!.split('.')[0]!;
    if(!fixture[name])throw Error('Unexpected resource '+url);
    return Response.json(fixture[name]);
  });
  vi.stubGlobal('fetch',fetch);
  const courses=await loadReplayCourses(),shapes=await loadReplayGeometry();
  expect(courses.courses['10606']).toMatchObject({raceTrackId:10006,distance:2400});
  expect(shapes['10606']!.points).toHaveLength(1001);
  expect(shapes['10606']!.distance).toBe(2400);
  const points=replayTrack(shapes['10606']!);
  expect(trackPointAtDistance(points,2500)).toEqual(points.at(-1));
  expect(fetch).toHaveBeenCalledWith('/resources/test/simulator_course_geometry.json.gz',expect.anything());

  resourceRepository.invalidate();
  const invalid={...fixture.simulator_course_geometry,courses:[{...fixture.simulator_course_geometry.courses[0],position_z:[0]}]};
  fetch.mockImplementation(async(url:string)=>Response.json(url.endsWith('manifest.json')?{version:'test'}:invalid));
  await expect(loadReplayGeometry()).rejects.toThrow('Course geometry data is invalid.');
});
it('resolves course IDs from race instances without replacing the captured course or guessing by distance',async()=>{
  const capture=(raceInstanceId?:number,courseId?:number):ParsedRaceCapture=>({source:'api',fileName:'race.json',raceInstanceId,courseId,track:{},runners:[],frames:[],events:[]});
  const captures=[capture(800023),capture(800023,10606),capture(100101),capture(),capture(-1)];
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.endsWith('manifest.json')?{version:'test'}:{races:[{race_instance_id:800023,course_set_id:10506}]})));
  const query=vi.spyOn(appHttp,'request').mockResolvedValue({rows:[[100101,10611]]});
  await resolveReplayCourses(captures);
  expect(captures.map(c=>c.courseId)).toEqual([10506,10606,10611,undefined,undefined]);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query.mock.calls[0]?.[1]?.query?.sql).toContain('WHERE ri.id IN (100101)');
});
it('uses resource distances and grades for upcoming section, slope and phase markers',()=>{
  const landmarks=courseLandmarks({raceTrackId:10006,distance:1200,surface:1,turn:2,corners:[{start:200,length:400}],straights:[{start:0,end:200},{start:600,end:1200}],slopes:[{start:300,length:100,slope:15000},{start:400,length:100,slope:-10000}]});
  expect(landmarks).toContainEqual({distance:300,label:'Uphill +1.5%',color:'#bd7581'});
  expect(landmarks).toContainEqual({distance:400,label:'Downhill -1.0%',color:'#719bdd'});
  expect(landmarks.filter(m=>m.distance===400).some(m=>m.label==='Level ground')).toBe(false);
  expect(landmarks.find(m=>m.label==='Late race')?.distance).toBe(800);
  expect(landmarks.at(-1)?.label).toBe('Finish');
  expect(courseLandmarks(undefined)).toEqual([]);
});
