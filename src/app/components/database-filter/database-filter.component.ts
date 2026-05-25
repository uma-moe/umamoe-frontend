import { Component, EventEmitter, Output, Input, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChild, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSliderModule } from '@angular/material/slider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { CharacterSelectDialogComponent } from '../character-select-dialog/character-select-dialog.component';
import { SupportCardSelectDialogComponent } from '../support-card-select-dialog/support-card-select-dialog.component';
import { VeteranPickerDialogComponent, VeteranPickerDialogData } from '../veteran-picker-dialog/veteran-picker-dialog.component';
import { SupportCardService } from '../../services/support-card.service';
import { AuthService } from '../../services/auth.service';
import { ProfileService } from '../../services/profile.service';
import { LocaleNumberPipe } from '../../pipes/locale-number.pipe';
import { SupportCardShort, SupportCardType, Rarity } from '../../models/support-card.model';
import { VeteranMember } from '../../models/profile.model';
import { LinkedAccount } from '../../models/auth.model';
import { CHARACTERS, getCharacterById as getMasterCharacterById, getCharacterNameEntries } from '../../data/character.data';
import { SKILLS } from '../../data/skills.data';
import { getCharacterName } from '../../pages/profile/profile-helpers';
import { FactorService } from '../../services/factor.service';
import { RaceSchedulerComponent } from '../race-scheduler/race-scheduler.component';
import { VeteranDisplayComponent } from '../veteran-display/veteran-display.component';
import { preferRasterAsset } from '../../utils/raster-asset';
import { AdvancedFilterPanelComponent } from './advanced-filter/advanced-filter.component';
import { UqlFilterComponent, UqlSuggestion, UqlValueContext } from './uql-filter/uql-filter.component';
export interface ActiveFilterChip {
  id: string;
  label: string;
  name?: string;
  value?: string;
  showStar?: boolean;
  rankIcon?: string; // Path to rank icon image
  range?: string; // Star range like "1-9", "5+", etc.
  type: 'blue' | 'pink' | 'green' | 'white' | 'optionalWhite' | 'optionalMainWhite' | 'mainBlue' | 'mainPink' | 'mainGreen' | 'mainWhite' | 'character' | 'supportCard' | 'other' | 'blueStarSum' | 'pinkStarSum' | 'greenStarSum' | 'whiteStarSum' | 'includeMainParent' | 'includeParent' | 'excludeParent' | 'excludeMainParent' | 'raceSchedule' | 'uql';
  filterIndex?: number;
  filterList?: FactorFilter[];
}
export type FilterMode = 'basic' | 'advanced' | 'uql';
export type UqlValidationState = 'empty' | 'valid' | 'incomplete' | 'invalid';

export interface UqlSnippet {
  label: string;
  insertText: string;
}

interface FriendlySparkField {
  label: string;
  aliases: string[];
  field: string;
  factorId: number;
  maxLevel: number;
}

interface FriendlyScopedSparkField {
  label: string;
  aliases: string[];
  fields: { field: string; type: 'number' | 'array' }[];
  factorId: number;
  maxLevel: number;
  valueContext: UqlFactorValueContext;
}

export type UqlFieldType = 'number' | 'string' | 'array';
type UqlFactorValueContext = Extract<UqlValueContext, 'blue-factor' | 'pink-factor' | 'green-factor' | 'white-factor'>;

interface FriendlyFieldAlias {
  label: string;
  aliases: string[];
  field: string;
  type?: UqlFieldType;
}

type UqlNamedFactor = FriendlySparkField & { valueContext: UqlFactorValueContext };

interface FriendlySparkComparisonAlias extends FriendlySparkField {
  alias: string;
  comparisonPattern: RegExp;
}

interface FriendlyScopedSparkComparisonAlias extends FriendlyScopedSparkField {
  alias: string;
  comparisonPattern: RegExp;
}

interface FriendlyFieldAliasReplacement {
  alias: string;
  field: string;
  pattern: RegExp;
}

interface FriendlyArrayAliasReplacement {
  alias: string;
  label: string;
  fields: string[];
  hasAllPattern: RegExp;
  hasAnyPattern: RegExp;
  doesNotHavePattern: RegExp;
  hasPattern: RegExp;
}

interface UqlNamedFactorComparison extends UqlNamedFactor {
  comparisonPattern: RegExp;
}

interface UqlSkillListItem {
  value: string;
  factor: UqlNamedFactor | null;
  operator?: string;
  level?: number;
}

interface CompressedState {
  fm?: FilterMode;
  uql?: string;
  b?: (number|null)[][]; // blue factors [id, min]
  p?: (number|null)[][]; // pink factors [id, min]
  g?: (number|null)[][]; // green factors [id, min]
  w?: (number|null)[][]; // white factors [id, min]
  
  ow?: number[]; // optional white factors [id]
  omw?: number[]; // optional main white factors [id]
  lw?: number[]; // lineage white factors [id]
  mb?: (number|null)[][]; // main blue
  mp?: (number|null)[][]; // main pink
  mg?: (number|null)[][]; // main green
  mw?: (number|null)[][]; // main white
  
  // Tree: [targetId, p1Id, p1_g1Id, p1_g2Id, p2Id, p2_g1Id, p2_g2Id]
  t?: (number|null)[]; 
  
  sc?: string; // support card id
  lb?: number; // limit break
  
  uid?: string; // search user id
  
  // Other scalars
  mwc?: number; // min win count
  mwh?: number; // min white count
  pr?: number; // parent rank
  mf?: number; // max followers
  
  // Star sum filters (min only)
  bss?: number; // blue stars sum min
  pss?: number; // pink stars sum min
  gss?: number; // green stars sum min
  wss?: number; // white stars sum min
  
  mmwc?: number; // main parent min white count
  
  // Parent include/exclude (arrays of character IDs)
  imp?: number[]; // include main parent IDs
  ip?: number[];  // include parent IDs
  ep?: number[];  // exclude parent IDs
  emp?: number[]; // exclude main parent IDs
  // Race schedule: [yearIdx, month, half, raceInstanceId][]
  rs?: [number, number, number, number][];
  vet?: [string, number];
}
export interface TreeNode {
  id: string;
  name: string;
  image?: string;
  characterId?: number;
  layer: number;
  children?: TreeNode[];
}
export interface UnifiedSearchParams {
  page?: number;
  limit?: number;
  search_type?: string;
  // Inheritance filtering
  player_chara_id?: number;
  main_parent_id?: number[];
  parent_left_id?: number;
  parent_right_id?: number;
  parent_rank?: number;
  parent_rarity?: number;
  blue_sparks?: number[][];
  pink_sparks?: number[][];
  green_sparks?: number[][];
  white_sparks?: number[][];
  
