import { clonePlanCollection, type CaratPlanCollection } from '@/lib/carat-planner/carat-planner';
import { plannerCollectionHash, reconcileInitialPlannerCollections, samePlannerCollection } from '@/lib/carat-planner/planner-cloud-state';
import { HttpError } from '@/services/http/http-client';
import { decodePlannerCloudState, plannerCloudRepository, type PlannerCloudStateResponse } from './planner-cloud-repository';

export type PlannerCloudStatusKind = 'local' | 'loading' | 'saving' | 'synced' | 'offline' | 'reverted';
export interface PlannerCloudStatus { kind: PlannerCloudStatusKind; loggedIn: boolean; label: string; }
export interface PlannerCloudPort {
  loadState(signal?: AbortSignal): Promise<PlannerCloudStateResponse>;
  saveState(baseRevision: number, collection: CaratPlanCollection, signal?: AbortSignal): Promise<PlannerCloudStateResponse>;
}
interface PlannerCloudMeta { userId: string; revision: number; updatedAt: string | null; verifiedHash?: string | null; }

const CLOUD_META_KEY = 'carat-planner-cloud-meta-v1';
const SAVE_DEBOUNCE_MS = 700;
const RETRY_DELAY_MS = 5000;

/** Framework-free controller preserving Angular's optimistic revision and stale-cache rules. */
export class PlannerCloudSync {
  private status: PlannerCloudStatus = {kind:'local',loggedIn:false,label:'Saved on this device'};
  private listeners = new Set<(status: PlannerCloudStatus) => void>();
  private activeUserId: string | null = null;
  private revision = 0;
  private remoteUpdatedAt: string | null = null;
  private verifiedHash: string | null = null;
  private hasVerifiedState = false;
  private pendingCollection: CaratPlanCollection | null = null;
  private pendingHash: string | null = null;
  private pendingDueAt = 0;
  private inFlightHash: string | null = null;
  private saving = false;
  private applyingRemote = false;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private request?: AbortController;

  constructor(
    private readonly getLocal: () => CaratPlanCollection,
    private readonly replaceLocal: (collection: CaratPlanCollection) => void,
    private readonly port: PlannerCloudPort = plannerCloudRepository,
    private readonly storage: Pick<Storage,'getItem'|'setItem'> = localStorage,
  ) {}

  subscribe(listener: (status: PlannerCloudStatus) => void): () => void { this.listeners.add(listener); listener(this.status); return () => this.listeners.delete(listener); }
  currentStatus(): PlannerCloudStatus { return this.status; }

  connect(userId: string | null): void {
    this.stopTimer();
    this.request?.abort();
    this.request = undefined;
    this.generation += 1;
    this.activeUserId = userId;
    this.revision = 0;
    this.remoteUpdatedAt = null;
    this.verifiedHash = null;
    this.hasVerifiedState = false;
    this.pendingCollection = null;
    this.pendingHash = null;
    this.pendingDueAt = 0;
    this.inFlightHash = null;
    this.saving = false;
    if (!userId) { this.setStatus('local',false,'Saved on this device'); return; }
    const localAtConnect = this.snapshot();
    this.setStatus('loading',true,'Loading account plans');
    void this.loadInitial(userId, localAtConnect, this.generation);
  }

  notifyLocalChange(collection = this.getLocal(), delay = SAVE_DEBOUNCE_MS): void {
    if (this.applyingRemote || !this.activeUserId || !this.hasVerifiedState) return;
    this.queueSave(clonePlanCollection(collection), delay);
  }

  dispose(): void { this.generation += 1; this.stopTimer(); this.request?.abort(); this.request=undefined; this.listeners.clear(); }

  private async loadInitial(userId: string, localAtConnect: CaratPlanCollection, generation: number): Promise<void> {
    const request = new AbortController();
    this.request = request;
    try {
      const response = await this.port.loadState(request.signal);
      if (!this.isActive(userId,generation)) return;
      this.applyInitial(userId,response,localAtConnect);
    } catch (reason) {
      if (!this.isActive(userId,generation) || request.signal.aborted) return;
      this.setStatus('offline',true,'Saved locally. Account sync will retry');
      this.timer = setTimeout(() => { this.timer=undefined; if (this.isActive(userId,generation)) this.connect(userId); }, RETRY_DELAY_MS);
    } finally { if (this.request === request) this.request=undefined; }
  }

  private applyInitial(userId: string, response: PlannerCloudStateResponse, localAtConnect: CaratPlanCollection): void {
    this.revision=Math.max(0,Number(response.revision)||0);
    this.remoteUpdatedAt=response.updated_at;
    const local=this.snapshot();
    const meta=this.loadMeta();
    const knownAccount=meta?.userId===userId;
    this.verifiedHash=response.collection ? plannerCollectionHash(response.collection) : null;
    this.hasVerifiedState=true;
    this.storeMeta(userId);
    if (!response.collection) { this.queueSave(local,0); return; }
    const merged=reconcileInitialPlannerCollections(localAtConnect,local,response.collection,response.updated_at,knownAccount);
    const startHash=plannerCollectionHash(localAtConnect);
    const currentHash=plannerCollectionHash(local);
    const remoteHash=plannerCollectionHash(response.collection);
    const reverted=knownAccount&&startHash!==remoteHash&&currentHash!==startHash&&currentHash!==remoteHash;
    if (!samePlannerCollection(merged,local)) this.applyRemote(merged);
    if (response.needs_compaction) this.verifiedHash=null;
    if (reverted) {
      this.setStatus('reverted',true,'Changes were reverted because this device copy was out of date. Your account plans are now current.');
      if (response.needs_compaction) this.queueSave(this.snapshot(),0);
      return;
    }
    this.queueSave(this.snapshot(),0);
  }

