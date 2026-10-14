import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import { normalizeInheritanceRecord } from '@/lib/inheritance/inheritance-search';
import { inheritanceAffinity } from '@/lib/inheritance/inheritance-factors';
import type { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';

export function veteranInheritanceRecord(veteran: ProfileVeteran) {
  const parents = veteran.succession_chara_array ?? [];
  const left = parents.find(parent => parent.position_id === 10);
  const right = parents.find(parent => parent.position_id === 20);
  // Affinity only uses characters and race wins; the query row resolves its own sparks.
  return normalizeInheritanceRecord({ account_id:veteran.trainer_id ?? '', trainer_name:'', inheritance:{
    inheritance_id:Number(veteran.trained_chara_id ?? veteran.id), main_parent_id:veteran.card_id ?? 0,
    parent_left_id:left?.card_id ?? 0, parent_right_id:right?.card_id ?? 0, parent_rank:veteran.rank_score ?? 0, parent_rarity:veteran.rarity ?? 0,
    affinity_score:veteran.inheritance?.affinity_score ?? undefined, scenario_id:veteran.scenario_id,
    main_win_saddles:veteran.win_saddle_id_array ?? [], left_win_saddles:left?.win_saddle_id_array ?? [], right_win_saddles:right?.win_saddle_id_array ?? [], race_results:veteran.race_results ?? []
  } })!;
}

export function profileVeteranAffinity(veteran: ProfileVeteran, engine?: VeteranAffinityEngine, groups: ReadonlyMap<number,number> = new Map(), targetId?: number) {
  if (!engine) return { main: targetId ? null : veteran.inheritance?.affinity_score ?? null, p1: null, p2: null, race: null, recorded: !targetId };
  const record = veteranInheritanceRecord(veteran);
  const known = (id: number) => engine?.characterIds.includes(id>=10000 ? Math.floor(id / 100) : id);
  const calculated = inheritanceAffinity(record, targetId, undefined, engine, groups);
  const mainKnown = known(record.mainParentId) && (!targetId || known(targetId));
  const p1 = mainKnown && known(record.leftParentId) ? calculated.source({owner:'left',side:'p1',level:1}) : null;
  const p2 = mainKnown && known(record.rightParentId) ? calculated.source({owner:'right',side:'p1',level:1}) : null;
  if(targetId) return {main:p1!=null && p2!=null ? calculated.total : null,p1,p2,race:p1!=null && p2!=null ? calculated.race : null,recorded:false};
  return {main:p1 != null && p2 != null ? p1 + p2 : veteran.inheritance?.affinity_score ?? null, p1, p2, race:p1 != null && p2 != null ? calculated.race : null, recorded:p1 == null || p2 == null};
}
