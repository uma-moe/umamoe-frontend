import type { CourseShape } from './replay-course';

// Adapted from Torena Hub's track-path.ts and canvasMath.ts for our sampled
// course geometry and SVG viewport. Playback continues to use captured frames.
// Original Torena code copyright (c) 2026 jalbarrang; used for the uma.moe merger.
export type TrackPoint = { x:number; y:number; distance:number };
export const TRACK_WIDTH=1000,TRACK_HEIGHT=340;

export function replayTrack(shape:CourseShape):TrackPoint[] {
  if(shape.points.length<2||!Number.isFinite(shape.distance)||shape.distance<=0)return [];
  if(shape.points.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])))return [];
  const xs=shape.points.map(p=>-p[0]),ys=shape.points.map(p=>p[1]);
  const minX=Math.min(...xs),minY=Math.min(...ys);
  const width=Math.max(1,Math.max(...xs)-minX),height=Math.max(1,Math.max(...ys)-minY);
  const scale=Math.min((TRACK_WIDTH-100)/width,(TRACK_HEIGHT-80)/height);
  return shape.points.map((_,i)=>({
    x:(TRACK_WIDTH-width*scale)/2+(xs[i]!-minX)*scale,
    y:(TRACK_HEIGHT-height*scale)/2+(ys[i]!-minY)*scale,
    distance:i*shape.distance/(shape.points.length-1)
  }));
}

export function trackPointAtDistance(points:TrackPoint[],distance:number):TrackPoint {
  if(!points.length)return {x:TRACK_WIDTH/2,y:TRACK_HEIGHT/2,distance:0};
  const d=Math.max(0,Math.min(points.at(-1)!.distance,Number.isFinite(distance)?distance:0));
  let low=0,high=points.length-1;
  while(low+1<high){const middle=Math.floor((low+high)/2);if(points[middle]!.distance<=d)low=middle;else high=middle;}
  const a=points[low]!,b=points[high]!,t=b.distance>a.distance?(d-a.distance)/(b.distance-a.distance):0;
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,distance:d};
}

export function trackSection(points:TrackPoint[],start:number,end:number):string {
  if(!points.length)return '';
  return [trackPointAtDistance(points,start),...points.filter(p=>p.distance>start&&p.distance<end),trackPointAtDistance(points,end)]
    .map(p=>p.x+','+p.y).join(' ');
}

export type TrackCamera = {x:number;y:number;scale:number};

// Fit the inspected section, including bends between its endpoints. During
// interpolation, constrain the camera so a fast seek cannot lose that section.
export function fitTrackCamera(points:TrackPoint[],width:number,height:number,top:number,current?:TrackCamera):TrackCamera {
  if(!points.length)return {x:TRACK_WIDTH/2,y:TRACK_HEIGHT/2,scale:1};
  const left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
  const start=Math.min(...points.map(p=>p.y)),end=Math.max(...points.map(p=>p.y));
  const halfWidth=Math.max(1,width/2-24),halfHeight=Math.max(1,(height-top)/2-20);
  const fit=Math.min(32,halfWidth*2/Math.max(1,right-left),halfHeight*2/Math.max(1,end-start));
  const scale=current?Math.min(current.scale,fit):fit*.8;
  return {
    x:Math.max(right-halfWidth/scale,Math.min(left+halfWidth/scale,current?.x??(left+right)/2)),
    y:Math.max(end-halfHeight/scale,Math.min(start+halfHeight/scale,current?.y??(start+end)/2)),
    scale
  };
}

export function trackUnitsPerMetre(points:TrackPoint[]):number {
  return points.reduce((scale,p,i)=>{
    const previous=points[i-1];
    return previous&&p.distance>previous.distance?Math.max(scale,Math.hypot(p.x-previous.x,p.y-previous.y)/(p.distance-previous.distance)):scale;
  },0);
}

// Positive lane offsets run from the inner rail toward the outside of the course.
export function trackBasis(points:TrackPoint[],distance:number,turn=1) {
  const point=trackPointAtDistance(points,distance),before=trackPointAtDistance(points,distance-4),after=trackPointAtDistance(points,distance+4);
  const dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy)||1,sign=turn===2?1:-1;
  return {...point,tx:dx/length,ty:dy/length,nx:-sign*dy/length,ny:sign*dx/length};
}

// Keep the same metres-to-pixels scale through straights and corners.
export function followTrackCamera(points:TrackPoint[],viewport:{min:number;max:number},width:number,height:number,zoom=1):TrackCamera {
  const centre=trackPointAtDistance(points,(viewport.min+viewport.max)/2);
  const unitsPerMetre=trackUnitsPerMetre(points);
  return {x:centre.x,y:centre.y,scale:Math.min(32,Math.max(1,Math.min(width,height)-64)*zoom/Math.max(1,(viewport.max-viewport.min)*unitsPerMetre))};
}

// Fan portraits along course distance, preserving their order on either side.
// Sorting in course space avoids the x-order reversal at a bend.
export function placeTrackLabels(anchors:{index:number;distance:number}[],gap:number) {
  return [-1,1].flatMap(side=>{
    const group=anchors.filter(a=>(a.index%2?1:-1)===side).sort((a,b)=>a.distance-b.distance||a.index-b.index);
    const positions:number[]=[];
    for(const a of group)positions.push(Math.max(a.distance,(positions.at(-1)??-Infinity)+gap));
    const shift=positions.reduce((sum,p,i)=>sum+p-group[i]!.distance,0)/Math.max(1,group.length);
    return group.map((a,i)=>({...a,distance:positions[i]!-shift,side}));
  });
}
