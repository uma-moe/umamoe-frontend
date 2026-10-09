export interface PickupProbabilityGoal {
  pickupId: number;
  rate: number;
  requestedCopies: number;
  exchangeable?: boolean;
}

export interface PickupGoalProbability {
  pickupId: number;
  requestedCopies: number;
  pickupRate: number;
  exchangeable: boolean;
  exchangeCopiesAvailable: number;
  randomCopiesNeeded: number;
  probability: number;
}

export interface MultiPickupProbability {
  pulls: number;
  sparkCopiesAvailable: number;
  goals: PickupGoalProbability[];
  jointProbability?: number;
  jointProbabilityExact: boolean;
}

export interface PullPoolComposition {
  topRarityRate: number;
  selectedRateUpRate: number;
  allFeaturedRate: number;
  unselectedFeaturedRate: number;
  offBannerTopRarityRate: number;
  lowerRarityRate: number;
  expectedTopRarityHits: number;
  expectedSelectedRateUpHits: number;
  expectedUnselectedFeaturedHits: number;
  expectedOffBannerTopRarityHits: number;
  probabilityAtLeastOneTopRarity: number;
}
export interface PullOutcomeBucket { hits: number; randomHits: number; probability: number; cumulativeProbability: number; cumulativeAtLeastProbability: number; }
export interface PullProbabilityResult {
  pulls: number;
  normalizedRateUpRates: readonly number[];
  combinedRateUpRate: number;
  guaranteedHits: number;
  randomExpectedHits: number;
  expectedHits: number;
  medianHits: number;
  probabilityAtLeastOneRandomHit: number;
  probabilityAtLeastOneHit: number;
  pool?: PullPoolComposition;
  medianFirstHitPull?: number;
  buckets: readonly PullOutcomeBucket[];
}
export type PullOutcomeTone = 'miss' | 'below' | 'expected' | 'lucky' | 'neutral';
export interface PullOutcomeSegment { tone: PullOutcomeTone; semanticLabel: string; rangeLabel: string; probability: number; width: number; }

/** Exact Angular binomial distribution for the combined selected pickup pool. */
export function calculatePullDistribution(input: {pulls:number;rateUpRates:readonly number[];allRateUpRates?:readonly number[];topRarityRate?:number;sparkPulls?:number;sparkExchangeable?:boolean}): PullProbabilityResult {
  const pulls=nonNegativeInt(input.pulls);
  const selected=input.rateUpRates.map(normalizeRate).filter((rate):rate is number => rate!==undefined);
  const all=input.allRateUpRates?.map(normalizeRate);
  const allValid=all?.every((rate):rate is number => rate!==undefined) ? all : undefined;
  const top=normalizeRate(input.topRarityRate ?? Number.NaN);
  const combined=Math.min(1,selected.reduce((sum,rate)=>sum+rate,0));
  const sparkPulls=nonNegativeInt(input.sparkPulls);
  const guaranteed=input.sparkExchangeable!==false&&sparkPulls>0 ? Math.floor(pulls/sparkPulls) : 0;
  const probabilities=binomialProbabilities(pulls,combined);
  const atLeastOneRandom=pulls>0 ? -Math.expm1(pulls*Math.log1p(-combined)) : 0;
  let cumulative=0;
  const buckets:PullOutcomeBucket[]=probabilities.map((probability,randomHits)=>{cumulative+=probability;return{hits:randomHits+guaranteed,randomHits,probability,cumulativeProbability:clamp(cumulative),cumulativeAtLeastProbability:0};});
  let atLeast=0;for(let index=buckets.length-1;index>=0;index-=1){atLeast+=buckets[index]!.probability;buckets[index]!.cumulativeAtLeastProbability=clamp(atLeast);}
  if(buckets.length){buckets.at(-1)!.cumulativeProbability=1;buckets[0]!.cumulativeAtLeastProbability=1;}
  const median=buckets.find((bucket)=>bucket.cumulativeProbability>=.5)??buckets.at(-1);
  return {pulls,normalizedRateUpRates:selected,combinedRateUpRate:combined,guaranteedHits:guaranteed,randomExpectedHits:pulls*combined,expectedHits:pulls*combined+guaranteed,medianHits:median?.hits??guaranteed,probabilityAtLeastOneRandomHit:atLeastOneRandom,probabilityAtLeastOneHit:guaranteed>0?1:atLeastOneRandom,pool:buildPool(pulls,combined,allValid,top),medianFirstHitPull:medianFirstHitPull(pulls,combined,guaranteed>0?sparkPulls:undefined),buckets};
}

