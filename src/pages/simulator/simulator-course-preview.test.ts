import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {coursePreviewTrack} from './simulator-course-preview';
import {replayTrack,trackSection} from '@/pages/race-analysis/replay-track';
import type {CourseShape} from '@/pages/race-analysis/replay-course';

it('separates repeated Nakayama sections downwards without changing distances or replay geometry',()=>{
  const fixture=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString());
  const data=fixture.simulator_course_geometry.courses.find((course:{course_id:number})=>course.course_id===10506);
  const shape:CourseShape={distance:data.course_distance,points:data.position_x.map((x:number,index:number)=>[x,data.position_z[index]])};
  const original=replayTrack(shape),preview=coursePreviewTrack(shape);
  expect(preview.repeated).toBe(true);expect(preview.points).toHaveLength(original.length);
  for(const [index,point]of preview.points.entries()){
    expect(point.distance).toBe(original[index]!.distance);expect(point.x).toBe(original[index]!.x);
    expect(point.y-original[index]!.y).toBeCloseTo(60*point.distance/shape.distance);
  }
  expect(trackSection(preview.points,2000,2500)).not.toBe(trackSection(original,2000,2500));
  expect(coursePreviewTrack(shape,false)).toEqual({points:original,repeated:false});
});
it('leaves single circuits, straight courses, invalid shapes and isolated crossings unchanged',()=>{
  const circle:CourseShape={distance:1600,points:Array.from({length:1001},(_,index)=>[100*Math.cos(index/1000*Math.PI*2),100*Math.sin(index/1000*Math.PI*2)])};
  const straight:CourseShape={distance:1000,points:[[0,0],[100,0],[200,0]]};
  const crossing:CourseShape={distance:1600,points:Array.from({length:1001},(_,index)=>[100*Math.sin(index/1000*Math.PI*2),100*Math.sin(index/1000*Math.PI*4)])};
  for(const shape of [circle,straight,crossing,{distance:0,points:[]}])expect(coursePreviewTrack(shape)).toEqual({points:replayTrack(shape),repeated:false});
});
