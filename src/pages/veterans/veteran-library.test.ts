import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { authUser } from '@/services/auth/auth-state';
import { setAccountWorkspaces } from '@/lib/workspaces/workspace-state';
import { normalizeVeteranImport } from '@/lib/veterans/veteran-normalizer';
import { veteranPayload, veteranProfile, veteranSupportCards } from '@/lib/veterans/veteran-profile';
import { veteranRepository } from '@/lib/veterans/veteran-repository';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import { profileRepository } from '@/pages/profile/profile-repository';
import { draftScope, importVeteranFiles, syncVeteranDrafts, veteranDrafts, veteranImportBusy } from './veteran-library';

const raw = { trained_chara_id: 11, card_id: 100101, speed: 1200, proper_ground_turf: 8, create_time: '2026-01-01 01:00:00', route_id: 4, factor_id_array: [103], skill_array: [{ skill_id: 20001, level: 2 }], succession_chara_array: [{ position_id: 10, card_id: 100601, factor_id_array: [102], win_saddle_id_array: [100] }] };
const file = (value: unknown) => ({ name: 'veterans.json', size: 100, text: async () => JSON.stringify(value) }) as File;
let saved: Record<string, VeteranRecord[]>;
beforeEach(() => {
  localStorage.clear(); authUser.set(null); setAccountWorkspaces([]); veteranDrafts.set({}); veteranImportBusy.set(false); saved = {};
  vi.spyOn(veteranRepository, 'query').mockImplementation(async scope => structuredClone(saved[scope] ?? []));
  vi.spyOn(veteranRepository, 'import').mockImplementation(async (scope, values) => {
    const next = normalizeVeteranImport(values); saved[scope] = [...new Map([...(saved[scope] ?? []), ...next].map(value => [value.recordId, value])).values()];
    return { inserted: next.length, updated: 0, total: next.length };
  });
  vi.spyOn(veteranRepository, 'replace').mockImplementation(async (scope, values) => {
    saved[scope] = values.length ? [...new Map(normalizeVeteranImport(values).map(record => [record.trainedCharaId ?? record.recordId, record])).values()] : [];
    return saved[scope]!.length;
  });
  vi.spyOn(profileRepository, 'ingestVeterans').mockResolvedValue({ inserted: 1, updated: 0, deleted: 0, total: 1 });
  vi.spyOn(profileRepository, 'load').mockResolvedValue({ veterans: [raw] } as never);
});
afterEach(() => vi.restoreAllMocks());
function signIn() { authUser.set({ id: 'login-one', display_name: 'Trainer', created_at: '' }); localStorage.setItem('auth_token', 'first-token'); setAccountWorkspaces([{ accountId: '111', label: 'First' }, { accountId: '222', label: 'Second' }]); }

