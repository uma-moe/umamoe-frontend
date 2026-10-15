import { appHttp } from '@/services/http/app-http';
import { getAuthToken } from '@/services/auth/auth-token';
import {
  normalizeInheritanceSearch,
  type ApiInheritanceRecord
} from '@/lib/inheritance/search/inheritance-search';
import { inheritanceParent, type SelectableParent } from '@/lib/veterans/parents/parent-picker';

interface PartnerRecord extends ApiInheritanceRecord {
  id?: number;
  account_id: string;
  trainer_name?: string | null;
  label?: string | null;
}

interface LookupResponse {
  task_id: number | null;
  will_persist: boolean;
  result?: {
    account_id: string;
    trainer_name?: string | null;
    inheritance: PartnerRecord | null;
  } | null;
}

export type PartnerPhase = 'queued' | 'pending' | 'processing';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPartnerRecord(value: unknown): value is PartnerRecord {
  if (!isRecord(value) || typeof value.account_id !== 'string') return false;
  const requiredNumbers = [
    'inheritance_id',
    'main_parent_id',
    'parent_left_id',
    'parent_right_id',
    'parent_rank',
    'parent_rarity'
  ];

  if (
    !requiredNumbers.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
  )
    return false;
  const optionalNumbers = [
    'id',
    'main_blue_factors',
    'main_pink_factors',
    'main_green_factors',
    'left_blue_factors',
    'left_pink_factors',
    'left_green_factors',
    'right_blue_factors',
    'right_pink_factors',
    'right_green_factors',
    'win_count',
    'white_count',
    'affinity_score'
  ];

  if (
    !optionalNumbers.every(
      (key) =>
        value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key]))
    )
  )
    return false;
  if (
    value.scenario_id != null &&
    (typeof value.scenario_id !== 'number' || !Number.isFinite(value.scenario_id))
  )
    return false;
  return ['trainer_name', 'label'].every(
    (key) => value[key] == null || typeof value[key] === 'string'
  );
}

function parsePartnerRecord(value: unknown): PartnerRecord {
  if (!isRecord(value)) throw new Error('Partner lookup returned invalid inheritance data.');
  const normalized = { ...value, inheritance_id: value.inheritance_id ?? value.id ?? 0 };

  if (!isPartnerRecord(normalized))
    throw new Error('Partner lookup returned invalid inheritance data.');
  return normalized;
}

function parseLookupResponse(value: unknown): LookupResponse {
  if (!isRecord(value) || typeof value.will_persist !== 'boolean')
    throw new Error('Partner lookup returned an invalid response.');
  const taskId = value.task_id;
  if (
    taskId !== null &&
    (typeof taskId !== 'number' || !Number.isSafeInteger(taskId) || taskId < 0)
  )
    throw new Error('Partner lookup returned an invalid task.');
  if (taskId !== null || value.result == null)
    return { task_id: taskId, will_persist: value.will_persist };

  const result = value.result;
  if (
    !isRecord(result) ||
    typeof result.account_id !== 'string' ||
    (result.trainer_name != null && typeof result.trainer_name !== 'string')
  )
    throw new Error('Partner lookup returned an invalid result.');
  if (result.inheritance != null && !isRecord(result.inheritance))
    throw new Error('Partner lookup returned invalid inheritance data.');
  const inheritance =
    result.inheritance == null
      ? null
      : parsePartnerRecord({
          ...result.inheritance,
          account_id: result.account_id,
          trainer_name: result.trainer_name
        });

  return {
    task_id: null,
    will_persist: value.will_persist,
    result: { account_id: result.account_id, trainer_name: result.trainer_name, inheritance }
  };
}

function parentFromPartner(value: PartnerRecord): SelectableParent {
  const record = normalizeInheritanceSearch({
    items: [
      {
        account_id: value.account_id,
        trainer_name: value.trainer_name ?? '',
        inheritance: { ...value, inheritance_id: value.id ?? value.inheritance_id ?? 0 }
      }
    ],
    total: 1,
    page: 0,
    limit: 1,
    total_pages: 1
  }).records[0];

  if (!record?.mainParentId) throw new Error('The partner response contains no parent.');
  return { ...inheritanceParent(record, 'partner'), name: value.label || undefined };
}

