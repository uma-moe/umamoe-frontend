/**
 * A skill's activation conditions in words. The game writes them as `key op value` terms joined by `&`, with `@`
 * separating alternatives (any one of which fires it): `running_style==2&is_finalcorner_random==1&order_rate<=50` reads
 * "Pace chaser · Random point of the final corner · In the front half of the field".
 */

type Operator = '==' | '!=' | '>=' | '<=' | '>' | '<';

interface Term {
  key: string;
  op: Operator;
  value: number;
}

const TERM = /^([a-z_]+)(==|!=|>=|<=|>|<)(-?\d+(?:\.\d+)?)$/;

const STYLES = ['', 'Front runner', 'Pace chaser', 'Late surger', 'End closer'];
const STYLE_KEYS: Record<string, string> = {
  nige: 'Front runners',
  senko: 'Pace chasers',
  sashi: 'Late surgers',
  oikomi: 'End closers'
};
const DISTANCES = ['', 'Sprint', 'Mile', 'Medium', 'Long'];
const SURFACES = ['', 'Turf', 'Dirt'];
const GROUNDS = ['', 'Firm', 'Good', 'Soft', 'Heavy'];
const WEATHERS = ['', 'Sunny', 'Cloudy', 'Rainy', 'Snowy'];
const SEASONS = ['', 'Spring', 'Summer', 'Fall', 'Winter', 'Spring'];
const LEGS = ['the opening leg', 'the middle leg', 'the late leg', 'the last spurt'];
/** Where each kind of count gate counts activations. */
const COUNT_WINDOWS: Record<string, string> = {
  activate_count_start: 'in the opening leg',
  activate_count_middle: 'in the middle leg',
  activate_count_later_half: 'in the second half',
  activate_count_end_after: 'from the late leg on',
  activate_count_all: 'so far',
  activate_count_heal: 'so far'
};

/** A skill gated on other skills' activations: how many, and where they must fire. */
export interface CountGate {
  count: number;
  /** Which activations count: any of her skills, or only her recovery skills. */
  counted: 'any' | 'recovery';
  /** The share of the race the counted activations fall in, as 24-section bounds. */
  sections: [number, number];
  where: string;
}

const GATE_SECTIONS: Record<string, [number, number]> = {
  activate_count_start: [0, 4],
  activate_count_middle: [4, 16],
  activate_count_later_half: [12, 24],
  activate_count_end_after: [16, 24],
  activate_count_all: [0, 24],
  activate_count_heal: [0, 24]
};

function parseTerm(text: string): Term | undefined {
  const match = TERM.exec(text.trim());
  if (match === null) return undefined;
  return { key: match[1]!, op: match[2] as Operator, value: Number(match[3]) };
}

function parseAlternative(text: string): Term[] {
  return text
    .split('&')
    .map(parseTerm)
    .filter((term): term is Term => term !== undefined);
}

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
}

function leg(value: number): string {
  return LEGS[value] ?? `phase ${value}`;
}

function named(names: string[], value: number, what: string): string {
  return names[value] ?? `${what} ${value}`;
}

/** A term the table does not know, still readable: `blocked_side_continuetime>=2` → "blocked side continuetime ≥ 2". */
function plainTerm({ key, op, value }: Term): string {
  const symbol = { '==': '=', '!=': '≠', '>=': '≥', '<=': '≤', '>': '>', '<': '<' }[op];
  return `${key.replaceAll('_', ' ').trim()} ${symbol} ${value}`;
}

