import type { ProfileResponse, ProfileVeteran } from '@/pages/profile/profile-repository';
import { validateInheritanceUql, type UqlValidation } from '@/lib/inheritance/uql/uql';
import type { UqlCompiler } from '@/lib/inheritance/uql/uql-compiler';
import { resolveVeteranFactors, veteranFactorTotals } from './profile-veterans';
import { veteranInheritanceRecord } from './profile-veteran-metrics';
import { decodeFactor } from '@/lib/catalog/factor-catalog';

type Value = string | number | boolean | null | Value[];
export type VeteranQueryRow = Record<string, Value>;
interface QueryReference { field: string; value: Value; requested?: number[]; factorId?: number; }
type Expression = ((row: VeteranQueryRow) => Value) & { references?: (row: VeteranQueryRow) => QueryReference[] };
export interface VeteranQueryMatch { field: string; label: string; value: string; factor?: {id:number;name:string;level:number;tone:'blue'|'pink'|'green'|'white'}; }
const references = (expression: Expression, row: VeteranQueryRow) => expression.references?.(row) ?? [];
const traced = (evaluate: Expression, inputs: Expression[], explain?: (row: VeteranQueryRow) => QueryReference[]): Expression => Object.assign(evaluate,{references:explain ?? (row=>inputs.flatMap(input=>references(input,row)))});
const scalarFields = ['inheritance_id','account_id','trainer_id','trainer_name','name','follower_num','followers','main_parent_id','parent_left_id','left_parent_id','parent_right_id','right_parent_id','main_chara_id','left_chara_id','right_chara_id','parent_rank','parent_rarity','scenario_id','scenario','affinity','affinity_score','race_affinity','computed_race_affinity','win_count','wins','white_count','support_card_count','support_cards_count'];
const fields = new Set([...scalarFields, ...['blue','pink','green','white'].flatMap(color => [color+'_sparks',color+'_stars_sum']), ...['main','left','right'].flatMap(side => ['blue_factors','pink_factors','green_factors','white_factors','white_sparks','white_count','win_saddles'].map(field => side+'_'+field)), ...['','main_'].flatMap(scope => ['common','race','scenario'].flatMap(kind => [scope+kind+'_white_count',scope+kind+'_white_stars_sum'])), 'race_results']);
const list = (value: Value): Value[] => Array.isArray(value) ? value : value == null ? [] : [value];