  private queueSave(collection: CaratPlanCollection, delay=SAVE_DEBOUNCE_MS): void {
    if (!this.activeUserId) return;
    const hash=plannerCollectionHash(collection);
    if (this.saving) { if (hash===this.inFlightHash) this.clearPending(); else this.setPending(collection,hash,delay); return; }
    if (this.hasVerifiedState&&hash===this.verifiedHash) { this.clearPending(); this.setStatus('synced',true,'Saved to your account'); return; }
    this.setPending(collection,hash,delay);
    this.schedule();
  }

  private setPending(collection:CaratPlanCollection,hash:string,delay:number):void { const changed=hash!==this.pendingHash; this.pendingCollection=collection; this.pendingHash=hash; if(changed||this.pendingDueAt===0) this.pendingDueAt=Date.now()+Math.max(0,delay); }
  private schedule():void { if(this.saving||!this.pendingCollection||!this.pendingHash||!this.activeUserId)return; this.stopTimer(); this.timer=setTimeout(() => {this.timer=undefined;void this.flush();},Math.max(0,this.pendingDueAt-Date.now())); }
  private clearPending():void { this.pendingCollection=null;this.pendingHash=null;this.pendingDueAt=0;this.stopTimer(); }

  private async flush():Promise<void> {
    const userId=this.activeUserId; const collection=this.pendingCollection; const submittedHash=this.pendingHash; const generation=this.generation;
    if(!userId||!collection||!submittedHash||this.saving)return;
    if(this.hasVerifiedState&&submittedHash===this.verifiedHash){this.clearPending();this.setStatus('synced',true,'Saved to your account');return;}
    this.pendingCollection=null;this.pendingHash=null;this.pendingDueAt=0;this.saving=true;this.inFlightHash=submittedHash;this.setStatus('saving',true,'Saving to your account');
    try {
      const response=await this.port.saveState(this.revision,collection);
      if(!this.isActive(userId,generation))return;
      this.saving=false;this.inFlightHash=null;this.revision=response.revision;this.remoteUpdatedAt=response.updated_at;this.verifiedHash=submittedHash;this.hasVerifiedState=true;this.storeMeta(userId);
      if(this.pendingCollection&&this.pendingHash!==this.verifiedHash)this.schedule();else{this.clearPending();this.setStatus('synced',true,'Saved to your account');}
    } catch(reason) {
      if(!this.isActive(userId,generation))return;
      this.saving=false;this.inFlightHash=null;
      if(reason instanceof HttpError&&reason.status===409){try{this.resolveConflict(decodePlannerCloudState(reason.body));return;}catch{}}
      const latest=this.snapshot();this.clearPending();this.setStatus('offline',true,'Saved locally. Account sync will retry');this.queueSave(latest,RETRY_DELAY_MS);
    }
  }

  private resolveConflict(remote:PlannerCloudStateResponse):void {
    this.clearPending();this.revision=Math.max(0,Number(remote.revision)||0);this.remoteUpdatedAt=remote.updated_at;this.verifiedHash=remote.collection?plannerCollectionHash(remote.collection):null;this.hasVerifiedState=true;if(this.activeUserId)this.storeMeta(this.activeUserId);
    const local=this.snapshot();if(!remote.collection){this.queueSave(local,0);return;}if(plannerCollectionHash(local)===plannerCollectionHash(remote.collection)){this.setStatus('synced',true,'Saved to your account');return;}
    this.applyRemote(remote.collection);this.setStatus('reverted',true,'Changes were reverted because your account changed elsewhere. Your local plans are now current.');
  }

  private applyRemote(collection:CaratPlanCollection):void { this.applyingRemote=true;try{this.replaceLocal(clonePlanCollection(collection));}finally{this.applyingRemote=false;} }
  private snapshot():CaratPlanCollection{return clonePlanCollection(this.getLocal());}
  private isActive(userId:string,generation:number):boolean{return this.activeUserId===userId&&this.generation===generation;}
  private setStatus(kind:PlannerCloudStatusKind,loggedIn:boolean,label:string):void{this.status={kind,loggedIn,label};for(const listener of this.listeners)listener(this.status);}
  private stopTimer():void{if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
  private loadMeta():PlannerCloudMeta|null{try{const raw=this.storage.getItem(CLOUD_META_KEY);if(!raw)return null;const value=JSON.parse(raw) as Partial<PlannerCloudMeta>;return typeof value.userId==='string'&&Number.isFinite(value.revision)?{userId:value.userId,revision:Math.max(0,Number(value.revision)),updatedAt:typeof value.updatedAt==='string'?value.updatedAt:null,...(Object.prototype.hasOwnProperty.call(value,'verifiedHash')?{verifiedHash:typeof value.verifiedHash==='string'?value.verifiedHash:null}:{})}:null;}catch{return null;}}
  private storeMeta(userId:string):void{try{this.storage.setItem(CLOUD_META_KEY,JSON.stringify({userId,revision:this.revision,updatedAt:this.remoteUpdatedAt,verifiedHash:this.verifiedHash} satisfies PlannerCloudMeta));}catch{}}
}