/** One term in words, or none when it says nothing a reader needs (`always==1`). */
function describeTerm(term: Term, trackName: (id: number) => string): string | undefined {
  const { key, op, value } = term;
  const at = op === '==';
  const styleCount = /^running_style_count_(nige|senko|sashi|oikomi)_otherself$/.exec(key);
  if (styleCount) return `${value}+ other ${STYLE_KEYS[styleCount[1]!]}`;

  switch (key) {
    case 'always':
      return undefined;
    case 'running_style':
      return named(STYLES, value, 'Style');
    case 'distance_type':
      return named(DISTANCES, value, 'Distance');
    case 'ground_type':
      return named(SURFACES, value, 'Track');
    case 'ground_condition':
      return `${op === '!=' ? 'Not ' : ''}${named(GROUNDS, value, 'Ground')} ground`;
    case 'weather':
      return `${op === '!=' ? 'Not ' : ''}${named(WEATHERS, value, 'Weather')}`;
    case 'season':
      return named(SEASONS, value, 'Season');
    case 'rotation':
      return value === 1 ? 'Clockwise course' : 'Counter-clockwise course';
    case 'track_id':
      return `At ${trackName(value)}`;
    case 'is_basis_distance':
      return value === 1 ? 'Standard distance' : 'Non-standard distance';
    case 'is_dirtgrade':
      return 'Dirt graded race';
    case 'phase':
      if (at) return `In ${leg(value)}`;
      if (op === '>=') return `From ${leg(value)} on`;
      if (op === '<=') return `Up to ${leg(value)}`;
      break;
    case 'phase_random':
      return `Random point in ${leg(value)}`;
    case 'phase_firsthalf_random':
      return `First half of ${leg(value)}`;
    case 'phase_laterhalf_random':
      return `Second half of ${leg(value)}`;
    case 'is_lastspurt':
    case 'lastspurt':
      return 'In the last spurt';
    case 'corner':
      if (at && value === 0) return 'On a straight';
      if (op === '!=' && value === 0) return 'On a corner';
      return at ? `On corner ${value}` : undefined;
    case 'corner_random':
      return `Random point of corner ${value}`;
    case 'all_corner_random':
      return 'Random corner';
    case 'straight_random':
      return 'Random straight';
    case 'last_straight_random':
      return 'Random point of the final straight';
    case 'is_last_straight_onetime':
      return 'On the final straight';
    case 'straight_front_type':
      return value === 1 ? 'On the home straight' : 'On the back straight';
    case 'is_finalcorner':
      return value === 1 ? 'On the final corner or after' : 'Before the final corner';
    case 'is_finalcorner_random':
      return 'Random point of the final corner';
    case 'is_finalcorner_laterhalf':
      return 'Second half of the final corner';
    case 'slope':
      return value === 1 ? 'Uphill' : 'Downhill';
    case 'up_slope_random':
      return 'Random uphill';
    case 'down_slope_random':
      return 'Random downhill';
    case 'distance_rate':
      return op.startsWith('>')
        ? `After ${value}% of the race`
        : `In the first ${value}% of the race`;
    case 'distance_rate_after_random':
      return `Random point after ${value}% of the race`;
    case 'remain_distance':
      return op.startsWith('<')
        ? `Within ${value} m of the finish`
        : `More than ${value} m from the finish`;
    case 'order':
      if (at && value === 1) return 'Leading';
      if (op === '>=') return value === 2 ? 'Not leading' : `${ordinal(value)} or further back`;
      if (op === '<=') return `In the top ${value}`;
      if (at) return `In ${ordinal(value)} place`;
      break;
    case 'order_rate':
      return op.startsWith('<')
        ? `In the front ${value}% of the field`
        : `In the back ${100 - value}% of the field`;
    case 'distance_diff_top':
      return op.startsWith('<') ? 'Close behind the leader' : 'Well behind the leader';
    case 'bashin_diff_behind':
      return op.startsWith('<')
        ? `A runner within ${value} lengths behind`
        : `No runner within ${value} lengths behind`;
    case 'bashin_diff_infront':
      return op.startsWith('<')
        ? `A runner within ${value} lengths ahead`
        : `No runner within ${value} lengths ahead`;
    case 'change_order_onetime':
      return value <= 0 ? 'Just passed a runner' : 'Just lost a place';
    case 'change_order_up_end_after':
      return `Gained ${value}+ places since the late leg`;
    case 'change_order_up_finalcorner_after':
      return `Gained ${value}+ places since the final corner`;
    case 'is_overtake':
      return 'While overtaking';
    case 'overtake_target_time':
      return `Chasing a runner for ${value}s`;
    case 'blocked_front':
      return 'Blocked in front';
    case 'blocked_front_continuetime':
      return `Blocked in front for ${value}s`;
    case 'blocked_side_continuetime':
      return `Boxed in at the side for ${value}s`;
    case 'is_surrounded':
      return 'Surrounded';
    case 'is_move_lane':
      return 'Changing lanes';
    case 'infront_near_lane_time':
      return `A runner close ahead for ${value}s`;
    case 'behind_near_lane_time':
      return `A runner close behind for ${value}s`;
    case 'near_count':
      return `${value}+ runners nearby`;
    case 'hp_per':
      return op.startsWith('>') ? `HP above ${value}%` : `HP at or below ${value}%`;
    case 'accumulatetime':
      return `After ${value}s of racing`;
    case 'is_activate_any_skill':
      return 'Right after another of her skills fires';
    case 'temptation_count':
      return value === 0 ? 'Not rushed yet' : `Rushed ${value}+ times`;
    case 'is_temptation':
      return 'While rushed';
    case 'compete_fight_count':
      return 'In a duel';
    case 'running_style_count_same':
      return op.startsWith('<') && value <= 1
        ? 'No other runner of her style'
        : `${value}+ runners of her style`;
    case 'running_style_count_same_rate':
      return `${value}%+ of the field runs her style`;
    case 'running_style_equal_popularity_one':
      return 'The favourite runs her style';
    case 'popularity':
      return at && value === 1
        ? 'Most popular'
        : `Popularity rank ${value}${op === '>=' ? ' or lower' : ''}`;
    case 'post_number':
      return op.startsWith('<') ? `Gate ${value} or inside` : `Gate ${value} or outside`;
    case 'is_badstart':
      return value === 1 ? 'After a slow start' : 'After a clean start';
    case 'random_lot':
      return `${value}% chance`;
    default:
      break;
  }

  const window = COUNT_WINDOWS[key];
  if (window !== undefined) {
    return key === 'activate_count_heal'
      ? `${value} recovery skills fired first`
      : `${value} of her skills fired ${window}`;
  }

  return plainTerm(term);
}