  blue_sparks_9star?: boolean;
  pink_sparks_9star?: boolean;
  green_sparks_9star?: boolean;
  // Main parent spark filtering
  main_parent_blue_sparks?: number[];
  main_parent_pink_sparks?: number[];
  main_parent_green_sparks?: number[];
  main_parent_white_sparks?: number[][];
  min_win_count?: number;
  min_white_count?: number;
  // Star sum filtering (min only)
  min_blue_stars_sum?: number;
  min_pink_stars_sum?: number;
  min_green_stars_sum?: number;
  min_white_stars_sum?: number;
  // Main inherit filtering
  min_main_blue_factors?: number;
  min_main_pink_factors?: number;
  min_main_green_factors?: number;
  min_main_white_count?: number;
  // Optional white sparks (no level requirement, used for sorting by match score)
  optional_white_sparks?: number[];
  optional_main_white_sparks?: number[];
  // Lineage white sparks (filter by white sparks in the lineage parents)
  lineage_white?: number[];
  main_legacy_white?: number[];
  left_legacy_white?: number[];
  right_legacy_white?: number[];
  // Support card filtering
  support_card_id?: number;
  min_limit_break?: number;
  max_limit_break?: number;
  min_experience?: number;
  // Common filtering
  trainer_id?: string;
  trainer_name?: string;
  max_follower_num?: number;
  sort_by?: string;
  uql?: string;
  player_chara_id_2?: number;
  desired_main_chara_id?: number;
  main_win_saddle?: number[];
  // Parent include/exclude filters (multi-select)
  parent_id?: number[];           // Matches against both left and right parent positions
  exclude_parent_id?: number[];   // Excludes from both left and right parent positions
  exclude_main_parent_id?: number[]; // Excludes main parent IDs
  p2_main_chara_id?: number;
  p2_win_saddle?: number[];
  affinity_p2?: number;
}
export interface FactorFilter {
  uuid: string;
  factorId: number | null;
  min: number;
  max: number;
}
@Component({
  selector: 'app-database-filter',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatSliderModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    MatChipsModule,
    FormsModule,
    RaceSchedulerComponent,
    VeteranDisplayComponent,
    AdvancedFilterPanelComponent,
    UqlFilterComponent,
    LocaleNumberPipe
  ],
  templateUrl: './database-filter.component.html',
  styleUrl: './database-filter.component.scss'
})
export class DatabaseFilterComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() resultCount: number | null = null;
  @Output() filterChange = new EventEmitter<UnifiedSearchParams>();
  @Output() maxFollowersToggled = new EventEmitter<boolean>();
  @Output() veteranSelected = new EventEmitter<VeteranMember | null>();
  private filterChangeSubject = new Subject<UnifiedSearchParams>();
  private destroy$ = new Subject<void>();
  @ViewChild(RaceSchedulerComponent) raceScheduler!: RaceSchedulerComponent;
  // Wrapping detection
  @ViewChild('mainLayout', { static: false }) mainLayoutRef!: ElementRef<HTMLElement>;
  legacyWrapped = false;
  searchWrapped = false;
  private resizeObserver?: ResizeObserver;
  private hostResizeObserver?: ResizeObserver;
  private wrappingDetectFrame: number | null = null;
  private floatingBtnFrame: number | null = null;
  isExpanded = false;
  filterMode: FilterMode = 'basic';
  uqlQuery = '';
  compiledUqlQuery = '';
  uqlValidationState: UqlValidationState = 'empty';
  uqlValidationMessage = '';
  uqlPreviewExpanded = false;
  currentUqlPreview = '';
  readonly uqlStarterSnippets: UqlSnippet[] = [
    { label: 'Speed', insertText: 'Speed >= 3' },
    { label: 'Wins', insertText: 'Wins >= 30' },
    { label: 'Name', insertText: "Trainer name ilike '%name%'" },
    { label: 'Include Umas', insertText: 'Main character in (Special Week, Silence Suzuka)' },
    { label: 'White Skill', insertText: 'White sparks has Right-Handed ○' },
    { label: 'Main Skill', insertText: 'Main white factors has Right-Handed ○' },
    { label: 'Any Skills', insertText: 'White sparks has any (Right-Handed ○, Left-Handed ○)' },
    { label: 'All Skills', insertText: 'White sparks has all (Right-Handed ○, Left-Handed ○)' },
    { label: 'Optional White', insertText: 'optional_white(Right-Handed ○, Left-Handed ○)' },
    { label: 'Lineage White', insertText: 'lineage_white(Right-Handed ○, Left-Handed ○)' },
    { label: 'Weighted Optional', insertText: 'optional_white(Right-Handed ○, Left-Handed ○, proc_weight = 10)' },
    { label: 'OR group', insertText: '(Speed >= 3 or Stamina >= 3) and Wins >= 30' },
    { label: 'Main Speed', insertText: 'Main Speed >= 3' },
    { label: 'Grandparent Speed', insertText: 'Grandparent Speed >= 3' },
    { label: 'Either path', insertText: '(Wins >= 35 and White factors >= 12) or (Blue stars >= 9 and Pink stars >= 6)' },
    { label: 'Exclude Test', insertText: "not Trainer name ilike '%test%'" }
  ];
  uqlSuggestions: UqlSuggestion[] = [];
  private readonly friendlySparkFields: FriendlySparkField[] = [
    { label: 'Speed', aliases: ['speed'], field: 'blue_sparks', factorId: 10, maxLevel: 9 },
    { label: 'Stamina', aliases: ['stamina'], field: 'blue_sparks', factorId: 20, maxLevel: 9 },
    { label: 'Power', aliases: ['power'], field: 'blue_sparks', factorId: 30, maxLevel: 9 },
    { label: 'Guts', aliases: ['guts'], field: 'blue_sparks', factorId: 40, maxLevel: 9 },
    { label: 'Wit', aliases: ['wit', 'wisdom', 'intelligence'], field: 'blue_sparks', factorId: 50, maxLevel: 9 },
    { label: 'Turf', aliases: ['turf'], field: 'pink_sparks', factorId: 110, maxLevel: 9 },
    { label: 'Dirt', aliases: ['dirt'], field: 'pink_sparks', factorId: 120, maxLevel: 9 },
    { label: 'Front Runner', aliases: ['front runner', 'front'], field: 'pink_sparks', factorId: 210, maxLevel: 9 },
    { label: 'Pace Chaser', aliases: ['pace chaser', 'pace'], field: 'pink_sparks', factorId: 220, maxLevel: 9 },
    { label: 'Late Surger', aliases: ['late surger', 'late'], field: 'pink_sparks', factorId: 230, maxLevel: 9 },
    { label: 'End Closer', aliases: ['end closer', 'end'], field: 'pink_sparks', factorId: 240, maxLevel: 9 },
    { label: 'Sprint', aliases: ['sprint'], field: 'pink_sparks', factorId: 310, maxLevel: 9 },
    { label: 'Mile', aliases: ['mile'], field: 'pink_sparks', factorId: 320, maxLevel: 9 },
    { label: 'Medium', aliases: ['medium', 'middle'], field: 'pink_sparks', factorId: 330, maxLevel: 9 },
    { label: 'Long', aliases: ['long'], field: 'pink_sparks', factorId: 340, maxLevel: 9 },
  ];
  private readonly friendlyFieldAliases: FriendlyFieldAlias[] = [
    { label: 'Wins', aliases: ['wins', 'win count', 'g1 wins'], field: 'win_count', type: 'number' },
    { label: 'White factors', aliases: ['white factors', 'white factor count', 'white count'], field: 'white_count', type: 'number' },
    { label: 'Followers', aliases: ['followers', 'follower count'], field: 'follower_num', type: 'number' },
    { label: 'Trainer name', aliases: ['trainer name', 'trainer', 'name'], field: 'trainer_name', type: 'string' },
    { label: 'Trainer ID', aliases: ['trainer id', 'account id'], field: 'account_id', type: 'string' },
    { label: 'Main character', aliases: ['main character', 'runner', 'main uma', 'main chara'], field: 'main_chara_id', type: 'number' },
    { label: 'Parent character', aliases: ['parent character', 'parent uma', 'main parent character', 'main parent', 'main', 'parent'], field: 'main_parent_id', type: 'number' },
    { label: 'GP1 character', aliases: ['grandparent 1', 'grand parent 1', 'gp1', 'left parent', 'left character', 'left uma'], field: 'left_chara_id', type: 'number' },
    { label: 'GP2 character', aliases: ['grandparent 2', 'grand parent 2', 'gp2', 'right parent', 'right character', 'right uma'], field: 'right_chara_id', type: 'number' },
    { label: 'Parent rank', aliases: ['parent rank', 'rank'], field: 'parent_rank', type: 'number' },
    { label: 'Blue stars', aliases: ['blue stars', 'blue star sum'], field: 'blue_stars_sum', type: 'number' },
    { label: 'Pink stars', aliases: ['pink stars', 'pink star sum'], field: 'pink_stars_sum', type: 'number' },
    { label: 'Green stars', aliases: ['green stars', 'green star sum'], field: 'green_stars_sum', type: 'number' },
    { label: 'White stars', aliases: ['white stars', 'white star sum'], field: 'white_stars_sum', type: 'number' },
    { label: 'Race affinity', aliases: ['race affinity', 'affinity'], field: 'computed_race_affinity', type: 'number' },
    { label: 'White sparks', aliases: ['white sparks', 'white skills'], field: 'white_sparks', type: 'array' },
    { label: 'Blue sparks', aliases: ['blue sparks'], field: 'blue_sparks', type: 'array' },
    { label: 'Pink sparks', aliases: ['pink sparks'], field: 'pink_sparks', type: 'array' },
    { label: 'Green sparks', aliases: ['green sparks', 'unique skills'], field: 'green_sparks', type: 'array' },
    { label: 'Main white factors', aliases: ['main white factors', 'main white sparks', 'main white skills', 'main skills'], field: 'main_white_factors', type: 'array' },
    { label: 'Main race wins', aliases: ['main race wins', 'main win saddles'], field: 'main_win_saddles', type: 'array' },
    // Additional fields documented in the UQL README so they show up in autocomplete and validate correctly.
    { label: 'Inheritance ID', aliases: ['inheritance id', 'inheritance_id'], field: 'inheritance_id', type: 'number' },
    { label: 'Parent inheritance ID', aliases: ['main parent id', 'main_parent_id', 'parent inheritance id'], field: 'main_parent_id', type: 'number' },
    { label: 'GP1 inheritance ID', aliases: ['gp1 id', 'grandparent 1 id', 'left parent id', 'parent left id', 'left_parent_id', 'parent_left_id'], field: 'parent_left_id', type: 'number' },
    { label: 'GP2 inheritance ID', aliases: ['gp2 id', 'grandparent 2 id', 'right parent id', 'parent right id', 'right_parent_id', 'parent_right_id'], field: 'parent_right_id', type: 'number' },
    { label: 'Parent rarity', aliases: ['parent rarity', 'rarity'], field: 'parent_rarity', type: 'number' },
    { label: 'Main blue factors', aliases: ['main blue factors', 'main blue parsed sparks', 'main blue spark ids'], field: 'main_blue_factors', type: 'number' },
    { label: 'Main pink factors', aliases: ['main pink factors', 'main pink parsed sparks', 'main pink spark ids'], field: 'main_pink_factors', type: 'number' },
    { label: 'Main green factors', aliases: ['main green factors', 'main green parsed sparks', 'main green spark ids'], field: 'main_green_factors', type: 'number' },
    { label: 'Main white count', aliases: ['main white count'], field: 'main_white_count', type: 'number' },
    { label: 'Left blue factors', aliases: ['left blue factors', 'left blue parsed sparks', 'gp1 blue factors', 'gp1 blue spark ids'], field: 'left_blue_factors', type: 'number' },
    { label: 'Left pink factors', aliases: ['left pink factors', 'left pink parsed sparks', 'gp1 pink factors', 'gp1 pink spark ids'], field: 'left_pink_factors', type: 'number' },
    { label: 'Left green factors', aliases: ['left green factors', 'left green parsed sparks', 'gp1 green factors', 'gp1 green spark ids'], field: 'left_green_factors', type: 'number' },
    { label: 'Left white count', aliases: ['left white count'], field: 'left_white_count', type: 'number' },
    { label: 'Right blue factors', aliases: ['right blue factors', 'right blue parsed sparks', 'gp2 blue factors', 'gp2 blue spark ids'], field: 'right_blue_factors', type: 'number' },
    { label: 'Right pink factors', aliases: ['right pink factors', 'right pink parsed sparks', 'gp2 pink factors', 'gp2 pink spark ids'], field: 'right_pink_factors', type: 'number' },
    { label: 'Right green factors', aliases: ['right green factors', 'right green parsed sparks', 'gp2 green factors', 'gp2 green spark ids'], field: 'right_green_factors', type: 'number' },
    { label: 'Right white count', aliases: ['right white count'], field: 'right_white_count', type: 'number' },
    { label: 'Race affinity (raw)', aliases: ['race affinity raw'], field: 'race_affinity', type: 'number' },
    { label: 'Support card count', aliases: ['support cards', 'support card count', 'support cards count'], field: 'support_card_count', type: 'number' },
    { label: 'Left white factors', aliases: ['left white factors', 'left white sparks'], field: 'left_white_factors', type: 'array' },
    { label: 'Right white factors', aliases: ['right white factors', 'right white sparks'], field: 'right_white_factors', type: 'array' },
    { label: 'Left race wins', aliases: ['left race wins', 'left win saddles'], field: 'left_win_saddles', type: 'array' },
    { label: 'Right race wins', aliases: ['right race wins', 'right win saddles'], field: 'right_win_saddles', type: 'array' },
    { label: 'Race results', aliases: ['race results'], field: 'race_results', type: 'array' },
  ];
  private readonly friendlySparkComparisonAliases: FriendlySparkComparisonAlias[] = this.friendlySparkFields
    .flatMap(field => field.aliases.map(alias => this.createFriendlySparkComparisonAlias(field, alias)))
    .sort((left, right) => right.alias.length - left.alias.length);
  private readonly friendlyFieldAliasReplacements: FriendlyFieldAliasReplacement[] = this.friendlyFieldAliases
    .flatMap(aliasGroup => aliasGroup.aliases.map(alias => this.createFriendlyFieldAliasReplacement(alias, aliasGroup.field)))
    .sort((left, right) => right.alias.length - left.alias.length);
  private readonly scopedArrayFields = this.buildScopedArrayFields();
  private readonly friendlyArrayAliasReplacements: FriendlyArrayAliasReplacement[] = [
    ...this.friendlyFieldAliases
      .filter(field => field.type === 'array')
      .flatMap(field => [field.field, field.label, ...field.aliases].map(alias => ({ alias, fields: [field.field], label: field.label }))),
    ...this.scopedArrayFields
  ]
    .sort((left, right) => right.alias.length - left.alias.length)
    .map(field => this.createFriendlyArrayAliasReplacement(field));
  private uqlNamedFactorsCache: UqlNamedFactor[] = [];
  private uqlNamedFactorComparisonsByLabelLength: UqlNamedFactorComparison[] = [];
  private scopedUqlNamedFactorsCache: UqlNamedFactor[] = [];
  private scopedSparkFieldsCache: FriendlyScopedSparkField[] = [];
  private scopedSparkComparisonAliases: FriendlyScopedSparkComparisonAlias[] = [];
  private factorValueLookup = new Map<string, UqlNamedFactor>();
  private uqlFieldPatternCache = new Map<UqlValueContext, string>();
  private readonly uqlFields = new Set([
    'inheritance_id', 'follower_num', 'followers', 'main_parent_id', 'parent_left_id', 'left_parent_id',
    'parent_right_id', 'right_parent_id', 'main_chara_id', 'left_chara_id', 'right_chara_id',
    'parent_rank', 'parent_rarity', 'win_count', 'wins', 'white_count', 'main_blue_factors',
    'main_pink_factors', 'main_green_factors', 'main_white_count', 'left_blue_factors',
    'left_pink_factors', 'left_green_factors', 'left_white_count', 'right_blue_factors',
    'right_pink_factors', 'right_green_factors', 'right_white_count', 'blue_stars_sum',
    'pink_stars_sum', 'green_stars_sum', 'white_stars_sum', 'race_affinity',
    'computed_race_affinity', 'support_card_count', 'support_cards_count', 'account_id',
    'trainer_id', 'trainer_name', 'name', 'blue_sparks', 'pink_sparks', 'green_sparks',
    'white_sparks', 'main_white_factors', 'main_white_sparks', 'left_white_factors',
    'left_white_sparks', 'right_white_factors', 'right_white_sparks', 'main_win_saddles',
    'left_win_saddles', 'right_win_saddles', 'race_results'
  ]);
  private readonly uqlKeywords = new Set([
    'where', 'and', 'or', 'not', 'in', 'between', 'like', 'ilike', 'true', 'false', 'null'
  ]);
  private readonly uqlFunctions = new Set([
    'contains', 'has', 'overlaps', 'any', 'has_all', 'contains_all', 'all',
    'support_card', 'has_support_card',
    'optional_white', 'optional_main_white', 'optional_any_white', 'lineage_white'
  ]);
  private readonly uqlFunctionParameterNames = new Set([
    'id', 'card_id', 'support_card_id', 'lb', 'limit_break', 'limit_break_count', 'exp', 'experience',
    'type_weight', 'distinct_weight', 'level_weight', 'match_weight', 'weight',
    'proc_weight', 'proc_kind', 'affinity',
    'stack_weight', 'occurrence_weight', 'base', 'base_percent', 'decay', 'decay_percent'
  ]);
  selectedLimitBreak = 0; // Default to LB0+
  includeMaxFollowers = false; // false = exclude max follower accounts (999), true = include (1000)
  searchUserId = ''; // Search for user ID
  searchUsername = ''; // Search for username
  selectedSupportCard: SupportCardShort | null = null;
  selectedVeteran: VeteranMember | null = null;
  selectedVeteranName = '';
  selectedVeteranImage = '';
  linkedAccounts: LinkedAccount[] = [];
  selectedAccountId: string | null = null;
  veterans: { [accountId: string]: VeteranMember[] } = {};
  loadingVeterans: { [accountId: string]: boolean } = {};
  private pendingVeteranRestore: { accountId: string; memberId: number } | null = null;
  activeFilterChips: ActiveFilterChip[] = [];
  // Collapsible section state
  collapsedSections = new Set<string>();
  // Scroll-aware floating button state
  showFloatingBtn = false;
  floatingBtnMode: 'results' | 'top' = 'results';
  private scrollListener?: () => void;
  // Factor Data
  blueFactors: any[] = [];
  pinkFactors: any[] = [];
  greenFactors: any[] = [];
  whiteFactors: any[] = [];
  // Active Factor Filters
  blueFactorFilters: FactorFilter[] = [];
  pinkFactorFilters: FactorFilter[] = [];
  greenFactorFilters: FactorFilter[] = [];
  whiteFactorFilters: FactorFilter[] = [];
  mainBlueFactorFilters: FactorFilter[] = [];
  mainPinkFactorFilters: FactorFilter[] = [];
  mainGreenFactorFilters: FactorFilter[] = [];
  mainWhiteFactorFilters: FactorFilter[] = [];
  // Optional white factors (no level, just ID - for scoring/sorting)
  optionalWhiteFactorFilters: FactorFilter[] = [];
  optionalMainWhiteFactorFilters: FactorFilter[] = [];
  // Lineage white factors (filter by which white sparks exist in lineage parents)
  lineageWhiteFactorFilters: FactorFilter[] = [];
  // Parent include/exclude character selections (multi-select)
  includeMainParentCharacters: { id: number; name: string; image?: string }[] = [];
  includeParentCharacters: { id: number; name: string; image?: string }[] = [];
  excludeParentCharacters: { id: number; name: string; image?: string }[] = [];
  excludeMainParentCharacters: { id: number; name: string; image?: string }[] = [];
  // Race schedule
  raceScheduleRaceCount = 0;
  ngOnInit() {
    this.updateUqlSuggestions();
    this.applyBasicFilterDefaults();
    // Default Quick Filters collapsed at all sizes
    this.collapsedSections.add('quickFilters');
    // On mobile, default all sections to collapsed
    if (window.innerWidth <= 600) {
      this.collapsedSections.add('mLegacyTree');
      this.collapsedSections.add('mSupportCard');
      this.collapsedSections.add('mSearchUsers');
      this.collapsedSections.add('inheritanceFactors');
      this.collapsedSections.add('mainParentFactors');
      this.collapsedSections.add('generalCriteria');
      this.collapsedSections.add('totalStarCount');
      this.collapsedSections.add('raceSchedule');
    }
    this.filterChangeSubject.pipe(
      debounceTime(800) // Increased to prevent rate limiting
    ).subscribe(filters => {
      this.filterChange.emit(filters);
    });
    this.factorService.getFactors()
      .pipe(takeUntil(this.destroy$))
      .subscribe(factors => this.setFactorOptions(factors));
  }

  private setFactorOptions(factors: any[]): void {
    const normalize = (factor: any) => ({ ...factor, id: parseInt(factor.id, 10) });
    this.blueFactors = factors.filter((f: any) => f.type === 0).map(normalize);
    this.pinkFactors = factors.filter((f: any) => f.type === 1).map(normalize);
    this.greenFactors = factors.filter((f: any) => f.type === 5).map(normalize);
    this.whiteFactors = factors.filter((f: any) => f.type === 2 || f.type === 3 || f.type === 4).map(normalize);
    this.rebuildUqlDerivedCaches();
    this.updateUqlSuggestions();
  }
  // Filter State
  filterState: UnifiedSearchParams = {
    blue_sparks: [],
    pink_sparks: [],
    green_sparks: [],
    white_sparks: [],
    
    blue_sparks_9star: false,
    pink_sparks_9star: false,
    green_sparks_9star: false,
    min_win_count: 0,
    min_white_count: 0,
    min_main_blue_factors: undefined,
    min_main_pink_factors: undefined,
    min_main_green_factors: undefined,
    min_main_white_count: 0,
    
    main_parent_blue_sparks: [],
    main_parent_pink_sparks: [],
    main_parent_green_sparks: [],
    main_parent_white_sparks: [],
    parent_rank: 1,
    parent_rarity: undefined,
    max_follower_num: 999,
    
    parent_id: [],
    exclude_parent_id: [],
    exclude_main_parent_id: [],
    
    min_experience: undefined,
  };
  // Filtered Options for Autocomplete
  filteredGreenFactorOptions: any[][] = [];
  filteredWhiteFactorOptions: any[][] = [];
  filteredMainWhiteFactorOptions: any[][] = [];
  filteredMainGreenFactorOptions: any[][] = [];
  filteredOptionalWhiteFactorOptions: any[][] = [];
  filteredOptionalMainWhiteFactorOptions: any[][] = [];
  filteredLineageWhiteFactorOptions: any[][] = [];
  private uuidCounter = 0;
  constructor(
    private dialog: MatDialog,
    private supportCardService: SupportCardService,
    private factorService: FactorService,
    private authService: AuthService,
    private profileService: ProfileService,
    private elementRef: ElementRef,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {
    this.rebuildUqlDerivedCaches();
  }
  ngAfterViewInit() {
    this.setupWrappingDetection();
    this.setupScrollListener();
    this.setupHostResizeObserver();
  }
  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.hostResizeObserver?.disconnect();
    if (this.wrappingDetectFrame !== null) cancelAnimationFrame(this.wrappingDetectFrame);
    if (this.floatingBtnFrame !== null) cancelAnimationFrame(this.floatingBtnFrame);
    this.teardownScrollListener();
    this.destroy$.next();
    this.destroy$.complete();
  }
  private setupScrollListener() {
    this.scrollListener = () => this.scheduleFloatingBtnUpdate();
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.scrollListener!, { passive: true });
    });
  }
  private teardownScrollListener() {
    if (this.scrollListener) {
      window.removeEventListener('scroll', this.scrollListener);
      this.scrollListener = undefined;
    }
  }
  private setupHostResizeObserver() {
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    this.ngZone.runOutsideAngular(() => {
      this.hostResizeObserver = new ResizeObserver(() => {
        this.scheduleFloatingBtnUpdate();
      });
      this.hostResizeObserver.observe(hostEl);
    });
  }
  private scheduleFloatingBtnUpdate() {
    if (this.floatingBtnFrame !== null) return;
    this.floatingBtnFrame = requestAnimationFrame(() => {
      this.floatingBtnFrame = null;
      this.updateFloatingBtnState();
    });
  }
  private updateFloatingBtnState() {
    let newShow: boolean;
    let newMode: 'results' | 'top';

    if (!this.isExpanded) {
      const hostEl = this.elementRef.nativeElement as HTMLElement;
      const rect = hostEl.getBoundingClientRect();
      newShow = rect.bottom < 100;
      newMode = 'top';
    } else {
      const hostEl = this.elementRef.nativeElement as HTMLElement;
      const rect = hostEl.getBoundingClientRect();
      const filterBottom = rect.bottom;
      if (filterBottom > window.innerHeight) {
        newShow = true;
        newMode = 'results';
      } else {
        newShow = window.scrollY > 200;
        newMode = 'top';
      }
    }

    if (newShow !== this.showFloatingBtn || newMode !== this.floatingBtnMode) {
      this.ngZone.run(() => {
        this.showFloatingBtn = newShow;
        this.floatingBtnMode = newMode;
      });
    }
  }
  private setupWrappingDetection() {
    if (!this.mainLayoutRef) return;
    const el = this.mainLayoutRef.nativeElement;
    const detect = () => {
      const legacy = el.querySelector('.legacy-tree-wrapper') as HTMLElement;
      const supportLb = el.querySelector('.support-lb-group') as HTMLElement;
      const search = el.querySelector('.search-wrapper') as HTMLElement;
      if (!legacy || !supportLb || !search) return;
      // Temporarily remove wrapping classes to measure natural positions
      legacy.classList.remove('is-wrapped');
      supportLb.classList.remove('is-wrapped');
      search.classList.remove('is-wrapped');
      // Force layout recalc
      const legacyTop = legacy.offsetTop;
      const supportTop = supportLb.offsetTop;
      const searchTop = search.offsetTop;
      const newLegacyWrapped = supportTop > legacyTop + 10;
      const newSearchWrapped = searchTop > supportTop + 10;
      if (newLegacyWrapped !== this.legacyWrapped || newSearchWrapped !== this.searchWrapped) {
        this.ngZone.run(() => {
          this.legacyWrapped = newLegacyWrapped;
          this.searchWrapped = newSearchWrapped;
        });
      } else {
        // Re-apply classes since Angular won't re-render
        if (this.legacyWrapped) { legacy.classList.add('is-wrapped'); supportLb.classList.add('is-wrapped'); }
        if (this.searchWrapped) search.classList.add('is-wrapped');
      }
    };
    const scheduleDetect = () => {
      if (this.wrappingDetectFrame !== null) return;
      this.wrappingDetectFrame = requestAnimationFrame(() => {
        this.wrappingDetectFrame = null;
        detect();
      });
    };
    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => scheduleDetect());
      this.resizeObserver.observe(el);
    });
    // Initial check
    setTimeout(() => scheduleDetect(), 0);
  }
  scrollToResults() {
    // Scroll past the filter to the results section
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const rect = hostEl.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top + rect.height - 60;
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }
  scrollToTop() {
    const hostEl = this.elementRef.nativeElement as HTMLElement;
    const rect = hostEl.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - 20;
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }
  onFloatingBtnClick() {
    if (this.floatingBtnMode === 'results') {
      this.scrollToResults();
    } else {
      this.scrollToTop();
    }
  }
  // --- Serialization Logic ---
  getSerializedState(): string {
    const state: CompressedState = {};
    if (this.filterMode !== 'basic') state.fm = this.filterMode;
    const normalizedUql = this.getNormalizedUqlQuery();
    if (normalizedUql) state.uql = normalizedUql;
    // Factors
    if (this.blueFactorFilters.length) state.b = this.blueFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.pinkFactorFilters.length) state.p = this.pinkFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.greenFactorFilters.length) state.g = this.greenFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.whiteFactorFilters.length) state.w = this.whiteFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.optionalWhiteFactorFilters.length) {
      const ids = this.optionalWhiteFactorFilters.filter(f => f.factorId && f.factorId > 0).map(f => f.factorId!);
      if (ids.length) state.ow = ids;
    }
    if (this.optionalMainWhiteFactorFilters.length) {
      const ids = this.optionalMainWhiteFactorFilters.filter(f => f.factorId && f.factorId > 0).map(f => f.factorId!);
      if (ids.length) state.omw = ids;
    }
    if (this.lineageWhiteFactorFilters.length) {
      const ids = this.lineageWhiteFactorFilters.filter(f => f.factorId && f.factorId > 0).map(f => f.factorId!);
      if (ids.length) state.lw = ids;
    }
    if (this.mainBlueFactorFilters.length) state.mb = this.mainBlueFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.mainPinkFactorFilters.length) state.mp = this.mainPinkFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.mainGreenFactorFilters.length) state.mg = this.mainGreenFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.mainWhiteFactorFilters.length) state.mw = this.mainWhiteFactorFilters.map(f => [f.factorId, f.min, f.max]);
    // Tree
    const t: (number|null)[] = [
      this.treeData.characterId || null,
      this.treeData.children?.[0]?.characterId || null,
      this.treeData.children?.[0]?.children?.[0]?.characterId || null,
      this.treeData.children?.[0]?.children?.[1]?.characterId || null,
      this.treeData.children?.[1]?.characterId || null,
      this.treeData.children?.[1]?.children?.[0]?.characterId || null,
      this.treeData.children?.[1]?.children?.[1]?.characterId || null,
    ];
    // Only add tree if at least one node is selected
    if (t.some(id => id !== null)) {
      state.t = t;
    }
    // Other fields
    if (this.selectedSupportCard) state.sc = this.selectedSupportCard.id;
    if (this.selectedLimitBreak > 0) state.lb = this.selectedLimitBreak;
    if (this.searchUserId) state.uid = this.searchUserId;
    
    if (this.filterState.min_win_count) state.mwc = this.filterState.min_win_count;
    if (this.filterState.min_white_count) state.mwh = this.filterState.min_white_count;
    if (this.filterState.parent_rank && this.filterState.parent_rank !== 1) state.pr = this.filterState.parent_rank;
    if (this.includeMaxFollowers) state.mf = 1000;
    
    // Star sum filters (min only)
    if (this.filterState.min_blue_stars_sum) state.bss = this.filterState.min_blue_stars_sum;
    if (this.filterState.min_pink_stars_sum) state.pss = this.filterState.min_pink_stars_sum;
    if (this.filterState.min_green_stars_sum) state.gss = this.filterState.min_green_stars_sum;
    if (this.filterState.min_white_stars_sum) state.wss = this.filterState.min_white_stars_sum;
    
    // Main parent min white count
    if (this.filterState.min_main_white_count) state.mmwc = this.filterState.min_main_white_count;
    // Parent include/exclude
    if (this.includeMainParentCharacters.length) state.imp = this.includeMainParentCharacters.map(c => c.id);
    if (this.includeParentCharacters.length) state.ip = this.includeParentCharacters.map(c => c.id);
    if (this.excludeParentCharacters.length) state.ep = this.excludeParentCharacters.map(c => c.id);
    if (this.excludeMainParentCharacters.length) state.emp = this.excludeMainParentCharacters.map(c => c.id);
    if (this.raceScheduler) {
      const encoded = this.raceScheduler.getEncodedSelection();
      if (encoded.length) state.rs = encoded;
    }
    if (this.selectedVeteran && this.selectedAccountId && this.selectedVeteran.member_id != null) {
      state.vet = [this.selectedAccountId, this.selectedVeteran.member_id];
    }
    return btoa(JSON.stringify(state));
  }
  loadSerializedState(stateStr: string) {
    try {
      const state: CompressedState = JSON.parse(atob(stateStr));
      if (state.fm === 'basic' || state.fm === 'advanced' || state.fm === 'uql') {
        this.filterMode = state.fm;
      }
      this.uqlQuery = state.uql || '';
      this.validateUqlQuery();
      
      // Restore Factors
      const restoreFactors = (source: (number|null)[][] | undefined, target: FactorFilter[], type?: 'green' | 'white' | 'mainWhite' | 'mainGreen') => {
        if (!source) return;
        source.forEach(([id, min, max]) => {
          const filter: FactorFilter = {
            uuid: this.getUuid(),
            factorId: id,
            min: min || 1,
            max: max !== undefined && max !== null ? max : 9
          };
          target.push(filter);
          
          // Update autocomplete options
          if (type === 'green') this.filteredGreenFactorOptions.push([...this.greenFactors]);
          if (type === 'white') this.filteredWhiteFactorOptions.push([...this.whiteFactors]);
          if (type === 'mainWhite') this.filteredMainWhiteFactorOptions.push([...this.whiteFactors]);
          if (type === 'mainGreen') this.filteredMainGreenFactorOptions.push([...this.greenFactors]);
        });
      };
      // Clear existing
      this.blueFactorFilters = [];
      this.pinkFactorFilters = [];
      this.greenFactorFilters = [];
      this.whiteFactorFilters = [];
      this.mainBlueFactorFilters = [];
      this.mainPinkFactorFilters = [];
      this.mainGreenFactorFilters = [];
      this.mainWhiteFactorFilters = [];
      this.optionalWhiteFactorFilters = [];
      this.optionalMainWhiteFactorFilters = [];
      this.lineageWhiteFactorFilters = [];
      this.filteredGreenFactorOptions = [];
      this.filteredWhiteFactorOptions = [];
      this.filteredMainWhiteFactorOptions = [];
      this.filteredOptionalWhiteFactorOptions = [];
      this.filteredOptionalMainWhiteFactorOptions = [];
      this.filteredLineageWhiteFactorOptions = [];
      restoreFactors(state.b, this.blueFactorFilters);
      restoreFactors(state.p, this.pinkFactorFilters);
      restoreFactors(state.g, this.greenFactorFilters, 'green');
      restoreFactors(state.w, this.whiteFactorFilters, 'white');
      restoreFactors(state.mb, this.mainBlueFactorFilters);
      restoreFactors(state.mp, this.mainPinkFactorFilters);
      restoreFactors(state.mg, this.mainGreenFactorFilters, 'mainGreen');
      // Actually mainGreenFactorFilters uses autocomplete? Let's check.
      // In addFactorFilter, type 'green' adds to filteredGreenFactorOptions.
      // But mainGreenFactorFilters logic in addFactorFilter is missing in the original code?
      // Let's assume it works like others.
      
      restoreFactors(state.mw, this.mainWhiteFactorFilters, 'mainWhite');
      // Restore Optional Factors
      const restoreOptionalFactors = (source: number[] | undefined, target: FactorFilter[], type: 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite') => {
        if (!source) return;
        source.forEach(id => {
          const filter: FactorFilter = {
            uuid: this.getUuid(),
            factorId: id,
            min: 1,
            max: 9
          };
          target.push(filter);
          
          if (type === 'optionalWhite') this.filteredOptionalWhiteFactorOptions.push([...this.whiteFactors]);
          if (type === 'optionalMainWhite') this.filteredOptionalMainWhiteFactorOptions.push([...this.whiteFactors]);
          if (type === 'lineageWhite') this.filteredLineageWhiteFactorOptions.push([...this.whiteFactors]);
        });
      };
      restoreOptionalFactors(state.ow, this.optionalWhiteFactorFilters, 'optionalWhite');
      restoreOptionalFactors(state.omw, this.optionalMainWhiteFactorFilters, 'optionalMainWhite');
      restoreOptionalFactors(state.lw, this.lineageWhiteFactorFilters, 'lineageWhite');
      // Restore Tree
      if (state.t) {
        const [target, p1, p1g1, p1g2, p2, p2g1, p2g2] = state.t;
        
        const setNode = (node: TreeNode, id: number | null) => {
          if (id) {
            node.characterId = id;
            const char = getMasterCharacterById(id);
            if (char) {
              node.name = char.name || `ID: ${id}`;
              node.image = char?.image;
            } else {
              node.name = `ID: ${id}`; 
              node.image = undefined;
            }
          }
        };
        setNode(this.treeData, target);
        if (this.treeData.children?.[0]) {
          setNode(this.treeData.children[0], p1);
          if (this.treeData.children[0].children?.[0]) setNode(this.treeData.children[0].children[0], p1g1);
          if (this.treeData.children[0].children?.[1]) setNode(this.treeData.children[0].children[1], p1g2);
        }
        if (this.treeData.children?.[1]) {
          setNode(this.treeData.children[1], p2);
          if (this.treeData.children[1].children?.[0]) setNode(this.treeData.children[1].children[0], p2g1);
          if (this.treeData.children[1].children?.[1]) setNode(this.treeData.children[1].children[1], p2g2);
        }
        
        this.updateTreeFilters(); // This updates filterState from treeData
      }
      // Restore Support Card
      if (state.sc) {
        // Try to fetch card info
        this.supportCardService.getSupportCards().subscribe((cards: SupportCardShort[]) => {
           const card = cards.find((c: SupportCardShort) => c.id.toString() === state.sc);
           if (card) {
             this.selectedSupportCard = {
               id: card.id.toString(),
               name: card.name,
               imageUrl: card.imageUrl,
               type: card.type,
               rarity: card.rarity,
               limitBreak: card.limitBreak,
               release_date: card.release_date
             };
             this.onFilterChange();
           }
        });
      }
      // Restore Scalars
      if (state.lb !== undefined) this.selectedLimitBreak = state.lb;
      this.applyBasicFilterDefaults(false);
      if (state.uid) this.searchUserId = state.uid;
      
      if (state.mwc !== undefined) this.filterState.min_win_count = state.mwc;
      if (state.mwh !== undefined) this.filterState.min_white_count = state.mwh;
      if (state.pr !== undefined) this.filterState.parent_rank = state.pr;
      if (state.mf !== undefined) {
        this.filterState.max_follower_num = state.mf;
        this.includeMaxFollowers = state.mf >= 1000;
        this.maxFollowersToggled.emit(this.includeMaxFollowers);
      }
      
      // Star sum filters (min only, with backwards compatibility for old [min, max] format)
      if (state.bss !== undefined) {
        this.filterState.min_blue_stars_sum = Array.isArray(state.bss) ? state.bss[0] : state.bss;
      }
      if (state.pss !== undefined) {
        this.filterState.min_pink_stars_sum = Array.isArray(state.pss) ? state.pss[0] : state.pss;
      }
      if (state.gss !== undefined) {
        this.filterState.min_green_stars_sum = Array.isArray(state.gss) ? state.gss[0] : state.gss;
      }
      if (state.wss !== undefined) {
        this.filterState.min_white_stars_sum = Array.isArray(state.wss) ? state.wss[0] : state.wss;
      }
      
      // Main parent min white count
      if (state.mmwc !== undefined) {
        this.filterState.min_main_white_count = state.mmwc;
      }
      // Restore parent include/exclude
      this.includeMainParentCharacters = [];
      this.includeParentCharacters = [];
      this.excludeParentCharacters = [];
      this.excludeMainParentCharacters = [];
      const restoreParentChars = (ids: number[] | undefined, target: { id: number; name: string; image?: string }[]) => {
        if (!ids) return;
        ids.forEach(id => {
          const char = getMasterCharacterById(id);
          if (char) {
            target.push({ id, name: char.name || `ID: ${id}`, image: char.image });
          } else {
            target.push({ id, name: `ID: ${id}` });
          }
        });
      };
      restoreParentChars(state.imp, this.includeMainParentCharacters);
      restoreParentChars(state.ip, this.includeParentCharacters);
      restoreParentChars(state.ep, this.excludeParentCharacters);
      restoreParentChars(state.emp, this.excludeMainParentCharacters);
      // Restore race schedule
      if (state.rs && this.raceScheduler) {
        this.raceScheduler.setEncodedSelection(state.rs as [number, number, number, number][]);
        this.raceScheduleRaceCount = this.raceScheduler.selectedRaceIds.size;
        this.filterState.main_win_saddle = this.raceScheduleRaceCount > 0
          ? this.raceScheduler.getSelectedSaddleIds()
          : undefined;
      }
      // Restore veteran
      if (state.vet) {
        const [accountId, memberId] = state.vet;
        this.pendingVeteranRestore = { accountId, memberId };
        this.selectedAccountId = accountId;
        this.loadLinkedAccounts(() => {
          if (this.veterans[accountId]?.length) {
            this.tryRestoreVeteran();
          } else {
            this.loadVeteransForAccount(accountId);
          }
        });
      }
      this.onFilterChange();
    } catch (e) {
      console.error('Failed to load filter state', e);
    }
  }
  // Helper to generate unique IDs
  private getUuid(): string {
    return `filter_${this.uuidCounter++}`;
  }
  // --- Factor Filter Management ---
  addFactorFilter(list: FactorFilter[], defaultFactorId: number | null, type?: 'green' | 'white' | 'mainWhite' | 'mainGreen' | 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite') {
    list.push({
      uuid: this.getUuid(),
      factorId: defaultFactorId,
      min: 1,
      max: 9
    });
    if (type === 'green') this.filteredGreenFactorOptions.push([...this.greenFactors]);
    if (type === 'white') this.filteredWhiteFactorOptions.push([...this.whiteFactors]);
    if (type === 'mainWhite') this.filteredMainWhiteFactorOptions.push([...this.whiteFactors]);
    if (type === 'mainGreen') this.filteredMainGreenFactorOptions.push([...this.greenFactors]);
    if (type === 'optionalWhite') this.filteredOptionalWhiteFactorOptions.push([...this.whiteFactors]);
    if (type === 'optionalMainWhite') this.filteredOptionalMainWhiteFactorOptions.push([...this.whiteFactors]);
    if (type === 'lineageWhite') this.filteredLineageWhiteFactorOptions.push([...this.whiteFactors]);
    // Enforce single green factor for main parent
    if (type === 'mainGreen' && this.mainGreenFactorFilters.length > 1) {
      // Remove the previous one, keep the new one
      this.removeFactorFilter(this.mainGreenFactorFilters, 0, 'mainGreen');
    }
    // Only trigger filter change if a valid factor is already selected
    // For white factors with null default, don't trigger until user selects something
    if (defaultFactorId !== null) {
      this.onFilterChange();
    }
  }
  removeFactorFilter(list: FactorFilter[], index: number, type?: 'green' | 'white' | 'mainWhite' | 'mainGreen' | 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite') {
    // Check if the filter being removed had a valid selection
    const removedFilter = list[index];
    const hadValidSelection = removedFilter && removedFilter.factorId !== null && removedFilter.factorId !== 0;
    
    list.splice(index, 1);
    
    if (type === 'green') this.filteredGreenFactorOptions.splice(index, 1);
    if (type === 'white') this.filteredWhiteFactorOptions.splice(index, 1);
    if (type === 'mainWhite') this.filteredMainWhiteFactorOptions.splice(index, 1);
    if (type === 'mainGreen') this.filteredMainGreenFactorOptions.splice(index, 1);
    if (type === 'optionalWhite') this.filteredOptionalWhiteFactorOptions.splice(index, 1);
    if (type === 'optionalMainWhite') this.filteredOptionalMainWhiteFactorOptions.splice(index, 1);
    if (type === 'lineageWhite') this.filteredLineageWhiteFactorOptions.splice(index, 1);
    // Always trigger filter change to update chips and URL
    this.onFilterChange();
  }
  // --- Autocomplete Logic ---
  filterFactors(value: string | number, type: 'green' | 'white' | 'mainWhite' | 'mainGreen' | 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite', index: number) {
    // If value is a number (factor ID selected), don't filter - just return
    if (typeof value === 'number') return;
    
    const filterValue = (value || '').toLowerCase();
    let sourceList: any[] = [];
    
    if (type === 'green' || type === 'mainGreen') sourceList = this.greenFactors;
    else sourceList = this.whiteFactors; // All white types use whiteFactors
    const filtered = sourceList.filter(option => option.text.toLowerCase().includes(filterValue));
    if (type === 'green') this.filteredGreenFactorOptions[index] = filtered;
    if (type === 'white') this.filteredWhiteFactorOptions[index] = filtered;
    if (type === 'mainWhite') this.filteredMainWhiteFactorOptions[index] = filtered;
    if (type === 'mainGreen') this.filteredMainGreenFactorOptions[index] = filtered;
    if (type === 'optionalWhite') this.filteredOptionalWhiteFactorOptions[index] = filtered;
    if (type === 'optionalMainWhite') this.filteredOptionalMainWhiteFactorOptions[index] = filtered;
    if (type === 'lineageWhite') this.filteredLineageWhiteFactorOptions[index] = filtered;
  }
  getFactorText(id: number | null | undefined, type: 'green' | 'white'): string {
    if (id === null || id === undefined) return '';
    if (id === 0) return 'Any';
    const list = type === 'green' ? this.greenFactors : this.whiteFactors;
    const found = list.find(f => f.id === id);
    return found ? found.text : '';
  }
  onFactorSelected(event: MatAutocompleteSelectedEvent, filter: FactorFilter) {
    filter.factorId = event.option.value;
    this.onFilterChange();
  }
  // --- Tree Logic ---
  treeData: TreeNode = {
    id: 'target',
    name: 'Target Character',
    layer: 0,
    children: [
      {
        id: 'p1',
        name: 'Parent 1',
        layer: 1,
        children: [
          { id: 'p2-1', name: 'Grandparent 1', layer: 2 },
          { id: 'p2-2', name: 'Grandparent 2', layer: 2 }
        ]
      },
      {
        id: 'p1-2',
        name: 'Parent 2',
        layer: 1,
        children: [
          { id: 'p2-3', name: 'Grandparent 3', layer: 2 },
          { id: 'p2-4', name: 'Grandparent 4', layer: 2 }
        ]
      }
    ]
  };
  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
    // Recalculate floating button state after animation settles
    setTimeout(() => this.updateFloatingBtnState(), 350);
  }
  toggleSection(section: string) {
    if (this.collapsedSections.has(section)) {
      this.collapsedSections.delete(section);
    } else {
      this.collapsedSections.add(section);
    }
  }
  isSectionCollapsed(section: string): boolean {
    return this.collapsedSections.has(section);
  }
  getCharacterImagePath(imageName: string | undefined): string {
    if (!imageName) return 'assets/images/placeholder-uma.webp';
    if (imageName.startsWith('assets/')) return preferRasterAsset(imageName);
    return preferRasterAsset(`assets/images/character_stand/${imageName}`);
  }
  selectNode(node: TreeNode) {
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: { affinityTargetIds: this.getAffinityTargetsForTreeNode(node) }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const newBaseId = Math.floor(result.id / 100);
        // Layer-aware duplicate removal
        if (node.layer === 0) {
          // Adding to Target: conflicts with Main Parent only
          this.clearFromMainParents(newBaseId);
        } else if (node.layer === 1) {
          // Adding to Main Parent: conflicts with Target + Grandparents
          this.clearFromTarget(newBaseId);
          this.clearFromGrandparents(newBaseId);
          this.clearFromMainParentNodes(newBaseId); // same-level dedup
        } else {
          // Adding to Grandparent: conflicts with Main Parent only
          this.clearFromMainParents(newBaseId);
          this.clearFromGrandparentNodes(newBaseId); // same-level dedup
        }
        node.name = result.name;
        node.image = result.image;
        node.characterId = result.id;
        
        this.updateTreeFilters();
      }
    });
  }
  /** Build affinity target list for picking a slot in the breeding tree. */
  private getAffinityTargetsForTreeNode(node: TreeNode): number[] {
    const baseOf = (id?: number) => (id ? Math.floor(id / 100) : null);
    const ids: number[] = [];
    const push = (id?: number) => { const b = baseOf(id); if (b) ids.push(b); };
    const target = this.treeData;
    const p1 = this.treeData.children?.[0];
    const p2 = this.treeData.children?.[1];
    if (node === target) {
      push(p1?.characterId);
      push(p2?.characterId);
    } else if (node === p1) {
      push(target.characterId);
      push(p1?.children?.[0]?.characterId);
      push(p1?.children?.[1]?.characterId);
    } else if (node === p2) {
      push(target.characterId);
      push(p2?.children?.[0]?.characterId);
      push(p2?.children?.[1]?.characterId);
    } else if (p1?.children?.includes(node)) {
      push(target.characterId);
      push(p1?.characterId);
    } else if (p2?.children?.includes(node)) {
      push(target.characterId);
      push(p2?.characterId);
    } else {
      push(target.characterId);
    }
    return ids;
  }

  /** Clear character from Target tree node */
  private clearFromTarget(baseId: number) {
    if (this.treeData.characterId && Math.floor(this.treeData.characterId / 100) === baseId) {
      this.treeData.name = 'Target Character';
      this.treeData.image = undefined;
      this.treeData.characterId = undefined;
    }
  }
  /** Clear character from Main Parent tree nodes + include main parent list (not excludes) */
  private clearFromMainParents(baseId: number) {
    this.clearFromMainParentNodes(baseId);
    this.includeMainParentCharacters = this.includeMainParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
  }
  /** Clear character from Main Parent tree nodes only */
  private clearFromMainParentNodes(baseId: number) {
    if (this.treeData.children) {
      for (const child of this.treeData.children) {
        if (child.characterId && Math.floor(child.characterId / 100) === baseId) {
          child.name = 'Parent';
          child.image = undefined;
          child.characterId = undefined;
        }
      }
    }
  }
  /** Clear character from Grandparent tree nodes + include parent list (not excludes) */
  private clearFromGrandparents(baseId: number) {
    this.clearFromGrandparentNodes(baseId);
    this.includeParentCharacters = this.includeParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
  }
  /** Clear character from Grandparent tree nodes only */
  private clearFromGrandparentNodes(baseId: number) {
    if (this.treeData.children) {
      for (const child of this.treeData.children) {
        if (child.children) {
          for (const grandchild of child.children) {
            if (grandchild.characterId && Math.floor(grandchild.characterId / 100) === baseId) {
              grandchild.name = 'Grandparent';
              grandchild.image = undefined;
              grandchild.characterId = undefined;
            }
          }
        }
      }
    }
  }
  updateTreeFilters() {
    this.filterState.player_chara_id = this.treeData.characterId;
    
    // Main parent: combine tree selection with include list
    const mainParentIds: number[] = [];
    const mainParent = this.treeData.children?.[0];
    if (mainParent?.characterId) {
      mainParentIds.push(mainParent.characterId);
    }
    this.includeMainParentCharacters.forEach(c => {
      if (!mainParentIds.includes(c.id)) mainParentIds.push(c.id);
    });
    this.filterState.main_parent_id = mainParentIds.length > 0 ? mainParentIds : undefined;
    if (mainParent && mainParent.children) {
      this.filterState.parent_left_id = mainParent.children[0]?.characterId;
      this.filterState.parent_right_id = mainParent.children[1]?.characterId;
    }
    // Sync parent include/exclude arrays
    this.filterState.parent_id = this.includeParentCharacters.map(c => c.id);
    this.filterState.exclude_parent_id = this.excludeParentCharacters.map(c => c.id);
    this.filterState.exclude_main_parent_id = this.excludeMainParentCharacters.map(c => c.id);
    
    this.onFilterChange();
  }
  // --- Parent Include/Exclude Character Selection ---
  addIncludeParent() {
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: {
        multiSelect: true,
        existingIds: this.includeParentCharacters.map(c => c.id),
        mode: 'include'
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && Array.isArray(result)) {
        result.forEach((char: any) => {
          if (!this.includeParentCharacters.some(c => c.id === char.id)) {
            // Grandparent include conflicts only with explicit grandparent picks and exclude grandparent list.
            const baseId = Math.floor(char.id / 100);
            this.clearFromGrandparentNodes(baseId);
            // Remove from exclude grandparent list (can't include + exclude same role)
            this.excludeParentCharacters = this.excludeParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
            this.includeParentCharacters.push({ id: char.id, name: char.name, image: char.image });
          }
        });
        this.updateTreeFilters();
      }
    });
  }
  removeIncludeParent(index: number) {
    this.includeParentCharacters.splice(index, 1);
    this.updateTreeFilters();
  }
  addExcludeParent() {
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: {
        multiSelect: true,
        existingIds: this.excludeParentCharacters.map(c => c.id),
        mode: 'exclude'
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && Array.isArray(result)) {
        result.forEach((char: any) => {
          if (!this.excludeParentCharacters.some(c => c.id === char.id)) {
            // Remove from include grandparent list (can't include + exclude same role)
            const baseId = Math.floor(char.id / 100);
            this.includeParentCharacters = this.includeParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
            this.excludeParentCharacters.push({ id: char.id, name: char.name, image: char.image });
          }
        });
        this.updateTreeFilters();
      }
    });
  }
  removeExcludeParent(index: number) {
    this.excludeParentCharacters.splice(index, 1);
    this.updateTreeFilters();
  }
  addIncludeMainParent() {
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: {
        multiSelect: true,
        existingIds: this.includeMainParentCharacters.map(c => c.id),
        mode: 'include'
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && Array.isArray(result)) {
        result.forEach((char: any) => {
          if (!this.includeMainParentCharacters.some(c => c.id === char.id)) {
            // Main parent include conflicts with target, explicit main parent picks, and exclude main parent list.
            const baseId = Math.floor(char.id / 100);
            this.clearFromTarget(baseId);
            this.clearFromMainParentNodes(baseId);
            // Remove from exclude main parent list (can't include + exclude same role)
            this.excludeMainParentCharacters = this.excludeMainParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
            this.includeMainParentCharacters.push({ id: char.id, name: char.name, image: char.image });
          }
        });
        this.updateTreeFilters();
      }
    });
  }
  removeIncludeMainParent(index: number) {
    this.includeMainParentCharacters.splice(index, 1);
    this.updateTreeFilters();
  }
  addExcludeMainParent() {
    const dialogRef = this.dialog.open(CharacterSelectDialogComponent, {
      width: '90%',
      maxWidth: '600px',
      height: '80vh',
      panelClass: 'modern-dialog-panel',
      data: {
        multiSelect: true,
        existingIds: this.excludeMainParentCharacters.map(c => c.id),
        mode: 'exclude'
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && Array.isArray(result)) {
        result.forEach((char: any) => {
          if (!this.excludeMainParentCharacters.some(c => c.id === char.id)) {
            // Remove from include main parent list (can't include + exclude same role)
            const baseId = Math.floor(char.id / 100);
            this.includeMainParentCharacters = this.includeMainParentCharacters.filter(c => Math.floor(c.id / 100) !== baseId);
            this.excludeMainParentCharacters.push({ id: char.id, name: char.name, image: char.image });
          }
        });
        this.updateTreeFilters();
      }
    });
  }
  removeExcludeMainParent(index: number) {
    this.excludeMainParentCharacters.splice(index, 1);
    this.updateTreeFilters();
  }
  // Helper to generate spark IDs from filters
  private generateSparkIds(filters: FactorFilter[], availableFactors: any[], maxCap: number = 9): number[] {
    const ids: number[] = [];
    filters.forEach(f => {
      const min = f.min || 1;
      let max = f.max !== undefined ? f.max : 9;
      
      // Clamp max to the provided cap (e.g. 3 for main parent factors)
      if (max > maxCap) {
        max = maxCap;
      }
      
      for (let lvl = min; lvl <= max; lvl++) {
        if (f.factorId) {
          // Specific factor: ID + Level (concatenated)
          ids.push(parseInt(`${f.factorId}${lvl}`, 10));
        } else {
          // "Any" factor: Expand to all available factors in this category
          availableFactors.forEach(factor => {
            ids.push(parseInt(`${factor.id}${lvl}`, 10));
          });
        }
      }
    });
    return [...new Set(ids)];
  }
  // Helper to generate spark ID groups from filters (AND logic between groups)
  private generateSparkIdGroups(filters: FactorFilter[], availableFactors: any[], maxCap: number = 9): number[][] {
    const groups: number[][] = [];
    filters.forEach(f => {
      const ids: number[] = [];
      const min = f.min || 1;
      let max = f.max !== undefined ? f.max : 9;
      
      if (max > maxCap) {
        max = maxCap;
      }
      
      for (let lvl = min; lvl <= max; lvl++) {
        if (f.factorId) {
          ids.push(parseInt(`${f.factorId}${lvl}`, 10));
        } else {
          // "Any" factor: Expand to all available factors in this category
          availableFactors.forEach(factor => {
            ids.push(parseInt(`${factor.id}${lvl}`, 10));
          });
        }
      }
      if (ids.length > 0) {
        groups.push(ids);
      }
    });
    return groups;
  }
  onFilterChange() {
    this.validateUqlQuery();
    this.syncUqlFilterState();
    // Sanitize star sum filters - convert null to undefined and clamp values
    // Blue, Pink, Green max is 9; White has no max
    if (this.filterState.min_blue_stars_sum == null || this.filterState.min_blue_stars_sum <= 0) {
      this.filterState.min_blue_stars_sum = undefined;
    } else if (this.filterState.min_blue_stars_sum > 9) {
      this.filterState.min_blue_stars_sum = 9;
    }
    
    if (this.filterState.min_pink_stars_sum == null || this.filterState.min_pink_stars_sum <= 0) {
      this.filterState.min_pink_stars_sum = undefined;
    } else if (this.filterState.min_pink_stars_sum > 9) {
      this.filterState.min_pink_stars_sum = 9;
    }
    
    if (this.filterState.min_green_stars_sum == null || this.filterState.min_green_stars_sum <= 0) {
      this.filterState.min_green_stars_sum = undefined;
    } else if (this.filterState.min_green_stars_sum > 9) {
      this.filterState.min_green_stars_sum = 9;
    }
    
    if (this.filterState.min_white_stars_sum == null || this.filterState.min_white_stars_sum <= 0) {
      this.filterState.min_white_stars_sum = undefined;
    }
    // White stars have no max limit
    
    // Sync derived state
    this.filterState.min_limit_break = this.selectedLimitBreak > 0 ? this.selectedLimitBreak : undefined;
    this.filterState.trainer_id = this.searchUserId;
    this.filterState.trainer_name = this.searchUsername;
    
    if (this.selectedSupportCard) {
      this.filterState.support_card_id = parseInt(this.selectedSupportCard.id, 10);
    } else {
      this.filterState.support_card_id = undefined;
    }
    // Map Factor Filters to API State
    
    // Global Factors
    this.filterState.blue_sparks = this.generateSparkIdGroups(this.blueFactorFilters, this.blueFactors);
    this.filterState.blue_sparks_9star = this.blueFactorFilters.some(f => f.min >= 9);
    
    this.filterState.pink_sparks = this.generateSparkIdGroups(this.pinkFactorFilters, this.pinkFactors);
    this.filterState.pink_sparks_9star = this.pinkFactorFilters.some(f => f.min >= 9);
    
    this.filterState.green_sparks = this.generateSparkIdGroups(this.greenFactorFilters, this.greenFactors);
    this.filterState.green_sparks_9star = this.greenFactorFilters.some(f => f.min >= 9);
    
    this.filterState.white_sparks = this.generateSparkIdGroups(this.whiteFactorFilters, this.whiteFactors);
    // Main Parent Factors
    this.filterState.main_parent_blue_sparks = this.generateSparkIds(this.mainBlueFactorFilters, this.blueFactors, 3);
    // For min_main_blue_factors, we take the MAX of the mins specified, as a best effort approximation
    // since the API only supports one global min for the parent.
    // Or if multiple are selected, maybe we should sum them? 
    // Usually "Speed 3" and "Stamina 3" means "Speed >= 3 AND Stamina >= 3".
    // But if the API is "Sum of (Speed, Stamina) >= X", then we can't express AND.
    // We will assume the user wants "Sum of selected >= X" where X is the highest constraint or sum?
    // Let's just take the highest min value for now.
    this.filterState.min_main_blue_factors = this.mainBlueFactorFilters.length > 0 
      ? Math.max(...this.mainBlueFactorFilters.map(f => f.min)) 
      : undefined;
    this.filterState.main_parent_pink_sparks = this.generateSparkIds(this.mainPinkFactorFilters, this.pinkFactors, 3);
    this.filterState.min_main_pink_factors = this.mainPinkFactorFilters.length > 0
      ? Math.max(...this.mainPinkFactorFilters.map(f => f.min))
      : undefined;
    this.filterState.main_parent_green_sparks = this.generateSparkIds(this.mainGreenFactorFilters, this.greenFactors, 3);
    this.filterState.min_main_green_factors = this.mainGreenFactorFilters.length > 0
      ? Math.max(...this.mainGreenFactorFilters.map(f => f.min))
      : undefined;
    this.filterState.main_parent_white_sparks = this.generateSparkIdGroups(this.mainWhiteFactorFilters, this.whiteFactors, 3);
    // min_main_white_count is handled by the input field directly, do not overwrite it here based on specific factor filters.
    // Optional White Sparks (just IDs, no levels - for scoring/sorting)
    this.filterState.optional_white_sparks = this.optionalWhiteFactorFilters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => f.factorId!);
    
    this.filterState.optional_main_white_sparks = this.optionalMainWhiteFactorFilters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => f.factorId!);
    // Lineage White Sparks (user-specified white factor IDs to match against lineage parents)
    const lineageWhiteIds = this.lineageWhiteFactorFilters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => f.factorId!);
    this.filterState.lineage_white = lineageWhiteIds.length ? lineageWhiteIds : undefined;
    // Extract white sparks from the selected veteran's parents and merge with lineage_white
    if (this.selectedVeteran?.succession_chara_array?.length) {
      const whiteFactorIdSet = new Set(this.whiteFactors.map(f => f.id));
      const getWhiteIds = (positionId: number): number[] => {
        const sc = this.selectedVeteran!.succession_chara_array!.find(s => s.position_id === positionId);
        if (!sc) return [];
        const ids = sc.factor_info_array?.length
          ? sc.factor_info_array.map(e => e.factor_id)
          : sc.factor_id_array || [];
        return ids.filter(id => whiteFactorIdSet.has(id));
      };
      const mainWhites = [...new Set([...getWhiteIds(10), ...lineageWhiteIds])];
      const leftWhites = [...new Set([...getWhiteIds(20), ...lineageWhiteIds])];
      this.filterState.main_legacy_white = mainWhites.length ? mainWhites : undefined;
      this.filterState.left_legacy_white = leftWhites.length ? leftWhites : undefined;
      this.filterState.right_legacy_white = undefined;
    } else if (lineageWhiteIds.length) {
      // No veteran selected: use lineage_white IDs for all legacy positions
      this.filterState.main_legacy_white = lineageWhiteIds;
      this.filterState.left_legacy_white = lineageWhiteIds;
      this.filterState.right_legacy_white = undefined;
    } else {
      this.filterState.main_legacy_white = undefined;
      this.filterState.left_legacy_white = undefined;
      this.filterState.right_legacy_white = undefined;
    }
    // Race schedule saddle IDs
    if (!this.filterState.main_win_saddle?.length) {
      this.filterState.main_win_saddle = undefined;
    }
    // Sync parent include/exclude arrays to filterState
    // (updateTreeFilters handles main_parent_id merging, but include/exclude need to be synced here too
    //  so they're always up-to-date even when no tree is set)
    const includeParentIds = this.includeParentCharacters.map(c => c.id);
    this.filterState.parent_id = includeParentIds.length > 0 ? includeParentIds : this.filterState.parent_id;
    this.filterState.exclude_parent_id = this.excludeParentCharacters.map(c => c.id);
    this.filterState.exclude_main_parent_id = this.excludeMainParentCharacters.map(c => c.id);
    // P2 legacy params from selected veteran
    if (this.selectedVeteran) {
      const vet = this.selectedVeteran;
      this.filterState.p2_main_chara_id = vet.card_id
        ? Math.floor(vet.card_id / 100)
        : (vet.trained_chara_id ?? undefined);
      this.filterState.p2_win_saddle = vet.win_saddle_id_array ?? undefined;
    } else {
      this.filterState.p2_main_chara_id = undefined;
      this.filterState.p2_win_saddle = undefined;
      this.filterState.affinity_p2 = undefined;
    }
    // Sync include main parent characters into main_parent_id (merge with tree selection)
    if (this.includeMainParentCharacters.length > 0) {
      const existingMainIds = this.filterState.main_parent_id || [];
      this.includeMainParentCharacters.forEach(c => {
        if (!existingMainIds.includes(c.id)) existingMainIds.push(c.id);
      });
      this.filterState.main_parent_id = existingMainIds;
    }
    // Update active filter chips
    this.updateCurrentUqlPreview();
    this.updateActiveFilterChips();
    // Emit a shallow copy of the filter state to ensure change detection
    this.filterChangeSubject.next({ ...this.filterState });
  }
  onRaceSelectionChanged(raceIds: number[]): void {
    this.raceScheduleRaceCount = raceIds.length;
    this.filterState.main_win_saddle = raceIds.length > 0
      ? this.raceScheduler.getSelectedSaddleIds()
      : undefined;
    this.onFilterChange();
  }

  private updateActiveFilterChips(): void {
    this.activeFilterChips = [];
    // Helper to format value part
    const formatValue = (min: number, max: number, maxPossible: number = 9): string => {
      // Clamp max to maxPossible (e.g., main parent factors cap at 3)
      const clampedMax = Math.min(max, maxPossible);
      
      if (min === clampedMax) {
        return `${min}`;
      } else if (min === 1 && clampedMax === maxPossible) {
        return `${min}-${clampedMax}`;
      } else if (min > 1 && clampedMax === maxPossible) {
        return `${min}+`;
      } else if (min === 1 && clampedMax < maxPossible) {
        return `≤${clampedMax}`;
      } else {
        return `${min}-${clampedMax}`;
      }
    };
    // Helper to add factor chips - always show if filter exists
    const addFactorChips = (
      filters: FactorFilter[], 
      factorList: any[], 
      type: ActiveFilterChip['type'],
      prefix: string,
      maxPossible: number = 9
    ) => {
      filters.forEach((f, index) => {
        const factorName = f.factorId === 0 || !f.factorId 
          ? 'Any' 
          : (factorList.find(factor => factor.id === f.factorId)?.text || 'Unknown');
        
        const valueStr = formatValue(f.min, f.max, maxPossible);
        const nameStr = prefix ? `${prefix}${factorName}` : factorName;
        
        this.activeFilterChips.push({
          id: `${type}-${index}`,
          label: `${nameStr}: ${valueStr}`,
          name: nameStr,
          value: valueStr,
          showStar: true,
          type: type,
          filterIndex: index,
          filterList: filters
        });
      });
    };
    // Blue Factors (Inheritance)
    addFactorChips(this.blueFactorFilters, this.blueFactors, 'blue', '');
    
    // Pink Factors (Inheritance)
    addFactorChips(this.pinkFactorFilters, this.pinkFactors, 'pink', '');
    
    // Green Factors (Inheritance)
    addFactorChips(this.greenFactorFilters, this.greenFactors, 'green', '');
    
    // White Factors (Inheritance)
    addFactorChips(this.whiteFactorFilters, this.whiteFactors, 'white', '');
    
    // Main Parent Blue Factors
    addFactorChips(this.mainBlueFactorFilters, this.blueFactors, 'mainBlue', 'Main: ', 3);
    
    // Main Parent Pink Factors
    addFactorChips(this.mainPinkFactorFilters, this.pinkFactors, 'mainPink', 'Main: ', 3);
    
    // Main Parent Green Factors
    addFactorChips(this.mainGreenFactorFilters, this.greenFactors, 'mainGreen', 'Main: ', 3);
    
    // Main Parent White Factors
    addFactorChips(this.mainWhiteFactorFilters, this.whiteFactors, 'mainWhite', 'Main: ', 3);
    // Optional White Factors (no level, just for scoring)
    this.optionalWhiteFactorFilters.forEach((f, index) => {
      if (f.factorId && f.factorId > 0) {
        const factorName = this.whiteFactors.find(factor => factor.id === f.factorId)?.text || 'Unknown';
        this.activeFilterChips.push({
          id: `optionalWhite-${index}`,
          label: `Optional: ${factorName}`,
          name: 'Optional',
          value: factorName,
          showStar: false,
          type: 'optionalWhite',
          filterIndex: index,
          filterList: this.optionalWhiteFactorFilters
        });
      }
    });
    // Optional Main White Factors (no level, just for scoring)
    this.optionalMainWhiteFactorFilters.forEach((f, index) => {
      if (f.factorId && f.factorId > 0) {
        const factorName = this.whiteFactors.find(factor => factor.id === f.factorId)?.text || 'Unknown';
        this.activeFilterChips.push({
          id: `optionalMainWhite-${index}`,
          label: `Main Optional: ${factorName}`,
          name: 'Main Optional',
          value: factorName,
          showStar: false,
          type: 'optionalMainWhite',
          filterIndex: index,
          filterList: this.optionalMainWhiteFactorFilters
        });
      }
    });
    // Tree Characters
    if (this.treeData.characterId) {
      this.activeFilterChips.push({
        id: 'tree-target',
        label: `Target: ${this.treeData.name}`,
        name: 'Target',
        value: this.treeData.name,
        type: 'character'
      });
    }
    if (this.treeData.children?.[0]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-parent1',
        label: `Main Parent: ${this.treeData.children[0].name}`,
        name: 'Main Parent',
        value: this.treeData.children[0].name,
        type: 'character'
      });
    }
    // Grandparents
    if (this.treeData.children?.[0]?.children?.[0]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-gp1',
        label: `GP: ${this.treeData.children[0].children[0].name}`,
        name: 'GP',
        value: this.treeData.children[0].children[0].name,
        type: 'character'
      });
    }
    if (this.treeData.children?.[0]?.children?.[1]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-gp2',
        label: `GP: ${this.treeData.children[0].children[1].name}`,
        name: 'GP',
        value: this.treeData.children[0].children[1].name,
        type: 'character'
      });
    }
    // Include Main Parent Characters (multi-select)
    this.includeMainParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `include-main-parent-${index}`,
        label: `Include Main: ${char.name}`,
        name: 'Inc. Main',
        value: char.name,
        type: 'includeMainParent',
        filterIndex: index
      });
    });
    // Include Parent Characters (multi-select)
    this.includeParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `include-parent-${index}`,
        label: `Include Parent: ${char.name}`,
        name: 'Inc. Parent',
        value: char.name,
        type: 'includeParent',
        filterIndex: index
      });
    });
    // Exclude Parent Characters (multi-select)
    this.excludeParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `exclude-parent-${index}`,
        label: `Exclude Parent: ${char.name}`,
        name: 'Excl. Parent',
        value: char.name,
        type: 'excludeParent',
        filterIndex: index
      });
    });
    // Exclude Main Parent Characters (multi-select)
    this.excludeMainParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `exclude-main-parent-${index}`,
        label: `Exclude Main: ${char.name}`,
        name: 'Excl. Main',
        value: char.name,
        type: 'excludeMainParent',
        filterIndex: index
      });
    });
    // Support Card
    if (this.selectedSupportCard) {
      this.activeFilterChips.push({
        id: 'support-card',
        label: `Card: ${this.selectedSupportCard.name}`,
        name: 'Card',
        value: this.selectedSupportCard.name,
        type: 'supportCard'
      });
    }
    // Veteran
    if (this.selectedVeteran) {
      this.activeFilterChips.push({
        id: 'veteran',
        label: `Veteran: ${this.selectedVeteranName}`,
        name: 'Veteran',
        value: this.selectedVeteranName,
        type: 'character'
      });
    }
    // Limit Break
    if (this.selectedLimitBreak > 0) {
      const lbLabel = this.selectedLimitBreak === 4 ? 'MLB' : `LB${this.selectedLimitBreak}+`;
      this.activeFilterChips.push({
        id: 'limit-break',
        label: lbLabel,
        value: lbLabel,
        type: 'other'
      });
    }
    // Min Win Count
    if (this.filterState.min_win_count && this.filterState.min_win_count > 0) {
      this.activeFilterChips.push({
        id: 'min-wins',
        label: `Wins: ${this.filterState.min_win_count}+`,
        name: 'Wins',
        value: `${this.filterState.min_win_count}+`,
        type: 'other'
      });
    }
    // Min White Count
    if (this.filterState.min_white_count && this.filterState.min_white_count > 0) {
      this.activeFilterChips.push({
        id: 'min-white',
        label: `White: ${this.filterState.min_white_count}+`,
        name: 'White',
        value: `${this.filterState.min_white_count}+`,
        type: 'other'
      });
    }
    // Main Parent Min White Count
    if (this.filterState.min_main_white_count && this.filterState.min_main_white_count > 0) {
      this.activeFilterChips.push({
        id: 'main-min-white',
        label: `Main White: ${this.filterState.min_main_white_count}+`,
        name: 'Main White',
        value: `${this.filterState.min_main_white_count}+`,
        type: 'other'
      });
    }
    // Parent Rank
    if (this.filterState.parent_rank && this.filterState.parent_rank > 1) {
      this.activeFilterChips.push({
        id: 'parent-rank',
        label: `Rank: ${this.filterState.parent_rank}+`,
        name: 'Rank',
        value: `${this.filterState.parent_rank}+`,
        rankIcon: this.getRankIconPath(this.filterState.parent_rank),
        type: 'other'
      });
    }
    // Max Followers
    if (this.includeMaxFollowers) {
      this.activeFilterChips.push({
        id: 'max-followers',
        label: 'Max Followers: Included',
        name: 'Max Followers',
        value: 'Included',
        type: 'other'
      });
    }
    // Trainer ID Search
    if (this.searchUserId) {
      this.activeFilterChips.push({
        id: 'trainer-id',
        label: `ID: ${this.searchUserId}`,
        name: 'ID',
        value: this.searchUserId,
        type: 'other'
      });
    }
    // Username Search
    if (this.searchUsername) {
      this.activeFilterChips.push({
        id: 'username',
        label: `User: ${this.searchUsername}`,
        name: 'User',
        value: this.searchUsername,
        type: 'other'
      });
    }
    // Star Sum Filters (min only)
    if (this.filterState.min_blue_stars_sum) {
      this.activeFilterChips.push({
        id: 'blue-stars-sum',
        label: `Total Blue ★: ≥${this.filterState.min_blue_stars_sum}`,
        name: 'Total Blue ★',
        value: `≥${this.filterState.min_blue_stars_sum}`,
        type: 'blueStarSum'
      });
    }
    if (this.filterState.min_pink_stars_sum) {
      this.activeFilterChips.push({
        id: 'pink-stars-sum',
        label: `Total Pink ★: ≥${this.filterState.min_pink_stars_sum}`,
        name: 'Total Pink ★',
        value: `≥${this.filterState.min_pink_stars_sum}`,
        type: 'pinkStarSum'
      });
    }
    if (this.filterState.min_green_stars_sum) {
      this.activeFilterChips.push({
        id: 'green-stars-sum',
        label: `Total Green ★: ≥${this.filterState.min_green_stars_sum}`,
        name: 'Total Green ★',
        value: `≥${this.filterState.min_green_stars_sum}`,
        type: 'greenStarSum'
      });
    }
    if (this.filterState.min_white_stars_sum) {
      this.activeFilterChips.push({
        id: 'white-stars-sum',
        label: `Total White ★: ≥${this.filterState.min_white_stars_sum}`,
        name: 'Total White ★',
        value: `≥${this.filterState.min_white_stars_sum}`,
        type: 'whiteStarSum'
      });
    }
    // Race Schedule
    if (this.raceScheduleRaceCount > 0) {
      this.activeFilterChips.push({
        id: 'race-schedule',
        label: `Race Schedule: ${this.raceScheduleRaceCount} race${this.raceScheduleRaceCount !== 1 ? 's' : ''}`,
        name: 'Race Schedule',
        value: `${this.raceScheduleRaceCount}`,
        type: 'raceSchedule'
      });
    }
    if (this.filterState.uql) {
      const displayedUql = this.getNormalizedUqlQuery() || this.filterState.uql;
      this.activeFilterChips.push({
        id: 'uql-query',
        label: `UQL: ${displayedUql}`,
        name: 'UQL',
        value: this.truncateUqlChipValue(displayedUql),
        type: 'uql'
      });
    }
  }
  removeActiveFilter(chip: ActiveFilterChip): void {
    switch (chip.type) {
      case 'blue':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.blueFactorFilters, chip.filterIndex);
        }
        break;
      case 'pink':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.pinkFactorFilters, chip.filterIndex);
        }
        break;
      case 'green':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.greenFactorFilters, chip.filterIndex, 'green');
        }
        break;
      case 'white':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.whiteFactorFilters, chip.filterIndex, 'white');
        }
        break;
      case 'mainBlue':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.mainBlueFactorFilters, chip.filterIndex);
        }
        break;
      case 'mainPink':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.mainPinkFactorFilters, chip.filterIndex);
        }
        break;
      case 'mainGreen':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.mainGreenFactorFilters, chip.filterIndex, 'mainGreen');
        }
        break;
      case 'mainWhite':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.mainWhiteFactorFilters, chip.filterIndex, 'mainWhite');
        }
        break;
      case 'optionalWhite':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.optionalWhiteFactorFilters, chip.filterIndex, 'optionalWhite');
        }
        break;
      case 'optionalMainWhite':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.optionalMainWhiteFactorFilters, chip.filterIndex, 'optionalMainWhite');
        }
        break;
      case 'character':
        if (chip.id === 'veteran') {
          this.removeVeteran();
        } else if (chip.id === 'tree-target') {
          this.clearNodeRecursive(this.treeData);
        } else if (chip.id === 'tree-parent1' && this.treeData.children?.[0]) {
          this.clearNodeRecursive(this.treeData.children[0]);
        } else if (chip.id === 'tree-gp1' && this.treeData.children?.[0]?.children?.[0]) {
          this.clearNodeRecursive(this.treeData.children[0].children[0]);
        } else if (chip.id === 'tree-gp2' && this.treeData.children?.[0]?.children?.[1]) {
          this.clearNodeRecursive(this.treeData.children[0].children[1]);
        }
        this.updateTreeFilters();
        break;
      case 'supportCard':
        this.removeSupportCard();
        break;
      case 'includeMainParent':
        if (chip.filterIndex !== undefined) {
          this.removeIncludeMainParent(chip.filterIndex);
        }
        break;
      case 'includeParent':
        if (chip.filterIndex !== undefined) {
          this.removeIncludeParent(chip.filterIndex);
        }
        break;
      case 'excludeParent':
        if (chip.filterIndex !== undefined) {
          this.removeExcludeParent(chip.filterIndex);
        }
        break;
      case 'excludeMainParent':
        if (chip.filterIndex !== undefined) {
          this.removeExcludeMainParent(chip.filterIndex);
        }
        break;
      case 'blueStarSum':
        this.filterState.min_blue_stars_sum = undefined;
        this.onFilterChange();
        break;
      case 'pinkStarSum':
        this.filterState.min_pink_stars_sum = undefined;
        this.onFilterChange();
        break;
      case 'greenStarSum':
        this.filterState.min_green_stars_sum = undefined;
        this.onFilterChange();
        break;
      case 'whiteStarSum':
        this.filterState.min_white_stars_sum = undefined;
        this.onFilterChange();
        break;
      case 'raceSchedule':
        if (this.raceScheduler) {
          this.raceScheduler.cellSelection.clear();
        }
        this.raceScheduleRaceCount = 0;
        this.filterState.main_win_saddle = undefined;
        this.onFilterChange();
        break;
      case 'uql':
        this.clearUql();
        break;
      case 'other':
        if (chip.id === 'limit-break') {
          this.selectedLimitBreak = 0;
        } else if (chip.id === 'min-wins') {
          this.filterState.min_win_count = 0;
        } else if (chip.id === 'min-white') {
          this.filterState.min_white_count = 0;
        } else if (chip.id === 'main-min-white') {
          this.filterState.min_main_white_count = 0;
        } else if (chip.id === 'parent-rank') {
          this.filterState.parent_rank = 1;
        } else if (chip.id === 'max-followers') {
          this.includeMaxFollowers = false;
          this.filterState.max_follower_num = 999;
          this.maxFollowersToggled.emit(false);
        } else if (chip.id === 'trainer-id') {
          this.searchUserId = '';
        } else if (chip.id === 'username') {
          this.searchUsername = '';
        }
        this.onFilterChange();
        break;
    }
  }
  getChipColorClass(type: ActiveFilterChip['type']): string {
    switch (type) {
      case 'blue':
      case 'mainBlue':
      case 'blueStarSum':
        return 'chip-blue';
      case 'pink':
      case 'mainPink':
      case 'pinkStarSum':
        return 'chip-pink';
      case 'green':
      case 'mainGreen':
      case 'greenStarSum':
        return 'chip-green';
      case 'white':
      case 'mainWhite':
      case 'whiteStarSum':
        return 'chip-white';
      case 'optionalWhite':
      case 'optionalMainWhite':
        return 'chip-optional-white';
      case 'character':
      case 'includeMainParent':
      case 'includeParent':
        return 'chip-character';
      case 'excludeParent':
      case 'excludeMainParent':
        return 'chip-exclude';
      case 'supportCard':
        return 'chip-support';
      case 'raceSchedule':
        return 'chip-green';
      case 'uql':
        return 'chip-support';
      default:
        return 'chip-default';
    }
  }
  setFilterMode(mode: FilterMode): void {
    this.filterMode = mode;
    this.applyBasicFilterDefaults();
    if (!this.isExpanded) {
      this.isExpanded = true;
    }
    setTimeout(() => this.updateFloatingBtnState(), 350);
  }

  private applyBasicFilterDefaults(emit = true): void {
    if (this.filterMode !== 'basic' || this.selectedLimitBreak === 4) return;
    this.selectedLimitBreak = 4;
    if (emit) this.onFilterChange();
  }
  onUqlChange(): void {
    this.validateUqlQuery();
    this.syncUqlFilterState();
    this.updateCurrentUqlPreview();
    this.updateActiveFilterChips();
    this.filterChangeSubject.next({ ...this.filterState });
  }

  private syncUqlFilterState(): void {
    this.filterState.uql = this.uqlValidationState === 'valid' && this.compiledUqlQuery
      ? this.compiledUqlQuery
      : undefined;
  }
  clearUql(): void {
    this.uqlQuery = '';
    this.validateUqlQuery();
    this.onFilterChange();
  }
  insertUqlSnippet(insertText: string): void {
    const expression = this.stripLeadingWhere(insertText);
    const currentQuery = this.uqlQuery.trim().replace(/;\s*$/, '');
    if (!currentQuery || /^where$/i.test(currentQuery)) {
      this.uqlQuery = `where ${expression}`;
    } else {
      this.uqlQuery = `${currentQuery} and ${expression}`;
    }
    this.setFilterMode('uql');
    this.onUqlChange();
  }
  toggleUqlPreview(): void {
    this.uqlPreviewExpanded = !this.uqlPreviewExpanded;
  }
  private updateCurrentUqlPreview(): void {
    const structuredExpression = this.buildStructuredUqlExpression();
    const typedExpression = this.uqlValidationState === 'valid'
      ? this.stripLeadingWhere(this.compiledUqlQuery)
      : '';
    const expressions: string[] = [];
    if (structuredExpression) expressions.push(`(${structuredExpression})`);
    if (typedExpression) expressions.push(`(${typedExpression})`);
    this.currentUqlPreview = expressions.length ? `where ${expressions.join(' and ')}` : '';
  }
  getUqlStatusIcon(): string {
    switch (this.uqlValidationState) {
      case 'valid': return 'check_circle';
      case 'incomplete': return 'pending';
      case 'invalid': return 'error';
      default: return 'radio_button_unchecked';
    }
  }
  getUqlStatusLabel(): string {
    switch (this.uqlValidationState) {
      case 'valid': return 'Valid';
      case 'incomplete': return 'Incomplete';
      case 'invalid': return 'Invalid';
      default: return 'UQL';
    }
  }
  private validateUqlQuery(): void {
    const normalizedQuery = this.getNormalizedUqlQuery();
    this.compiledUqlQuery = '';
    if (!normalizedQuery) {
      this.uqlValidationState = 'empty';
      this.uqlValidationMessage = '';
      return;
    }
    const delimiterIssue = this.getUqlDelimiterIssue(normalizedQuery);
    if (delimiterIssue === 'unterminated-string') {
      this.uqlValidationState = 'incomplete';
      this.uqlValidationMessage = 'Finish the string literal';
      return;
    }
    if (delimiterIssue === 'open-paren') {
      this.uqlValidationState = 'incomplete';
      this.uqlValidationMessage = 'Close the parentheses';
      return;
    }
    if (delimiterIssue === 'closing-paren') {
      this.uqlValidationState = 'invalid';
      this.uqlValidationMessage = 'Unexpected closing parenthesis';
      return;
    }
    const expression = this.stripLeadingWhere(normalizedQuery);
    if (!expression || this.endsWithIncompleteUqlToken(expression)) {
      this.uqlValidationState = 'incomplete';
      this.uqlValidationMessage = 'Finish the predicate';
      return;
    }
    if (this.hasEmptyUqlValueList(expression)) {
      this.uqlValidationState = 'incomplete';
      this.uqlValidationMessage = 'Choose at least one skill';
      return;
    }
    if (this.endsWithPartialBooleanContinuation(expression)) {
      this.uqlValidationState = 'incomplete';
      this.uqlValidationMessage = 'Finish the boolean operator';
      return;
    }
    const compiledQuery = this.getCompiledUqlQuery();
    this.compiledUqlQuery = compiledQuery;
    const unknownIdentifier = this.findUnknownUqlIdentifier(compiledQuery);
    if (unknownIdentifier) {
      this.uqlValidationState = 'invalid';
      this.uqlValidationMessage = `Unknown field or function: ${unknownIdentifier}`;
      return;
    }
    this.uqlValidationState = 'valid';
    this.uqlValidationMessage = 'Ready';
  }
  private getCompiledUqlQuery(): string {
    const normalizedQuery = this.getNormalizedUqlQuery();
    if (!normalizedQuery) return '';
    const arrayOperatorCompiled = this.compileFriendlyArrayOperators(normalizedQuery);
    const scopedSparkCompiled = this.compileFriendlyScopedSparkComparisons(arrayOperatorCompiled);
    const sparkCompiled = this.compileFriendlySparkComparisons(scopedSparkCompiled);
    const factorCompiled = this.compileFriendlyLoadedFactorComparisons(sparkCompiled);
    const namedValueCompiled = this.compileFriendlyNamedValues(factorCompiled);
    return this.compileFriendlyFieldAliases(namedValueCompiled).replace(/\s+/g, ' ').trim();
  }

  private rebuildUqlDerivedCaches(): void {
    const toFriendly = (factor: any, field: FriendlySparkField['field'], valueContext: UqlFactorValueContext): UqlNamedFactor => ({
      label: factor.text,
      aliases: [...new Set([factor.text, this.stripUqlFactorLevelMarker(factor.text)].filter(Boolean))],
      field,
      factorId: parseInt(factor.id, 10),
      maxLevel: 9,
      valueContext
    });

    const namedFactors: UqlNamedFactor[] = [
      ...this.blueFactors.map(factor => toFriendly(factor, 'blue_sparks', 'blue-factor')),
      ...this.pinkFactors.map(factor => toFriendly(factor, 'pink_sparks', 'pink-factor')),
      ...this.greenFactors.map(factor => toFriendly(factor, 'green_sparks', 'green-factor')),
      ...this.whiteFactors.map(factor => toFriendly(factor, 'white_sparks', 'white-factor'))
    ];
    this.uqlNamedFactorsCache = namedFactors;
    this.uqlNamedFactorComparisonsByLabelLength = namedFactors
      .map(factor => this.createUqlNamedFactorComparison(factor))
      .sort((left, right) => right.label.length - left.label.length);

    const factorValueLookup = new Map<string, UqlNamedFactor>();
    namedFactors.forEach(factor => {
      const values = [factor.label, ...factor.aliases]
        .map(value => this.normalizeUqlName(value))
        .filter(Boolean);
      for (const normalizedLabel of [...new Set(values)]) {
        const contextKey = this.getFactorValueLookupKey(factor.valueContext, normalizedLabel);
        const fallbackKey = this.getFactorValueLookupKey(null, normalizedLabel);
        if (!factorValueLookup.has(contextKey)) factorValueLookup.set(contextKey, factor);
        if (!factorValueLookup.has(fallbackKey)) factorValueLookup.set(fallbackKey, factor);
      }
    });
    this.factorValueLookup = factorValueLookup;

    const staticFactors: UqlNamedFactor[] = this.friendlySparkFields.map(field => ({
      ...field,
      valueContext: field.field === 'blue_sparks' ? 'blue-factor' as const : 'pink-factor' as const
    }));
    const byKey = new Map<string, UqlNamedFactor>();
    [...staticFactors, ...namedFactors].forEach(factor => {
      const key = `${factor.valueContext}:${factor.factorId}`;
      if (!byKey.has(key)) byKey.set(key, factor);
    });
    this.scopedUqlNamedFactorsCache = [...byKey.values()];
    this.scopedSparkFieldsCache = this.buildScopedSparkFields(this.scopedUqlNamedFactorsCache);
    this.scopedSparkComparisonAliases = this.scopedSparkFieldsCache
      .flatMap(field => field.aliases.map(alias => this.createFriendlyScopedSparkComparisonAlias(field, alias)))
      .sort((left, right) => right.alias.length - left.alias.length);
    this.uqlFieldPatternCache.clear();
  }

  private createFriendlySparkComparisonAlias(field: FriendlySparkField, alias: string): FriendlySparkComparisonAlias {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      ...field,
      alias,
      comparisonPattern: new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])\\s*(=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
    };
  }

  private createFriendlyScopedSparkComparisonAlias(field: FriendlyScopedSparkField, alias: string): FriendlyScopedSparkComparisonAlias {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      ...field,
      alias,
      comparisonPattern: new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])\\s*(=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
    };
  }

  private createUqlNamedFactorComparison(factor: UqlNamedFactor): UqlNamedFactorComparison {
    const labelPattern = this.escapeRegExp(factor.label).replace(/\s+/g, '\\s+');
    return {
      ...factor,
      comparisonPattern: new RegExp(`(^|[\\s(,])${labelPattern}\\s*(=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
    };
  }

  private createFriendlyFieldAliasReplacement(alias: string, field: string): FriendlyFieldAliasReplacement {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      alias,
      field,
      pattern: new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])`, 'gi')
    };
  }

  private createFriendlyArrayAliasReplacement(field: { alias: string; fields: string[]; label: string }): FriendlyArrayAliasReplacement {
    const fieldPattern = this.escapeRegExp(field.alias).replace(/\s+/g, '\\s+');
    const fieldBoundary = `(^|[^A-Za-z0-9_])(${fieldPattern})(?=$|[^A-Za-z0-9_])`;
    return {
      alias: field.alias,
      label: field.label,
      fields: [...field.fields],
      hasAllPattern: new RegExp(`${fieldBoundary}\\s+has\\s+all\\s*\\(([^)]*)\\)`, 'gi'),
      hasAnyPattern: new RegExp(`${fieldBoundary}\\s+has\\s+any\\s*\\(([^)]*)\\)`, 'gi'),
      doesNotHavePattern: new RegExp(`${fieldBoundary}\\s+does\\s+not\\s+have\\s+([^;()]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi'),
      hasPattern: new RegExp(`${fieldBoundary}\\s+has\\s+([^;()]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi')
    };
  }

  private resetPattern(pattern: RegExp): RegExp {
    pattern.lastIndex = 0;
    return pattern;
  }

  private getFactorValueLookupKey(context: UqlValueContext | null, normalizedValue: string): string {
    return `${context || '*'}:${normalizedValue}`;
  }

  private buildScopedArrayFields(): Array<{ alias: string; fields: string[]; label: string }> {
    return [
      { label: 'Main has', aliases: ['main', 'parent', 'main parent'], fields: ['main_white_factors'] },
      { label: 'GP1 has', aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1'], fields: ['left_white_factors'] },
      { label: 'GP2 has', aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2'], fields: ['right_white_factors'] },
      { label: 'Grandparent has', aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent'], fields: ['left_white_factors', 'right_white_factors'] }
    ].flatMap(scope => scope.aliases.map(alias => ({ alias, fields: scope.fields, label: scope.label })));
  }

  private buildScopedSparkFields(factors: UqlNamedFactor[]): FriendlyScopedSparkField[] {
    const scopes = [
      {
        label: 'Main',
        aliases: ['main', 'parent', 'main parent'],
        fieldsByContext: {
          'blue-factor': [{ field: 'main_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'main_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'main_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'main_white_factors', type: 'array' as const }]
        }
      },
      {
        label: 'GP1',
        aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1'],
        fieldsByContext: {
          'blue-factor': [{ field: 'left_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'left_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'left_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'left_white_factors', type: 'array' as const }]
        }
      },
      {
        label: 'GP2',
        aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2'],
        fieldsByContext: {
          'blue-factor': [{ field: 'right_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'right_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'right_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'right_white_factors', type: 'array' as const }]
        }
      },
      {
        label: 'Grandparent',
        aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent'],
        fieldsByContext: {
          'blue-factor': [{ field: 'left_blue_factors', type: 'number' as const }, { field: 'right_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'left_pink_factors', type: 'number' as const }, { field: 'right_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'left_green_factors', type: 'number' as const }, { field: 'right_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'left_white_factors', type: 'array' as const }, { field: 'right_white_factors', type: 'array' as const }]
        }
      }
    ];

    return scopes.flatMap(scope => factors.flatMap(factor => {
      const fields = scope.fieldsByContext[factor.valueContext];
      if (!fields?.length) return [];
      const factorAliases = [factor.label, ...factor.aliases];
      return [{
        label: `${scope.label} ${factor.label}`,
        aliases: scope.aliases.flatMap(scopeAlias => factorAliases.map(factorAlias => `${scopeAlias} ${factorAlias}`)),
        fields,
        factorId: factor.factorId,
        maxLevel: 3,
        valueContext: factor.valueContext
      }];
    }));
  }

  private compileFriendlyScopedSparkComparisons(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      this.scopedSparkComparisonAliases.forEach(field => {
        compiledSegment = compiledSegment.replace(this.resetPattern(field.comparisonPattern), (_match, leadingText: string, _aliasText: string, operator: string, value: string) => {
          return `${leadingText}${this.buildScopedSparkComparison(field, operator, parseInt(value, 10))}`;
        });
      });
      return compiledSegment;
    });
  }
  private compileFriendlySparkComparisons(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      this.friendlySparkComparisonAliases.forEach(field => {
        compiledSegment = compiledSegment.replace(this.resetPattern(field.comparisonPattern), (_match, leadingText: string, _aliasText: string, operator: string, value: string) => {
          return `${leadingText}${this.buildSparkComparison(field, operator, parseInt(value, 10))}`;
        });
      });
      return compiledSegment;
    });
  }
  private compileFriendlyFieldAliases(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      this.friendlyFieldAliasReplacements.forEach(aliasGroup => {
        compiledSegment = compiledSegment.replace(this.resetPattern(aliasGroup.pattern), (_match, leadingText: string) => `${leadingText}${aliasGroup.field}`);
      });
      return compiledSegment;
    });
  }
  private compileFriendlyLoadedFactorComparisons(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      this.uqlNamedFactorComparisonsByLabelLength.forEach(factor => {
        compiledSegment = compiledSegment.replace(this.resetPattern(factor.comparisonPattern), (_match, leadingText: string, operator: string, value: string) => {
          return `${leadingText}${this.buildSparkComparison(factor, operator, parseInt(value, 10))}`;
        });
      });
      return compiledSegment;
    });
  }

  private compileFriendlyArrayOperators(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = this.compileBareFriendlySkillArrayOperators(segment);
      this.friendlyArrayAliasReplacements.forEach(arrayField => {
        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasAllPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'all', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `has_all(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasAnyPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'any', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `overlaps(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.doesNotHavePattern), (_match, leadingText: string, _aliasText: string, rawValue: string) => {
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'not', rawValue);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `not contains(${field}, ${rawValue.trim()})`, 'and')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasPattern), (_match, leadingText: string, _aliasText: string, rawValue: string) => {
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'one', rawValue);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `contains(${field}, ${rawValue.trim()})`, 'or')}`;
        });
      });

      return compiledSegment;
    });
  }

  private buildContextAwareScopedSkillClause(
    arrayField: FriendlyArrayAliasReplacement,
    mode: 'one' | 'any' | 'all' | 'not',
    listText: string
  ): string | null {
    if (!arrayField.label.endsWith(' has')) return null;
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some(item => !item.factor)) return null;
    const clauses = resolved.flatMap(item => this.buildScopedSkillPresenceClauses(arrayField.fields, item, mode === 'not'));
    if (!clauses.length) return null;
    const joiner = mode === 'all' || mode === 'not' ? ' and ' : ' or ';
    return clauses.length === 1 ? clauses[0] : `(${clauses.join(joiner)})`;
  }

  private buildScopedSkillPresenceClauses(templateFields: string[], item: UqlSkillListItem, negated: boolean): string[] {
    const factor = item.factor;
    if (!factor) return [];
    return templateFields.flatMap(templateField => {
      const targetFields = this.getContextualSkillFields(templateField, factor.valueContext);
      return targetFields.map(fieldName => this.buildSkillPresenceClause(fieldName, item, negated));
    });
  }

  private getContextualSkillFields(templateField: string, context: UqlFactorValueContext): string[] {
    const scope = templateField.toLowerCase().replace(/[_\s-]+/g, '_');
    const contextField = (prefix: string): string => {
      switch (context) {
        case 'blue-factor': return `${prefix}_blue_factors`;
        case 'pink-factor': return `${prefix}_pink_factors`;
        case 'green-factor': return `${prefix}_green_factors`;
        case 'white-factor': return `${prefix}_white_factors`;
      }
    };
    if (scope === 'main_white_factors' || scope === 'main_white_sparks' || scope === 'main_parent_white_sparks') return [contextField('main')];
    if (scope === 'left_white_factors' || scope === 'left_white_sparks') return [contextField('left')];
    if (scope === 'right_white_factors' || scope === 'right_white_sparks') return [contextField('right')];
    if (scope === 'white_sparks' && context === 'white-factor') return ['white_sparks'];
    if (scope === 'blue_sparks' && context === 'blue-factor') return ['blue_sparks'];
    if (scope === 'pink_sparks' && context === 'pink-factor') return ['pink_sparks'];
    if (scope === 'green_sparks' && context === 'green-factor') return ['green_sparks'];
    return [];
  }

  private buildSkillPresenceClause(fieldName: string, item: UqlSkillListItem, negated: boolean): string {
    const factor = item.factor!;
    const normalizedOperator = item.operator === '<>' ? '!=' : item.operator;
    if (normalizedOperator === '!=' && item.level !== undefined) {
      const sparkId = this.buildSparkId(factor.factorId, item.level);
      const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
      const arrayField = normalizedField.endsWith('_sparks') || normalizedField.endsWith('_white_factors');
      const exactClause = arrayField ? `contains(${fieldName}, ${sparkId})` : `${fieldName} = ${sparkId}`;
      return negated ? exactClause : arrayField ? `not ${exactClause}` : `${fieldName} != ${sparkId}`;
    }
    const ids = this.getSparkIdsForFactorField(factor, fieldName, item.operator, item.level);
    if (!ids.length) return negated ? '(1 = 1)' : '(1 = 0)';
    const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const arrayField = normalizedField.endsWith('_sparks') || normalizedField.endsWith('_white_factors');
    if (arrayField) {
      const clause = ids.length === 1
        ? `contains(${fieldName}, ${ids[0]})`
        : `overlaps(${fieldName}, (${ids.join(', ')}))`;
      return negated ? `not ${clause}` : clause;
    }
    if (ids.length === 1) return `${fieldName} ${negated ? '!=' : '='} ${ids[0]}`;
    return `${fieldName} ${negated ? 'not in' : 'in'} (${ids.join(', ')})`;
  }

  private resolveAnyFactorListValues(listText: string): Array<{ value: string; factor: UqlNamedFactor | null }> {
    return this.resolveAnyFactorListItems(listText).map(({ value, factor }) => ({ value, factor }));
  }

  private resolveAnyFactorListItems(listText: string): UqlSkillListItem[] {
    return this.parseUqlAnyFactorListItems(listText)
      .map(item => ({ ...item, factor: this.resolveFactorUqlValue(item.value) as UqlNamedFactor | null }));
  }

  private compileBareFriendlySkillArrayOperators(segment: string): string {
    let compiledSegment = segment;
    const leadingBoundary = '(^|\\b(?:where|and|or|not)\\s+|\\()';
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+all\\s*\\(([^)]*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('all', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}has_all(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+any\\s*\\(([^)]*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('any', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}overlaps(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*does\\s+not\\s+have\\s+([^;()]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi'), (_match, leadingText: string, rawValue: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('not', rawValue);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}not contains(white_sparks, ${rawValue.trim()})`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+([^;()]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi'), (_match, leadingText: string, rawValue: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('one', rawValue);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}contains(white_sparks, ${rawValue.trim()})`;
    });
    return compiledSegment;
  }

  private buildBareContextAwareSkillClause(mode: 'one' | 'any' | 'all' | 'not', listText: string): string | null {
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some(item => !item.factor)) return null;
    const clauses = resolved.map(item => this.buildSkillPresenceClause(this.getGlobalSkillFieldForContext(item.factor!.valueContext), item, mode === 'not'));
    const joiner = mode === 'all' || mode === 'not' ? ' and ' : ' or ';
    return clauses.length === 1 ? clauses[0] : `(${clauses.join(joiner)})`;
  }

  private getGlobalSkillFieldForContext(context: UqlFactorValueContext): string {
    switch (context) {
      case 'blue-factor': return 'blue_sparks';
      case 'pink-factor': return 'pink_sparks';
      case 'green-factor': return 'green_sparks';
      case 'white-factor': return 'white_sparks';
    }
  }

  private compileFriendlyNamedValues(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = this.compileFriendlyComparisonValues(segment);
      compiledSegment = this.compileFriendlyFunctionValues(compiledSegment);
      return compiledSegment;
    });
  }
  private compileFriendlyComparisonValues(segment: string): string {
    const characterFieldPattern = this.getUqlFieldPattern('character');
    let compiledSegment = this.replaceComparisonValue(segment, characterFieldPattern, value => this.resolveCharacterUqlValue(value));
    compiledSegment = this.replaceInListValues(compiledSegment, characterFieldPattern, value => this.resolveCharacterUqlValue(value));
    return compiledSegment;
  }
  private compileFriendlyFunctionValues(segment: string): string {
    const singleValuePattern = /\b(contains|has|any)\s*\(\s*([^,()]+?)\s*,\s*([^()]*?)\s*\)/gi;
    let compiledSegment = segment.replace(singleValuePattern, (match, functionName: string, fieldText: string, rawValue: string) => {
      const factorClause = this.buildFriendlyFactorSingleFunctionClause(functionName, fieldText, rawValue);
      if (factorClause) return factorClause;
      const resolvedValue = this.resolveNamedUqlValueForField(fieldText, rawValue);
      return resolvedValue ? `${functionName}(${fieldText}, ${resolvedValue})` : match;
    });

    const listValuePattern = /\b(overlaps|has_all|contains_all|all)\s*\(\s*([^,()]+?)\s*,\s*\(([^)]*)\)\s*\)/gi;
    compiledSegment = compiledSegment.replace(listValuePattern, (match, functionName: string, fieldText: string, listText: string) => {
      const factorClause = this.buildFriendlyFactorListFunctionClause(functionName, fieldText, listText);
      if (factorClause) return factorClause;
      const resolvedList = this.replaceNamedListValues(listText, value => this.resolveNamedUqlValueForField(fieldText, value));
      return resolvedList !== listText ? `${functionName}(${fieldText}, (${resolvedList}))` : match;
    });

    const scoringFunctionPattern = /\b(optional_white|optional_main_white|optional_any_white|lineage_white)\s*\(((?:[^()]|\([^)]*\))*)\)/gi;
    compiledSegment = compiledSegment.replace(scoringFunctionPattern, (match, functionName: string, argsText: string) => {
      return this.buildFriendlyWhiteScoringFunctionClause(functionName, argsText) || match;
    });

    return compiledSegment;
  }

  private buildFriendlyWhiteScoringFunctionClause(functionName: string, argsText: string): string | null {
    const parsed = this.splitWhiteScoringFunctionArgs(argsText);
    if (!parsed) return null;
    const resolved = this.parseUqlFactorListItems(parsed.skillList, 'white-factor');
    if (!resolved.length || resolved.some(item => !item.factor && !/^\d+$/.test(item.value))) return null;
    if (!resolved.some(item => item.factor)) return null;
    const ids = resolved.map(item => item.factor ? item.factor.factorId.toString() : item.value.trim());
    const listText = parsed.parenthesizedList ? `(${ids.join(', ')})` : ids.join(', ');
    const normalizedParams = parsed.params.trim();
    return `${functionName}(${normalizedParams ? `${listText}, ${normalizedParams}` : listText})`;
  }

  private splitWhiteScoringFunctionArgs(argsText: string): { skillList: string; params: string; parenthesizedList: boolean } | null {
    const trimmed = argsText.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('(')) {
      let depth = 0;
      for (let index = 0; index < trimmed.length; index++) {
        const char = trimmed[index];
        if (char === '(') depth++;
        if (char === ')') depth--;
        if (depth !== 0) continue;
        const rest = trimmed.slice(index + 1).trim();
        return {
          skillList: trimmed.slice(1, index),
          params: rest.replace(/^,\s*/, ''),
          parenthesizedList: true
        };
      }
      return null;
    }
    const paramsMatch = trimmed.match(/,\s*[A-Za-z_]\w*\s*=/);
    if (!paramsMatch || paramsMatch.index === undefined) {
      return { skillList: trimmed, params: '', parenthesizedList: false };
    }
    return {
      skillList: trimmed.slice(0, paramsMatch.index),
      params: trimmed.slice(paramsMatch.index + 1).trim(),
      parenthesizedList: false
    };
  }

  private buildFriendlyFactorSingleFunctionClause(_functionName: string, fieldText: string, rawValue: string): string | null {
    const context = this.getUqlValueContextForField(fieldText);
    if (!context?.endsWith('-factor')) return null;
    const item = this.parseUqlFactorItem(rawValue, context);
    if (!item.factor) return null;
    return this.buildSkillPresenceClause(fieldText.trim(), item, false);
  }

  private buildFriendlyFactorListFunctionClause(functionName: string, fieldText: string, listText: string): string | null {
    const context = this.getUqlValueContextForField(fieldText);
    if (!context?.endsWith('-factor')) return null;
    const resolved = this.parseUqlFactorListItems(listText, context);
    if (!resolved.length) return null;
    if (!resolved.some(item => item.factor)) return null;
    if (resolved.some(item => !item.factor && !/^\d+$/.test(item.value))) return null;

    const normalizedFunction = functionName.toLowerCase();
    if (normalizedFunction === 'overlaps') {
      const ids = resolved.flatMap(item => item.factor
        ? this.getSparkIdsForFactorField(item.factor, fieldText, item.operator, item.level).map(id => id.toString())
        : [item.value]
      );
      return `overlaps(${fieldText.trim()}, (${ids.join(', ')}))`;
    }

    if (normalizedFunction === 'has_all' || normalizedFunction === 'contains_all' || normalizedFunction === 'all') {
      const clauses = resolved.map(item => item.factor
        ? this.buildSkillPresenceClause(fieldText.trim(), item, false)
        : `contains(${fieldText.trim()}, ${item.value})`
      );
      return clauses.length === 1 ? clauses[0] : `(${clauses.join(' and ')})`;
    }

    return null;
  }

  private splitUqlListValues(listText: string): string[] {
    return listText
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }

  private splitUqlFactorListValues(listText: string, context: UqlValueContext): string[] {
    const namedValues = this.uqlNamedFactorsCache
      .filter(factor => factor.valueContext === context)
      .flatMap(factor => [factor.label, ...factor.aliases])
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length);
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
      while (index < listText.length && /[\s,]/.test(listText[index])) index++;
      if (index >= listText.length) break;
      const knownValue = this.matchKnownUqlListValueAt(listText, index, namedValues);
      if (knownValue) {
        values.push(knownValue.text.trim());
        index = knownValue.end;
      } else {
        let end = index;
        while (end < listText.length && listText[end] !== ',') end++;
        values.push(listText.slice(index, end).trim());
        index = end;
      }
      while (index < listText.length && /\s/.test(listText[index])) index++;
      if (listText[index] === ',') index++;
    }
    return values.filter(Boolean);
  }

  private splitUqlAnyFactorListValues(listText: string): string[] {
    const namedValues = this.uqlNamedFactorsCache
      .flatMap(factor => [factor.label, ...factor.aliases])
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private parseUqlFactorListItems(listText: string, context: UqlValueContext): UqlSkillListItem[] {
    return this.splitUqlFactorListValues(listText, context).map(value => this.parseUqlFactorItem(value, context));
  }

  private parseUqlAnyFactorListItems(listText: string): UqlSkillListItem[] {
    return this.splitUqlAnyFactorListValues(listText).map(value => this.parseUqlFactorItem(value));
  }

  private parseUqlFactorItem(rawValue: string, context?: UqlValueContext): UqlSkillListItem {
    const trimmedValue = rawValue.trim();
    const comparisonMatch = trimmedValue.match(/^(.*?)(?:\s*(>=|<=|!=|<>|=|>|<)\s*(\d+))\s*$/);
    const value = comparisonMatch ? comparisonMatch[1].trim() : trimmedValue;
    const operator = comparisonMatch?.[2] === '<>' ? '!=' : comparisonMatch?.[2];
    const level = comparisonMatch?.[3] ? parseInt(comparisonMatch[3], 10) : undefined;
    return {
      value,
      factor: this.resolveFactorUqlValue(value, context) as UqlNamedFactor | null,
      operator,
      level
    };
  }

  private splitUqlKnownListValues(listText: string, namedValues: string[]): string[] {
    const values: string[] = [];
    let index = 0;
    while (index < listText.length) {
      while (index < listText.length && /[\s,]/.test(listText[index])) index++;
      if (index >= listText.length) break;
      const knownValue = this.matchKnownUqlListValueAt(listText, index, namedValues);
      if (knownValue) {
        values.push(knownValue.text.trim());
        index = knownValue.end;
      } else {
        let end = index;
        while (end < listText.length && listText[end] !== ',') end++;
        values.push(listText.slice(index, end).trim());
        index = end;
      }
      while (index < listText.length && /\s/.test(listText[index])) index++;
      if (listText[index] === ',') index++;
    }
    return values.filter(Boolean);
  }

  private matchKnownUqlListValueAt(listText: string, index: number, namedValues: string[]): { text: string; end: number } | null {
    const lowerText = listText.toLowerCase();
    for (const value of namedValues) {
      const lowerValue = value.toLowerCase();
      if (!lowerText.startsWith(lowerValue, index)) continue;
      const end = index + value.length;
      let boundary = end;
      while (boundary < listText.length && /\s/.test(listText[boundary])) boundary++;
      if (boundary < listText.length && listText[boundary] !== ',' && !/[<>=!]/.test(listText[boundary])) continue;
      const comparisonMatch = listText.slice(boundary).match(/^\s*(?:>=|<=|!=|<>|=|>|<)\s*\d+/);
      const comparisonEnd = comparisonMatch ? boundary + comparisonMatch[0].length : end;
      return { text: listText.slice(index, comparisonEnd), end: comparisonEnd };
    }
    return null;
  }

  private buildSparkIdListForFactorField(factor: FriendlySparkField, fieldText: string): string {
    return this.getSparkIdsForFactorField(factor, fieldText).join(', ');
  }

  private getSparkIdsForFactorField(factor: FriendlySparkField, fieldText: string, operator?: string, level?: number): number[] {
    const maxLevel = this.getSparkMaxLevelForUqlField(fieldText, factor);
    const levels = operator && level !== undefined
      ? this.getSparkLevelsForComparison(operator, level, maxLevel)
      : Array.from({ length: maxLevel }, (_entry, index) => index + 1);
    return levels.map(sparkLevel => this.buildSparkId(factor.factorId, sparkLevel));
  }

  private getSparkMaxLevelForUqlField(fieldText: string, factor: FriendlySparkField): number {
    const normalizedField = fieldText.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const scopedParentField = /^(?:main|left|right)_(?:blue|pink|green|white)_factors$/.test(normalizedField)
      || normalizedField === 'main_parent_white_sparks';
    return scopedParentField ? Math.min(factor.maxLevel, 3) : factor.maxLevel;
  }

  private replaceComparisonValue(segment: string, fieldPattern: string, resolveValue: (value: string) => string | null): string {
    const comparisonPattern = new RegExp(`(${fieldPattern}\\s*(?:=|!=|<>|<=|>=|<|>)\\s*)([^\\s(),][^;)]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi');
    return segment.replace(comparisonPattern, (match, prefix: string, rawValue: string) => {
      const resolvedValue = resolveValue(rawValue);
      return resolvedValue ? `${prefix}${resolvedValue}` : match;
    });
  }
  private replaceInListValues(segment: string, fieldPattern: string, resolveValue: (value: string) => string | null): string {
    const inListPattern = new RegExp(`(${fieldPattern}\\s+(?:not\\s+)?in\\s*\\()([^)]*)(\\))`, 'gi');
    return segment.replace(inListPattern, (_match, prefix: string, listText: string, suffix: string) => {
      return `${prefix}${this.replaceNamedListValues(listText, resolveValue)}${suffix}`;
    });
  }
  private replaceNamedListValues(listText: string, resolveValue: (value: string) => string | null): string {
    const items = listText.split(',');
    const resolvedItems: string[] = [];
    for (let index = 0; index < items.length; index++) {
      let bestMatch: { endIndex: number; text: string } | null = null;
      for (let endIndex = index; endIndex < items.length; endIndex++) {
        const candidateText = items.slice(index, endIndex + 1).join(',');
        const value = candidateText.trim();
        if (!value) continue;
        const resolvedValue = resolveValue(value);
        if (!resolvedValue) continue;
        const leadingWhitespace = candidateText.match(/^\s*/)?.[0] || '';
        const trailingWhitespace = candidateText.match(/\s*$/)?.[0] || '';
        bestMatch = { endIndex, text: `${leadingWhitespace}${resolvedValue}${trailingWhitespace}` };
      }
      if (bestMatch) {
        resolvedItems.push(bestMatch.text);
        index = bestMatch.endIndex;
        continue;
      }
      const item = items[index];
      const leadingWhitespace = item.match(/^\s*/)?.[0] || '';
      const trailingWhitespace = item.match(/\s*$/)?.[0] || '';
      const value = item.trim();
      resolvedItems.push(`${leadingWhitespace}${resolveValue(value) || value}${trailingWhitespace}`);
    }
    return resolvedItems.join(',');
  }
  private resolveNamedUqlValueForField(fieldText: string, rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value || /^\d+$/.test(value) || /^'.*'$|^".*"$/.test(value)) return null;
    const context = this.getUqlValueContextForField(fieldText);
    if (context === 'character') return this.resolveCharacterUqlValue(value);
    if (context === 'blue-factor' || context === 'pink-factor' || context === 'green-factor' || context === 'white-factor') {
      const factor = this.resolveFactorUqlValue(value, context);
      return factor ? this.buildSparkId(factor.factorId, 1).toString() : null;
    }
    return null;
  }
  private resolveCharacterUqlValue(rawValue: string): string | null {
    const normalizedValue = this.normalizeUqlName(rawValue);
    const exactVariant = CHARACTERS.find(entry => this.normalizeUqlName(this.getCharacterUqlDisplayName(entry)) === normalizedValue);
    if (exactVariant) return exactVariant.id.toString();
    const originalVariant = CHARACTERS.find(entry => {
      const isOriginal = this.getCharacterSkinName(entry.id) === 'Original';
      return isOriginal && (this.normalizeUqlName(getCharacterName(entry.id)) === normalizedValue || this.normalizeUqlName(entry.name || '') === normalizedValue);
    });
    if (originalVariant) return originalVariant.id.toString();
    const character = CHARACTERS.find(entry => this.normalizeUqlName(getCharacterName(entry.id)) === normalizedValue || this.normalizeUqlName(entry.name || '') === normalizedValue);
    return character ? character.id.toString() : null;
  }
  private resolveFactorUqlValue(rawValue: string, context?: UqlValueContext): FriendlySparkField | null {
    const normalizedValue = this.normalizeUqlName(rawValue);
    return this.factorValueLookup.get(this.getFactorValueLookupKey(context || null, normalizedValue)) || null;
  }
  private getUqlFieldPattern(context: UqlValueContext): string {
    const cachedPattern = this.uqlFieldPatternCache.get(context);
    if (cachedPattern) return cachedPattern;
    const aliases = this.friendlyFieldAliases
      .filter(field => this.getUqlValueContextForField(field.field) === context || field.aliases.some(alias => this.getUqlValueContextForField(alias) === context))
      .flatMap(field => [field.field, field.label, ...field.aliases]);
    const pattern = `(?:${[...new Set(aliases)].map(alias => this.escapeRegExp(alias).replace(/\s+/g, '\\s+')).join('|')})`;
    this.uqlFieldPatternCache.set(context, pattern);
    return pattern;
  }
  private getUqlValueContextForField(fieldText: string): UqlValueContext | null {
    const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (this.endsWithAny(normalized, ['main character', 'main uma', 'main parent', 'main chara', 'main chara id', 'left parent', 'left character', 'left uma', 'left chara id', 'right parent', 'right character', 'right uma', 'right chara id'])) {
      return 'character';
    }
    if (this.endsWithAny(normalized, ['white sparks', 'white skills', 'white factors', 'main parent white skills', 'main parent skills', 'parent white skills', 'parent skills', 'main white factors', 'main white sparks'])) {
      return 'white-factor';
    }
    if (this.endsWithAny(normalized, ['green sparks', 'unique skills', 'green factors'])) {
      return 'green-factor';
    }
    if (this.endsWithAny(normalized, ['blue sparks', 'blue factors'])) {
      return 'blue-factor';
    }
    if (this.endsWithAny(normalized, ['pink sparks', 'pink factors'])) {
      return 'pink-factor';
    }
    return null;
  }
  private getUqlNamedFactors(): UqlNamedFactor[] {
    return this.uqlNamedFactorsCache;
  }
  private getScopedSparkFields(): FriendlyScopedSparkField[] {
    return this.scopedSparkFieldsCache;
  }
  private getScopedArrayFields(): Array<{ alias: string; fields: string[]; label: string }> {
    return this.scopedArrayFields;
  }
  private getScopedUqlNamedFactors(): UqlNamedFactor[] {
    return this.scopedUqlNamedFactorsCache;
  }
  private normalizeUqlName(value: string): string {
    return this.stripUqlFactorLevelMarker(value.replace(/^['"]|['"]$/g, ''))
      .toLowerCase()
      .replace(/[_-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  private stripUqlFactorLevelMarker(value: string): string {
    return value.replace(/[○◎◯]/g, '').replace(/\s+[oO]$/g, '').replace(/\s+/g, ' ').trim();
  }
  private buildScopedSparkComparison(field: FriendlyScopedSparkField, operator: string, value: number): string {
    const normalizedOperator = operator === '<>' ? '!=' : operator;
    const clauses = field.fields.map(target => target.type === 'array'
      ? this.buildSparkComparison({ ...field, field: target.field }, normalizedOperator, value)
      : this.buildSingleSparkFieldComparison(target.field, field.factorId, normalizedOperator, value, field.maxLevel));
    if (clauses.length === 1) return clauses[0];
    const joiner = normalizedOperator === '!=' ? ' and ' : ' or ';
    return `(${clauses.join(joiner)})`;
  }
  private buildSingleSparkFieldComparison(fieldName: string, factorId: number, operator: string, value: number, maxLevel: number): string {
    if (operator === '!=') {
      return `${fieldName} != ${this.buildSparkId(factorId, value)}`;
    }
    const levels = this.getSparkLevelsForComparison(operator, value, maxLevel);
    if (!levels.length) return '(1 = 0)';
    const sparkIds = levels.map(level => this.buildSparkId(factorId, level));
    if (sparkIds.length === 1) return `${fieldName} = ${sparkIds[0]}`;
    return `${fieldName} in (${sparkIds.join(', ')})`;
  }
  private buildScopedArrayClause(fields: string[], buildClause: (field: string) => string, joiner: 'and' | 'or'): string {
    const clauses = fields.map(buildClause);
    if (clauses.length === 1) return clauses[0];
    return `(${clauses.join(` ${joiner} `)})`;
  }
  private buildSparkComparison(field: FriendlySparkField, operator: string, value: number): string {
    const normalizedOperator = operator === '<>' ? '!=' : operator;
    const levels = this.getSparkLevelsForComparison(normalizedOperator, value, field.maxLevel);
    if (normalizedOperator === '!=') {
      const sparkId = this.buildSparkId(field.factorId, value);
      return `not contains(${field.field}, ${sparkId})`;
    }
    if (!levels.length) return '(1 = 0)';
    const sparkIds = levels.map(level => this.buildSparkId(field.factorId, level));
    if (sparkIds.length === 1) return `contains(${field.field}, ${sparkIds[0]})`;
    return `overlaps(${field.field}, (${sparkIds.join(', ')}))`;
  }
  private getSparkLevelsForComparison(operator: string, value: number, maxLevel: number): number[] {
    const levels = Array.from({ length: maxLevel }, (_entry, index) => index + 1);
    switch (operator) {
      case '=': return levels.filter(level => level === value);
      case '>': return levels.filter(level => level > value);
      case '>=': return levels.filter(level => level >= value);
      case '<': return levels.filter(level => level < value);
      case '<=': return levels.filter(level => level <= value);
      default: return [];
    }
  }
  private buildSparkId(factorId: number, level: number): number {
    return parseInt(`${factorId}${level}`, 10);
  }
  private replaceOutsideStrings(query: string, replaceSegment: (segment: string) => string): string {
    const stringPattern = /'(?:''|[^'])*'|"(?:""|[^"])*"/g;
    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = stringPattern.exec(query)) !== null) {
      result += replaceSegment(query.slice(lastIndex, match.index));
      result += match[0];
      lastIndex = match.index + match[0].length;
    }
    result += replaceSegment(query.slice(lastIndex));
    return result;
  }

  private getFriendlyFieldSearchText(field: FriendlyFieldAlias): string {
    const extraTerms: string[] = [];
    switch (field.field) {
      case 'main_chara_id':
        extraTerms.push('main char', 'main character', 'runner', 'runner character');
        break;
      case 'main_parent_id':
        extraTerms.push('parent char', 'parent character', 'main parent char', 'main parent character');
        break;
      case 'left_chara_id':
        extraTerms.push('gp char', 'gp cha', 'gp1 char', 'gp1 character', 'grandparent character', 'left char', 'left character');
        break;
      case 'right_chara_id':
        extraTerms.push('gp char', 'gp cha', 'gp2 char', 'gp2 character', 'grandparent character', 'right char', 'right character');
        break;
      default:
        break;
    }
    return [...field.aliases, field.label, ...extraTerms].join(' ');
  }

  private getFriendlyFieldPriority(field: FriendlyFieldAlias): number {
    if (field.field.endsWith('_chara_id') || field.field === 'main_parent_id') return 0;
    if (field.field === 'trainer_name' || field.field === 'account_id') return 4;
    if (field.type === 'string') return 6;
    if (['win_count', 'white_count', 'follower_num', 'parent_rank', 'computed_race_affinity'].includes(field.field)) return 8;
    if (field.type === 'array') return 16;
    return 12;
  }

  private getSyntaxSuggestionPriority(suggestion: UqlSuggestion): number {
    if (suggestion.kind === 'keyword') return 10;
    if (suggestion.kind === 'operator') return 12;
    return 70;
  }

  private updateUqlSuggestions(): void {
    const syntaxSuggestions: UqlSuggestion[] = [
      { label: 'where', insertText: 'where ', kind: 'keyword', detail: 'Start a filter expression' },
      { label: 'and', insertText: ' and ', kind: 'keyword', detail: 'Require both sides' },
      { label: 'or', insertText: ' or ', kind: 'keyword', detail: 'Match either side' },
      { label: 'not', insertText: 'not ', kind: 'keyword', detail: 'Negate a predicate' },
      { label: 'greater than or equal', insertText: '>= ', kind: 'operator', detail: 'At least' },
      { label: 'less than or equal', insertText: '<= ', kind: 'operator', detail: 'At most' },
      { label: 'equals', insertText: '= ', kind: 'operator', detail: 'Exact match' },
      { label: 'include in list', insertText: 'in ()', kind: 'operator', detail: 'Match any listed value' },
      { label: 'exclude list', insertText: 'not in ()', kind: 'operator', detail: 'Reject listed values' },
      { label: 'Parentheses', insertText: '(Speed >= 3 or Stamina >= 3)', kind: 'snippet', detail: 'Group OR logic' },
      { label: 'Include list', insertText: 'Main character in (Special Week, Silence Suzuka)', kind: 'snippet', detail: 'Use in (...) for includes' },
      { label: 'Exclude list', insertText: 'Main character not in (Special Week, Silence Suzuka)', kind: 'snippet', detail: 'Use not in (...) for excludes' },
      { label: 'has skill', insertText: 'has Right-Handed ○', kind: 'snippet', detail: 'Skill present on any parent' },
      { label: 'has any skills', insertText: 'has any (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'At least one skill present on any parent' },
      { label: 'has all skills', insertText: 'has all (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Every listed skill present across all parents' },
      { label: 'optional white skills', insertText: 'optional_white(Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Prefer rows with these white skills in sorting' },
      { label: 'optional main white skills', insertText: 'optional_main_white(Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Prefer main-parent white skill matches' },
      { label: 'optional any white skills', insertText: 'optional_any_white(Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Prefer global or main-parent white skill matches' },
      { label: 'lineage white skills', insertText: 'lineage_white(Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Sort by lineage-style white skill stacking' },
      { label: 'weighted optional white', insertText: 'optional_white(Right-Handed ○, Left-Handed ○, proc_weight = 10)', kind: 'snippet', detail: 'Use proc-chance weighted optional sorting' },
      { label: 'weighted lineage white', insertText: 'lineage_white(Right-Handed ○, Left-Handed ○, stack_weight = 2000, occurrence_weight = 75)', kind: 'snippet', detail: 'Tune lineage sorting weights' },
      { label: 'Main speed stars', insertText: 'Main Speed >= 3', kind: 'snippet', detail: 'Main slot Speed stars, max 3' },
      { label: 'GP1 speed stars', insertText: 'GP1 Speed >= 3', kind: 'snippet', detail: 'Grandparent 1 Speed stars, max 3' },
      { label: 'GP2 speed stars', insertText: 'GP2 Speed >= 3', kind: 'snippet', detail: 'Grandparent 2 Speed stars, max 3' },
      { label: 'Grandparent speed stars', insertText: 'Grandparent Speed >= 3', kind: 'snippet', detail: 'Either grandparent has Speed stars, max 3' },
      { label: 'Main has skill', insertText: 'Main has Right-Handed ○', kind: 'snippet', detail: 'Specific white factor on the main slot' },
      { label: 'Grandparent has skill', insertText: 'Grandparent has Right-Handed ○', kind: 'snippet', detail: 'Either grandparent has this white factor' },
    ];
    const friendlyFieldSuggestions: UqlSuggestion[] = [
      ...this.friendlySparkFields.map(field => ({
        label: field.label,
        insertText: field.label,
        kind: 'field' as const,
        detail: `Compiles to ${field.field} ids`,
        searchText: field.aliases.join(' '),
        matchPhrases: [field.label, ...field.aliases],
        priority: 22,
        fieldType: 'number' as UqlFieldType
      })),
      ...this.friendlyFieldAliases.map(alias => ({
        label: alias.label,
        insertText: alias.label,
        kind: 'field' as const,
        detail: alias.field,
        searchText: this.getFriendlyFieldSearchText(alias),
        matchPhrases: [alias.label, ...alias.aliases],
        priority: this.getFriendlyFieldPriority(alias),
        fieldType: alias.type
      })),
      ...[
        { label: 'Main', detail: 'main_white_factors; white factors on the main slot', searchText: 'main parent main has parent has', matchPhrases: ['main', 'parent', 'main parent'], scopeContext: 'main' as const },
        { label: 'GP1', detail: 'left_white_factors; white factors on grandparent 1', searchText: 'gp1 left grandparent 1 grand parent 1 left has', matchPhrases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1'], scopeContext: 'gp1' as const },
        { label: 'GP2', detail: 'right_white_factors; white factors on grandparent 2', searchText: 'gp2 right grandparent 2 grand parent 2 right has', matchPhrases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2'], scopeContext: 'gp2' as const },
        { label: 'Any GP', detail: 'left_white_factors or right_white_factors; white factors on either grandparent', searchText: 'gp any gp grandparent grand parent any grandparent has', matchPhrases: ['gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent'], scopeContext: 'any-gp' as const },
        { label: 'Grandparent', detail: 'left_white_factors or right_white_factors; white factors on either grandparent', searchText: 'gp any gp grandparent grand parent any grandparent has', matchPhrases: ['gp', 'any gp', 'grandparent', 'grand parent', 'any grandparent', 'any grand parent'], scopeContext: 'any-gp' as const }
      ].map(field => ({
        label: field.label,
        insertText: field.label,
        kind: 'field' as const,
        detail: field.detail,
        searchText: field.searchText,
        matchPhrases: field.matchPhrases,
        priority: 14,
        scopeContext: field.scopeContext,
        valueContext: 'white-factor' as const,
        fieldType: 'array' as UqlFieldType
      })),
      ...this.getScopedSparkFields().map(field => ({
        label: field.label,
        insertText: field.label,
        kind: 'field' as const,
        detail: `${field.fields.map(entry => entry.field).join(' or ')}; max 3 stars on a specific slot`,
        searchText: field.aliases.join(' '),
        matchPhrases: [field.label, ...field.aliases],
        priority: 28,
        scopeContext: this.getScopeContextForLabel(field.label),
        valueContext: field.valueContext,
        fieldType: 'number' as UqlFieldType
      }))
    ];
    const characterSuggestions = CHARACTERS.map(character => {
      const characterName = getCharacterName(character.id);
      const skinName = this.getCharacterSkinName(character.id);
      const displayName = this.getCharacterUqlDisplayName(character);
      return {
        label: displayName,
        insertText: displayName,
        kind: 'value' as const,
        detail: `${skinName || 'Variant'} · Character id ${character.id}`,
        searchText: `${character.name || ''} ${characterName} ${displayName} ${skinName || ''} ${character.id}`,
        valueContext: 'character' as const,
        priority: 0,
        backendValue: character.id.toString(),
        imageUrl: `/assets/images/character_stand/chara_stand_${character.id}.png`
      };
    });
    const toFactorSuggestion = (factor: any, valueContext: UqlValueContext, detailPrefix: string): UqlSuggestion => {
      const factorId = parseInt(factor.id, 10);
      const backendValue = this.buildSparkId(factorId, 1).toString();
      const allLevelIds = Array.from({ length: 9 }, (_entry, index) => this.buildSparkId(factorId, index + 1));
      return {
        label: factor.text,
        insertText: factor.text,
        kind: 'value' as const,
        detail: `${detailPrefix} id ${factor.id}`,
        searchText: `${factor.text} ${this.stripUqlFactorLevelMarker(factor.text)} ${factor.id} ${allLevelIds.join(' ')}`,
        valueContext,
        priority: valueContext === 'white-factor' ? 12 : 18,
        backendValue,
        imageUrl: this.getSkillIconForFactorName(factor.text)
      };
    };
    const factorSuggestions = [
      ...this.blueFactors.map(factor => toFactorSuggestion(factor, 'blue-factor', 'Blue factor')),
      ...this.pinkFactors.map(factor => toFactorSuggestion(factor, 'pink-factor', 'Pink factor')),
      ...this.greenFactors.map(factor => toFactorSuggestion(factor, 'green-factor', 'Unique skill')),
      ...this.whiteFactors.map(factor => toFactorSuggestion(factor, 'white-factor', 'White factor'))
    ];
    this.uqlSuggestions = [
      ...friendlyFieldSuggestions,
      ...syntaxSuggestions.map(suggestion => ({ ...suggestion, priority: this.getSyntaxSuggestionPriority(suggestion) })),
      ...characterSuggestions,
      ...factorSuggestions
    ];
  }

  private getScopeContextForLabel(label: string): UqlSuggestion['scopeContext'] {
    const normalized = label.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:main|parent|main parent)\b/.test(normalized)) return 'main';
    if (/^(?:gp1|left|left parent|grandparent 1|grand parent 1)\b/.test(normalized)) return 'gp1';
    if (/^(?:gp2|right|right parent|grandparent 2|grand parent 2)\b/.test(normalized)) return 'gp2';
    if (/^(?:gp|any gp|grandparent|grand parent|any grandparent|any grand parent)\b/.test(normalized)) return 'any-gp';
    return undefined;
  }

  private getSkillIconForFactorName(factorName: string): string | undefined {
    const normalizedName = this.normalizeUqlName(factorName);
    const skill = SKILLS.find(entry => this.normalizeUqlName(entry.name) === normalizedName && entry.icon);
    return skill?.icon ? `/assets/images/skills/${skill.icon}` : undefined;
  }

  private getCharacterUqlDisplayName(character: (typeof CHARACTERS)[number]): string {
    const characterName = getCharacterName(character.id);
    const skinName = this.getCharacterSkinName(character.id);
    return skinName && skinName !== 'Original' ? `${characterName} [${skinName}]` : characterName;
  }

  private getCharacterSkinName(characterId: number): string {
    const baseId = Math.floor(characterId / 100).toString();
    const skinId = (characterId % 100).toString().padStart(2, '0');
    return getCharacterNameEntries()[baseId]?.skins?.[skinId] || '';
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  private endsWithAny(value: string, endings: string[]): boolean {
    return endings.some(ending => value.endsWith(ending));
  }
  private getNormalizedUqlQuery(): string {
    return this.uqlQuery.trim().replace(/\s+/g, ' ');
  }
  private getUqlDelimiterIssue(query: string): 'unterminated-string' | 'closing-paren' | 'open-paren' | null {
    let quoteCharacter: string | null = null;
    let openParentheses = 0;
    for (let index = 0; index < query.length; index++) {
      const character = query[index];
      if (quoteCharacter) {
        if (character === quoteCharacter) {
          if (query[index + 1] === quoteCharacter) {
            index++;
          } else {
            quoteCharacter = null;
          }
        }
        continue;
      }
      if (character === '\'' || character === '"') {
        quoteCharacter = character;
      } else if (character === '(') {
        openParentheses++;
      } else if (character === ')') {
        openParentheses--;
        if (openParentheses < 0) return 'closing-paren';
      }
    }
    if (quoteCharacter) return 'unterminated-string';
    if (openParentheses > 0) return 'open-paren';
    return null;
  }
  private endsWithIncompleteUqlToken(expression: string): boolean {
    const trimmedExpression = expression.replace(/;\s*$/, '').trim();
    return /(?:\bwhere\b|\band\b|\bor\b|\bnot\b|\bin\b|\bbetween\b|\blike\b|\bilike\b|\bhas\b|\bhas\s+any\b|\bhas\s+all\b|\bdoes\s+not\s+have\b|[,(]|=|!=|<>|<=|>=|<|>)$/i.test(trimmedExpression);
  }
  private hasEmptyUqlValueList(expression: string): boolean {
    return /(?:^|[\s(])(?:has\s+any|has\s+all)\s*\(\s*\)(?=\s*(?:\)|;|$|\band\b|\bor\b))/i.test(expression)
      || /\b(?:overlaps|has_all|contains_all|all)\s*\(\s*[^,()]+\s*,\s*\(\s*\)\s*\)/i.test(expression);
  }
  private endsWithPartialBooleanContinuation(expression: string): boolean {
    const trimmedExpression = expression.replace(/;\s*$/, '').trim();
    const match = trimmedExpression.match(/(?:\d|'|"|\))\s+([A-Za-z]+)$/);
    if (!match) return false;
    const token = match[1].toLowerCase();
    return token !== 'and' && token !== 'or' && ('and'.startsWith(token) || 'or'.startsWith(token));
  }
  private findUnknownUqlIdentifier(query: string): string | null {
    const queryWithoutStrings = query.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, ' ');
    const identifierPattern = /[A-Za-z_][A-Za-z0-9_.]*/g;
    let identifierMatch: RegExpExecArray | null;
    while ((identifierMatch = identifierPattern.exec(queryWithoutStrings)) !== null) {
      const rawIdentifier = identifierMatch[0];
      const normalizedIdentifier = rawIdentifier.toLowerCase().replace(/\./g, '_');
      if (this.uqlFields.has(normalizedIdentifier) || this.uqlKeywords.has(normalizedIdentifier) || this.uqlFunctions.has(normalizedIdentifier) || this.uqlFunctionParameterNames.has(normalizedIdentifier)) {
        continue;
      }
      const remainingText = queryWithoutStrings.slice(identifierMatch.index + rawIdentifier.length).trimStart();
      if (remainingText.startsWith('(')) {
        return `${rawIdentifier}()`;
      }
      return rawIdentifier;
    }
    return null;
  }
  private buildStructuredUqlExpression(): string {
    const clauses: string[] = [];
    const addMinimumClause = (fieldName: string, value: number | undefined) => {
      if (value !== undefined && value > 0) clauses.push(`${fieldName} >= ${value}`);
    };
    const addNumberInClause = (fieldName: string, values: Array<number | undefined>) => {
      const uniqueValues = this.getUniqueNumbers(values);
      if (uniqueValues.length === 1) {
        clauses.push(`${fieldName} = ${uniqueValues[0]}`);
      } else if (uniqueValues.length > 1) {
        clauses.push(`${fieldName} in (${this.formatUqlNumberList(uniqueValues)})`);
      }
    };
    const mainParent = this.treeData.children?.[0];
    addNumberInClause('main_chara_id', [
      mainParent?.characterId,
      ...this.includeMainParentCharacters.map(character => character.id)
    ]);
    addNumberInClause('left_chara_id', [mainParent?.children?.[0]?.characterId]);
    addNumberInClause('right_chara_id', [mainParent?.children?.[1]?.characterId]);
    const includeParentIds = this.getUniqueNumbers(this.includeParentCharacters.map(character => character.id));
    if (includeParentIds.length) {
      const values = this.formatUqlNumberList(includeParentIds);
      clauses.push(`(left_chara_id in (${values}) or right_chara_id in (${values}))`);
    }
    const excludeParentIds = this.getUniqueNumbers(this.excludeParentCharacters.map(character => character.id));
    if (excludeParentIds.length) {
      const values = this.formatUqlNumberList(excludeParentIds);
      clauses.push(`left_chara_id not in (${values})`);
      clauses.push(`right_chara_id not in (${values})`);
    }
    const excludeMainParentIds = this.getUniqueNumbers(this.excludeMainParentCharacters.map(character => character.id));
    if (excludeMainParentIds.length) {
      clauses.push(`main_chara_id not in (${this.formatUqlNumberList(excludeMainParentIds)})`);
    }
    this.appendArrayOverlapClauses(clauses, 'blue_sparks', this.filterState.blue_sparks);
    this.appendArrayOverlapClauses(clauses, 'pink_sparks', this.filterState.pink_sparks);
    this.appendArrayOverlapClauses(clauses, 'green_sparks', this.filterState.green_sparks);
    this.appendArrayOverlapClauses(clauses, 'white_sparks', this.filterState.white_sparks);
    this.appendArrayOverlapClauses(clauses, 'main_white_factors', this.filterState.main_parent_white_sparks);
    addMinimumClause('main_blue_factors', this.filterState.min_main_blue_factors);
    addMinimumClause('main_pink_factors', this.filterState.min_main_pink_factors);
    addMinimumClause('main_green_factors', this.filterState.min_main_green_factors);
    addMinimumClause('main_white_count', this.filterState.min_main_white_count);
    addMinimumClause('win_count', this.filterState.min_win_count);
    addMinimumClause('white_count', this.filterState.min_white_count);
    if (this.filterState.parent_rank && this.filterState.parent_rank > 1) {
      addMinimumClause('parent_rank', this.filterState.parent_rank);
    }
    if (this.includeMaxFollowers && this.filterState.max_follower_num) {
      clauses.push(`follower_num <= ${this.filterState.max_follower_num}`);
    }
    addMinimumClause('blue_stars_sum', this.filterState.min_blue_stars_sum);
    addMinimumClause('pink_stars_sum', this.filterState.min_pink_stars_sum);
    addMinimumClause('green_stars_sum', this.filterState.min_green_stars_sum);
    addMinimumClause('white_stars_sum', this.filterState.min_white_stars_sum);
    this.appendArrayOverlapClauses(clauses, 'main_win_saddles', this.filterState.main_win_saddle ? [this.filterState.main_win_saddle] : undefined);
    if (this.searchUserId) {
      clauses.push(`account_id = ${this.quoteUqlString(this.searchUserId)}`);
    }
    if (this.searchUsername) {
      clauses.push(`trainer_name ilike ${this.quoteUqlString(`%${this.searchUsername}%`)}`);
    }
    return clauses.join(' and ');
  }
  private appendArrayOverlapClauses(clauses: string[], fieldName: string, groups: number[][] | undefined): void {
    if (!groups) return;
    groups.forEach(group => {
      const uniqueValues = this.getUniqueNumbers(group);
      if (uniqueValues.length) {
        clauses.push(`overlaps(${fieldName}, (${this.formatUqlNumberList(uniqueValues)}))`);
      }
    });
  }
  private getUniqueNumbers(values: Array<number | undefined>): number[] {
    return [...new Set(values.filter((value): value is number => Number.isFinite(value)))];
  }
  private formatUqlNumberList(values: number[]): string {
    return values.join(', ');
  }
  private quoteUqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
  private stripLeadingWhere(query: string): string {
    return query.replace(/^\s*where\b\s*/i, '').replace(/;\s*$/, '').trim();
  }
  private truncateUqlChipValue(value: string): string {
    return value.length > 56 ? `${value.slice(0, 53)}...` : value;
  }
  setLimitBreak(level: number) {
    this.selectedLimitBreak = level;
    this.onFilterChange();
  }
  toggleLimitBreak(level: number) {
    if (this.selectedLimitBreak === level) {
      this.selectedLimitBreak = 0;
    } else {
      this.selectedLimitBreak = level;
    }
    this.onFilterChange();
  }
  formatLabel(value: number): string {
    if (value === 4) return 'MLB';
    return 'LB' + value;
  }
  onSearchChange() {
    this.onFilterChange();
  }
  clearSearchUserId() {
    this.searchUserId = '';
    this.onSearchChange();
  }
  clearSearchUsername() {
    this.searchUsername = '';
    this.onFilterChange();
  }
  selectSupportCard() {
    const dialogRef = this.dialog.open(SupportCardSelectDialogComponent, {
      width: '700px',
      maxWidth: '90vw',
      panelClass: 'modern-dialog-panel'
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.selectedSupportCard = result;
        this.onFilterChange();
      }
    });
  }
  removeSupportCard() {
    this.selectedSupportCard = null;
    this.onFilterChange();
  }
  selectVeteran() {
    if (this.linkedAccounts.length === 0) {
      this.loadLinkedAccounts(() => this.openVeteranDialog());
    } else {
      this.openVeteranDialog();
    }
  }
  private openVeteranDialog() {
    const targetCharaId = this.treeData.characterId
      ? Math.floor(this.treeData.characterId / 100)
      : null;
    const dialogRef = this.dialog.open(VeteranPickerDialogComponent, {
      width: '92vw',
      maxWidth: '1100px',
      panelClass: 'modern-dialog-panel',
      autoFocus: false,
      data: {
        linkedAccounts: this.linkedAccounts,
        selectedAccountId: this.selectedAccountId,
        characters: CHARACTERS,
        veterans: this.veterans,
        loadingVeterans: {},
        targetCharaId,
      } as VeteranPickerDialogData,
    });
    dialogRef.afterClosed().subscribe((vet: VeteranMember | undefined) => {
      if (vet) {
        this.selectedVeteran = vet;
        this.selectedVeteranName = this.getVeteranName(vet);
        this.selectedVeteranImage = this.getVeteranImage(vet);
        this.veteranSelected.emit(vet);
        this.onFilterChange();
      }
    });
  }
  private loadLinkedAccounts(callback?: () => void) {
    this.authService.getLinkedAccounts()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(accounts => {
        this.linkedAccounts = accounts;
        if (accounts.length > 0 && !this.selectedAccountId) {
          this.selectedAccountId = accounts[0].account_id;
          this.loadVeteransForAccount(accounts[0].account_id);
        }
        this.cdr.markForCheck();
        callback?.();
      });
  }
  private loadVeteransForAccount(accountId: string) {
    if (this.loadingVeterans[accountId]) return;
    this.loadingVeterans[accountId] = true;
    this.profileService.getProfile(accountId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(profile => {
        this.loadingVeterans[accountId] = false;
        this.veterans[accountId] = profile?.veterans ?? [];
        this.tryRestoreVeteran();
        this.cdr.markForCheck();
      });
  }
  removeVeteran() {
    this.selectedVeteran = null;
    this.selectedVeteranName = '';
    this.selectedVeteranImage = '';
    this.pendingVeteranRestore = null;
    this.filterState.affinity_p2 = undefined;
    this.veteranSelected.emit(null);
    this.onFilterChange();
  }

  onVeteranAffinityChanged(affinity: number) {
    this.filterState.affinity_p2 = affinity > 0 ? affinity : undefined;
    this.onFilterChange();
  }

  private tryRestoreVeteran() {
    if (!this.pendingVeteranRestore) return;
    const { accountId, memberId } = this.pendingVeteranRestore;
    const vets = this.veterans[accountId];
    if (!vets) return;
    const vet = vets.find(v => v.member_id === memberId);
    if (vet) {
      this.pendingVeteranRestore = null;
      this.selectedVeteran = vet;
      this.selectedVeteranName = this.getVeteranName(vet);
      this.selectedVeteranImage = this.getVeteranImage(vet);
      this.veteranSelected.emit(vet);
      this.onFilterChange();
    }
  }
  getAffinityTargetCharaId(): number | null {
    return this.treeData.characterId
      ? Math.floor(this.treeData.characterId / 100)
      : null;
  }
  private getVeteranName(vet: VeteranMember): string {
    if (vet.card_id) return getCharacterName(vet.card_id);
    if (vet.trained_chara_id) {
      const c = CHARACTERS.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? getCharacterName(c.id) : `Uma #${vet.trained_chara_id}`;
    }
    return 'Unknown';
  }
  private getVeteranImage(vet: VeteranMember): string {
    if (vet.card_id) return `assets/images/character_stand/chara_stand_${vet.card_id}.webp`;
    if (vet.trained_chara_id) {
      const c = CHARACTERS.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? `assets/images/character_stand/chara_stand_${c.id}.webp` : '';
    }
    return '';
  }
  getSupportCardTypeDisplay(type: SupportCardType): string {
    const typeMap: Record<number, string> = {
      [SupportCardType.SPEED]: 'Speed',
      [SupportCardType.STAMINA]: 'Stamina',
      [SupportCardType.POWER]: 'Power',
      [SupportCardType.GUTS]: 'Guts',
      [SupportCardType.WISDOM]: 'Wisdom',
      [SupportCardType.FRIEND]: 'Friend'
    };
    return typeMap[type] || 'Unknown';
  }
  getSupportCardRarityDisplay(rarity: Rarity): string {
    const rarityMap: Record<number, string> = {
      [Rarity.R]: 'R',
      [Rarity.SR]: 'SR',
      [Rarity.SSR]: 'SSR'
    };
    return rarityMap[rarity] || 'Unknown';
  }
  clearNode(node: TreeNode, event: Event) {
    event.stopPropagation(); // Prevent opening the dialog
    this.clearNodeRecursive(node);
    this.updateTreeFilters();
  }
  private clearNodeRecursive(node: TreeNode) {
    node.name = node.layer === 0 ? 'Target Character' : (node.layer === 1 ? 'Parent' : 'Grandparent');
    node.image = undefined;
    node.characterId = undefined;
    // If clearing a parent, recursively clear children
    if (node.children) {
      node.children.forEach(child => this.clearNodeRecursive(child));
    }
  }
  increment(field: keyof UnifiedSearchParams) {
    const currentValue = (this.filterState[field] as number) || 0;
    (this.filterState[field] as any) = currentValue + 1;
    this.onFilterChange();
  }
  decrement(field: keyof UnifiedSearchParams) {
    const currentValue = (this.filterState[field] as number) || 0;
    if (currentValue > 0) {
      (this.filterState[field] as any) = currentValue - 1;
      this.onFilterChange();
    }
  }
  incrementStarSum(field: keyof UnifiedSearchParams, max?: number) {
    const currentValue = (this.filterState[field] as number) || 0;
    if (max === undefined || currentValue < max) {
      (this.filterState[field] as any) = currentValue + 1;
      this.onFilterChange();
    }
  }
  decrementStarSum(field: keyof UnifiedSearchParams) {
    const currentValue = (this.filterState[field] as number) || 0;
    if (currentValue > 0) {
      (this.filterState[field] as any) = currentValue - 1;
      this.onFilterChange();
    }
  }
  // Rank Options
  rankOptions = Array.from({ length: 20 }, (_, i) => i + 1);
  toggleMaxFollowers(checked: boolean) {
    this.includeMaxFollowers = checked;
    this.filterState.max_follower_num = checked ? 1000 : 999;
    this.maxFollowersToggled.emit(checked);
    this.onFilterChange();
  }
  getRankIconPath(rank: number): string {
    const rankId = rank.toString().padStart(2, '0');
    return `assets/images/icon/ranks/utx_txt_rank_${rankId}.webp`;
  }
  onRankIconError(event: any, rank: number): void {
    event.target.style.display = 'none';
  }
  // Star Sum Helpers
  getStarSumValue(type: 'blue' | 'pink' | 'green' | 'white'): number | undefined {
    switch (type) {
      case 'blue': return this.filterState.min_blue_stars_sum;
      case 'pink': return this.filterState.min_pink_stars_sum;
      case 'green': return this.filterState.min_green_stars_sum;
      case 'white': return this.filterState.min_white_stars_sum;
    }
  }
  onStarSumOpened(opened: boolean): void {
    // Optional: Handle dropdown open state if needed
  }
}