export function pullOutcomeSegments(result: PullProbabilityResult): PullOutcomeSegment[] {
  if(result.pulls===0||result.combinedRateUpRate<=0)return[{tone:'neutral',semanticLabel:result.guaranteedHits>0?'Exchange copies only':'No chance configured',rangeLabel:copyRange(result.guaranteedHits,result.guaranteedHits),probability:1,width:100}];
  const lower=result.buckets.find((bucket)=>bucket.cumulativeProbability>=.25)?.randomHits??0;
  const upper=result.buckets.find((bucket)=>bucket.cumulativeProbability>=.75)?.randomHits??result.buckets.at(-1)?.randomHits??0;
  const groups=new Map<PullOutcomeTone,{semanticLabel:string;probability:number;minHits:number;maxHits:number}>();
  for(const bucket of result.buckets){if(bucket.probability<=0)continue;const tone:PullOutcomeTone=bucket.randomHits===0?'miss':bucket.randomHits<lower?'below':bucket.randomHits<=upper?'expected':'lucky';const semanticLabel=tone==='miss'?(result.guaranteedHits>0?'Exchange only':'No rate-up'):tone==='below'?'Below expected':tone==='expected'?'Expected range':'Above expected';const existing=groups.get(tone);if(existing){existing.probability+=bucket.probability;existing.minHits=Math.min(existing.minHits,bucket.hits);existing.maxHits=Math.max(existing.maxHits,bucket.hits);}else groups.set(tone,{semanticLabel,probability:bucket.probability,minHits:bucket.hits,maxHits:bucket.hits});}
  return (['miss','below','expected','lucky'] as const).flatMap((tone)=>{const group=groups.get(tone);return !group||group.probability<1e-12?[]:[{tone,semanticLabel:group.semanticLabel,rangeLabel:tone==='lucky'?`${group.minHits} or more ${group.minHits===1?'copy':'copies'}`:copyRange(group.minHits,group.maxHits),probability:group.probability,width:Math.max(0,group.probability*100)}];});
}

const MAX_JOINT_STATES = 250_000;
const MAX_JOINT_WORK = 50_000_000;

/** Exact Angular-compatible multinomial evaluation. Exchange copies are shared
 * across selected pickups and allocated optimally after the random draws. */
export function calculateMultiPickupProbability(pullsInput: number, goalsInput: readonly PickupProbabilityGoal[], sparkPullsInput?: number, drawRates?: readonly (readonly number[])[]): MultiPickupProbability {
  const pulls = nonNegativeInt(pullsInput);
  const sparkPulls = nonNegativeInt(sparkPullsInput);
  const sparkCopiesAvailable = sparkPulls > 0 ? Math.floor(pulls / sparkPulls) : 0;
  if (drawRates && (drawRates.length !== pulls || drawRates.some(rates => rates.length !== goalsInput.length || rates.some(rate => !Number.isFinite(rate) || rate < 0 || rate > 1) || rates.reduce((sum, rate) => sum + rate, 0) > 1 + 1e-12))) {
    return { pulls, sparkCopiesAvailable, goals: [], jointProbabilityExact: false };
  }
  const goals = goalsInput.flatMap((goal, index) => {
    const pickupRate = normalizeRate(goal.rate);
    if (pickupRate === undefined || !Number.isFinite(goal.pickupId) || goal.pickupId < 0) return [];
    const requestedCopies = Math.max(1, nonNegativeInt(goal.requestedCopies));
    const exchangeable = goal.exchangeable !== false;
    const exchangeCopiesAvailable = exchangeable ? sparkCopiesAvailable : 0;
    const randomCopiesNeeded = Math.max(0, requestedCopies - exchangeCopiesAvailable);
    return [{
      pickupId: Math.trunc(goal.pickupId), requestedCopies, pickupRate, exchangeable,
      exchangeCopiesAvailable, randomCopiesNeeded,
      probability: drawRates ? varyingRateTail(drawRates.map(rates => rates[index]!), randomCopiesNeeded) : binomialTail(pulls, randomCopiesNeeded, pickupRate)
    }];
  });
  const jointProbability = goals.length === goalsInput.length ? multinomialJointProbability(pulls, goals, sparkCopiesAvailable, drawRates) : undefined;
  return { pulls, sparkCopiesAvailable, goals, jointProbability, jointProbabilityExact: jointProbability !== undefined };
}

