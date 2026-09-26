import {expect,it} from 'vitest';
import {replayTrack,trackPointAtDistance,fitTrackCamera,followTrackCamera,placeTrackLabels,trackBasis,trackUnitsPerMetre} from './replay-track';

it('maps capture distances onto the course without wrapping the finish',()=>{
  const track=replayTrack({distance:100,points:[[0,0],[40,20],[80,0]]});
  const midpoint=trackPointAtDistance(track,25);
  expect(midpoint.x).toBeCloseTo((track[0]!.x+track[1]!.x)/2);
  expect(midpoint.y).toBeCloseTo((track[0]!.y+track[1]!.y)/2);
  expect(trackPointAtDistance(track,-10)).toEqual(track[0]);
  expect(trackPointAtDistance(track,150)).toEqual(track[2]);
  expect(replayTrack({distance:100,points:[[NaN,0],[1,1]]})).toEqual([]);
});

it('keeps the entire inspected bend visible while easing or seeking, clear of portrait labels',()=>{
  const bend=[{x:400,y:170,distance:0},{x:520,y:40,distance:40},{x:640,y:170,distance:80}];
  for(const width of [300,1100]){
    const height=228,top=96;
    const target=fitTrackCamera(bend,width,height,top);
    for(const camera of [target,fitTrackCamera(bend,width,height,top,{x:-400,y:1000,scale:64})]){
      for(const p of bend){
        const x=(p.x-camera.x)*camera.scale+width/2;
        const y=(p.y-camera.y)*camera.scale+(height+top)/2;
        expect(x).toBeGreaterThanOrEqual(24-1e-6);expect(x).toBeLessThanOrEqual(width-24+1e-6);
        expect(y).toBeGreaterThanOrEqual(top+20-1e-6);expect(y).toBeLessThanOrEqual(height-20+1e-6);
      }
    }
  }
  expect(fitTrackCamera([{x:20,y:20,distance:0}],300,186,54).scale).toBeGreaterThan(0);
});

it('keeps follow zoom stable when the course turns',()=>{
  const points=[{x:0,y:0,distance:0},{x:40,y:0,distance:40},{x:40,y:40,distance:80},{x:80,y:40,distance:120}];
  const straight=followTrackCamera(points,{min:0,max:40},1100,240);
  const corner=followTrackCamera(points,{min:20,max:60},1100,240);
  expect(corner.scale).toBe(straight.scale);
  expect(followTrackCamera(points,{min:20,max:60},1100,240,1.2).scale).toBeGreaterThan(corner.scale);
});

it('fans portraits in course order on each side so overtakes do not create arbitrary crossed lines',()=>{
  const anchors=[{index:0,distance:124},{index:1,distance:120},{index:2,distance:112},{index:3,distance:115},{index:4,distance:121},{index:5,distance:114}];
  const labels=placeTrackLabels(anchors,15);
  for(const side of [-1,1]){
    const group=labels.filter(l=>l.side===side);
    expect(group.map(l=>l.index)).toEqual(anchors.filter(a=>(a.index%2?1:-1)===side).sort((a,b)=>a.distance-b.distance).map(a=>a.index));
    for(let i=1;i<group.length;i++)expect(group[i]!.distance-group[i-1]!.distance).toBeGreaterThanOrEqual(15-1e-9);
  }
  const moved=placeTrackLabels(anchors.map(a=>({...a,distance:a.distance+.2})),15);
  moved.forEach((p,i)=>expect(p.distance-labels[i]!.distance).toBeCloseTo(.2));
});

it('offsets captured lanes outward from the inner rail on left and right courses',()=>{
  const points=[{x:0,y:0,distance:0},{x:100,y:0,distance:100}];
  expect(trackUnitsPerMetre(points)).toBe(1);
  expect(trackBasis(points,50,1)).toMatchObject({x:50,y:0,nx:0,ny:-1});
  expect(trackBasis(points,50,2)).toMatchObject({x:50,y:0,ny:1});
  const p=trackBasis(points,50,1);
  expect(p.y+p.ny*4*trackUnitsPerMetre(points)).toBe(-4);
});