/** Two `remain_distance` bounds a few metres apart are one point: "200 m from the finish". */
function mergeRemainingDistance(terms: Term[]): Term[] {
  const upper = terms.find((term) => term.key === 'remain_distance' && term.op.startsWith('<'));
  const lower = terms.find((term) => term.key === 'remain_distance' && term.op.startsWith('>'));
  if (upper === undefined || lower === undefined || upper.value - lower.value > 20) return terms;

  return [
    ...terms.filter((term) => term !== upper && term !== lower),
    { key: 'remain_point', op: '==', value: Math.round((upper.value + lower.value) / 2) }
  ];
}

/**
 * Each alternative's requirements in words, alternatives that read the same folded together. `trackName` names a
 * racecourse by its id.
 */
export function describeRequirements(
  conditions: string,
  trackName: (id: number) => string
): string[][] {
  const seen = new Set<string>();
  const alternatives: string[][] = [];
  for (const text of conditions.split('@')) {
    const phrases = mergeRemainingDistance(parseAlternative(text)).flatMap((term) => {
      if (term.key === 'remain_point') return [`${term.value} m from the finish`];
      const phrase = describeTerm(term, trackName);
      return phrase === undefined ? [] : [phrase];
    });
    const unique = [...new Set(phrases)];
    const key = unique.join('|');
    if (seen.has(key)) continue;

    seen.add(key);
    alternatives.push(unique);
  }

  return alternatives.filter((alternative) => alternative.length > 0);
}

/** The count gate a skill waits on, when it waits on others' activations. */
export function countGate(conditions: string): CountGate | undefined {
  for (const term of conditions.split('@').flatMap(parseAlternative)) {
    const sections = GATE_SECTIONS[term.key];
    if (sections !== undefined && term.op.startsWith('>')) {
      return {
        count: term.value,
        counted: term.key === 'activate_count_heal' ? 'recovery' : 'any',
        sections,
        where: COUNT_WINDOWS[term.key]!
      };
    }
  }

  return undefined;
}