function multinomialJointProbability(pulls: number, goals: readonly PickupGoalProbability[], sparks: number, drawRates?: readonly (readonly number[])[]): number | undefined {
  if (!goals.length) return 1;
  if (new Set(goals.map((goal) => goal.pickupId)).size !== goals.length) return undefined;
  const selectedRate = goals.reduce((sum, goal) => sum + goal.pickupRate, 0);
  if (selectedRate > 1 + Number.EPSILON * goals.length) return undefined;
  const radices = goals.map((goal) => goal.requestedCopies + 1);
  const multipliers: number[] = [];
  let stateCount = 1;
  for (const radix of radices) {
    multipliers.push(stateCount);
    stateCount *= radix;
    if (!Number.isSafeInteger(stateCount) || stateCount > MAX_JOINT_STATES) return undefined;
  }
  if (pulls * stateCount * (goals.length + 1) > MAX_JOINT_WORK) return undefined;
  const nextStates = goals.map((goal, goalIndex) => {
    const next = new Int32Array(stateCount);
    const multiplier = multipliers[goalIndex]!;
    const radix = radices[goalIndex]!;
    for (let state = 0; state < stateCount; state += 1) {
      const count = Math.floor(state / multiplier) % radix;
      next[state] = count < goal.requestedCopies ? state + multiplier : state;
    }
    return next;
  });
  let distribution = new Float64Array(stateCount);
  distribution[0] = 1;
  for (let pull = 0; pull < pulls; pull += 1) {
    const rates = drawRates?.[pull] ?? goals.map(goal => goal.pickupRate);
    const otherRate = Math.max(0, 1 - rates.reduce((sum, rate) => sum + rate, 0));
    const nextDistribution = new Float64Array(stateCount);
    for (let state = 0; state < stateCount; state += 1) {
      const probability = distribution[state]!;
      if (!probability) continue;
      nextDistribution[state] = nextDistribution[state]! + probability * otherRate;
      for (let goalIndex = 0; goalIndex < goals.length; goalIndex += 1) {
        const nextState = nextStates[goalIndex]![state]!;
        nextDistribution[nextState] = nextDistribution[nextState]! + probability * rates[goalIndex]!;
      }
    }
    distribution = nextDistribution;
  }
  let success = 0;
  for (let state = 0; state < stateCount; state += 1) {
    const probability = distribution[state]!;
    if (!probability) continue;
    let exchangeDeficit = 0;
    let satisfies = true;
    for (let goalIndex = 0; goalIndex < goals.length; goalIndex += 1) {
      const goal = goals[goalIndex]!;
      const randomCopies = Math.floor(state / multipliers[goalIndex]!) % radices[goalIndex]!;
      const deficit = Math.max(0, goal.requestedCopies - randomCopies);
      if (!goal.exchangeable && deficit > 0) { satisfies = false; break; }
      exchangeDeficit += deficit;
    }
    if (satisfies && exchangeDeficit <= sparks) success += probability;
  }
  return clamp(success);
}

