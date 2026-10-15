import type {CourseShape} from '@/pages/competitive/race-analysis/replay/replay-course';
import {replayTrack,type TrackPoint} from '@/pages/competitive/race-analysis/replay/replay-track';

/** Separate repeated passes in the setup diagram only; retain every race distance. */
export function coursePreviewTrack(shape:CourseShape,separate=true):{points:TrackPoint[];repeated:boolean}{
  const points=replayTrack(shape);
  if(!separate||points.length<3)return {points,repeated:false};
  const cells=new Map<string,{point:TrackPoint;tx:number;ty:number}[]>();
  let repeats=0;
  for(let index=0;index<points.length;index++){
    const point=points[index]!,before=points[Math.max(0,index-1)]!,after=points[Math.min(points.length-1,index+1)]!;
    const length=Math.hypot(after.x-before.x,after.y-before.y)||1,tx=(after.x-before.x)/length,ty=(after.y-before.y)/length;
    const x=Math.floor(point.x/4),y=Math.floor(point.y/4);
    let repeated=false;
    for(let dx=-1;dx<=1&&!repeated;dx++)for(let dy=-1;dy<=1&&!repeated;dy++){
      repeated=cells.get((x+dx)+','+(y+dy))?.some(previous=>point.distance-previous.point.distance>shape.distance/4
        &&Math.hypot(point.x-previous.point.x,point.y-previous.point.y)<3
        &&tx*previous.tx+ty*previous.ty>.98)??false;
    }
    if(repeated)repeats++;
    const key=x+','+y,bucket=cells.get(key)??[];bucket.push({point,tx,ty});cells.set(key,bucket);
  }
  // Require a repeated stretch, rather than an isolated crossing or the closing point.
  const repeated=repeats>=8;
  return {points:repeated?points.map(point=>({...point,y:point.y+60*point.distance/shape.distance})):points,repeated};
}
