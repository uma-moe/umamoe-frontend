import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlan, type CaratPlanCollection } from '@/lib/carat-planner/carat-planner';
import { PlannerCloudSync, type PlannerCloudPort, type PlannerCloudStatus } from './planner-cloud-sync';

function collection(jewels = 0, updatedAt = '2026-01-01T00:00:00.000Z'): CaratPlanCollection {
  const plan=createPlan();plan.id='plan-1';plan.createdAt='2026-01-01T00:00:00.000Z';plan.updatedAt=updatedAt;plan.balances.freeJewels=jewels;
  return {version:1,activePlanId:plan.id,plans:[plan]};
}
function memoryStorage(seed?:Record<string,string>):Pick<Storage,'getItem'|'setItem'>{const values=new Map(Object.entries(seed??{}));return{getItem:(key)=>values.get(key)??null,setItem:(key,value)=>void values.set(key,value)};}

afterEach(() => vi.useRealTimers());

describe('planner account synchronization', () => {
  it('uploads the local collection when an account has no server state', async () => {
    vi.useFakeTimers();
    let local=collection(1200);const saved:CaratPlanCollection[]=[];const statuses:PlannerCloudStatus[]=[];
    const port:PlannerCloudPort={loadState:async()=>({revision:0,collection:null,updated_at:null,needs_compaction:false}),saveState:async(_revision,value)=>{saved.push(value);return{revision:1,collection:value,updated_at:'2026-01-02T00:00:00.000Z',needs_compaction:false};}};
    const sync=new PlannerCloudSync(()=>local,(value)=>local=value,port,memoryStorage());sync.subscribe((status)=>statuses.push(status));sync.connect('user-1');
    await vi.runAllTimersAsync();
    expect(saved).toHaveLength(1);expect(saved[0]!.plans[0]!.balances.freeJewels).toBe(1200);expect(statuses.at(-1)?.kind).toBe('synced');sync.dispose();
  });

  it('replaces a stale known-account cache and preserves edits only when the cache matched remote', async () => {
    vi.useFakeTimers();
    const meta=memoryStorage({'carat-planner-cloud-meta-v1':JSON.stringify({userId:'user-1',revision:2,updatedAt:null})});
    let local=collection(10);const remote=collection(99,'2026-02-01T00:00:00.000Z');let resolveLoad!:(value:any)=>void;
    const port:PlannerCloudPort={loadState:()=>new Promise((resolve)=>resolveLoad=resolve),saveState:async(_revision,value)=>({revision:3,collection:value,updated_at:null,needs_compaction:false})};
    const sync=new PlannerCloudSync(()=>local,(value)=>local=value,port,meta);sync.connect('user-1');local=collection(11);resolveLoad({revision:2,collection:remote,updated_at:'2026-02-01T00:00:00.000Z',needs_compaction:false});
    await Promise.resolve();await vi.runAllTimersAsync();
    expect(local.plans[0]!.balances.freeJewels).toBe(99);expect(sync.currentStatus().kind).toBe('reverted');sync.dispose();
  });

  it('debounces subsequent local edits through one revisioned save', async () => {
    vi.useFakeTimers();
    let local=collection(5);const revisions:number[]=[];const port:PlannerCloudPort={loadState:async()=>({revision:4,collection:structuredClone(local),updated_at:null,needs_compaction:false}),saveState:async(revision,value)=>{revisions.push(revision);return{revision:revision+1,collection:value,updated_at:null,needs_compaction:false};}};
    const sync=new PlannerCloudSync(()=>local,(value)=>local=value,port,memoryStorage());sync.connect('user-2');await Promise.resolve();await vi.runAllTimersAsync();
    local=collection(6);sync.notifyLocalChange(local);local=collection(7);sync.notifyLocalChange(local);await vi.advanceTimersByTimeAsync(700);
    expect(revisions).toEqual([4]);expect(sync.currentStatus().kind).toBe('synced');sync.dispose();
  });
});
