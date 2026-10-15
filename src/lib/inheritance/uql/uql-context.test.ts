import { expect, it } from 'vitest';
import { parseUqlContext, resolveUqlTarget, resolveUqlLegacy, setUqlLegacy, uqlLegacyHints } from './uql-context';
import { accountParent, manualParent } from '@/lib/veterans/parent-picker';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';

const characters = [{ id:'100101', name:'Special Week', displayName:'Special Week', skin:'Original' }, {id:'100302', name:'Tokai Teio', displayName:'Tokai Teio [Anime Collab]', skin:'Anime Collab'}];
const parent = accountParent({id:'veteran-uuid',member_id:42,card_id:100101} as ProfileVeteran, '123456789');

it('separates Angular editor context without splitting literals, costume brackets or nested predicates', () => {
  const parsed = parseUqlContext("where target = [Tokai Teio [Anime Collab]] and owned legacy = [Special Week #veteran-uuid] and trainer_name = 'A and B' and (Speed >= 3 or Stamina >= 3);");
  expect(parsed).toEqual({predicate:"trainer_name = 'A and B' and (Speed >= 3 or Stamina >= 3)",directives:[{kind:'target',value:'Tokai Teio [Anime Collab]'},{kind:'legacy',value:'Special Week #veteran-uuid'}]});
  expect(resolveUqlTarget(parsed.directives[0]!.value, characters).match?.id).toBe('100302');
  for (const label of ['owned legacy','your legacy','my legacy','legacy']) expect(parseUqlContext(`${label} = []`)).toMatchObject({issue:{state:'incomplete'},directives:[{kind:'legacy',value:''}]});
  expect(parseUqlContext('target != Special Week')).toMatchObject({issue:{state:'invalid'}});
  expect(parseUqlContext('target = [Special Week')).toMatchObject({issue:{state:'incomplete'}});
  expect(parseUqlContext('owned legacy = [Special Week #veteran-uuid]]')).toMatchObject({issue:{state:'invalid'}});
  expect(parseUqlContext('owned legacy = "Special Week #veteran-uuid')).toMatchObject({issue:{state:'incomplete'}});
  expect(parseUqlContext('target = [Special Week)')).toMatchObject({issue:{state:'invalid'}});
  expect(parseUqlContext('target = Special Week and')).toMatchObject({issue:{state:'incomplete'}});
  expect(parseUqlContext('target == 100101 and Speed >= 3')).toMatchObject({predicate:'Speed >= 3',directives:[{kind:'target',value:'100101'}]});
  expect(resolveUqlTarget('Tokai Te', characters)).toMatchObject({partial:true,match:undefined});
  expect(resolveUqlTarget('does not exist', characters)).toEqual({partial:false,match:undefined});
});

it('preserves UUID/account/member identity and round-trips picker choices without matching a different account', () => {
  for (const value of ['Special Week #veteran-uuid','Special Week #42 @123456789','123456789:42','member 42','Special Week @123456789','Special Week']) expect(resolveUqlLegacy(value,[parent],characters).match, value).toBe(parent);
  expect(uqlLegacyHints('Special Week #veteran-uuid')).toMatchObject({uuid:'veteran-uuid'});
  expect(resolveUqlLegacy('Special Week #42 @987654321',[parent],characters).match).toBeUndefined();
  const query = setUqlLegacy('target = 100302 and your legacy = [] and Main Speed >= 3',parent,characters);
  expect(query).toBe('target = 100302 and owned legacy = [Special Week #veteran-uuid] and Main Speed >= 3');
  expect(resolveUqlLegacy(parseUqlContext(query).directives[1]!.value,[parent],characters).match).toBe(parent);
  const manual = manualParent({id:'entry',label:'My parent',mainCardId:100101,ownSparkIds:[],p1CardId:null,p1SparkIds:[],p2CardId:null,p2SparkIds:[],createdAt:'2026-09-05'});
  expect(setUqlLegacy('owned legacy = []',manual,characters)).toBe('owned legacy = [Special Week]');
});
