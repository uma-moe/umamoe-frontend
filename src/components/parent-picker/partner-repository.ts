import { appHttp } from '@/services/http/app-http';
import { getAuthToken } from '@/services/auth/auth-token';
import { normalizeInheritanceSearch, type ApiInheritanceRecord } from '@/lib/inheritance/inheritance-search';
import { inheritanceParent, type SelectableParent } from '@/lib/veterans/parent-picker';

interface PartnerRecord extends ApiInheritanceRecord { id?: number; account_id: string; trainer_name?: string | null; label?: string | null; }
interface LookupResponse { task_id: number | null; will_persist: boolean; result?: { account_id: string; trainer_name?: string | null; inheritance: PartnerRecord | null } | null; }
export type PartnerPhase = 'queued' | 'pending' | 'processing';
function parentFromPartner(value: PartnerRecord): SelectableParent {
  const record = normalizeInheritanceSearch({ items: [{ account_id: value.account_id, trainer_name: value.trainer_name ?? '', inheritance: { ...value, inheritance_id: value.id ?? value.inheritance_id ?? 0 } }], total: 1, page: 0, limit: 1, total_pages: 1 }).records[0];
  if (!record?.mainParentId) throw new Error('The partner response contains no parent.');
  return { ...inheritanceParent(record, 'partner'), name: value.label || undefined };
}

/** Consumes fetch streams through the same auth/proof/cancellation pipeline as JSON requests. */
export async function readPartnerStream(response: Response, onphase: (phase: PartnerPhase) => void): Promise<PartnerRecord | null> {
  if (!response.body) throw new Error('Partner lookup returned no event stream.');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
  function consume(block: string): { completed: true; value: PartnerRecord | null } | undefined {
    const lines = block.split(/\r?\n/); const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    if (!event || !['pending', 'processing', 'completed', 'failed', 'timeout'].includes(event)) return;
    const json = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    const data = (json ? JSON.parse(json) : {}) as { inheritance?: PartnerRecord | null; error?: string };
    if (event === 'pending' || event === 'processing') onphase(event);
    if (event === 'completed') return { completed: true, value: data.inheritance ?? null };
    if (event === 'failed') throw new Error(data.error || 'Partner lookup failed. Please try again.');
    if (event === 'timeout') throw new DOMException('The worker did not respond in time. Please try again.', 'TimeoutError');
    return undefined;
  }
  try {
    while (true) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000) throw new Error('Partner lookup response is too large.');
      if (done) buffer += '\n\n';
      const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? '';
      for (const block of blocks) { const result = consume(block); if (result?.completed) return result.value; }
      if (done) throw new Error('Partner lookup disconnected before returning a result. Please retry.');
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export const partnerRepository = {
  async saved(): Promise<SelectableParent[]> { return (await appHttp.request<PartnerRecord[]>('/api/v4/partner/saved')).map(parentFromPartner); },
  async lookup(id: string, signal: AbortSignal, onphase: (phase: PartnerPhase) => void): Promise<{ parent: SelectableParent | null; willPersist: boolean }> {
    if (!/^(?:\d{9}|\d{12})$/.test(id)) throw new Error('Enter a 9-digit practice ID or 12-digit trainer ID.');
    onphase('queued');
    const created = await appHttp.request<LookupResponse>('/api/v4/partner/lookup', { method: 'POST', signal, body: { partner_id: id, label: null, require_persistence: Boolean(getAuthToken()) } });
    if (created.task_id === null) return { willPersist: created.will_persist, parent: created.result?.inheritance ? parentFromPartner({ ...created.result.inheritance, account_id: created.result.account_id, trainer_name: created.result.trainer_name }) : null };
    if (!Number.isSafeInteger(created.task_id) || created.task_id < 0) throw new Error('Partner lookup returned an invalid task.');
    const response = await appHttp.request<Response>(`/api/v4/partner/lookup/${created.task_id}/stream`, { signal, responseType: 'response', headers: { accept: 'text/event-stream' } });
    const result = await readPartnerStream(response, onphase); return { willPersist: created.will_persist, parent: result ? parentFromPartner(result) : null };
  },
  remove(parent: SelectableParent): Promise<void> {
    const id = parent.share_inheritance_id;
    return appHttp.request(`/api/v4/partner/saved/${id ? `id/${id}` : encodeURIComponent(parent.trainer_id ?? '')}`, { method: 'DELETE' });
  },
  async migrateAnonymous(): Promise<void> {
    const raw = localStorage.getItem('partner-lookups:anon'); if (!raw || !getAuthToken()) return;
    const entries: unknown = JSON.parse(raw); if (!Array.isArray(entries)) throw new Error('Saved partner history is invalid. The original entries have been kept.');
    if (entries.length) await appHttp.request('/api/v4/partner/saved/migrate', { method: 'POST', body: entries });
    if (localStorage.getItem('partner-lookups:anon') === raw) localStorage.removeItem('partner-lookups:anon');
  }
};