/** Evaluate compiled database predicates locally; never execute query text as JavaScript. */
function predicate(source: string): Expression {
  const tokens: string[] = [];
  const lexer = /\s*(?:'(?:''|[^'])*'|"(?:""|[^"])*"|\d+(?:\.\d+)?|[a-z_][a-z_0-9.]*|>=|<=|!=|<>|==|[=<>+*/%(),[\]-])/iy;
  let offset = 0;
  while (offset < source.trimEnd().length) {
    lexer.lastIndex = offset;
    const match = lexer.exec(source);
    if (!match) throw Error('Unexpected query text near: '+source.slice(offset,offset+24));
    tokens.push(match[0].trim()); offset = lexer.lastIndex;
    if (tokens.length > 2048) throw Error('Query is too long. Split it into fewer rules.');
  }
  let cursor = 0, depth = 0;
  const peek = () => tokens[cursor]?.toLowerCase();
  const take = (value: string) => peek() === value ? (cursor++,true) : false;
  const requireToken = (value: string) => {if (!take(value)) throw Error('Expected '+value);};
  const constant = (value: Value): Expression => () => value;
  const compare = (operator: string, a: Value, b: Value): Value => {
    if (a == null || b == null) return null;
    switch(operator) {
      case '=': case '==': return a === b;
      case '!=': case '<>': return a !== b;
      case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b;
      case '+': return Number(a)+Number(b); case '-': return Number(a)-Number(b); case '*': return Number(a)*Number(b);
      case '/': return Number(b) === 0 ? null : Number(a)/Number(b);
      case '%': case 'mod': return Number(b) === 0 ? null : Number(a)%Number(b);
      case 'like': case 'ilike': {
        const escaped = String(b).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*').replace(/_/g,'.');
        return new RegExp('^'+escaped+'$',operator === 'ilike' ? 'i' : '').test(String(a));
      }
      default: throw Error('Unsupported operator: '+operator);
    }
  };
  const precedence: Record<string,number> = {or:1,and:2,'=':3,'==':3,'!=':3,'<>':3,'>':3,'<':3,'>=':3,'<=':3,in:3,not:3,between:3,like:3,ilike:3,'+':4,'-':4,'*':5,'/':5,'%':5,mod:5};
  function expression(minimum = 0): Expression {
    if (++depth > 64) throw Error('Query nesting is too deep.');
    let left: Expression;
    const token = tokens[cursor++];
    if (token == null) throw Error('Finish the predicate');
    if (token.toLowerCase() === 'not') {const value=expression(3); left=traced(row=>{const v=value(row);return v == null ? null : !v;},[value]);}
    else if (token === '-' || token === '+') {const value=expression(6);left=traced(row=>Number(value(row))*(token === '-' ? -1 : 1),[value]);}
    else if (token === '(' || token === '[') {
      const end=token === '(' ? ')' : ']'; const items:Expression[]=[];
      if (!take(end)) {do {items.push(expression());} while(take(','));requireToken(end);}
      left=items.length === 1 && token === '(' ? items[0]! : traced(row=>items.map(item=>item(row)),items);
    } else if (/^['"]/.test(token)) left=constant(token.slice(1,-1).replaceAll(token[0]!.repeat(2),token[0]!));
    else if (/^\d/.test(token)) left=constant(Number(token));
    else if (['null','true','false'].includes(token.toLowerCase())) left=constant(token.toLowerCase() === 'null' ? null : token.toLowerCase() === 'true');
    else if (take('(')) {
      const name=token.toLowerCase();
      if (!['contains','has','overlaps','any','has_all','contains_all','all','spark_sum','support_card','has_support_card'].includes(name)) throw Error(name+' is a database ranking function and is not available for a local collection.');
      const args:Expression[]=[];
      if(!take(')')) {do {args.push(expression());} while(take(','));requireToken(')');}
      if (name === 'support_card' || name === 'has_support_card') {
        if(args.length !== 1) throw Error('Support limit-break data is not available in this collection. Filter by support card ID instead.');
        left=traced(row=>list(row.support_card_ids ?? []).includes(args[0]!(row)),[],row=>[{field:'support_card_ids',value:row.support_card_ids ?? [],requested:list(args[0]!(row)).map(Number)}]);
      } else {
        if(args.length !== 2) throw Error(name+' expects two arguments');
        left=row=>{
          const first=list(args[0]!(row)), second=list(args[1]!(row));
          if(name === 'spark_sum') return first.reduce<number>((sum,value)=>Math.floor(Number(value)/10) === Number(second[0]) ? sum+Number(value)%10 : sum,0);
          const sparkField = references(args[0]!,row).some(reference=>/^(blue|pink|green|white)_sparks$|^(main|left|right)_white_factors$/.test(reference.field));
          const matches = (value: Value) => first.includes(value) || sparkField && typeof value === 'number' && value >= 1 && value <= 9 && first.some(actual=>Number(actual) >= 10 && Number(actual)%10 === value);
          return ['has_all','contains_all','all'].includes(name) ? second.every(matches) : second.some(matches);
        };
        const call=left;
        left=traced(call,args,row=>references(args[0]!,row).map(reference=>name==='spark_sum'
          ? {...reference,factorId:Number(args[1]!(row)),value:call(row)}
          : {...reference,requested:list(args[1]!(row)).map(Number)}));
      }
    } else {
      const field=token.toLowerCase().replaceAll('.','_');
      if(!fields.has(field)) throw Error('Field unavailable for veteran collections: '+token);
      left=traced(row=>row[field] ?? null,[],row=>[{field,value:row[field] ?? null}]);
    }
    while(peek() && (precedence[peek()!] ?? -1) >= minimum) {
      let op=tokens[cursor++]!.toLowerCase(); const before=left;
      const negate=op === 'not';
      if(negate){op=tokens[cursor++]?.toLowerCase() ?? '';if(!['in','between','like','ilike'].includes(op))throw Error('Expected IN, BETWEEN or LIKE after NOT');}
      if(op === 'between') {
        const low=expression(4);requireToken('and');const high=expression(4);
        left=traced(row=>{const v=before(row),a=low(row),b=high(row);return v == null || a == null || b == null ? null : (v >= a && v <= b) !== negate;},[before,low,high]);
      } else {
        const right=expression((precedence[op] ?? 3)+1);
        left=row=>{
          const a=before(row),b=right(row);
          if(op === 'and') return !a && a != null || !b && b != null ? false : a == null || b == null ? null : true;
          if(op === 'or') return a || b ? true : a == null || b == null ? null : false;
          if(op === 'in') return a == null ? null : list(b).includes(a) !== negate;
          const result=compare(op,a,b); return negate && result != null ? !result : result;
        };
        const evaluate=left;
        left=traced(evaluate,[before,right],op==='and'||op==='or'
          ? row=>[before,right].filter(input=>Boolean(input(row))===Boolean(evaluate(row))).flatMap(input=>references(input,row))
          : ['=','==','!=','<>','in'].includes(op) ? row=>[...references(before,row).map(reference=>/^(main|left|right)_(blue|pink|green)_factors$/.test(reference.field) && !references(right,row).length ? {...reference,requested:list(right(row)).map(Number)} : reference),...references(right,row)] : undefined);
      }
    }
    depth--; return left;
  }
  if(!tokens.length) return constant(true);
  const result=expression();
  if(cursor !== tokens.length) throw Error('Unexpected token: '+tokens[cursor]);
  return result;
}

function describeReferences(items: QueryReference[]): VeteranQueryMatch[] {
  const matches: VeteranQueryMatch[]=[];
  for(const item of items) {
    const spark=item.field.match(/^(?:(main|left|right)_)?(blue|pink|green|white)_(?:sparks|factors)$/);
    if(spark) {
      const actual=list(item.value).map(Number);
      const ids=item.factorId!=null ? [item.factorId] : [...new Set((item.requested ?? actual).filter(id=>id>0).map(id=>Math.floor(id/10)))];
      for(const id of ids) {
        const factor=decodeFactor(id*10+1),level=item.factorId!=null ? Number(item.value) : actual.filter(value=>Math.floor(value/10)===id).reduce((sum,value)=>sum+value%10,0);
        const prefix=spark[1] ? ({main:'Main',left:'P1',right:'P2'} as Record<string,string>)[spark[1]]+' · ' : '';
        matches.push({field:item.field,label:prefix+factor.name,value:level+'★',factor:{id,name:factor.name,level,tone:spark[2] as 'blue'|'pink'|'green'|'white'}});
      }
    } else {
      const value=item.field==='support_card_ids' && item.requested ? item.requested.filter(id=>list(item.value).includes(id)) : item.value;
      matches.push({field:item.field,label:({affinity:'Affinity',affinity_score:'Affinity',parent_rank:'Rank score',parent_rarity:'Rarity',scenario_id:'Scenario',win_count:'Race wins',white_count:'Unique white sparks'} as Record<string,string>)[item.field] ?? item.field.replaceAll('_',' '),value:Array.isArray(value) ? value.join(', ') || 'None' : value==null ? 'Unknown' : typeof value==='number' ? value.toLocaleString() : String(value)});
    }
  }
  return [...new Map(matches.map(match=>[match.field+':'+(match.factor?.id ?? ''),match])).values()];
}

export function compileVeteranQuery(value: string, compiler?: UqlCompiler): {validation:UqlValidation; matches:(row:VeteranQueryRow)=>boolean; explain:(row:VeteranQueryRow)=>VeteranQueryMatch[]} {
  const validation=validateInheritanceUql(value,compiler);
  if(!['empty','valid'].includes(validation.state)) return {validation,matches:()=>false,explain:()=>[]};
  try {
    if(validation.sortBy && ['trending','last_updated','follower_num'].includes(validation.sortBy)) throw Error('Use the collection Sort control for this ordering.');
    const evaluate=predicate(validation.compiled);
    return {validation,matches:row=>Boolean(evaluate(row)),explain:row=>value.trim() && evaluate(row) ? describeReferences(references(evaluate,row)) : []};
  } catch(error) {return {validation:{...validation,state:'invalid',message:error instanceof Error ? error.message : 'Invalid collection query'},matches:()=>false,explain:()=>[]};}
}

export function veteranQueryRow(veteran: ProfileVeteran, trainer: ProfileResponse['trainer'], groups: ReadonlyMap<number,number>, affinity: number | null, raceAffinity: number | null = null): VeteranQueryRow {
  const r=veteranInheritanceRecord(veteran);
  const row:VeteranQueryRow={inheritance_id:r.id,account_id:trainer.account_id,trainer_id:trainer.account_id,trainer_name:trainer.name,name:trainer.name,follower_num:trainer.follower_num,followers:trainer.follower_num,main_parent_id:r.mainParentId,main_chara_id:r.mainParentId,parent_left_id:r.leftParentId,left_parent_id:r.leftParentId,left_chara_id:r.leftParentId,parent_right_id:r.rightParentId,right_parent_id:r.rightParentId,right_chara_id:r.rightParentId,parent_rank:r.rankScore,parent_rarity:r.rarity,scenario_id:r.scenarioId ?? null,scenario:r.scenarioId ?? null,affinity,affinity_score:affinity,race_affinity:raceAffinity,computed_race_affinity:raceAffinity,main_win_saddles:r.mainWinSaddles,left_win_saddles:r.leftWinSaddles,right_win_saddles:r.rightWinSaddles,race_results:r.raceResults,support_card_ids:veteran.support_cards ?? [],support_card_count:veteran.support_cards?.length ?? null,support_cards_count:veteran.support_cards?.length ?? null};
  const wins=veteran.win_saddle_id_array == null || veteran.win_saddle_id_array.length > 0 && !groups.size ? null : new Set(r.mainWinSaddles.map(id=>groups.get(id)).filter(id=>id != null)).size;
  row.win_count=wins;row.wins=wins;
  const totals=veteranFactorTotals(veteran);
  for(const color of ['blue','pink','green','white'] as const){const factors=totals.filter(f=>f.tone===color);row[color+'_sparks']=factors.map(f=>f.id*10+f.level);row[color+'_stars_sum']=factors.reduce((sum,f)=>sum+f.level,0);}
  row.white_count=totals.filter(f=>f.tone==='white').length;
  for(const [side,node] of [['main',veteran],['left',veteran.succession_chara_array?.find(p=>p.position_id===10)],['right',veteran.succession_chara_array?.find(p=>p.position_id===20)]] as const){
    const factors=resolveVeteranFactors(node ?? {});
    for(const color of ['blue','pink','green','white']){const items=factors.filter(f=>f.tone===color);row[side+'_'+color+'_factors']=color==='white' ? items.map(f=>f.encodedId) : items[0]?.encodedId ?? 0;}
    row[side+'_white_sparks']=row[side+'_white_factors']!;row[side+'_white_count']=factors.filter(f=>f.tone==='white').length;
  }
  for(const [scope,factors] of [['',totals],['main_',resolveVeteranFactors(veteran)]] as const) for(const [kind,type] of [['common',3],['race',2],['scenario',4]] as const){const items=factors.filter(f=>f.type===type);row[scope+kind+'_white_count']=items.length;row[scope+kind+'_white_stars_sum']=items.reduce((sum,f)=>sum+f.level,0);}
  return row;
}