/** Consumes fetch streams through the same auth/proof/cancellation pipeline as JSON requests. */
export async function readPartnerStream(
  response: Response,
  onphase: (phase: PartnerPhase) => void
): Promise<PartnerRecord | null> {
  if (!response.body) throw new Error('Partner lookup returned no event stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  function consume(block: string): { completed: true; value: PartnerRecord | null } | undefined {
    const lines = block.split(/\r?\n/);
    const event = lines
      .find((line) => line.startsWith('event:'))
      ?.slice(6)
      .trim();

    if (!event || !['pending', 'processing', 'completed', 'failed', 'timeout'].includes(event))
      return;
    const json = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    const data: unknown = json ? JSON.parse(json) : {};

    if (!isRecord(data)) throw new Error('Partner lookup returned an invalid event.');
    if (event === 'pending' || event === 'processing') onphase(event);
    if (event === 'completed')
      return {
        completed: true,
        value: data.inheritance == null ? null : parsePartnerRecord(data.inheritance)
      };

    if (event === 'failed')
      throw new Error(
        typeof data.error === 'string' && data.error
          ? data.error
          : 'Partner lookup failed. Please try again.'
      );
    if (event === 'timeout')
      throw new DOMException(
        'The worker did not respond in time. Please try again.',
        'TimeoutError'
      );
    return undefined;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2_000_000) throw new Error('Partner lookup response is too large.');
      if (done) buffer += '\n\n';
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const result = consume(block);
        if (result?.completed) return result.value;
      }

      if (done)
        throw new Error('Partner lookup disconnected before returning a result. Please retry.');
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export const partnerRepository = {
  async saved(): Promise<SelectableParent[]> {
    const records = await appHttp.request<unknown>('/api/v4/partner/saved');
    if (!Array.isArray(records)) throw new Error('Saved partners returned an invalid response.');
    return records.map((record) => parentFromPartner(parsePartnerRecord(record)));
  },
  async lookup(
    id: string,
    signal: AbortSignal,
    onphase: (phase: PartnerPhase) => void
  ): Promise<{ parent: SelectableParent | null; willPersist: boolean }> {
    if (!/^(?:\d{9}|\d{12})$/.test(id))
      throw new Error('Enter a 9-digit practice ID or 12-digit trainer ID.');
    onphase('queued');
    const responseBody = await appHttp.request<unknown>('/api/v4/partner/lookup', {
      method: 'POST',
      signal,
      body: { partner_id: id, label: null, require_persistence: Boolean(getAuthToken()) }
    });

    const created = parseLookupResponse(responseBody);
    if (created.task_id === null) {
      const inheritance = created.result?.inheritance;
      return {
        willPersist: created.will_persist,
        parent: inheritance ? parentFromPartner(inheritance) : null
      };
    }

    const response = await appHttp.request<Response>(
      `/api/v4/partner/lookup/${created.task_id}/stream`,
      { signal, responseType: 'response', headers: { accept: 'text/event-stream' } }
    );

    const result = await readPartnerStream(response, onphase);
    return { willPersist: created.will_persist, parent: result ? parentFromPartner(result) : null };
  },
  remove(parent: SelectableParent): Promise<void> {
    const id = parent.share_inheritance_id;
    return appHttp.request(
      `/api/v4/partner/saved/${id ? `id/${id}` : encodeURIComponent(parent.trainer_id ?? '')}`,
      { method: 'DELETE' }
    );
  },
  async migrateAnonymous(): Promise<void> {
    const raw = localStorage.getItem('partner-lookups:anon');
    if (!raw || !getAuthToken()) return;
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries))
      throw new Error('Saved partner history is invalid. The original entries have been kept.');
    if (entries.length)
      await appHttp.request('/api/v4/partner/saved/migrate', { method: 'POST', body: entries });
    if (localStorage.getItem('partner-lookups:anon') === raw)
      localStorage.removeItem('partner-lookups:anon');
  }
};
