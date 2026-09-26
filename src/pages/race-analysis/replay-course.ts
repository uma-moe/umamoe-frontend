import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
import { appHttp } from '@/services/http/app-http';
import { resourceRepository } from '@/lib/catalog/resource-repository';

export type Course = { raceTrackId:number; distance:number; surface:number; turn:number; laneMax?:number; corners:{start:number;length:number}[]; straights:{start:number;end:number}[]; slopes:{start:number;length:number;slope:number}[] };
export type CourseShape = {distance:number;points:[number,number][]};
export type CourseData = { courses:Record<string,Course>; names:Record<number,string> };
type CourseResource = Omit<Course,'raceTrackId'> & {course_id:number;race_track_id:number;lane_max?:number};
type GeometryResource = {course_id:number;course_distance:number;position_x:number[];position_z:number[]};

// Track labels; course dimensions and geometry come from the resource manifest.
const names:CourseData['names'] = {10001:'Sapporo',10002:'Hakodate',10003:'Niigata',10004:'Fukushima',10005:'Nakayama',10006:'Tokyo',10007:'Chukyo',10008:'Kyoto',10009:'Hanshin',10010:'Kokura',10101:'Oi',10103:'Kawasaki',10104:'Funabashi',10105:'Morioka',10201:'Longchamp'};

export function loadReplayCourses():Promise<CourseData> {
  return resourceRepository.load('simulator_courses',false,value=>{
    const data=value as {courses:CourseResource[]};
    if(!Array.isArray(data?.courses))throw new Error('Course metadata is invalid.');
    const courses:CourseData['courses']={};
    for(const course of data.courses){
      if(!course||!Number.isSafeInteger(course.course_id)||!Number.isFinite(course.distance)||course.distance<=0||!Number.isSafeInteger(course.race_track_id)
        ||![course.corners,course.straights,course.slopes].every(Array.isArray))throw new Error('Course metadata is invalid.');
      courses[course.course_id]={...course,raceTrackId:course.race_track_id,laneMax:course.lane_max};
    }
    return {courses,names};
  });
}

export function loadReplayGeometry():Promise<Record<string,CourseShape>> {
  return resourceRepository.load('simulator_course_geometry',false,value=>{
    const data=value as {courses:GeometryResource[]};
    if(!Array.isArray(data?.courses))throw new Error('Course geometry data is invalid.');
    const shapes:Record<string,CourseShape>={};
    for(const course of data.courses){
      if(!course||!Number.isSafeInteger(course.course_id)||!Number.isFinite(course.course_distance)||course.course_distance<=0
        ||!Array.isArray(course.position_x)||!Array.isArray(course.position_z)||course.position_x.length!==1001||course.position_z.length!==1001
        ||!course.position_x.every(Number.isFinite)||!course.position_z.every(Number.isFinite))throw new Error('Course geometry data is invalid.');
      shapes[course.course_id]={distance:course.course_distance,points:course.position_x.map((x,i)=>[x,course.position_z[i]!])};
    }
    return shapes;
  });
}

// Exact IDs only: tracks of the same length are not interchangeable.
export async function resolveReplayCourses(captures:ParsedRaceCapture[]):Promise<void> {
  const ids=[...new Set(captures.filter(c=>!c.courseId).map(c=>c.raceInstanceId)
    .filter((id):id is number=>Number.isSafeInteger(id)&&id!>0&&id!<=0xffffffff))];
  if(!ids.length)return;
  const known=new Map<number,number>();
  try {
    const data=await resourceRepository.load<{races:{race_instance_id:number;course_set_id:number}[]}>('room_match_races');
    for(const race of data.races??[])if(Number.isSafeInteger(race.race_instance_id)&&Number.isSafeInteger(race.course_set_id))known.set(race.race_instance_id,race.course_set_id);
  } catch { /* The master lookup also covers captures outside Room Matches. */ }
  const missing=ids.filter(id=>!known.has(id));
  if(missing.length){
    try {
      const data=await appHttp.request<{rows:[number,number][]}>('/resources/current/sql',{browserProof:true,query:{
        sql:'SELECT ri.id, r.course_set FROM race_instance ri JOIN race r ON r.id = ri.race_id WHERE ri.id IN ('+missing.join(',')+')'
      }});
      for(const [id,course] of data.rows??[])if(missing.includes(id)&&Number.isSafeInteger(course)&&course>0)known.set(id,course);
    } catch { /* Keep the capture usable; an unresolved course can be selected manually. */ }
  }
  for(const capture of captures)if(!capture.courseId&&capture.raceInstanceId)capture.courseId=known.get(capture.raceInstanceId);
}

export function courseSegments(course:Course|undefined) {
  if(!course)return [];
  const lastStraight=Math.max(...course.straights.map(s=>s.start)),lastCorner=Math.max(...course.corners.map(s=>s.start));
  return [...course.straights.map(s=>({start:s.start,end:s.end,label:s.start===lastStraight?'Final straight':'Straight',color:s.start===lastStraight?'#419168':'#64918c'})),...course.corners.map(s=>({start:s.start,end:s.start+s.length,label:s.start===lastCorner?'Final corner':'Corner',color:s.start===lastCorner?'#bb9148':'#7b7ea8'}))].sort((a,b)=>a.start-b.start);
}
export function courseLandmarks(course:Course|undefined) {
  if(!course)return [];
  const hills=course.slopes.filter(s=>s.slope!==0);
  return [
    ...courseSegments(course).map(s=>({distance:s.start,label:s.label,color:s.color})),
    ...hills.flatMap(s=>[
      {distance:s.start,label:(s.slope>0?'Uphill +':'Downhill ')+(s.slope/10000).toFixed(1)+'%',color:s.slope>0?'#bd7581':'#719bdd'},
      ...hills.some(next=>next.start===s.start+s.length)?[]:[{distance:s.start+s.length,label:'Level ground',color:'#9ca5b4'}]
    ]),
    {distance:course.distance/6,label:'Mid race',color:'#69b7ee'},
    {distance:course.distance*2/3,label:'Late race',color:'#69b7ee'},
    {distance:course.distance,label:'Finish',color:'#e5e7eb'}
  ].filter(m=>m.distance>=0&&m.distance<=course.distance).sort((a,b)=>a.distance-b.distance);
}
