import type { CaratPlan, CaratPlanCollection } from '@/lib/carat-planner/carat-planner';
import {
  compactPlannerCollectionForCloud,
  compactPlannerPlanForCloudShare,
  expandPlannerCollectionFromCloud,
  expandPlannerPlanFromCloudShare,
  isCompactPlannerCollectionForCloud,
} from '@/lib/carat-planner/planner-cloud-codec';
import { appHttp } from '@/services/http/app-http';
import { HttpError } from '@/services/http/http-client';

export interface PlannerCloudStateResponse {
  revision: number;
  collection: CaratPlanCollection | null;
  updated_at: string | null;
  needs_compaction: boolean;
}

export interface PlannerShareResponse {
  share_id: string;
  plan_id: string;
  plan_name: string;
  plan: CaratPlan;
  updated_at: string;
}

interface WireStateResponse { revision: number; collection: unknown | null; updated_at?: unknown; }
interface WireShareResponse { share_id: string; plan_id: string; plan_name: string; plan?: unknown; collection?: unknown; updated_at: string; }

export const plannerCloudRepository = {
  async loadState(signal?: AbortSignal): Promise<PlannerCloudStateResponse> {
    return decodePlannerCloudState(await appHttp.request<WireStateResponse>('/api/carat-planner/state', { signal }));
  },
  async saveState(baseRevision: number, collection: CaratPlanCollection, signal?: AbortSignal): Promise<PlannerCloudStateResponse> {
    return decodePlannerCloudState(await appHttp.request<WireStateResponse>('/api/carat-planner/state', { method:'PUT',body:{base_revision:baseRevision,collection:compactPlannerCollectionForCloud(collection)},signal }));
  },
  async createShare(plan: CaratPlan): Promise<PlannerShareResponse> {
    let response: WireShareResponse;
    try {
      response = await appHttp.request<WireShareResponse>('/api/carat-planner/shares', { method:'POST',body:{plan_id:plan.id,plan_name:plan.name} });
    } catch (reason) {
      if (!(reason instanceof HttpError) || reason.status !== 400 && reason.status !== 422) throw reason;
      response = await appHttp.request<WireShareResponse>('/api/carat-planner/shares', { method:'POST',body:{plan:compactPlannerPlanForCloudShare(plan)} });
    }
    return decodeShare(response, plan);
  },
  async getSharedPlan(shareId: string): Promise<PlannerShareResponse> {
    return decodeShare(await appHttp.request<WireShareResponse>(`/api/carat-planner/shared/${encodeURIComponent(shareId)}`));
  },
  async deleteShare(planId: string): Promise<void> {
    await appHttp.request(`/api/carat-planner/shares/${encodeURIComponent(planId)}`, { method:'DELETE' });
  },
};

export function decodePlannerCloudState(value: unknown): PlannerCloudStateResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid planner cloud response.');
  const item = value as Partial<WireStateResponse>;
  if (!Number.isFinite(Number(item.revision)) || !(item.collection === null || typeof item.collection === 'object')) throw new Error('Invalid planner cloud response.');
  const collection = item.collection === null ? null : expandPlannerCollectionFromCloud(item.collection);
  if (item.collection !== null && !collection) throw new Error('Invalid planner cloud collection.');
  return {revision:Math.max(0,Number(item.revision)||0),collection,updated_at:typeof item.updated_at === 'string' ? item.updated_at : null,needs_compaction:item.collection !== null&&!isCompactPlannerCollectionForCloud(item.collection)};
}

function decodeShare(value: WireShareResponse, fallbackPlan?: CaratPlan): PlannerShareResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid planner share response.');
  const collection = expandPlannerCollectionFromCloud(value.collection);
  const plan = collection?.plans.find(plan => plan.id === value.plan_id) ?? collection?.plans[0] ?? expandPlannerPlanFromCloudShare(value.plan) ?? fallbackPlan;
  if (!plan) throw new Error('Invalid shared planner data.');
  if (typeof value.share_id !== 'string' || typeof value.plan_id !== 'string' || typeof value.plan_name !== 'string' || typeof value.updated_at !== 'string') throw new Error('Invalid planner share response.');
  return {share_id:value.share_id,plan_id:value.plan_id,plan_name:value.plan_name,updated_at:value.updated_at,plan};
}
