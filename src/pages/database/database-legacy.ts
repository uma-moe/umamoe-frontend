import type { VeteranUiRecord } from '@/components/game/veteran-ui-types';
import {
  accountParent,
  manualParent,
  parentAffinityDetails,
  parseManualParents,
  MANUAL_PARENTS_KEY,
  type SelectableParent
} from '@/lib/veterans/parent-picker';
import type { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import { uqlLegacyHints } from '@/lib/inheritance/uql/uql-context';
import { authRepository } from '@/services/auth/auth-repository';
import { profileRepository } from '@/pages/profile/profile-repository';
import { deviceVeteranParents } from '@/pages/veterans/veteran-library';
import { veteranToUi } from '@/pages/veterans/veteran-adapter';
import type { CatalogEntry } from './catalog-repository';
import type { CompactDatabaseFilterState } from './database-preferences';

export async function restoreSavedParent(
  reference: NonNullable<CompactDatabaseFilterState['vet']>,
  signedIn: boolean
): Promise<SelectableParent | undefined> {
  let parent: SelectableParent | undefined;
  if (typeof reference === 'string') {
    if (reference.startsWith('device-'))
      parent = (await deviceVeteranParents()).find((parent) => parent.id === reference);
    else if (reference.startsWith('manual:')) {
      const entry = parseManualParents(localStorage.getItem(MANUAL_PARENTS_KEY)).find(
        (entry) => `manual:${entry.id}` === reference
      );
      if (entry) parent = manualParent(entry);
    } else {
      const veteran = await profileRepository.veteran(reference, true);
      if (veteran?.id === reference) parent = accountParent(veteran, veteran.trainer_id ?? '');
    }
  } else if (
    signedIn &&
    Array.isArray(reference) &&
    typeof reference[0] === 'string' &&
    Number.isSafeInteger(reference[1])
  ) {
    const [accountId, memberId] = reference;
    const accounts = await authRepository.linkedAccounts();
    if (
      accounts.some(
        (account) => account.account_id === accountId && account.verification_status === 'verified'
      )
    ) {
      const veteran = (await profileRepository.load(accountId, true)).veterans?.find(
        (item) => item.member_id === memberId
      );
      if (veteran) parent = accountParent(veteran, accountId);
    }
  }
  return parent;
}

export function legacyScope(value: string, userId: string | number | undefined): string {
  const hint = uqlLegacyHints(value);
  return hint.uuid
    ? `uuid:${hint.uuid}`
    : hint.accountId
      ? `account:${hint.accountId}`
      : `accounts:${userId ?? ''}`;
}

export async function loadLegacyParents(
  value: string,
  refresh: boolean,
  signedIn: boolean
): Promise<SelectableParent[]> {
  const hint = uqlLegacyHints(value);
  if (hint.uuid?.startsWith('device-')) {
    const parents = await deviceVeteranParents();
    if (!parents.some((parent) => parent.id === hint.uuid))
      throw new Error('This veteran is stored on another device. Import its JSON here to use it.');
    return parents;
  }
  if (hint.uuid) {
    const veteran = await profileRepository.veteran(hint.uuid, refresh);
    return [accountParent(veteran, veteran.trainer_id ?? '')];
  }
  const accountIds = hint.accountId
    ? [hint.accountId]
    : signedIn
      ? (await authRepository.linkedAccounts())
          .filter((account) => account.verification_status === 'verified')
          .map((account) => account.account_id)
      : [];
  return [
    ...(await deviceVeteranParents()),
    ...(
      await Promise.all(
        accountIds.map(
          async (accountId) =>
            (await profileRepository.load(accountId, refresh)).veterans?.map((veteran) =>
              accountParent(veteran, accountId)
            ) ?? []
        )
      )
    ).flat()
  ];
}

export function legacyVeteranView(
  selectedParent: SelectableParent,
  partner: VeteranRecord,
  characters: CatalogEntry[],
  targetId: number | undefined,
  affinityEngine: VeteranAffinityEngine | undefined,
  raceGroups: ReadonlyMap<number, number>
): VeteranUiRecord {
  const view = veteranToUi(
    { ...partner, name: '' },
    selectedParent.trainer_id ?? '',
    new Map(characters.map((character) => [Number(character.id), { name: character.title }]))
  );
  const score = parentAffinityDetails(selectedParent, targetId, affinityEngine, raceGroups);
  view.detail = undefined;
  view.affinity = score ? score.parentOne.total + score.race.p1Left + score.race.p1Right : NaN;
  for (const parent of view.parents ?? [])
    parent.affinity = !score
      ? NaN
      : parent.position === 'P1'
        ? score.parentOne.left + score.race.p1Left
        : score.parentOne.right + score.race.p1Right;
  return view;
}