function varyingRateTail(rates: readonly number[], needed: number): number {
  if (needed <= 0) return 1;
  if (needed > rates.length) return 0;
  const probabilities = new Float64Array(needed + 1);
  probabilities[0] = 1;
  for (const rate of rates) {
    for (let count = needed; count > 0; count--) probabilities[count] = probabilities[count]! * (count === needed ? 1 : 1 - rate) + probabilities[count - 1]! * rate;
    probabilities[0] = probabilities[0]! * (1 - rate);
  }
  return clamp(probabilities[needed]!);
}

function binomialTail(draws: number, successesNeeded: number, rate: number): number {
  if (successesNeeded <= 0) return 1;
  if (draws < successesNeeded || rate <= 0) return 0;
  if (rate >= 1) return 1;
  let logProbability = logCombination(draws, successesNeeded) + successesNeeded * Math.log(rate) + (draws - successesNeeded) * Math.log1p(-rate);
  let largest = logProbability;
  let scaled = 1;
  for (let successes = successesNeeded + 1; successes <= draws; successes += 1) {
    logProbability += Math.log(draws - successes + 1) - Math.log(successes) + Math.log(rate) - Math.log1p(-rate);
    if (logProbability > largest) { scaled = scaled * Math.exp(largest - logProbability) + 1; largest = logProbability; }
    else scaled += Math.exp(logProbability - largest);
  }
  return clamp(Math.exp(largest + Math.log(scaled)));
}
export function binomialProbabilities(draws:number,rate:number):number[]{if(draws===0||rate<=0)return[1,...Array.from({length:draws},()=>0)];if(rate>=1)return[...Array.from({length:draws},()=>0),1];const values=Array.from({length:draws+1},()=>0);const mode=Math.floor((draws+1)*rate);values[mode]=1;for(let hits=mode;hits>0;hits-=1)values[hits-1]=values[hits]!*hits/(draws-hits+1)*(1-rate)/rate;for(let hits=mode;hits<draws;hits+=1)values[hits+1]=values[hits]!*(draws-hits)/(hits+1)*rate/(1-rate);const total=values.reduce((sum,value)=>sum+value,0);return values.map((value)=>value/total);}
function medianFirstHitPull(pulls:number,rate:number,guaranteed?:number):number|undefined{let random:number|undefined;if(pulls>0&&rate>=1)random=1;else if(pulls>0&&rate>0){const candidate=Math.ceil(Math.log(.5)/Math.log1p(-rate));if(candidate<=pulls)random=candidate;}return guaranteed!==undefined&&guaranteed<=pulls?(random===undefined?guaranteed:Math.min(random,guaranteed)):random;}
function buildPool(pulls:number,selected:number,all:readonly number[]|undefined,top:number|undefined):PullPoolComposition|undefined{if(top===undefined||all===undefined)return undefined;const featured=all.reduce((sum,rate)=>sum+rate,0);const tolerance=Number.EPSILON*Math.max(8,all.length*2);if(featured>1+tolerance||selected>featured+tolerance||featured>top+tolerance)return undefined;const unselected=Math.max(0,featured-selected);const offBanner=Math.max(0,top-featured);return{topRarityRate:top,selectedRateUpRate:selected,allFeaturedRate:featured,unselectedFeaturedRate:unselected,offBannerTopRarityRate:offBanner,lowerRarityRate:Math.max(0,1-top),expectedTopRarityHits:pulls*top,expectedSelectedRateUpHits:pulls*selected,expectedUnselectedFeaturedHits:pulls*unselected,expectedOffBannerTopRarityHits:pulls*offBanner,probabilityAtLeastOneTopRarity:pulls>0?-Math.expm1(pulls*Math.log1p(-top)):0};}
function copyRange(min:number,max:number):string{return min===max?`${min} ${min===1?'copy':'copies'}`:`${min}–${max} copies`;}
function logCombination(n: number, k: number): number { let result = 0; const smaller = Math.min(k, n-k); for (let value=1; value<=smaller; value+=1) result += Math.log(n-smaller+value)-Math.log(value); return result; }
export function normalizeRate(value: number): number | undefined { if (!Number.isFinite(value) || value < 0) return undefined; const normalized = value > 1 ? value / 100 : value; return normalized <= 1 ? normalized : undefined; }
function nonNegativeInt(value: number | undefined): number { return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
