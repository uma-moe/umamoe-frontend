import { describe,it,expect,vi,afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { cmGet,buildRunner,loadCmSummary } from './cm-data';
import * as characters from '@/lib/catalog/character-catalog';
import { parseQuery,matchesTeam } from './hakuraku-query';
import type { Build } from './hakuraku-types';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('Hakuraku data contracts',()=>{
  it('reads gzip responses and rejects a different snapshot',async()=>{
    const bytes=gzipSync(JSON.stringify({snapshotId:'cm20',value:42}));
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array(bytes))));
    await expect(cmGet('/snapshot',new AbortController().signal,'cm20')).resolves.toEqual({snapshotId:'cm20',value:42});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({snapshotId:'cm19'}))));
    await expect(cmGet('/snapshot',new AbortController().signal,'cm20')).rejects.toThrow('do not match');
  });
  it('keeps distinct team slots and excludes matching runners',()=>{
    const cards={100101:{chara:1001,name:'Special Week',outfit:'Special Dreamer'}};
    const members=[{card:100101,chara:1001,style:1 as const},{card:100201,chara:1002,style:2 as const},{card:100301,chara:1003,style:6 as const}];
    expect(matchesTeam(members,parseQuery('Special Week / Pace / Any',cards))).toBe(true);
    expect(matchesTeam(members,parseQuery('Front / Front / Any',cards))).toBe(false);
    expect(matchesTeam(members,parseQuery('Special Week / Any / Any / Without Debuffer',cards))).toBe(false);
  });
  it('uses shared character resources without changing metrics or breaking source-name queries',async()=>{
    vi.spyOn(characters,'loadCharacterCatalog').mockResolvedValue(new Map([[100101,{id:'100101',name:'Shared Uma',subtitle:'Shared Outfit',image:''}]]));
    const data={snapshotId:'cm20',cards:{100101:{chara:1001,name:'Source Uma',outfit:'Source Outfit'}},pairs:[{card:100101,name:'Source Uma',outfit:'Source Outfit',individual:.1234,owners:42}]};
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    const result=await loadCmSummary('cm20',new AbortController().signal);
    expect(result.pairs[0]).toMatchObject({name:'Shared Uma',outfit:'Shared Outfit',individual:.1234,owners:42});
    expect(parseQuery('Source Uma Source Outfit / Any / Any',result.cards)).toEqual(parseQuery('Shared Uma Shared Outfit / Any / Any',result.cards));
    expect(parseQuery('Source Uma / Any / Any',result.cards)).toEqual(parseQuery('Shared Uma / Any / Any',result.cards));
  });
  it('adapts a captured build without inventing a race result',()=>{
    const build={id:'b',card:100101,chara:1001,style:1,racingStyle:1,score:20000,stats:[1200,1000,900,800,700],aptitudes:['S','A','B'],skills:[[200132,1]],trainedIds:[]} as Build;
    const runner=buildRunner(build,{cards:{100101:{name:'Special Week',chara:1001,outfit:'Special Dreamer'}}});
    expect(runner.stats.speed).toBe(1200);expect(runner.aptitudes).toEqual({distance:8,surface:7,style:6});expect(runner.skillIds).toEqual([200132]);expect(runner.result).toBeUndefined();
  });
});