it('retains extractor fields, parent wins and encoded data across device storage and account upload', () => {
  const [record] = normalizeVeteranImport({ data: { trained_chara_array: [raw] } });
  expect(veteranProfile(record!)).toMatchObject({ card_id: 100101, proper_ground_turf: 8, creation_time: raw.create_time, factors: [103], skill_array: raw.skill_array, succession_chara_array: [{ factor_id_array: [102], win_saddle_id_array: [100] }] });
  expect(veteranPayload(record!)).toMatchObject({ route_id: 4, factor_info_array: [{ factor_id: 10, level: 3 }], trained_chara_id: 11 });
  expect(normalizeVeteranImport(raw)).toHaveLength(1);
});
it('preserves support limit breaks through imports and distinguishes zero from missing or invalid values', () => {
  const support_card_list = [{ support_card_id:30028, limit_break_count:4 }, { support_card_id:30016, limit_break_count:0 }];
  const [record] = normalizeVeteranImport({ ...raw, support_card_list });
  expect(veteranProfile(record!)).toMatchObject({ support_cards:[30028,30016], support_card_list });
  expect(veteranPayload(record!)).toMatchObject({ support_card_list });
  expect(veteranSupportCards({ support_cards:[30016,30028,30003,30009,20023,30011,30012], support_card_list:[...support_card_list,
    { support_card_id:30003, limit_break_count:5 }, { support_card_id:30009, limit_break_count:-1 },
    { support_card_id:20023, limit_break_count:2.5 }, { support_card_id:30011, limit_break_count:'3' }
  ] }).map(card => card.limit_break_count)).toEqual([0,4,null,null,null,null,null]);
});
it('decodes packed Team Stadium support IDs and limit breaks without changing ordinary support IDs', () => {
  const support_cards = [200233, 300152, 300284, 300194, 300360, 300104];
  expect(veteranSupportCards({ support_cards })).toEqual([
    { support_card_id:20023, limit_break_count:3 }, { support_card_id:30015, limit_break_count:2 },
    { support_card_id:30028, limit_break_count:4 }, { support_card_id:30019, limit_break_count:4 },
    { support_card_id:30036, limit_break_count:0 }, { support_card_id:30010, limit_break_count:4 }
  ]);
  expect(veteranSupportCards({ support_cards:[30028,300285,999999] })).toEqual([
    { support_card_id:30028, limit_break_count:null }, { support_card_id:30028, limit_break_count:null }, { support_card_id:999999, limit_break_count:null }
  ]);
  expect(veteranSupportCards({ support_cards:[300284], support_card_list:[{ support_card_id:30028, limit_break_count:0 }] })).toEqual([{ support_card_id:30028, limit_break_count:0 }]);
});
it('replaces guest collections without network writes and validates every file before changing storage', async () => {
  await importVeteranFiles([file({ veterans: [raw] })]);
  expect(saved.local).toHaveLength(1); expect(get(veteranDrafts).local).toHaveLength(1);
  await expect(importVeteranFiles([file([{ ...raw, trained_chara_id: 12 }]), file([{ card_id: 0 }])])).rejects.toThrow();
  expect(saved.local).toHaveLength(1); expect(profileRepository.ingestVeterans).not.toHaveBeenCalled();
  await importVeteranFiles([file([{ ...raw, trained_chara_id: 12 }])]);
  expect(saved.local?.map(record => record.trainedCharaId)).toEqual([12]);
  await expect(importVeteranFiles([file([])])).rejects.toThrow('does not contain a Veteran list');
  expect(saved.local?.map(record => record.trainedCharaId)).toEqual([12]);
});
it('retains failed uploads in the original account and retries without losing the device copy', async () => {
  signIn(); vi.mocked(profileRepository.ingestVeterans).mockRejectedValueOnce(new Error('Offline'));
  await expect(importVeteranFiles([file([raw])], '111')).rejects.toThrow('Saved on this device');
  expect(saved[draftScope('111')]).toHaveLength(1); expect(saved[draftScope('222')]).toBeUndefined();
  await syncVeteranDrafts('111'); expect(saved[draftScope('111')]).toEqual([]);
  expect(profileRepository.ingestVeterans).toHaveBeenLastCalledWith('111', [expect.objectContaining({ trained_chara_id: 11 })]);
});
it('syncs guest imports to the chosen account without mixing older drafts, keeping the device copy', async () => {
  await importVeteranFiles([file(raw)]); signIn();
  saved[draftScope('222')] = normalizeVeteranImport([{ ...raw, trained_chara_id: 12 }]);
  await syncVeteranDrafts('222', true);
  expect(profileRepository.ingestVeterans).toHaveBeenCalledWith('222', [expect.objectContaining({ card_id: 100101 })]);
  expect(saved.local).toHaveLength(1); expect(saved[draftScope('222')]).toEqual([]);
  expect(draftScope('222', 'another-login')).not.toBe(draftScope('222'));
});
it('does not post an upload under a changed sign-in session while reading a file', async () => {
  signIn(); let release!: (text: string) => void;
  const slow = { ...file(raw), text: () => new Promise<string>(resolve => release = resolve) } as File;
  const importing = importVeteranFiles([slow], '111');
  localStorage.setItem('auth_token', 'replacement-token'); release(JSON.stringify(raw));
  await expect(importing).rejects.toThrow('sign-in session changed');
  expect(profileRepository.ingestVeterans).not.toHaveBeenCalled(); expect(veteranRepository.replace).not.toHaveBeenCalled();
});
it('keeps imports missing required server IDs locally without replacing the account collection', async () => {
  signIn(); await expect(importVeteranFiles([file({ card_id: 100101 })], '111')).rejects.toThrow('missing trained character IDs');
  expect(saved[draftScope('111')]).toHaveLength(1); expect(profileRepository.ingestVeterans).not.toHaveBeenCalled();
});
it('keeps the recovery copy when the upload succeeds but the account read is stale', async () => {
  signIn(); vi.mocked(profileRepository.load).mockResolvedValueOnce({ veterans: [] } as never);
  await expect(importVeteranFiles([file(raw)], '111')).rejects.toThrow('has not refreshed yet');
  expect(saved[draftScope('111')]).toHaveLength(1);
  expect(veteranRepository.replace).not.toHaveBeenCalledWith(draftScope('111'), [], 'uploaded-to-account');
});

it('uploads only the latest batch after a failure, deduplicating files and updating matching veterans', async () => {
  signIn(); vi.mocked(profileRepository.ingestVeterans).mockRejectedValueOnce(new Error('Offline'));
  await expect(importVeteranFiles([file([raw, { ...raw, trained_chara_id: 12 }])], '111')).rejects.toThrow('Saved on this device');
  const updated = { ...raw, speed: 1300 }, added = { ...raw, trained_chara_id: 13 };
  vi.mocked(profileRepository.load).mockResolvedValueOnce({ veterans: [updated, added] } as never);
  await importVeteranFiles([file([raw, added]), file([updated])], '111');
  expect(profileRepository.ingestVeterans).toHaveBeenLastCalledWith('111', [
    expect.objectContaining({ trained_chara_id: 11, speed: 1300 }),
    expect.objectContaining({ trained_chara_id: 13 }),
  ]);
  expect(saved[draftScope('111')]).toEqual([]);
});

it('keeps the recovery copy until removed veterans also disappear from the account read', async () => {
  signIn(); vi.mocked(profileRepository.load).mockResolvedValueOnce({ veterans: [raw, { ...raw, trained_chara_id: 12 }] } as never);
  await expect(importVeteranFiles([file(raw)], '111')).rejects.toThrow('has not refreshed yet');
  expect(saved[draftScope('111')]).toHaveLength(1);
  expect(veteranRepository.replace).not.toHaveBeenCalledWith(draftScope('111'), [], 'uploaded-to-account');
});
