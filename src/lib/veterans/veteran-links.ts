import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import { encodeDatabaseFilterState, type CompactDatabaseFilterState } from '@/pages/database/database-preferences';

export function veteranDatabaseUrl(veteran: ProfileVeteran, accountId = veteran.trainer_id ?? '', targetId?: string | number): string | undefined {
  const reference: CompactDatabaseFilterState['vet'] = typeof veteran.id === 'string' && veteran.id
    ? veteran.id : accountId && veteran.member_id != null ? [accountId, veteran.member_id] : undefined;
  if (!reference) return undefined;
  const target = Number(targetId);
  return '/database?filters=' + encodeURIComponent(encodeDatabaseFilterState({ fm:'advanced', vet:reference, ...(target > 0 ? { t:[target] } : {}) }));
}
