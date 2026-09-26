import {it,expect} from 'vitest';
import {fieldRows,activationBins,centralActivationWindow,type SkillDetail} from './cm-exploration';
import type {Pair} from './hakuraku-types';

it('groups outfits without merging distinct-player counts across roles',()=>{
  const pair=(card:number,style:number,owners:number,pop:number)=>({card,style,owners,pop,name:'Uma '+card,outfit:'Original'} as Pair);
  const pairs=[pair(1,1,25,.2),pair(1,6,30,.1),pair(2,2,12,.4)];
  const rows=fieldRows(pairs,20,' original ');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.share).toBeCloseTo(.3);
  expect([...rows[0]!.cells.values()].map(p=>p.owners)).toEqual([25,30]);
  expect(fieldRows(pairs,1,'2')[0]!.card).toBe(2);
  expect(fieldRows(pairs,1,'')[0]!.card).toBe(2);
});


it('combines activation events, filters styles and computes bucket-bounded percentile windows',()=>{
  const detail:SkillDetail={snapshotId:'test',skillId:1,bucketCount:100,courseDistance:2000,styles:{
    Nige:[[-1,1,0,0,0],[20,3,0,0,0],[80,1,0,0,0],[100,90,0,0,0],[-2,90,0,0,0],[2.5,90,0,0,0],[40,-1,0,0,0]],
    Sashi:[[20,5,0,0,0]]
  }};
  const all=activationBins(detail);
  expect(all.reduce((a,b)=>a+b,0)).toBe(10);
  expect(all[0]).toBe(1);expect(all[20]).toBe(8);
  expect(centralActivationWindow(all,2000)).toEqual([0,420]);
  expect(activationBins(detail,'1').reduce((a,b)=>a+b,0)).toBe(5);
  expect(centralActivationWindow(activationBins(detail,'3'),2000)).toEqual([400,420]);
  expect(centralActivationWindow(activationBins(detail,'2'),2000)).toBeUndefined();
});
