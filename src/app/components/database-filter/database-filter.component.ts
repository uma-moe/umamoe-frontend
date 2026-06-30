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
import {
  SUPPORT_CARDS,
  getSupportCardDisplayName as getSupportCardDataDisplayName,
  getSupportCardDisplayTitle as getSupportCardDataDisplayTitle
} from '../../data/support-cards.data';
import { SKILLS } from '../../data/skills.data';
import { RACE_SADDLE_DATA } from '../../data/race-saddle.data';
import { getCharacterName } from '../../pages/profile/profile-helpers';
import { FactorService } from '../../services/factor.service';
import { RaceSchedulerComponent } from '../race-scheduler/race-scheduler.component';
import { VeteranDisplayComponent } from '../veteran-display/veteran-display.component';
import { preferRasterAsset } from '../../utils/raster-asset';
import { AdvancedFilterPanelComponent } from './advanced-filter/advanced-filter.component';
import { UqlFilterComponent, UqlSuggestion, UqlValidationIssue, UqlValueContext } from './uql-filter/uql-filter.component';
export interface ActiveFilterChip {
  id: string;
  label: string;
  name?: string;
  value?: string;
  showStar?: boolean;
  rankIcon?: string; // Path to rank icon image
  range?: string; // Star range like "1-9", "5+", etc.
  type: 'blue' | 'pink' | 'green' | 'white' | 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite' | 'mainBlue' | 'mainPink' | 'mainGreen' | 'mainWhite' | 'character' | 'supportCard' | 'other' | 'blueStarSum' | 'pinkStarSum' | 'greenStarSum' | 'whiteStarSum' | 'includeMainParent' | 'includeParent' | 'excludeParent' | 'excludeMainParent' | 'raceSchedule' | 'uql';
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

export type UqlFieldType = 'number' | 'string' | 'array' | 'directive';
type UqlFactorValueContext = Extract<UqlValueContext, 'blue-factor' | 'pink-factor' | 'green-factor' | 'white-factor'>;

type UqlEditorDirectiveKind = 'target' | 'legacy';

interface UqlEditorDirective {
  kind: UqlEditorDirectiveKind;
  value: string;
}

interface UqlEditorDirectiveParseResult {
  queryWithoutDirectives: string;
  directives: UqlEditorDirective[];
  issue?: { state: 'incomplete' | 'invalid'; message: string };
}

interface UqlDelimiterIssue {
  kind: 'unterminated-string' | 'closing-paren' | 'open-paren';
  from: number;
  to: number;
}

interface UqlRaceSaddleValue {
  label: string;
  aliases: string[];
  searchText: string;
  saddleIds: number[];
  raceInstanceId: number;
  grade?: number;
  gradeLabel?: string;
  gradeClass?: string;
}

interface FriendlyFieldAlias {
  label: string;
  aliases: string[];
  field: string;
  type?: UqlFieldType;
}

export interface UqlSparkHighlight {
  globalSparkIds?: number[];
  mainSparkIds?: number[];
  leftSparkIds?: number[];
  rightSparkIds?: number[];
  optionalWhiteFactorIds?: number[];
  optionalMainWhiteFactorIds?: number[];
  lineageWhiteFactorIds?: number[];
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

interface FriendlyCharacterScopeAliasReplacement {
  alias: string;
  label: string;
  fields: string[];
  comparisonPattern: RegExp;
  inPattern: RegExp;
  notInPattern: RegExp;
}

interface FriendlyArrayAliasReplacement {
  alias: string;
  label: string;
  fields: string[];
  hasAllPattern: RegExp;
  hasAnyPattern: RegExp;
  doesNotHavePattern: RegExp;
  hasPattern: RegExp;
  containsAllPattern: RegExp;
  containsAnyPattern: RegExp;
  inPattern: RegExp;
  notInPattern: RegExp;
  containsPattern: RegExp;
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

type PriorityFactorState = number | [number, number];

interface CompressedState {
  fm?: FilterMode;
  uql?: string;
  b?: (number|null)[][]; // blue factors [id, min]
  p?: (number|null)[][]; // pink factors [id, min]
  g?: (number|null)[][]; // green factors [id, min]
  w?: (number|null)[][]; // white factors [id, min]
  
  ow?: PriorityFactorState[]; // optional white factors [id] or [id, priority]
  omw?: PriorityFactorState[]; // optional main white factors [id] or [id, priority]
  lw?: PriorityFactorState[]; // lineage white factors [id] or [id, priority]
  mb?: (number|null)[][]; // main blue
  mp?: (number|null)[][]; // main pink
  mg?: (number|null)[][]; // main green
  mw?: (number|null)[][]; // main white
  
  // Tree: [targetId, p1Id, p1_g1Id, p1_g2Id, p2Id, p2_g1Id, p2_g2Id]
  t?: (number|null)[]; 
  
  sc?: string; // support card id
  lb?: number; // limit break
  
  uid?: string; // search user id
  un?: string; // search username
  
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
  p2c?: number; // compact selected legacy main character context for URL sharing
  p2w?: number[]; // compact selected legacy race-win context for URL sharing
  p2i?: number | string; // source inheritance id when the compact context came from a bookmark
  // Race schedule: [yearIdx, month, half, raceInstanceId][]
  rs?: [number, number, number, number][];
  vet?: [string, number];
}

interface SavedDatabaseFilterState {
  version: 2;
  mode: FilterMode;
  formState?: string;
  uqlState?: string;
  defaultMlbFilterRemoved?: boolean;
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
  optional_white_priorities?: string[];
  optional_main_white_priorities?: string[];
  // Lineage white sparks (filter by white sparks in the lineage parents)
  lineage_white?: number[];
  lineage_white_priorities?: string[];
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
  uql_highlight?: UqlSparkHighlight;
  main_win_saddle?: number[];
  // Parent include/exclude filters (multi-select)
  parent_id?: number[];           // Matches against both left and right parent positions
  exclude_parent_id?: number[];   // Excludes from both left and right parent positions
  exclude_main_parent_id?: number[]; // Excludes main parent IDs
  p2_main_chara_id?: number;
  p2_win_saddle?: number[];
}
export interface FactorFilter {
  uuid: string;
  factorId: number | null;
  min: number;
  max: number;
  priority?: number;
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
  static readonly SAVED_FILTER_STATE_KEY = 'database-filter-state-v2';
  static readonly SAVED_FILTER_MODE_KEY = 'database-filter-mode-v1';

  static hasSavedFilterState(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const saved = localStorage.getItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY);
      if (!saved) return false;
      const parsed = JSON.parse(saved) as Partial<SavedDatabaseFilterState>;
      return parsed.version === 2 && !!(parsed.formState || parsed.uqlState);
    } catch {
      return false;
    }
  }

  @Input() resultCount: number | null = null;
  @Output() filterChange = new EventEmitter<UnifiedSearchParams>();
  @Output() maxFollowersToggled = new EventEmitter<boolean>();
  @Output() veteranSelected = new EventEmitter<VeteranMember | null>();
  private filterChangeSubject = new Subject<UnifiedSearchParams>();
  private destroy$ = new Subject<void>();
  private restoredSavedFilterState = false;
  private staticUqlSuggestionsCache: UqlSuggestion[] | null = null;
  private lastUqlFilterStateSignature: string | null = null;
  private structuredFiltersDirtyForUql = false;
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
  uqlValidationIssue: UqlValidationIssue | null = null;
  uqlPreviewExpanded = false;
  currentUqlPreview = '';
  readonly uqlStarterSnippets: UqlSnippet[] = [
    { label: 'Speed', insertText: 'Speed >= 3' },
    { label: 'No Dirt', insertText: 'Dirt = 0' },
    { label: 'Spark Sum', insertText: '(Stamina + Power + Wit) >= 7' },
    { label: 'Affinity', insertText: 'affinity >= 150' },
    { label: 'Wins', insertText: 'Wins >= 30' },
    { label: 'Even Wins', insertText: 'Wins % 2 = 0' },
    { label: 'Name', insertText: "Trainer name ilike '%name%'" },
    { label: 'Match Umas', insertText: 'Main character in (Special Week, Silence Suzuka)' },
    { label: 'Target (ace)', insertText: 'target = Special Week' },
    { label: 'Owned Legacy', insertText: 'owned legacy = []' },
    { label: 'White Skill', insertText: 'White sparks has Right-Handed ○' },
    { label: 'Main Skill', insertText: 'Main white factors has Right-Handed ○' },
    { label: 'Any Skills', insertText: 'White sparks has any (Right-Handed ○, Left-Handed ○)' },
    { label: 'All Skills', insertText: 'White sparks has all (Right-Handed ○, Left-Handed ○)' },
    { label: 'Optional White', insertText: 'optional white in (Right-Handed ○, Left-Handed ○)' },
    { label: 'Optional White P0', insertText: 'optional white in (Right-Handed ○, Left-Handed ○, priority = 0)' },
    { label: 'Optional Main White', insertText: 'optional main white in (Right-Handed ○, Left-Handed ○)' },
    { label: 'Optional Main P1', insertText: 'optional main white in (Right-Handed ○, Left-Handed ○, priority_group = 1)' },
    { label: 'Lineage White', insertText: 'lineage white in (Right-Handed ○, Left-Handed ○)' },
    { label: 'Lineage White P2', insertText: 'lineage white in (Right-Handed ○, Left-Handed ○, group = 2)' },
    { label: 'OR group', insertText: '(Speed >= 3 or Stamina >= 3) and Wins >= 30' },
    { label: 'Main Speed', insertText: 'Main Speed >= 3' },
    { label: 'Great parent Speed', insertText: 'Great parent Speed >= 3' },
    { label: 'Either path', insertText: '(Wins >= 35 and White count >= 12) or (Blue stars >= 9 and Pink stars >= 6)' },
    { label: 'Omit Test', insertText: "not Trainer name ilike '%test%'" }
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
    { label: 'White count', aliases: ['white factor count', 'white count'], field: 'white_count', type: 'number' },
    { label: 'Followers', aliases: ['followers', 'follower count'], field: 'follower_num', type: 'number' },
    { label: 'Trainer name', aliases: ['trainer name', 'trainer', 'name'], field: 'trainer_name', type: 'string' },
    { label: 'Trainer ID', aliases: ['trainer id', 'account id'], field: 'account_id', type: 'string' },
    { label: 'Support card', aliases: ['support card', 'support', 'card', 'support card id'], field: 'support_card_id', type: 'number' },
    { label: 'LB', aliases: ['lb', 'limitbreak', 'limit break', 'limit_break', 'limit break count', 'limitbreak count', 'limit_break_count', 'min lb', 'minimum lb'], field: 'limit_break_count', type: 'number' },
    { label: 'Characters', aliases: ['characters', 'character', 'umas', 'uma', 'charas', 'chara'], field: 'characters', type: 'number' },
    { label: 'Main character', aliases: ['main character', 'main characters', 'runner', 'runners', 'main uma', 'main umas', 'main chara', 'main charas'], field: 'main_chara_id', type: 'number' },
    { label: 'Main parent (p1/2)', aliases: ['parent character', 'parent uma', 'main parent character', 'main parent', 'main', 'parent'], field: 'main_parent_id', type: 'number' },
    { label: 'Great parent 1 (gp1)', aliases: ['gp1 character', 'gp1 characters', 'gp1 uma', 'gp1 umas', 'gp1 chara', 'gp1 charas', 'grandparent 1', 'grandparent 1 character', 'grandparent 1 characters', 'grand parent 1', 'grand parent 1 character', 'grand parent 1 characters', 'great parent 1', 'great parent 1 character', 'left parent', 'left character', 'left characters', 'left uma', 'left umas', 'left chara', 'left charas', 'gp1'], field: 'left_chara_id', type: 'number' },
    { label: 'Great parent 2 (gp2)', aliases: ['gp2 character', 'gp2 characters', 'gp2 uma', 'gp2 umas', 'gp2 chara', 'gp2 charas', 'grandparent 2', 'grandparent 2 character', 'grandparent 2 characters', 'grand parent 2', 'grand parent 2 character', 'grand parent 2 characters', 'great parent 2', 'great parent 2 character', 'right parent', 'right character', 'right characters', 'right uma', 'right umas', 'right chara', 'right charas', 'gp2'], field: 'right_chara_id', type: 'number' },
    { label: 'Great parent (gp1/2)', aliases: ['gp characters', 'gp character', 'gp umas', 'gp uma', 'gp charas', 'gp chara', 'grandparent characters', 'grandparent character', 'grand parent characters', 'grand parent character', 'great parent characters', 'great parent character', 'any gp characters', 'any gp character', 'any grandparent characters', 'any grandparent character', 'any great parent characters', 'any great parent character'], field: 'grandparent_characters', type: 'number' },
    { label: 'Rank', aliases: ['parent rank', 'rank'], field: 'parent_rank', type: 'number' },
    { label: 'Blue stars', aliases: ['blue stars', 'blue star sum', 'blue sparks total', 'total blue sparks', 'lineage blue sparks', 'lineage blue stars'], field: 'blue_stars_sum', type: 'number' },
    { label: 'Pink stars', aliases: ['pink stars', 'pink star sum', 'pink sparks total', 'total pink sparks', 'lineage pink sparks', 'lineage pink stars'], field: 'pink_stars_sum', type: 'number' },
    { label: 'Green stars', aliases: ['green stars', 'green star sum', 'green sparks total', 'total green sparks', 'lineage green sparks', 'lineage green stars'], field: 'green_stars_sum', type: 'number' },
    { label: 'White stars', aliases: ['white stars', 'white star sum', 'white sparks total', 'total white sparks', 'lineage white sparks', 'lineage white stars'], field: 'white_stars_sum', type: 'number' },
    { label: 'Affinity', aliases: ['affinity', 'total affinity', 'legacy affinity'], field: 'affinity', type: 'number' },
    { label: 'Race affinity', aliases: ['race affinity'], field: 'computed_race_affinity', type: 'number' },
    { label: 'White factors', aliases: ['white factors', 'white sparks', 'white skills'], field: 'white_sparks', type: 'array' },
    { label: 'Blue sparks', aliases: ['blue sparks', 'blue factors'], field: 'blue_sparks', type: 'array' },
    { label: 'Pink sparks', aliases: ['pink sparks', 'pink factors'], field: 'pink_sparks', type: 'array' },
    { label: 'Green sparks', aliases: ['green sparks', 'green factors', 'unique skills'], field: 'green_sparks', type: 'array' },
    { label: 'Main white factors', aliases: ['main white factors', 'main white sparks', 'main white skills', 'main skills'], field: 'main_white_factors', type: 'array' },
    { label: 'Main race wins', aliases: ['main race wins', 'main race results', 'main win saddles'], field: 'main_win_saddles', type: 'array' },
    // Additional fields documented in the UQL README so they show up in autocomplete and validate correctly.
    { label: 'Inheritance ID', aliases: ['inheritance id', 'inheritance_id'], field: 'inheritance_id', type: 'number' },
    { label: 'Parent inheritance ID', aliases: ['main parent id', 'main_parent_id', 'parent inheritance id'], field: 'main_parent_id', type: 'number' },
    { label: 'GP1 inheritance ID', aliases: ['gp1 id', 'grandparent 1 id', 'left parent id', 'parent left id', 'left_parent_id', 'parent_left_id'], field: 'parent_left_id', type: 'number' },
    { label: 'GP2 inheritance ID', aliases: ['gp2 id', 'grandparent 2 id', 'right parent id', 'parent right id', 'right_parent_id', 'parent_right_id'], field: 'parent_right_id', type: 'number' },
    { label: 'Parent rarity', aliases: ['parent rarity', 'rarity'], field: 'parent_rarity', type: 'number' },
    { label: 'Main blue sparks', aliases: ['main blue sparks', 'main blue factors', 'main blue total', 'main blue stars total', 'main blue category count', 'main blue parsed sparks', 'main blue spark ids', 'main blue factor ids'], field: 'main_blue_factors', type: 'number' },
    { label: 'Main pink sparks', aliases: ['main pink sparks', 'main pink factors', 'main pink total', 'main pink stars total', 'main pink category count', 'main pink parsed sparks', 'main pink spark ids', 'main pink factor ids'], field: 'main_pink_factors', type: 'number' },
    { label: 'Main green sparks', aliases: ['main green sparks', 'main green factors', 'main green total', 'main green stars total', 'main green category count', 'main unique skills', 'main unique skill', 'main green parsed sparks', 'main green spark ids', 'main green factor ids'], field: 'main_green_factors', type: 'number' },
    { label: 'Main white count', aliases: ['main white count'], field: 'main_white_count', type: 'number' },
    { label: 'GP1 blue sparks', aliases: ['gp1 blue sparks', 'gp1 blue factors', 'gp1 blue spark ids', 'gp1 blue factor ids', 'left blue sparks', 'left blue factors', 'left blue parsed sparks'], field: 'left_blue_factors', type: 'number' },
    { label: 'GP1 pink sparks', aliases: ['gp1 pink sparks', 'gp1 pink factors', 'gp1 pink spark ids', 'gp1 pink factor ids', 'left pink sparks', 'left pink factors', 'left pink parsed sparks'], field: 'left_pink_factors', type: 'number' },
    { label: 'GP1 green sparks', aliases: ['gp1 green sparks', 'gp1 green factors', 'gp1 unique skills', 'gp1 unique skill', 'gp1 green spark ids', 'gp1 green factor ids', 'left green sparks', 'left green factors', 'left unique skills', 'left unique skill', 'left green parsed sparks'], field: 'left_green_factors', type: 'number' },
    { label: 'Left white count', aliases: ['left white count'], field: 'left_white_count', type: 'number' },
    { label: 'GP2 blue sparks', aliases: ['gp2 blue sparks', 'gp2 blue factors', 'gp2 blue spark ids', 'gp2 blue factor ids', 'right blue sparks', 'right blue factors', 'right blue parsed sparks'], field: 'right_blue_factors', type: 'number' },
    { label: 'GP2 pink sparks', aliases: ['gp2 pink sparks', 'gp2 pink factors', 'gp2 pink spark ids', 'gp2 pink factor ids', 'right pink sparks', 'right pink factors', 'right pink parsed sparks'], field: 'right_pink_factors', type: 'number' },
    { label: 'GP2 green sparks', aliases: ['gp2 green sparks', 'gp2 green factors', 'gp2 unique skills', 'gp2 unique skill', 'gp2 green spark ids', 'gp2 green factor ids', 'right green sparks', 'right green factors', 'right unique skills', 'right unique skill', 'right green parsed sparks'], field: 'right_green_factors', type: 'number' },
    { label: 'Right white count', aliases: ['right white count'], field: 'right_white_count', type: 'number' },
    { label: 'Race affinity (raw)', aliases: ['race affinity raw'], field: 'race_affinity', type: 'number' },
    { label: 'Support card count', aliases: ['support cards', 'support card count', 'support cards count'], field: 'support_card_count', type: 'number' },
    { label: 'Left white factors', aliases: ['left white factors', 'left white sparks', 'gp1 white factors', 'gp1 white sparks'], field: 'left_white_factors', type: 'array' },
    { label: 'Right white factors', aliases: ['right white factors', 'right white sparks', 'gp2 white factors', 'gp2 white sparks'], field: 'right_white_factors', type: 'array' },
    { label: 'Left race wins', aliases: ['left race wins', 'left race results', 'left win saddles'], field: 'left_win_saddles', type: 'array' },
    { label: 'Right race wins', aliases: ['right race wins', 'right race results', 'right win saddles'], field: 'right_win_saddles', type: 'array' },
    { label: 'Race wins', aliases: ['race wins', 'race results', 'win saddles'], field: 'main_win_saddles', type: 'array' },
  ];
  private readonly friendlySparkComparisonAliases: FriendlySparkComparisonAlias[] = this.friendlySparkFields
    .flatMap(field => field.aliases.map(alias => this.createFriendlySparkComparisonAlias(field, alias)))
    .sort((left, right) => right.alias.length - left.alias.length);
  private readonly friendlyFieldAliasReplacements: FriendlyFieldAliasReplacement[] = this.friendlyFieldAliases
    .flatMap(aliasGroup => [aliasGroup.field, aliasGroup.label, ...aliasGroup.aliases].map(alias => this.createFriendlyFieldAliasReplacement(alias, aliasGroup.field)))
    .sort((left, right) => right.alias.length - left.alias.length);
  private readonly friendlyCharacterScopeAliasReplacements: FriendlyCharacterScopeAliasReplacement[] = this.buildCharacterScopeAliases()
    .sort((left, right) => right.alias.length - left.alias.length)
    .map(scope => this.createFriendlyCharacterScopeAliasReplacement(scope));
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
    'pink_stars_sum', 'green_stars_sum', 'white_stars_sum', 'affinity', 'affinity_score', 'race_affinity',
    'computed_race_affinity', 'support_card_count', 'support_cards_count', 'support_card_id', 'limit_break_count', 'account_id',
    'trainer_id', 'trainer_name', 'name', 'blue_sparks', 'pink_sparks', 'green_sparks',
    'white_sparks', 'main_white_factors', 'main_white_sparks', 'left_white_factors',
    'left_white_sparks', 'right_white_factors', 'right_white_sparks', 'main_win_saddles',
    'left_win_saddles', 'right_win_saddles', 'race_results'
  ]);
  private readonly uqlKeywords = new Set([
    'where', 'and', 'or', 'not', 'in', 'between', 'like', 'ilike', 'mod', 'true', 'false', 'null'
  ]);
  private readonly uqlFunctions = new Set([
    'contains', 'has', 'overlaps', 'any', 'has_all', 'contains_all', 'all',
    'support_card', 'has_support_card',
    'spark_sum',
    'optional_white', 'optional_main_white', 'optional_any_white', 'lineage_white'
  ]);
  private readonly uqlFunctionParameterNames = new Set([
    'id', 'card_id', 'support_card_id', 'lb', 'limitbreak', 'limit_break', 'limit_break_count', 'exp', 'experience',
    'priority', 'priority_group', 'group',
    'type_weight', 'level_weight', 'match_weight', 'stack_weight', 'occurrence_weight',
    'base', 'decay', 'weight', 'proc_weight', 'affinity'
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
  private linkedAccountsLoaded = false;
  private loadingLinkedAccounts = false;
  selectedAccountId: string | null = null;
  veterans: { [accountId: string]: VeteranMember[] } = {};
  loadingVeterans: { [accountId: string]: boolean } = {};
  private fetchedVeteransById = new Map<string, VeteranMember | null>();
  private loadingVeteransById: { [veteranId: string]: boolean } = {};
  private pendingVeteranRestore: { accountId: string; memberId: number } | null = null;
  private restoredP2Context: { mainCharaId?: number; winSaddleIds?: number[]; sourceInheritanceId?: number | string } | null = null;
  private uqlOwnedLegacyPickerOpen = false;
  private uqlOwnedLegacyPickerPending = false;
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
    this.restoreInitialFilterModePreference();
    // Keep Quick Filters open on desktop; mobile still starts compact below.
    if (window.innerWidth <= 600) {
      this.collapsedSections.add('quickFilters');
    }
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
    this.staticUqlSuggestionsCache = null;
    const normalize = (factor: any) => ({ ...factor, id: parseInt(factor.id, 10) });
    this.blueFactors = factors.filter((f: any) => f.type === 0).map(normalize);
    this.pinkFactors = factors.filter((f: any) => f.type === 1).map(normalize);
    this.greenFactors = factors.filter((f: any) => f.type === 5).map(normalize);
    this.whiteFactors = factors.filter((f: any) => f.type === 2 || f.type === 3 || f.type === 4).map(normalize);
    this.rebuildUqlDerivedCaches();
    this.updateUqlSuggestions();
  }
  // Filter State
  filterState: UnifiedSearchParams = this.createDefaultFilterState();
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

  private createDefaultFilterState(): UnifiedSearchParams {
    return {
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
  }

  private restoreInitialFilterModePreference(): void {
    const savedMode = this.readSavedFilterState()?.mode;
    if (savedMode) {
      this.filterMode = savedMode;
    }
  }

  ngAfterViewInit() {
    this.setupWrappingDetection();
    this.setupScrollListener();
    this.setupHostResizeObserver();
    setTimeout(() => this.loadSavedFilterStateIfNeeded());
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
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
  getSerializedState(options: { shareable?: boolean } = {}): string {
    const state: CompressedState = {};
    const shouldSanitizeOwnedLegacy = options.shareable === true
      || (!!this.selectedVeteran && !this.canShareSelectedVeteranAsOwnedLegacyDirective());
    const normalizedUql = shouldSanitizeOwnedLegacy ? this.getShareableSerializedUqlQuery() : this.getNormalizedUqlQuery();
    if (normalizedUql) state.uql = normalizedUql;
    if (this.filterMode === 'uql') {
      this.addSerializedP2Context(state);
      if (Object.keys(state).length === 0) {
        return '';
      }
      return this.encodeBase64Utf8(JSON.stringify(state));
    }
    // Factors
    if (this.blueFactorFilters.length) state.b = this.blueFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.pinkFactorFilters.length) state.p = this.pinkFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.greenFactorFilters.length) state.g = this.greenFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.whiteFactorFilters.length) state.w = this.whiteFactorFilters.map(f => [f.factorId, f.min, f.max]);
    if (this.optionalWhiteFactorFilters.length) {
      const entries = this.serializePriorityFactorFilters(this.optionalWhiteFactorFilters);
      if (entries.length) state.ow = entries;
    }
    if (this.optionalMainWhiteFactorFilters.length) {
      const entries = this.serializePriorityFactorFilters(this.optionalMainWhiteFactorFilters);
      if (entries.length) state.omw = entries;
    }
    if (this.lineageWhiteFactorFilters.length) {
      const entries = this.serializePriorityFactorFilters(this.lineageWhiteFactorFilters);
      if (entries.length) state.lw = entries;
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
    if (this.searchUsername) state.un = this.searchUsername;
    
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
    this.addSerializedP2Context(state);
    if (this.selectedVeteran && this.selectedAccountId && this.selectedVeteran.member_id != null) {
      state.vet = [this.selectedAccountId, this.selectedVeteran.member_id];
    }
    if (Object.keys(state).length === 0) {
      return '';
    }
    return this.encodeBase64Utf8(JSON.stringify(state));
  }

  private addSerializedP2Context(state: CompressedState): void {
    const context = this.getCurrentP2Context();
    if (!context) return;
    if (context.mainCharaId) state.p2c = context.mainCharaId;
    if (context.winSaddleIds?.length) state.p2w = [...context.winSaddleIds];
    if (context.sourceInheritanceId != null) state.p2i = context.sourceInheritanceId;
  }

  private getCurrentP2Context(): { mainCharaId?: number; winSaddleIds?: number[]; sourceInheritanceId?: number | string } | null {
    if (this.selectedVeteran) {
      const winSaddleIds = this.selectedVeteran.win_saddle_id_array ?? [];
      return {
        mainCharaId: this.getVeteranMainCharaId(this.selectedVeteran),
        winSaddleIds: winSaddleIds.length ? winSaddleIds : undefined,
        sourceInheritanceId: this.selectedVeteran.share_source === 'bookmark' ? this.selectedVeteran.share_inheritance_id : undefined,
      };
    }
    return this.restoredP2Context;
  }

  private restoreSerializedP2Context(state: CompressedState): void {
    const mainCharaId = typeof state.p2c === 'number' && Number.isFinite(state.p2c) ? state.p2c : undefined;
    const winSaddleIds = Array.isArray(state.p2w)
      ? state.p2w.map(value => Number(value)).filter(value => Number.isFinite(value))
      : undefined;
    if (!mainCharaId && !winSaddleIds?.length) {
      this.restoredP2Context = null;
      return;
    }
    this.restoredP2Context = {
      mainCharaId,
      winSaddleIds: winSaddleIds?.length ? winSaddleIds : undefined,
      sourceInheritanceId: state.p2i,
    };
    this.filterState.p2_main_chara_id = mainCharaId;
    this.filterState.p2_win_saddle = winSaddleIds?.length ? winSaddleIds : undefined;
  }

  private getShareableSerializedUqlQuery(): string {
    const query = this.getNormalizedUqlQuery();
    if (!query || !this.hasUqlOwnedLegacyDirective(query)) return query;
    if (this.canShareSelectedVeteranAsOwnedLegacyDirective()) return query;
    return this.removeOwnedLegacyDirectiveFromUqlQuery(query);
  }

  private canShareSelectedVeteranAsOwnedLegacyDirective(): boolean {
    if (!this.selectedVeteran) return true;
    if (this.selectedVeteran.share_source === 'bookmark' || this.selectedVeteran.share_source === 'partner' || this.selectedVeteran.share_source === 'manual') {
      return false;
    }
    return !!this.getVeteranUuid(this.selectedVeteran);
  }

  private removeOwnedLegacyDirectiveFromUqlQuery(query: string): string {
    const hadWhere = /^\s*where\b/i.test(query);
    const clauses = this.splitTopLevelUqlAndClauses(this.stripLeadingWhere(query))
      .filter(clause => this.parseUqlEditorDirectiveClause(clause)?.kind !== 'legacy');
    if (!clauses.length) return '';
    return `${hadWhere ? 'where ' : ''}${clauses.join(' and ')}`;
  }

  private applySelectedVeteran(veteran: VeteranMember, accountId: string | null): void {
    if (accountId) this.selectedAccountId = accountId;
    this.selectedVeteran = veteran;
    this.restoredP2Context = null;
    this.selectedVeteranName = this.getVeteranName(veteran);
    this.selectedVeteranImage = this.getVeteranImage(veteran);
    this.pendingVeteranRestore = null;
    this.veteranSelected.emit(veteran);
    this.syncSelectedVeteranFilterState();
    this.cdr.markForCheck();
  }

  private readSavedFilterState(): SavedDatabaseFilterState | null {
    try {
      const savedMode = this.readSavedFilterMode();
      const saved = localStorage.getItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY);
      if (!saved) {
        return savedMode ? { version: 2, mode: savedMode } : null;
      }
      const parsed = JSON.parse(saved) as Partial<SavedDatabaseFilterState>;
      if (parsed.version !== 2) return null;
      if (parsed.mode !== 'basic' && parsed.mode !== 'advanced' && parsed.mode !== 'uql') return null;
      const state: SavedDatabaseFilterState = {
        version: 2,
        mode: savedMode ?? parsed.mode,
        formState: parsed.formState,
        uqlState: parsed.uqlState,
        defaultMlbFilterRemoved: parsed.defaultMlbFilterRemoved === true
      };
      return this.migrateSavedDefaultMlbFilter(state);
    } catch {
      return null;
    }
  }

  private migrateSavedDefaultMlbFilter(state: SavedDatabaseFilterState): SavedDatabaseFilterState {
    if (state.defaultMlbFilterRemoved) {
      return state;
    }

    const migrated: SavedDatabaseFilterState = {
      ...state,
      formState: state.formState ? this.removeDefaultMlbFromSerializedState(state.formState) : state.formState,
      defaultMlbFilterRemoved: true
    };

    try {
      localStorage.setItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY, JSON.stringify(migrated));
    } catch {
      // Ignore unavailable storage; returning the migrated state is enough for this session.
    }

    return migrated;
  }

  private removeDefaultMlbFromSerializedState(stateStr: string): string {
    try {
      const state: CompressedState = JSON.parse(this.decodeBase64Utf8(stateStr));
      if (state.lb === 4) {
        delete state.lb;
        return this.encodeBase64Utf8(JSON.stringify(state));
      }
    } catch {
      return stateStr;
    }

    return stateStr;
  }

  private readUqlQueryFromSerializedState(stateStr: string | undefined): string {
    if (!stateStr) return '';
    try {
      const state: CompressedState = JSON.parse(this.decodeBase64Utf8(stateStr));
      return this.normalizeRestoredUqlQuery(state.uql || '');
    } catch {
      return '';
    }
  }

  private readSavedFilterMode(): FilterMode | null {
    try {
      const mode = localStorage.getItem(DatabaseFilterComponent.SAVED_FILTER_MODE_KEY);
      return mode === 'basic' || mode === 'advanced' || mode === 'uql' ? mode : null;
    } catch {
      return null;
    }
  }

  private persistCurrentFilterMode(): void {
    try {
      localStorage.setItem(DatabaseFilterComponent.SAVED_FILTER_MODE_KEY, this.filterMode);
      const previous = this.readSavedFilterState();
      const next: SavedDatabaseFilterState = {
        version: 2,
        mode: this.filterMode,
        formState: previous?.formState,
        uqlState: previous?.uqlState,
        defaultMlbFilterRemoved: true
      };
      localStorage.setItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY, JSON.stringify(next));
    } catch {
      // Ignore unavailable storage; filters still work normally for the session.
    }
  }

  private persistCurrentFilterState(): void {
    try {
      const previous = this.readSavedFilterState();
      const next: SavedDatabaseFilterState = {
        version: 2,
        mode: this.filterMode,
        formState: previous?.formState,
        uqlState: previous?.uqlState,
        defaultMlbFilterRemoved: true
      };

      if (this.filterMode === 'uql') {
        next.uqlState = this.getSerializedState();
      } else {
        next.formState = this.getSerializedState();
      }

      localStorage.setItem(DatabaseFilterComponent.SAVED_FILTER_MODE_KEY, this.filterMode);
      localStorage.setItem(DatabaseFilterComponent.SAVED_FILTER_STATE_KEY, JSON.stringify(next));
    } catch {
      // Ignore unavailable storage; filters still work normally for the session.
    }
  }

  private hasFiltersQueryParam(): boolean {
    try {
      return new URLSearchParams(window.location.search).has('filters');
    } catch {
      return false;
    }
  }

  private loadSavedFilterStateIfNeeded(): void {
    if (this.restoredSavedFilterState || this.hasFiltersQueryParam()) return;
    const saved = this.readSavedFilterState();
    if (!saved) return;
    const serialized = saved.mode === 'uql'
      ? (saved.uqlState || saved.formState)
      : (saved.formState || saved.uqlState);

    this.restoredSavedFilterState = true;
    if (!serialized) {
      this.restoreSavedFilterMode(saved.mode);
      this.persistCurrentFilterMode();
      return;
    }

    this.loadSerializedState(serialized, saved.mode, { emitImmediately: true });
    this.restoreSavedFilterMode(saved.mode);
    this.persistCurrentFilterMode();
  }

  private restoreSavedFilterMode(mode: FilterMode): void {
    this.filterMode = mode;
    if (mode === 'uql') {
      this.validateUqlQuery();
      this.filterState = this.buildUqlOnlyFilterState();
      this.updateCurrentUqlPreview();
    }
    this.updateActiveFilterChips();
    this.cdr.markForCheck();
  }

  loadSerializedState(
    stateStr: string,
    modeOverride: FilterMode | null = this.readSavedFilterMode(),
    options: { emitImmediately?: boolean } = {},
  ) {
    try {
      const state: CompressedState = JSON.parse(this.decodeBase64Utf8(stateStr));
      if (modeOverride) {
        this.filterMode = modeOverride;
      } else if (state.fm === 'basic' || state.fm === 'advanced' || state.fm === 'uql') {
        this.filterMode = state.fm;
      } else if (state.uql) {
        this.filterMode = 'uql';
      }
      this.uqlQuery = this.normalizeRestoredUqlQuery(state.uql || '');
      this.validateUqlQuery();
      this.restoreSerializedP2Context(state);
      if (this.filterMode === 'uql') {
        this.clearUqlRepresentableStructuredFilters();
        this.onUqlChange({ emitImmediately: options.emitImmediately });
        return;
      }
      
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
      const restoreOptionalFactors = (source: PriorityFactorState[] | undefined, target: FactorFilter[], type: 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite') => {
        if (!source) return;
        source.forEach(entry => {
          const [id, priority] = Array.isArray(entry) ? entry : [entry, 0];
          const filter: FactorFilter = {
            uuid: this.getUuid(),
            factorId: id,
            min: 1,
            max: 9,
            priority: this.normalizePriorityGroup(priority)
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
      this.selectedLimitBreak = state.lb !== undefined ? state.lb : 0;
      if (state.uid) this.searchUserId = state.uid;
      if (state.un) this.searchUsername = state.un;
      
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
      this.onFilterChange({
        emitImmediately: options.emitImmediately,
        markStructuredDirtyForUql: false
      });
    } catch (e) {
      console.error('Failed to load filter state', e);
    }
  }
  // Helper to generate unique IDs
  private getUuid(): string {
    return `filter_${this.uuidCounter++}`;
  }
  private normalizePriorityGroup(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 0;
    return Math.floor(numeric);
  }
  private serializePriorityFactorFilters(filters: FactorFilter[]): PriorityFactorState[] {
    return filters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => {
        const priority = this.normalizePriorityGroup(f.priority);
        return priority > 0 ? [f.factorId!, priority] as [number, number] : f.factorId!;
      });
  }
  private serializePriorityParam(filters: FactorFilter[]): string[] {
    return filters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => `${f.factorId!}:${this.normalizePriorityGroup(f.priority)}`);
  }
  // --- Factor Filter Management ---
  addFactorFilter(list: FactorFilter[], defaultFactorId: number | null, type?: 'green' | 'white' | 'mainWhite' | 'mainGreen' | 'optionalWhite' | 'optionalMainWhite' | 'lineageWhite') {
    list.push({
      uuid: this.getUuid(),
      factorId: defaultFactorId,
      min: 1,
      max: 9,
      priority: 0
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
    name: 'Target (ace)',
    layer: 0,
    children: [
      {
        id: 'p1',
        name: 'Parent 1',
        layer: 1,
        children: [
          { id: 'p2-1', name: 'Great parent 1', layer: 2 },
          { id: 'p2-2', name: 'Great parent 2', layer: 2 }
        ]
      },
      {
        id: 'p1-2',
        name: 'Parent 2',
        layer: 1,
        children: [
          { id: 'p2-3', name: 'Great parent 3', layer: 2 },
          { id: 'p2-4', name: 'Great parent 4', layer: 2 }
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
    if (section === 'quickFilters' && window.innerWidth > 600) return;
    if (this.collapsedSections.has(section)) {
      this.collapsedSections.delete(section);
    } else {
      this.collapsedSections.add(section);
    }
  }
  setFactorPriority(filter: FactorFilter, value: unknown): void {
    filter.priority = this.normalizePriorityGroup(value);
    this.onFilterChange();
  }
  adjustFactorPriority(filter: FactorFilter, delta: number): void {
    const nextPriority = Math.max(0, this.getPriorityGroup(filter) + delta);
    this.setFactorPriority(filter, nextPriority);
  }
  getPriorityGroup(filter: FactorFilter): number {
    return this.normalizePriorityGroup(filter.priority);
  }
  isSectionCollapsed(section: string): boolean {
    if (section === 'quickFilters' && window.innerWidth > 600) return false;
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
      this.treeData.name = 'Target (ace)';
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
              grandchild.name = 'Great parent';
              grandchild.image = undefined;
              grandchild.characterId = undefined;
            }
          }
        }
      }
    }
  }
  updateTreeFilters(emit = true) {
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
    
    if (emit) {
      this.onFilterChange();
    }
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
      const factorId = this.getNormalizedFactorFilterId(f);
      const min = f.min || 1;
      let max = f.max !== undefined ? f.max : 9;
      
      // Clamp max to the provided cap (e.g. 3 for main parent factors)
      if (max > maxCap) {
        max = maxCap;
      }
      
      for (let lvl = min; lvl <= max; lvl++) {
        if (factorId) {
          // Specific factor: ID + Level (concatenated)
          ids.push(parseInt(`${factorId}${lvl}`, 10));
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
      const factorId = this.getNormalizedFactorFilterId(f);
      const ids: number[] = [];
      const min = f.min || 1;
      let max = f.max !== undefined ? f.max : 9;
      
      if (max > maxCap) {
        max = maxCap;
      }
      
      for (let lvl = min; lvl <= max; lvl++) {
        if (factorId) {
          ids.push(parseInt(`${factorId}${lvl}`, 10));
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
  onFilterChange(options: { emitImmediately?: boolean; markStructuredDirtyForUql?: boolean } = {}) {
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
    this.filterState.optional_white_priorities = this.serializePriorityParam(this.optionalWhiteFactorFilters);
    
    this.filterState.optional_main_white_sparks = this.optionalMainWhiteFactorFilters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => f.factorId!);
    this.filterState.optional_main_white_priorities = this.serializePriorityParam(this.optionalMainWhiteFactorFilters);
    // Lineage White Sparks (user-specified white factor IDs to match against lineage parents)
    const lineageWhiteIds = this.lineageWhiteFactorFilters
      .filter(f => f.factorId && f.factorId > 0)
      .map(f => f.factorId!);
    this.filterState.lineage_white = lineageWhiteIds.length ? lineageWhiteIds : undefined;
    this.filterState.lineage_white_priorities = this.serializePriorityParam(this.lineageWhiteFactorFilters);
    // Extract white sparks from the selected veteran's parents only when the
    // user asked for lineage white matching. Picking a legacy by itself should
    // provide P2 context, not silently add a white-factor filter.
    if (lineageWhiteIds.length && this.selectedVeteran?.succession_chara_array?.length) {
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
    this.syncSelectedVeteranFilterState();
    // Sync include main parent characters into main_parent_id (merge with tree selection)
    if (this.includeMainParentCharacters.length > 0) {
      const existingMainIds = this.filterState.main_parent_id || [];
      this.includeMainParentCharacters.forEach(c => {
        if (!existingMainIds.includes(c.id)) existingMainIds.push(c.id);
      });
      this.filterState.main_parent_id = existingMainIds;
    }
    if (this.filterMode !== 'uql' && options.markStructuredDirtyForUql !== false) {
      this.structuredFiltersDirtyForUql = true;
    }
    if (this.filterMode === 'uql') {
      this.filterState = this.buildUqlOnlyFilterState();
    }
    // Update active filter chips
    this.updateCurrentUqlPreview();
    this.updateActiveFilterChips();
    this.persistCurrentFilterState();
    this.emitFilterChange(options.emitImmediately === true);
  }

  private emitFilterChange(immediate = false): void {
    const filters = { ...this.filterState };
    if (immediate) {
      this.filterChange.emit(filters);
      return;
    }

    this.filterChangeSubject.next(filters);
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
    if (this.filterMode === 'uql') {
      const normalizedQuery = this.getNormalizedUqlQuery();
      if (normalizedQuery) {
        this.activeFilterChips.push({
          id: 'uql',
          label: 'UQL: Active',
          name: 'UQL',
          value: this.uqlValidationState === 'valid' ? 'Active' : 'Editing',
          type: 'uql'
        });
      }
      return;
    }
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
          label: `P${this.getPriorityGroup(f)} Optional: ${factorName}`,
          name: `P${this.getPriorityGroup(f)} Optional`,
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
          label: `P${this.getPriorityGroup(f)} Main Optional: ${factorName}`,
          name: `P${this.getPriorityGroup(f)} Main Optional`,
          value: factorName,
          showStar: false,
          type: 'optionalMainWhite',
          filterIndex: index,
          filterList: this.optionalMainWhiteFactorFilters
        });
      }
    });
    // Lineage White Factors (ranked according to their priority group)
    this.lineageWhiteFactorFilters.forEach((f, index) => {
      if (f.factorId && f.factorId > 0) {
        const factorName = this.whiteFactors.find(factor => factor.id === f.factorId)?.text || 'Unknown';
        this.activeFilterChips.push({
          id: `lineageWhite-${index}`,
          label: `P${this.getPriorityGroup(f)} Lineage: ${factorName}`,
          name: `P${this.getPriorityGroup(f)} Lineage`,
          value: factorName,
          showStar: false,
          type: 'lineageWhite',
          filterIndex: index,
          filterList: this.lineageWhiteFactorFilters
        });
      }
    });
    // Tree Characters
    if (this.treeData.characterId) {
      this.activeFilterChips.push({
        id: 'tree-target',
        label: `Target (ace): ${this.treeData.name}`,
        name: 'Target (ace)',
        value: this.treeData.name,
        type: 'character'
      });
    }
    if (this.treeData.children?.[0]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-parent1',
        label: `Main parent (p1/2): ${this.treeData.children[0].name}`,
        name: 'Main parent (p1/2)',
        value: this.treeData.children[0].name,
        type: 'character'
      });
    }
    // Grandparents
    if (this.treeData.children?.[0]?.children?.[0]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-gp1',
        label: `Great parent (gp1): ${this.treeData.children[0].children[0].name}`,
        name: 'Great parent (gp1)',
        value: this.treeData.children[0].children[0].name,
        type: 'character'
      });
    }
    if (this.treeData.children?.[0]?.children?.[1]?.characterId) {
      this.activeFilterChips.push({
        id: 'tree-gp2',
        label: `Great parent (gp2): ${this.treeData.children[0].children[1].name}`,
        name: 'Great parent (gp2)',
        value: this.treeData.children[0].children[1].name,
        type: 'character'
      });
    }
    // Include Main Parent Characters (multi-select)
    this.includeMainParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `include-main-parent-${index}`,
        label: `Main parent (p1/2): ${char.name}`,
        name: 'Main parent (p1/2)',
        value: char.name,
        type: 'includeMainParent',
        filterIndex: index
      });
    });
    // Include Parent Characters (multi-select)
    this.includeParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `include-parent-${index}`,
        label: `Great parent (gp1/2): ${char.name}`,
        name: 'Great parent (gp1/2)',
        value: char.name,
        type: 'includeParent',
        filterIndex: index
      });
    });
    // Exclude Parent Characters (multi-select)
    this.excludeParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `exclude-parent-${index}`,
        label: `No great parent (gp1/2): ${char.name}`,
        name: 'No great parent (gp1/2)',
        value: char.name,
        type: 'excludeParent',
        filterIndex: index
      });
    });
    // Exclude Main Parent Characters (multi-select)
    this.excludeMainParentCharacters.forEach((char, index) => {
      this.activeFilterChips.push({
        id: `exclude-main-parent-${index}`,
        label: `No main parent (p1/2): ${char.name}`,
        name: 'No main parent (p1/2)',
        value: char.name,
        type: 'excludeMainParent',
        filterIndex: index
      });
    });
    // Support Card
    if (this.selectedSupportCard) {
      const supportCardLabel = this.getSupportCardDisplayLabel(this.selectedSupportCard);
      this.activeFilterChips.push({
        id: 'support-card',
        label: `Card: ${supportCardLabel}`,
        name: 'Card',
        value: supportCardLabel,
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
    } else if (this.restoredP2Context) {
      const contextLabel = this.restoredP2Context.sourceInheritanceId != null
        ? `Shared legacy #${this.restoredP2Context.sourceInheritanceId}`
        : 'Shared legacy context';
      this.activeFilterChips.push({
        id: 'veteran',
        label: contextLabel,
        name: 'Veteran',
        value: contextLabel,
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
  }

  clearCurrentFilters(event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.filterMode === 'uql') {
      this.clearUql();
      return;
    }

    this.clearStructuredFilters();
    this.onFilterChange();
  }

  private clearStructuredFilters(): void {
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
    this.filteredMainGreenFactorOptions = [];
    this.filteredOptionalWhiteFactorOptions = [];
    this.filteredOptionalMainWhiteFactorOptions = [];
    this.filteredLineageWhiteFactorOptions = [];

    this.includeMainParentCharacters = [];
    this.includeParentCharacters = [];
    this.excludeParentCharacters = [];
    this.excludeMainParentCharacters = [];
    this.clearNodeRecursive(this.treeData);

    this.selectedSupportCard = null;
    this.selectedLimitBreak = 0;
    this.searchUserId = '';
    this.searchUsername = '';

    if (this.selectedVeteran) {
      this.veteranSelected.emit(null);
    }
    this.selectedVeteran = null;
    this.selectedVeteranName = '';
    this.selectedVeteranImage = '';
    this.pendingVeteranRestore = null;
    this.restoredP2Context = null;

    if (this.includeMaxFollowers) {
      this.maxFollowersToggled.emit(false);
    }
    this.includeMaxFollowers = false;

    this.filterState = this.createDefaultFilterState();
    this.raceScheduleRaceCount = 0;
    this.raceScheduler?.clearSelection();
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
      case 'lineageWhite':
        if (chip.filterIndex !== undefined) {
          this.removeFactorFilter(this.lineageWhiteFactorFilters, chip.filterIndex, 'lineageWhite');
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
      case 'lineageWhite':
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
    const previousMode = this.filterMode;
    this.persistCurrentFilterState();
    const savedState = this.readSavedFilterState();
    if (previousMode === 'uql' && mode !== 'uql') {
      if (savedState?.formState) {
        this.loadSerializedState(savedState.formState, mode);
        this.filterMode = mode;
      } else {
        this.applyRepresentableUqlToStructuredFilters();
      }
      this.structuredFiltersDirtyForUql = false;
    } else if (mode === 'uql' && previousMode !== 'uql' && this.structuredFiltersDirtyForUql) {
      this.writeStructuredFiltersToUqlQuery({ allowEmpty: true });
      this.structuredFiltersDirtyForUql = false;
    } else if (mode === 'uql' && previousMode !== 'uql' && this.hasStructuredFiltersForUql()) {
      this.writeStructuredFiltersToUqlQuery();
    } else if (mode === 'uql' && previousMode !== 'uql' && !this.getNormalizedUqlQuery()) {
      const savedUqlQuery = this.readUqlQueryFromSerializedState(savedState?.uqlState);
      if (savedUqlQuery) {
        this.uqlQuery = savedUqlQuery;
        this.validateUqlQuery();
        this.syncUqlFilterState();
        this.updateCurrentUqlPreview();
        this.updateActiveFilterChips();
      } else {
        this.writeStructuredFiltersToUqlQuery();
      }
    } else if (mode === 'uql' && previousMode !== 'uql') {
      this.syncSelectedEditorDirectivesToUqlQuery();
      this.applyUqlEditorDirectives();
      this.validateUqlQuery();
      this.syncUqlFilterState();
      this.syncSelectedVeteranFilterState();
      this.updateCurrentUqlPreview();
      this.updateActiveFilterChips();
    }
    this.filterMode = mode;
    this.persistCurrentFilterMode();
    if (mode === 'uql') {
      this.filterState = this.buildUqlOnlyFilterState();
      this.updateActiveFilterChips();
      this.persistCurrentFilterState();
      this.filterChangeSubject.next({ ...this.filterState });
    }
    this.persistCurrentFilterMode();
    if (!this.isExpanded) {
      this.isExpanded = true;
    }
    setTimeout(() => this.setupWrappingDetection(), 0);
    setTimeout(() => this.updateFloatingBtnState(), 350);
  }

  private hasStructuredFiltersForUql(): boolean {
    return !!(this.buildStructuredUqlExpression() || this.buildUqlEditorDirectiveClauses().length);
  }

  private writeStructuredFiltersToUqlQuery(options: { allowEmpty?: boolean } = {}): void {
    this.onFilterChange({ markStructuredDirtyForUql: false });
    const structuredExpression = this.buildStructuredUqlExpression();
    const editorDirectives = this.buildUqlEditorDirectiveClauses();
    const clauses = [...editorDirectives, structuredExpression].filter(Boolean);
    if (!clauses.length) {
      if (options.allowEmpty) {
        this.uqlQuery = '';
        this.validateUqlQuery();
        this.syncUqlFilterState();
        this.updateCurrentUqlPreview();
        this.updateActiveFilterChips();
      }
      return;
    }
    this.uqlQuery = `where ${clauses.join(' and ')}`;
    this.validateUqlQuery();
    this.syncUqlFilterState();
    this.updateCurrentUqlPreview();
    this.updateActiveFilterChips();
  }

  private syncSelectedEditorDirectivesToUqlQuery(): void {
    const normalizedQuery = this.getNormalizedUqlQuery();
    if (!normalizedQuery) return;

    const selectedDirectives = new Map<UqlEditorDirectiveKind, string>();
    for (const clause of this.buildUqlEditorDirectiveClauses()) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (directive) selectedDirectives.set(directive.kind, clause);
    }

    if (!selectedDirectives.size) return;

    const hadWhere = /^\s*where\b/i.test(normalizedQuery);
    const clauses = this.splitTopLevelUqlAndClauses(this.stripLeadingWhere(normalizedQuery));
    if (!clauses.length) return;

    const seen = new Set<UqlEditorDirectiveKind>();
    const mergedClauses: string[] = [];
    for (const clause of clauses) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (!directive) {
        mergedClauses.push(clause);
        continue;
      }

      mergedClauses.push(clause);
      if (selectedDirectives.has(directive.kind)) {
        seen.add(directive.kind);
      }
    }

    const missingDirectives: string[] = [];
    for (const kind of ['target', 'legacy'] as UqlEditorDirectiveKind[]) {
      const clause = selectedDirectives.get(kind);
      if (clause && !seen.has(kind)) missingDirectives.push(clause);
    }

    if (missingDirectives.length) {
      let insertIndex = 0;
      while (insertIndex < mergedClauses.length && this.parseUqlEditorDirectiveClause(mergedClauses[insertIndex])) {
        insertIndex++;
      }
      mergedClauses.splice(insertIndex, 0, ...missingDirectives);
    }

    this.uqlQuery = `${hadWhere ? 'where ' : ''}${mergedClauses.join(' and ')}`;
  }

  private applyRepresentableUqlToStructuredFilters(): void {
    const normalizedQuery = this.getNormalizedUqlQuery();
    if (!normalizedQuery) return;
    this.validateUqlQuery();
    if (this.uqlValidationState !== 'valid' || !this.compiledUqlQuery) return;

    const result = this.applyCompiledUqlToStructuredFilters(this.compiledUqlQuery);
    if (!result.appliedAny) return;
    this.onFilterChange();
  }

  onUqlChange(options: { emitImmediately?: boolean } = {}): void {
    this.applyUqlEditorDirectives();
    this.validateUqlQuery();
    this.syncUqlFilterState();
    this.syncSelectedVeteranFilterState();
    const nextFilterState = this.buildUqlOnlyFilterState();
    const nextSignature = JSON.stringify(nextFilterState);
    const filterStateChanged = nextSignature !== this.lastUqlFilterStateSignature;
    this.filterState = nextFilterState;
    this.updateCurrentUqlPreview();
    this.updateActiveFilterChips();
    if (this.isUqlOwnedLegacyResolutionPending(this.getNormalizedUqlQuery())) {
      return;
    }
    if (filterStateChanged) {
      this.lastUqlFilterStateSignature = nextSignature;
      this.persistCurrentFilterState();
      this.emitFilterChange(options.emitImmediately === true);
    } else {
      this.persistCurrentFilterState();
    }
  }

  private syncUqlFilterState(): void {
    if (this.uqlValidationState === 'valid' && this.compiledUqlQuery) {
      this.filterState.uql = this.compiledUqlQuery;
      this.filterState.uql_highlight = this.buildUqlSparkHighlight(this.compiledUqlQuery);
    } else {
      this.filterState.uql = undefined;
      this.filterState.uql_highlight = undefined;
    }
  }

  private buildUqlOnlyFilterState(): UnifiedSearchParams {
    const state: UnifiedSearchParams = {};
    if (this.uqlValidationState === 'valid' && this.compiledUqlQuery) {
      state.uql = this.compiledUqlQuery;
      state.uql_highlight = this.buildUqlSparkHighlight(this.compiledUqlQuery);
    }
    if (this.treeData.characterId) {
      state.player_chara_id = this.treeData.characterId;
    }
    const p2Context = this.getCurrentP2Context();
    if (p2Context) {
      state.p2_main_chara_id = p2Context.mainCharaId;
      state.p2_win_saddle = p2Context.winSaddleIds?.length ? p2Context.winSaddleIds : undefined;
    }
    return state;
  }

  private buildUqlSparkHighlight(compiledQuery: string): UqlSparkHighlight | undefined {
    const expression = this.stripLeadingWhere(compiledQuery);
    const globalSparkIds = new Set<number>();
    const mainSparkIds = new Set<number>();
    const leftSparkIds = new Set<number>();
    const rightSparkIds = new Set<number>();
    const optionalWhiteFactorIds = new Set<number>();
    const optionalMainWhiteFactorIds = new Set<number>();
    const lineageWhiteFactorIds = new Set<number>();

    const addSparkIds = (fieldName: string, ids: number[]) => {
      const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
      if (!ids.length) return;
      if (this.isUqlMainSparkHighlightField(normalizedField)) {
        ids.forEach(id => mainSparkIds.add(id));
      } else if (this.isUqlLeftSparkHighlightField(normalizedField)) {
        ids.forEach(id => leftSparkIds.add(id));
      } else if (this.isUqlRightSparkHighlightField(normalizedField)) {
        ids.forEach(id => rightSparkIds.add(id));
      } else if (this.isUqlGlobalSparkHighlightField(normalizedField)) {
        ids.forEach(id => globalSparkIds.add(id));
      }
    };

    const functionPattern = /\b(contains|overlaps|has_all)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(?:\(([^()]*)\)|(\d+))\s*\)/gi;
    let functionMatch: RegExpExecArray | null;
    while ((functionMatch = functionPattern.exec(expression)) !== null) {
      if (/\bnot\s*$/i.test(expression.slice(Math.max(0, functionMatch.index - 8), functionMatch.index))) continue;
      const ids = functionMatch[3]
        ? this.parseUqlNumberList(functionMatch[3])
        : [parseInt(functionMatch[4], 10)].filter(Number.isFinite);
      addSparkIds(functionMatch[2], ids);
    }

    const comparisonPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(=|in)\s*(?:\(([^()]*)\)|(\d+)\b)/gi;
    let comparisonMatch: RegExpExecArray | null;
    while ((comparisonMatch = comparisonPattern.exec(expression)) !== null) {
      const ids = comparisonMatch[3]
        ? this.parseUqlNumberList(comparisonMatch[3])
        : [parseInt(comparisonMatch[4], 10)].filter(Number.isFinite);
      addSparkIds(comparisonMatch[1], ids);
    }

    const rangeComparisonPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(>=|>|<=|<|=)\s*(\d+)\b/gi;
    let rangeComparisonMatch: RegExpExecArray | null;
    while ((rangeComparisonMatch = rangeComparisonPattern.exec(expression)) !== null) {
      const fieldName = rangeComparisonMatch[1];
      const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
      if (
        !this.isUqlMainSparkHighlightField(normalizedField)
        && !this.isUqlLeftSparkHighlightField(normalizedField)
        && !this.isUqlRightSparkHighlightField(normalizedField)
        && !this.isUqlGlobalSparkHighlightField(normalizedField)
      ) continue;
      const sparkId = parseInt(rangeComparisonMatch[3], 10);
      const ids = this.expandSparkIdsForComparison(sparkId, rangeComparisonMatch[2]);
      addSparkIds(fieldName, ids);
    }

    const scoringFunctionPattern = /\b(optional_white|optional_main_white|optional_any_white|lineage_white)\s*\(((?:[^()]|\([^)]*\))*)\)/gi;
    let scoringMatch: RegExpExecArray | null;
    while ((scoringMatch = scoringFunctionPattern.exec(expression)) !== null) {
      const ids = this.parseUqlScoringFactorIds(scoringMatch[2]);
      switch (scoringMatch[1].toLowerCase()) {
        case 'optional_main_white':
          ids.forEach(id => optionalMainWhiteFactorIds.add(id));
          break;
        case 'lineage_white':
          ids.forEach(id => lineageWhiteFactorIds.add(id));
          break;
        default:
          ids.forEach(id => optionalWhiteFactorIds.add(id));
          break;
      }
    }

    const highlight: UqlSparkHighlight = {};
    if (globalSparkIds.size) highlight.globalSparkIds = [...globalSparkIds];
    if (mainSparkIds.size) highlight.mainSparkIds = [...mainSparkIds];
    if (leftSparkIds.size) highlight.leftSparkIds = [...leftSparkIds];
    if (rightSparkIds.size) highlight.rightSparkIds = [...rightSparkIds];
    if (optionalWhiteFactorIds.size) highlight.optionalWhiteFactorIds = [...optionalWhiteFactorIds];
    if (optionalMainWhiteFactorIds.size) highlight.optionalMainWhiteFactorIds = [...optionalMainWhiteFactorIds];
    if (lineageWhiteFactorIds.size) highlight.lineageWhiteFactorIds = [...lineageWhiteFactorIds];
    return Object.keys(highlight).length ? highlight : undefined;
  }

  private isUqlGlobalSparkHighlightField(fieldName: string): boolean {
    return ['blue_sparks', 'pink_sparks', 'green_sparks', 'white_sparks'].includes(fieldName);
  }

  private isUqlMainSparkHighlightField(fieldName: string): boolean {
    return ['main_blue_factors', 'main_pink_factors', 'main_green_factors', 'main_white_factors', 'main_parent_white_sparks'].includes(fieldName);
  }

  private isUqlLeftSparkHighlightField(fieldName: string): boolean {
    return ['left_blue_factors', 'left_pink_factors', 'left_green_factors', 'left_white_factors'].includes(fieldName);
  }

  private isUqlRightSparkHighlightField(fieldName: string): boolean {
    return ['right_blue_factors', 'right_pink_factors', 'right_green_factors', 'right_white_factors'].includes(fieldName);
  }

  private expandSparkIdsForComparison(sparkId: number, operator: string): number[] {
    if (!Number.isFinite(sparkId) || sparkId <= 0) return [];
    const factorId = Math.floor(sparkId / 10);
    const level = sparkId % 10;
    if (!factorId || level < 0) return [];
    const makeId = (sparkLevel: number) => factorId * 10 + sparkLevel;
    switch (operator) {
      case '>=': return this.rangeInclusive(Math.max(1, level), 9).map(makeId);
      case '>': return this.rangeInclusive(Math.max(1, level + 1), 9).map(makeId);
      case '<=': return this.rangeInclusive(1, Math.min(9, level)).map(makeId);
      case '<': return this.rangeInclusive(1, Math.min(9, level - 1)).map(makeId);
      default: return [sparkId];
    }
  }

  private rangeInclusive(start: number, end: number): number[] {
    if (end < start) return [];
    return Array.from({ length: end - start + 1 }, (_value, index) => start + index);
  }

  private parseUqlScoringFactorIds(argsText: string): number[] {
    let listText = argsText.trim();
    if (listText.startsWith('(')) {
      let depth = 0;
      for (let index = 0; index < listText.length; index++) {
        const character = listText[index];
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth !== 0) continue;
        listText = listText.slice(1, index);
        break;
      }
    } else {
      const paramsMatch = listText.match(/,\s*[A-Za-z_]\w*\s*=/);
      if (paramsMatch?.index !== undefined) {
        listText = listText.slice(0, paramsMatch.index);
      }
    }
    return this.parseUqlNumberList(listText).filter(id => id > 0);
  }

  private parseUqlScoringPriority(argsText: string): number {
    const priorityMatch = argsText.match(/(?:^|,)\s*(?:priority|priority_group|group)\s*=\s*(-?\d+)/i);
    return this.normalizePriorityGroup(priorityMatch?.[1]);
  }

  private addRestoredWhiteScoringFilter(
    target: FactorFilter[],
    optionTarget: any[][],
    factorId: number,
    priority: number,
  ): void {
    if (target.some(filter => this.getNormalizedFactorFilterId(filter) === factorId && this.getPriorityGroup(filter) === priority)) {
      return;
    }
    target.push({
      uuid: this.getUuid(),
      factorId,
      min: 1,
      max: 9,
      priority
    });
    optionTarget.push([...this.whiteFactors]);
  }

  clearUql(): void {
    this.uqlQuery = '';
    this.clearUqlEditorDirectiveState();
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
    const editableQuery = this.getEditableUqlQuery();
    const normalizedQuery = this.getNormalizedUqlQuery();
    this.compiledUqlQuery = '';
    if (!normalizedQuery) {
      this.setUqlValidation('empty', '');
      return;
    }
    const delimiterIssue = this.getUqlDelimiterIssue(editableQuery);
    if (delimiterIssue?.kind === 'unterminated-string') {
      this.setUqlValidation('incomplete', 'Finish the string literal', this.createUqlValidationIssue(editableQuery, 'incomplete', 'Finish the string literal', delimiterIssue.from, delimiterIssue.to));
      return;
    }
    if (delimiterIssue?.kind === 'open-paren') {
      this.setUqlValidation('incomplete', 'Close the parentheses', this.createUqlValidationIssue(editableQuery, 'incomplete', 'Close the parentheses', delimiterIssue.from, delimiterIssue.to));
      return;
    }
    if (delimiterIssue?.kind === 'closing-paren') {
      this.setUqlValidation('invalid', 'Unexpected closing parenthesis', this.createUqlValidationIssue(editableQuery, 'invalid', 'Unexpected closing parenthesis', delimiterIssue.from, delimiterIssue.to));
      return;
    }
    const directiveParse = this.extractUqlEditorDirectives(normalizedQuery);
    if (directiveParse.issue) {
      this.setUqlValidation(
        directiveParse.issue.state,
        directiveParse.issue.message,
        this.createUqlValidationIssue(editableQuery, directiveParse.issue.state, directiveParse.issue.message, ...this.getTrailingUqlIssueRange(editableQuery)),
      );
      return;
    }
    const queryForBackendValidation = directiveParse.directives.length ? directiveParse.queryWithoutDirectives : normalizedQuery;
    const expression = this.stripLeadingWhere(queryForBackendValidation);
    if (!expression || this.endsWithIncompleteUqlToken(expression)) {
      if (directiveParse.directives.length && !expression) {
        this.setUqlValidation('valid', 'Ready');
      } else {
        this.setUqlValidation('incomplete', 'Finish the predicate', this.createUqlValidationIssue(editableQuery, 'incomplete', 'Finish the predicate', ...this.getTrailingUqlIssueRange(editableQuery)));
      }
      return;
    }
    if (this.hasEmptyUqlValueList(expression)) {
      this.setUqlValidation('incomplete', 'Choose at least one skill', this.createUqlValidationIssue(editableQuery, 'incomplete', 'Choose at least one skill', ...this.getEmptyUqlValueListRange(editableQuery)));
      return;
    }
    if (this.endsWithPartialBooleanContinuation(expression)) {
      this.setUqlValidation('incomplete', 'Finish the boolean operator', this.createUqlValidationIssue(editableQuery, 'incomplete', 'Finish the boolean operator', ...this.getTrailingUqlIssueRange(editableQuery)));
      return;
    }
    const compiledQuery = this.getCompiledUqlQuery();
    this.compiledUqlQuery = compiledQuery;
    const syntaxIssue = this.findInvalidUqlSyntaxIssue(editableQuery) || this.findInvalidCompiledUqlSyntax(compiledQuery);
    if (syntaxIssue) {
      this.setUqlValidation('invalid', syntaxIssue.message, this.createUqlValidationIssue(editableQuery, 'invalid', syntaxIssue.message, syntaxIssue.from, syntaxIssue.to));
      return;
    }
    const unknownIdentifier = this.findUnknownUqlIdentifier(compiledQuery);
    if (unknownIdentifier) {
      const message = `Unknown field or function: ${unknownIdentifier}`;
      this.setUqlValidation('invalid', message, this.createUqlValidationIssue(editableQuery, 'invalid', message, ...this.getUnknownIdentifierIssueRange(editableQuery, unknownIdentifier)));
      return;
    }
    this.setUqlValidation('valid', 'Ready');
  }
  private getCompiledUqlQuery(): string {
    const normalizedQuery = this.getNormalizedUqlQuery();
    if (!normalizedQuery) return '';
    const queryWithoutDirectives = this.extractUqlEditorDirectives(normalizedQuery).queryWithoutDirectives;
    if (!queryWithoutDirectives) return '';
    const queryForCompilation = this.stripLeadingWhere(queryWithoutDirectives);
    if (!queryForCompilation) return '';
    const arrayOperatorCompiled = this.compileFriendlyArrayOperators(queryForCompilation);
    const scalarArithmeticCompiled = this.compileFriendlyScalarArithmeticFactorAliases(arrayOperatorCompiled);
    const factorSumCompiled = this.compileFriendlyFactorSumComparisons(scalarArithmeticCompiled);
    const scopedSparkCompiled = this.compileFriendlyScopedSparkComparisons(factorSumCompiled);
    const scopedSparkCategoryCompiled = this.compileFriendlyScopedSparkCategoryComparisons(scopedSparkCompiled);
    const sparkCategoryCompiled = this.compileFriendlySparkCategoryComparisons(scopedSparkCategoryCompiled);
    const sparkCompiled = this.compileFriendlySparkComparisons(sparkCategoryCompiled);
    const factorCompiled = this.compileFriendlyLoadedFactorComparisons(sparkCompiled);
    const characterScopeCompiled = this.compileFriendlyCharacterScopeExpressions(factorCompiled);
    const supportCardCompiled = this.compileFriendlySupportCardExpressions(characterScopeCompiled);
    const scoringFunctionCompiled = this.compileFriendlyScoringFunctionNames(supportCardCompiled);
    const namedValueCompiled = this.compileFriendlyNamedValues(scoringFunctionCompiled);
    const fieldAliasCompiled = this.compileFriendlyFieldAliases(namedValueCompiled);
    return this.normalizeCompiledSupportCardAliases(fieldAliasCompiled).replace(/\s+/g, ' ').trim();
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
      comparisonPattern: new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])\\s*(==|=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
    };
  }

  private createFriendlyScopedSparkComparisonAlias(field: FriendlyScopedSparkField, alias: string): FriendlyScopedSparkComparisonAlias {
    const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
    return {
      ...field,
      alias,
      comparisonPattern: new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])\\s*(==|=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
    };
  }

  private createUqlNamedFactorComparison(factor: UqlNamedFactor): UqlNamedFactorComparison {
    const labelPattern = this.escapeRegExp(factor.label).replace(/\s+/g, '\\s+');
    return {
      ...factor,
      comparisonPattern: new RegExp(`(^|[\\s(,])${labelPattern}\\s*(==|=|!=|<>|<=|>=|<|>)\\s*(\\d+)`, 'gi')
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

  private createFriendlyCharacterScopeAliasReplacement(scope: { alias: string; label: string; fields: string[] }): FriendlyCharacterScopeAliasReplacement {
    const aliasPattern = this.escapeRegExp(scope.alias).replace(/\s+/g, '\\s+');
    const fieldBoundary = `(^|[^A-Za-z0-9_])(${aliasPattern})(?=$|[^A-Za-z0-9_])`;
    return {
      alias: scope.alias,
      label: scope.label,
      fields: [...scope.fields],
      comparisonPattern: new RegExp(`${fieldBoundary}\\s*(==|=|!=|<>)\\s*([^\\s(),][^;)]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi'),
      inPattern: new RegExp(`${fieldBoundary}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      notInPattern: new RegExp(`${fieldBoundary}\\s+not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi')
    };
  }

  private createFriendlyArrayAliasReplacement(field: { alias: string; fields: string[]; label: string }): FriendlyArrayAliasReplacement {
    const fieldPattern = this.escapeRegExp(field.alias).replace(/\s+/g, '\\s+');
    const fieldBoundary = `(^|[^A-Za-z0-9_])(${fieldPattern})(?=$|[^A-Za-z0-9_])`;
    const skillClauseBoundary = this.getFriendlySkillClauseBoundaryLookahead();
    return {
      alias: field.alias,
      label: field.label,
      fields: [...field.fields],
      hasAllPattern: new RegExp(`${fieldBoundary}\\s+has\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      hasAnyPattern: new RegExp(`${fieldBoundary}\\s+has\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      doesNotHavePattern: new RegExp(`${fieldBoundary}\\s+does\\s+not\\s+have\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi'),
      hasPattern: new RegExp(`${fieldBoundary}\\s+has\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi'),
      containsAllPattern: new RegExp(`${fieldBoundary}\\s+contains\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      containsAnyPattern: new RegExp(`${fieldBoundary}\\s+contains\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      inPattern: new RegExp(`${fieldBoundary}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      notInPattern: new RegExp(`${fieldBoundary}\\s+not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'),
      containsPattern: new RegExp(`${fieldBoundary}\\s+contains\\s+(?!all\\b|any\\b|\\()((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi')
    };
  }

  private getFriendlySkillClauseBoundaryLookahead(): string {
    return `(?=\\s+(?:and|or)\\s+(?:${this.getUqlPredicateStartPattern()})|\\)|;|$)`;
  }

  private getUqlPredicateStartPattern(): string {
    const phrases = [
      ...this.friendlyFieldAliases.flatMap(field => [field.field, field.label, ...field.aliases]),
      ...this.friendlySparkFields.flatMap(field => [field.label, ...field.aliases]),
      ...this.friendlyCharacterScopeAliasReplacements.map(scope => scope.alias),
      ...this.scopedArrayFields.map(field => field.alias),
      'target',
      'owned legacy',
      'your legacy',
      'my legacy',
      'legacy',
      'has',
      'contains',
      'does not have',
      'in',
      'not in',
      'contains',
      'has',
      'overlaps',
      'any',
      'has_all',
      'contains_all',
      'all',
      'support_card',
      'has_support_card',
      'spark_sum',
      'optional_white',
      'optional_main_white',
      'optional_any_white',
      'lineage_white'
    ];
    const phrasePattern = [...new Set(phrases.filter(Boolean))]
      .sort((left, right) => right.length - left.length)
      .map(phrase => this.escapeRegExp(phrase).replace(/\s+/g, '\\s+'))
      .join('|');
    return `(?:${phrasePattern})(?=$|[^A-Za-z0-9_])|[A-Za-z_]\\w*\\s*\\(`;
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
      { label: 'GP1 has', aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'], fields: ['left_white_factors'] },
      { label: 'GP2 has', aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'], fields: ['right_white_factors'] },
      { label: 'Great parent has', aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], fields: ['left_white_factors', 'right_white_factors'] }
    ].flatMap(scope => scope.aliases.map(alias => ({ alias, fields: scope.fields, label: scope.label })));
  }

  private buildCharacterScopeAliases(): Array<{ alias: string; fields: string[]; label: string }> {
    return [
      {
        label: 'Characters',
        aliases: ['characters', 'character', 'umas', 'uma', 'charas', 'chara'],
        fields: ['main_chara_id', 'left_chara_id', 'right_chara_id']
      },
      {
        label: 'Main character',
        aliases: ['main character', 'main characters', 'runner', 'runners', 'main uma', 'main umas', 'main chara', 'main charas'],
        fields: ['main_chara_id']
      },
      {
        label: 'Main parent (p1/2)',
        aliases: ['parent character', 'parent uma', 'main parent character'],
        fields: ['main_parent_id']
      },
      {
        label: 'Great parent 1 (gp1)',
        aliases: ['gp1 character', 'gp1 characters', 'gp1 uma', 'gp1 umas', 'gp1 chara', 'gp1 charas', 'grandparent 1 character', 'grandparent 1 characters', 'grand parent 1 character', 'grand parent 1 characters', 'great parent 1 character', 'great parent 1 characters', 'left character', 'left characters', 'left uma', 'left umas', 'left chara', 'left charas'],
        fields: ['left_chara_id']
      },
      {
        label: 'Great parent 2 (gp2)',
        aliases: ['gp2 character', 'gp2 characters', 'gp2 uma', 'gp2 umas', 'gp2 chara', 'gp2 charas', 'grandparent 2 character', 'grandparent 2 characters', 'grand parent 2 character', 'grand parent 2 characters', 'great parent 2 character', 'great parent 2 characters', 'right character', 'right characters', 'right uma', 'right umas', 'right chara', 'right charas'],
        fields: ['right_chara_id']
      },
      {
        label: 'Great parent (gp1/2)',
        aliases: ['gp characters', 'gp character', 'gp umas', 'gp uma', 'gp charas', 'gp chara', 'grandparent characters', 'grandparent character', 'grand parent characters', 'grand parent character', 'great parent characters', 'great parent character', 'any gp characters', 'any gp character', 'any grandparent characters', 'any grandparent character', 'any great parent characters', 'any great parent character'],
        fields: ['left_chara_id', 'right_chara_id']
      }
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
        aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'],
        fieldsByContext: {
          'blue-factor': [{ field: 'left_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'left_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'left_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'left_white_factors', type: 'array' as const }]
        }
      },
      {
        label: 'GP2',
        aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'],
        fieldsByContext: {
          'blue-factor': [{ field: 'right_blue_factors', type: 'number' as const }],
          'pink-factor': [{ field: 'right_pink_factors', type: 'number' as const }],
          'green-factor': [{ field: 'right_green_factors', type: 'number' as const }],
          'white-factor': [{ field: 'right_white_factors', type: 'array' as const }]
        }
      },
      {
        label: 'Great parent',
        aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'],
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

  private compileFriendlyScopedSparkCategoryComparisons(query: string): string {
    const scopes = [
      { aliases: ['main', 'parent', 'main parent'], fields: ['main_blue_factors'], color: 'blue' as const },
      { aliases: ['main', 'parent', 'main parent'], fields: ['main_pink_factors'], color: 'pink' as const },
      { aliases: ['main', 'parent', 'main parent'], fields: ['main_green_factors'], color: 'green' as const },
      { aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'], fields: ['left_blue_factors'], color: 'blue' as const },
      { aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'], fields: ['left_pink_factors'], color: 'pink' as const },
      { aliases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'], fields: ['left_green_factors'], color: 'green' as const },
      { aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'], fields: ['right_blue_factors'], color: 'blue' as const },
      { aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'], fields: ['right_pink_factors'], color: 'pink' as const },
      { aliases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'], fields: ['right_green_factors'], color: 'green' as const },
      { aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], fields: ['left_blue_factors', 'right_blue_factors'], color: 'blue' as const },
      { aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], fields: ['left_pink_factors', 'right_pink_factors'], color: 'pink' as const },
      { aliases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], fields: ['left_green_factors', 'right_green_factors'], color: 'green' as const }
    ];
    const colorAliases = {
      blue: ['blue spark', 'blue sparks', 'blue factor', 'blue factors'],
      pink: ['pink spark', 'pink sparks', 'pink factor', 'pink factors'],
      green: ['green spark', 'green sparks', 'green factor', 'green factors', 'unique skill', 'unique skills']
    };
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      for (const scope of scopes) {
        for (const scopeAlias of scope.aliases) {
          for (const colorAlias of colorAliases[scope.color]) {
            const aliasPattern = `${this.escapeRegExp(scopeAlias).replace(/\s+/g, '\\s+')}\\s+${this.escapeRegExp(colorAlias).replace(/\s+/g, '\\s+')}`;
            const pattern = new RegExp(`(^|[^\\w])(${aliasPattern})\\s*(==|=|!=|<>|>=|<=|>|<)\\s*(\\d+)`, 'gi');
            compiledSegment = compiledSegment.replace(pattern, (_match, leadingText: string, _aliasText: string, operator: string, value: string) => {
              return `${leadingText}${this.buildScopedSparkCategoryComparison(scope.fields, scope.color, operator, parseInt(value, 10))}`;
            });
          }
        }
      }
      return compiledSegment;
    });
  }

  private buildScopedSparkCategoryComparison(fields: string[], color: 'blue' | 'pink' | 'green', operator: string, value: number): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator) || operator;
    const factors = color === 'blue' ? this.blueFactors : color === 'pink' ? this.pinkFactors : this.greenFactors;
    const levels = normalizedOperator === '!='
      ? [value]
      : this.getSparkLevelsForComparison(normalizedOperator, value, 3);
    if (!levels.length) return '(1 = 0)';
    const ids = factors.flatMap(factor => levels.map(level => this.buildSparkId(Number(factor.id), level)));
    if (!ids.length) return normalizedOperator === '!=' ? '(1 = 1)' : '(1 = 0)';
    const buildClause = (field: string) => normalizedOperator === '!='
      ? `${field} not in (${ids.join(', ')})`
      : `${field} in (${ids.join(', ')})`;
    if (fields.length === 1) return buildClause(fields[0]);
    const joiner = normalizedOperator === '!=' ? ' and ' : ' or ';
    return `(${fields.map(buildClause).join(joiner)})`;
  }

  private compileFriendlySparkCategoryComparisons(query: string): string {
    const colorAliases = {
      blue: ['blue spark', 'blue sparks', 'blue factor', 'blue factors'],
      pink: ['pink spark', 'pink sparks', 'pink factor', 'pink factors'],
      green: ['green spark', 'green sparks', 'green factor', 'green factors', 'unique skill', 'unique skills']
    };
    const colorFields = {
      blue: 'blue_sparks',
      pink: 'pink_sparks',
      green: 'green_sparks'
    };

    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      for (const color of ['blue', 'pink', 'green'] as const) {
        for (const alias of colorAliases[color]) {
          const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
          const pattern = new RegExp(`(^|[^\\w])(${aliasPattern})\\s*(==|=|!=|<>|>=|<=|>|<)\\s*(\\d+)`, 'gi');
          compiledSegment = compiledSegment.replace(pattern, (_match, leadingText: string, _aliasText: string, operator: string, value: string) => {
            return `${leadingText}${this.buildSparkCategoryComparison(colorFields[color], color, operator, parseInt(value, 10))}`;
          });
        }
      }
      return compiledSegment;
    });
  }

  private buildSparkCategoryComparison(fieldName: string, color: 'blue' | 'pink' | 'green', operator: string, value: number): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator) || operator;
    const factors = color === 'blue' ? this.blueFactors : color === 'pink' ? this.pinkFactors : this.greenFactors;
    const levels = normalizedOperator === '!='
      ? [value]
      : this.getSparkLevelsForComparison(normalizedOperator, value, 9);
    if (!levels.length) return '(1 = 0)';
    const ids = factors.flatMap(factor => levels.map(level => this.buildSparkId(Number(factor.id), level)));
    if (!ids.length) return normalizedOperator === '!=' ? '(1 = 1)' : '(1 = 0)';
    if (normalizedOperator === '!=') {
      return ids.length === 1
        ? `not contains(${fieldName}, ${ids[0]})`
        : `not overlaps(${fieldName}, (${ids.join(', ')}))`;
    }
    return ids.length === 1
      ? `contains(${fieldName}, ${ids[0]})`
      : `overlaps(${fieldName}, (${ids.join(', ')}))`;
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

  private compileFriendlyScoringFunctionNames(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      const applyFieldSyntax = (fieldPattern: string, functionName: string): void => {
        compiledSegment = compiledSegment.replace(new RegExp(`\\b${fieldPattern}\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), `${functionName}($1)`);
        compiledSegment = compiledSegment.replace(new RegExp(`\\b${fieldPattern}\\s*(?:==|=)\\s*((?:[^;()]|\\([^)]*\\))+?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi'), (_match, rawValue: string) => `${functionName}(${rawValue.trim()})`);
      };

      applyFieldSyntax('optional\\s+main\\s+white', 'optional_main_white');
      applyFieldSyntax('optional\\s+any\\s+white', 'optional_any_white');
      applyFieldSyntax('optional\\s+white', 'optional_white');
      applyFieldSyntax('lineage\\s+white', 'lineage_white');

      return compiledSegment
        .replace(/\boptional\s+main\s+white\s*\(/gi, 'optional_main_white(')
        .replace(/\boptional\s+any\s+white\s*\(/gi, 'optional_any_white(')
        .replace(/\boptional\s+white\s*\(/gi, 'optional_white(')
        .replace(/\blineage\s+white\s*\(/gi, 'lineage_white(');
    });
  }

  private compileFriendlyCharacterScopeExpressions(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      this.friendlyCharacterScopeAliasReplacements.forEach(scope => {
        compiledSegment = compiledSegment.replace(this.resetPattern(scope.notInPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          return `${leadingText}${this.buildCharacterScopeListClause(scope.fields, listText, true)}`;
        });
        compiledSegment = compiledSegment.replace(this.resetPattern(scope.inPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          return `${leadingText}${this.buildCharacterScopeListClause(scope.fields, listText, false)}`;
        });
        compiledSegment = compiledSegment.replace(this.resetPattern(scope.comparisonPattern), (_match, leadingText: string, _aliasText: string, operator: string, rawValue: string) => {
          return `${leadingText}${this.buildCharacterScopeComparisonClause(scope.fields, operator, rawValue)}`;
        });
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

  private compileFriendlyScalarArithmeticFactorAliases(query: string): string {
    const factors = this.getScopedUqlNamedFactors()
      .flatMap(factor => [factor.label, ...factor.aliases]
        .filter(Boolean)
        .map(alias => ({ alias, factor })))
      .sort((left, right) => right.alias.length - left.alias.length);

    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = segment;
      for (const { alias, factor } of factors) {
        const aliasPattern = this.escapeRegExp(alias).replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${aliasPattern})(?=[^A-Za-z0-9_]|$)`, 'gi');
        compiledSegment = compiledSegment.replace(pattern, (match: string, leadingText: string, _aliasText: string, offset: number) => {
          const aliasStart = offset + leadingText.length;
          const aliasEnd = offset + match.length;
          if (!this.isUqlArithmeticScalarAliasContext(compiledSegment, aliasStart, aliasEnd)) {
            return match;
          }
          return `${leadingText}spark_sum(${this.getGlobalSkillFieldForContext(factor.valueContext)}, ${factor.factorId})`;
        });
      }
      return compiledSegment;
    });
  }

  private isUqlArithmeticScalarAliasContext(segment: string, aliasStart: number, aliasEnd: number): boolean {
    const leftBoundary = this.findUqlScalarAliasWindowBoundary(segment, aliasStart, -1);
    const rightBoundary = this.findUqlScalarAliasWindowBoundary(segment, aliasEnd, 1);
    const window = segment.slice(leftBoundary, rightBoundary);
    return /[+*/%]|\bmod\b/i.test(window);
  }

  private findUqlScalarAliasWindowBoundary(segment: string, start: number, direction: -1 | 1): number {
    if (direction < 0) {
      for (let index = start - 1; index >= 0; index--) {
        if (this.isUqlScalarAliasBoundaryAt(segment, index, direction)) return index + 1;
      }
      return 0;
    }
    for (let index = start; index < segment.length; index++) {
      if (this.isUqlScalarAliasBoundaryAt(segment, index, direction)) return index;
    }
    return segment.length;
  }

  private isUqlScalarAliasBoundaryAt(segment: string, index: number, direction: -1 | 1): boolean {
    const char = segment[index];
    if (char === ',' || char === ';') return true;
    if (/[<>=!]/.test(char)) return true;
    const remaining = direction < 0 ? segment.slice(0, index + 1) : segment.slice(index);
    return direction < 0
      ? /\b(?:where|and|or|not)\s*$/i.test(remaining)
      : /^\s*\b(?:and|or)\b/i.test(remaining);
  }

  private compileFriendlyFactorSumComparisons(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      const operatorPattern = '(==|=|!=|<>|>=|<=|>|<)';
      const compileExpression = (expression: string): string | null => {
        const terms = expression.split('+').map(term => term.trim()).filter(Boolean);
        if (terms.length < 2) return null;
        const compiledTerms = terms.map(term => {
          const factor = this.resolveFactorUqlValue(term) as UqlNamedFactor | null;
          if (!factor) return null;
          return `spark_sum(${this.getGlobalSkillFieldForContext(factor.valueContext)}, ${factor.factorId})`;
        });
        if (compiledTerms.some(term => !term)) return null;
        return compiledTerms.join(' + ');
      };

      let compiledSegment = segment.replace(new RegExp(`\\(([^()]*\\+[^()]*)\\)\\s*${operatorPattern}\\s*(\\d+)`, 'gi'), (match, expression: string, operator: string, value: string) => {
        const compiledExpression = compileExpression(expression);
        return compiledExpression ? `(${compiledExpression}) ${this.normalizeUqlComparisonOperator(operator)} ${value}` : match;
      });

      compiledSegment = compiledSegment.replace(new RegExp(`(^|\\b(?:where|and|or)\\s+)([^;()]*\\+[^;()]*?)\\s*${operatorPattern}\\s*(\\d+)`, 'gi'), (match, leadingText: string, expression: string, operator: string, value: string) => {
        const compiledExpression = compileExpression(expression);
        return compiledExpression ? `${leadingText}${compiledExpression} ${this.normalizeUqlComparisonOperator(operator)} ${value}` : match;
      });

      return compiledSegment;
    });
  }

  private compileFriendlyArrayOperators(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = this.compileBareFriendlySkillArrayOperators(segment);
      this.friendlyArrayAliasReplacements.forEach(arrayField => {
        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasAllPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'all', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'all', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `has_all(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasAnyPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'any', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'any', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `overlaps(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.doesNotHavePattern), (_match, leadingText: string, _aliasText: string, rawValue: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'not', rawValue);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'not', rawValue);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `not contains(${field}, ${rawValue.trim()})`, 'and')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.hasPattern), (_match, leadingText: string, _aliasText: string, rawValue: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'one', rawValue);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'one', rawValue);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `contains(${field}, ${rawValue.trim()})`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.containsAllPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'all', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'all', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `has_all(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.containsAnyPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'any', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'any', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `overlaps(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.notInPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'not', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'not', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `not overlaps(${field}, (${listText}))`, 'and')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.inPattern), (_match, leadingText: string, _aliasText: string, listText: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'any', listText);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'any', listText);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `overlaps(${field}, (${listText}))`, 'or')}`;
        });

        compiledSegment = compiledSegment.replace(this.resetPattern(arrayField.containsPattern), (_match, leadingText: string, _aliasText: string, rawValue: string) => {
          const raceSaddleClause = this.buildRaceSaddleArrayClause(arrayField.fields, 'one', rawValue);
          if (raceSaddleClause) return `${leadingText}${raceSaddleClause}`;
          const scopedClause = this.buildContextAwareScopedSkillClause(arrayField, 'one', rawValue);
          if (scopedClause) return `${leadingText}${scopedClause}`;
          return `${leadingText}${this.buildScopedArrayClause(arrayField.fields, field => `contains(${field}, ${rawValue.trim()})`, 'or')}`;
        });
      });

      return compiledSegment;
    });
  }

  private buildRaceSaddleArrayClause(fields: string[], mode: 'one' | 'any' | 'all' | 'not', listText: string): string | null {
    const targetFields = [...new Set(fields.flatMap(field => this.getRaceSaddleTargetFields(field)))];
    if (!targetFields.length) return null;
    const resolvedItems = this.resolveRaceSaddleListItems(listText);
    if (!resolvedItems.length || resolvedItems.some(item => item.saddleIds.length === 0)) return null;
    const effectiveMode = mode === 'one' && resolvedItems.length > 1 ? 'all' : mode;
    const buildAnyClause = (fieldName: string, saddleIds: number[]): string => {
      const ids = [...new Set(saddleIds)].sort((left, right) => left - right);
      return ids.length === 1 ? `contains(${fieldName}, ${ids[0]})` : `overlaps(${fieldName}, (${ids.join(', ')}))`;
    };

    if (effectiveMode === 'all') {
      const clauses = resolvedItems.map(item => this.buildScopedArrayClause(targetFields, field => buildAnyClause(field, item.saddleIds), 'or'));
      return clauses.length === 1 ? clauses[0] : `(${clauses.join(' and ')})`;
    }

    const allSaddleIds = [...new Set(resolvedItems.flatMap(item => item.saddleIds))].sort((left, right) => left - right);
    if (!allSaddleIds.length) return null;
    if (effectiveMode === 'not') {
      return this.buildScopedArrayClause(targetFields, field => `not ${buildAnyClause(field, allSaddleIds)}`, 'and');
    }
    return this.buildScopedArrayClause(targetFields, field => buildAnyClause(field, allSaddleIds), 'or');
  }

  private getRaceSaddleTargetFields(fieldText: string): string[] {
    const normalized = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:not|where)\s+/, '');
    if (normalized === 'race results' || normalized === 'race wins' || normalized === 'win saddles') return ['main_win_saddles'];
    if (normalized === 'main race wins' || normalized === 'main race results' || normalized === 'main win saddles') return ['main_win_saddles'];
    if (normalized === 'left race wins' || normalized === 'left race results' || normalized === 'left win saddles') return ['left_win_saddles'];
    if (normalized === 'right race wins' || normalized === 'right race results' || normalized === 'right win saddles') return ['right_win_saddles'];
    return [];
  }

  private buildContextAwareScopedSkillClause(
    arrayField: FriendlyArrayAliasReplacement,
    mode: 'one' | 'any' | 'all' | 'not',
    listText: string
  ): string | null {
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some(item => !item.factor)) return null;
    const clauses = resolved.flatMap(item => this.buildScopedSkillPresenceClauses(arrayField.fields, item, mode === 'not'));
    if (!clauses.length) return null;
    const strictList = mode === 'all' || mode === 'not' || (mode === 'one' && resolved.length > 1);
    const joiner = strictList ? ' and ' : ' or ';
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
    const normalizedOperator = item.operator ? this.normalizeUqlComparisonOperator(item.operator) : undefined;
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
    const leadingBoundary = '(^|\\b(?:where|and|or)\\s+|\\()';
    const skillClauseBoundary = this.getFriendlySkillClauseBoundaryLookahead();
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('all', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}has_all(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('any', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}overlaps(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*does\\s+not\\s+have\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi'), (_match, leadingText: string, rawValue: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('not', rawValue);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}not contains(white_sparks, ${rawValue.trim()})`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*has\\s+((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi'), (_match, leadingText: string, rawValue: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('one', rawValue);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}contains(white_sparks, ${rawValue.trim()})`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*contains\\s+all\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('all', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}has_all(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*contains\\s+any\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (_match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('any', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return `${leadingText}overlaps(white_sparks, (${listText}))`;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*not\\s+in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('not', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return match;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi'), (match, leadingText: string, listText: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('any', listText);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return match;
    });
    compiledSegment = compiledSegment.replace(new RegExp(`${leadingBoundary}\\s*contains\\s+(?!all\\b|any\\b|\\()((?:[^;()]|\\([^)]*\\))+?)${skillClauseBoundary}`, 'gi'), (match, leadingText: string, rawValue: string) => {
      const contextAwareClause = this.buildBareContextAwareSkillClause('one', rawValue);
      if (contextAwareClause) return `${leadingText}${contextAwareClause}`;
      return match;
    });
    return compiledSegment;
  }

  private encodeBase64Utf8(value: string): string {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private decodeBase64Utf8(value: string): string {
    const normalized = value
      .trim()
      .replace(/\s/g, '+')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  private buildBareContextAwareSkillClause(mode: 'one' | 'any' | 'all' | 'not', listText: string): string | null {
    const resolved = this.resolveAnyFactorListItems(listText);
    if (!resolved.length || resolved.some(item => !item.factor)) return null;
    const clauses = resolved.map(item => this.buildSkillPresenceClause(this.getGlobalSkillFieldForContext(item.factor!.valueContext), item, mode === 'not'));
    const strictList = mode === 'all' || mode === 'not' || (mode === 'one' && resolved.length > 1);
    const joiner = strictList ? ' and ' : ' or ';
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
    let compiledSegment = this.replaceComparisonValue(segment, characterFieldPattern, (value, fieldText) => this.resolveCharacterUqlValue(value, fieldText));
    compiledSegment = this.replaceInListValues(compiledSegment, characterFieldPattern, (value, fieldText) => this.resolveCharacterUqlValue(value, fieldText));
    return compiledSegment;
  }

  private compileFriendlySupportCardExpressions(query: string): string {
    return this.replaceOutsideStrings(query, segment => {
      let compiledSegment = this.compileFriendlySupportCardFunctionValues(segment);
      compiledSegment = this.compileFriendlySupportCardFieldValues(compiledSegment);
      compiledSegment = this.combineSupportCardLimitBreakClauses(compiledSegment);
      compiledSegment = this.compileStandaloneSupportCardLimitBreak(compiledSegment);
      return compiledSegment;
    });
  }

  private compileFriendlySupportCardFunctionValues(segment: string): string {
    const functionPattern = /\b(support_card|has_support_card)\s*\(((?:[^()]|\([^)]*\))*)\)/gi;
    return segment.replace(functionPattern, (match, functionName: string, argsText: string) => {
      const normalizedArgs = this.normalizeSupportCardFunctionArgs(argsText);
      return normalizedArgs ? `${functionName}(${normalizedArgs.join(', ')})` : match;
    });
  }

  private normalizeSupportCardFunctionArgs(argsText: string): string[] | null {
    const args = this.splitUqlDelimitedValues(argsText);
    if (!args.length) return null;
    let changed = false;
    const normalizedArgs = args.map((arg, index) => {
      const idMatch = arg.match(/^(?:(?:id|card_id|support_card_id)\s*=\s*)?(.+)$/i);
      if (index === 0 && idMatch) {
        const resolvedId = this.resolveSupportCardUqlValue(idMatch[1]);
        if (resolvedId) {
          changed = resolvedId !== arg;
          return resolvedId;
        }
      }
      const normalizedLimitBreak = this.normalizeSupportCardLimitBreakArg(arg);
      if (normalizedLimitBreak) {
        changed = changed || normalizedLimitBreak !== arg;
        return normalizedLimitBreak;
      }
      return arg;
    });
    return changed ? normalizedArgs : null;
  }

  private compileFriendlySupportCardFieldValues(segment: string): string {
    const supportCardFieldPattern = this.getUqlFieldPattern('support-card');
    let compiledSegment = this.replaceSupportCardComparisonValues(segment, supportCardFieldPattern);
    compiledSegment = this.replaceSupportCardInListValues(compiledSegment, supportCardFieldPattern);
    return compiledSegment;
  }

  private replaceSupportCardComparisonValues(segment: string, fieldPattern: string): string {
    const comparisonPattern = new RegExp(`(${fieldPattern})\\s*(==|=|!=|<>)\\s*((?:[^(),;)]|\\([^)]*\\))+?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi');
    return segment.replace(comparisonPattern, (match, _fieldText: string, operator: string, rawValue: string) => {
      const resolvedId = this.resolveSupportCardUqlValue(rawValue);
      if (!resolvedId) return match;
      const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
      return normalizedOperator === '!=' ? `not support_card(${resolvedId})` : `support_card(${resolvedId})`;
    });
  }

  private replaceSupportCardInListValues(segment: string, fieldPattern: string): string {
    const inListPattern = new RegExp(`(${fieldPattern})\\s+(not\\s+)?in\\s*\\(((?:[^()]|\\([^)]*\\))*)\\)`, 'gi');
    return segment.replace(inListPattern, (match, _fieldText: string, notText: string | undefined, listText: string) => {
      const resolvedIds = this.splitUqlSupportCardListValues(listText).map(value => this.resolveSupportCardUqlValue(value));
      if (!resolvedIds.length || resolvedIds.some(id => !id)) return match;
      const negated = !!notText;
      const clauses = resolvedIds.map(id => `${negated ? 'not ' : ''}support_card(${id})`);
      return clauses.length === 1 ? clauses[0] : `(${clauses.join(negated ? ' and ' : ' or ')})`;
    });
  }

  private splitUqlSupportCardListValues(listText: string): string[] {
    const namedValues = SUPPORT_CARDS
      .flatMap(card => [card.name, card.id])
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private combineSupportCardLimitBreakClauses(segment: string): string {
    const lbPattern = '(?:lb|limitbreak|limit[_\\s-]?break|limit[_\\s-]?break[_\\s-]?count)';
    const operatorPattern = '(?:>=|<=|!=|<>|==|=|>|<)';
    const supportThenLb = new RegExp(`support_card\\((\\d+)\\)\\s+and\\s+${lbPattern}\\s*(${operatorPattern})\\s*(\\d+)`, 'gi');
    let compiledSegment = segment.replace(supportThenLb, (_match, supportCardId: string, operator: string, value: string) => {
      return `support_card(${supportCardId}, lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
    });
    const lbThenSupport = new RegExp(`${lbPattern}\\s*(${operatorPattern})\\s*(\\d+)\\s+and\\s+support_card\\((\\d+)\\)`, 'gi');
    compiledSegment = compiledSegment.replace(lbThenSupport, (_match, operator: string, value: string, supportCardId: string) => {
      return `support_card(${supportCardId}, lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
    });
    return compiledSegment;
  }

  private compileStandaloneSupportCardLimitBreak(segment: string): string {
    const lbPattern = /\b(?:lb|limitbreak|limit[_\s-]?break|limit[_\s-]?break[_\s-]?count)\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+)\b/gi;
    return segment.replace(lbPattern, (match, operator: string, value: string, offset: number, fullText: string) => {
      if (this.isInsideSupportCardFunction(fullText, offset)) return match;
      return `support_card(lb ${this.normalizeUqlComparisonOperator(operator)} ${value})`;
    });
  }

  private isInsideSupportCardFunction(text: string, index: number): boolean {
    const prefix = text.slice(0, index);
    const openIndex = prefix.lastIndexOf('support_card(');
    if (openIndex < 0) return false;
    const closeIndex = text.indexOf(')', openIndex);
    return closeIndex >= index;
  }

  private normalizeSupportCardLimitBreakArg(arg: string): string | null {
    const match = arg.match(/^(?:lb|limitbreak|limit[_\s-]?break|limit[_\s-]?break[_\s-]?count)\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+)$/i);
    if (!match) return null;
    return `lb ${this.normalizeUqlComparisonOperator(match[1])} ${match[2]}`;
  }

  private normalizeCompiledSupportCardAliases(query: string): string {
    return query.replace(/\b(support_card|has_support_card)\s*\(((?:[^()]|\([^)]*\))*)\)/gi, (match, functionName: string, argsText: string) => {
      const normalizedArgs = this.splitUqlDelimitedValues(argsText)
        .map(arg => this.normalizeSupportCardLimitBreakArg(arg.trim()) || arg.trim())
        .filter(Boolean);
      return normalizedArgs.length ? `${functionName}(${normalizedArgs.join(', ')})` : match;
    });
  }
  private compileFriendlyFunctionValues(segment: string): string {
    const singleValuePattern = /\b(contains|has|any)\s*\(\s*([^,()]+?)\s*,\s*((?:[^()]|\([^)]*\))*?)\s*\)/gi;
    let compiledSegment = segment.replace(singleValuePattern, (match, functionName: string, fieldText: string, rawValue: string) => {
      const factorClause = this.buildFriendlyFactorSingleFunctionClause(functionName, fieldText, rawValue);
      if (factorClause) return factorClause;
      const raceSaddleClause = this.buildFriendlyRaceSaddleFunctionClause(functionName, fieldText, rawValue);
      if (raceSaddleClause) return raceSaddleClause;
      const resolvedValue = this.resolveNamedUqlValueForField(fieldText, rawValue);
      return resolvedValue ? `${functionName}(${fieldText}, ${resolvedValue})` : match;
    });

    const listValuePattern = /\b(overlaps|has_all|contains_all|all)\s*\(\s*([^,()]+?)\s*,\s*\(((?:[^()]|\([^)]*\))*)\)\s*\)/gi;
    compiledSegment = compiledSegment.replace(listValuePattern, (match, functionName: string, fieldText: string, listText: string) => {
      const factorClause = this.buildFriendlyFactorListFunctionClause(functionName, fieldText, listText);
      if (factorClause) return factorClause;
      const raceSaddleClause = this.buildFriendlyRaceSaddleFunctionClause(functionName, fieldText, listText);
      if (raceSaddleClause) return raceSaddleClause;
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

  private buildFriendlyRaceSaddleFunctionClause(functionName: string, fieldText: string, listText: string): string | null {
    const targetFields = this.getRaceSaddleTargetFields(fieldText);
    if (!targetFields.length) return null;
    const normalizedFunction = functionName.toLowerCase();
    const mode = normalizedFunction === 'has_all' || normalizedFunction === 'contains_all' || normalizedFunction === 'all'
      ? 'all'
      : 'any';
    return this.buildRaceSaddleArrayClause(targetFields, mode, listText);
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
    return this.splitUqlDelimitedValues(listText);
  }

  private splitUqlDelimitedValues(listText: string, preserveWhitespace = false): string[] {
    const parts: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let index = 0; index < listText.length; index++) {
      const character = listText[index];
      if (quote) {
        if (character === quote) {
          if (listText[index + 1] === quote) {
            index++;
          } else {
            quote = null;
          }
        }
        continue;
      }
      if (this.isUqlQuoteStart(listText, index)) {
        quote = character;
        continue;
      }
      if (character === '(') {
        depth++;
        continue;
      }
      if (character === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (character !== ',' || depth !== 0) continue;
      parts.push(listText.slice(start, index));
      start = index + 1;
    }
    parts.push(listText.slice(start));
    return parts
      .map(value => preserveWhitespace ? value : value.trim())
      .filter(value => value.trim().length > 0);
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
    return this.splitUqlFactorListValues(this.stripOuterParens(listText), context).map(value => this.parseUqlFactorItem(value, context));
  }

  private parseUqlAnyFactorListItems(listText: string): UqlSkillListItem[] {
    return this.splitUqlAnyFactorListValues(this.stripOuterParens(listText)).map(value => this.parseUqlFactorItem(value));
  }

  private parseUqlFactorItem(rawValue: string, context?: UqlValueContext): UqlSkillListItem {
    const trimmedValue = this.stripOuterParens(rawValue.trim());
    const comparisonMatch = trimmedValue.match(/^(.*?)(?:\s*(>=|<=|!=|<>|==|=|>|<)\s*(\d+))\s*$/);
    const value = comparisonMatch ? comparisonMatch[1].trim() : trimmedValue;
    const operator = comparisonMatch?.[2] ? this.normalizeUqlComparisonOperator(comparisonMatch[2]) : undefined;
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
      const comparisonMatch = listText.slice(boundary).match(/^\s*(?:>=|<=|!=|<>|==|=|>|<)\s*\d+/);
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

  private replaceComparisonValue(segment: string, fieldPattern: string, resolveValue: (value: string, fieldText: string) => string | null): string {
    const comparisonPattern = new RegExp(`(${fieldPattern}\\s*(?:==|=|!=|<>|<=|>=|<|>)\\s*)([^\\s(),][^;)]*?)(?=\\s+(?:and|or)\\b|\\)|;|$)`, 'gi');
    return segment.replace(comparisonPattern, (match, prefix: string, rawValue: string) => {
      const fieldText = prefix.replace(/\s*(?:==|=|!=|<>|<=|>=|<|>)\s*$/, '').trim();
      const resolvedValue = resolveValue(rawValue, fieldText);
      return resolvedValue ? `${prefix}${resolvedValue}` : match;
    });
  }
  private replaceInListValues(segment: string, fieldPattern: string, resolveValue: (value: string, fieldText: string) => string | null): string {
    const inListPattern = new RegExp(`(${fieldPattern}\\s+(?:not\\s+)?in\\s*\\()((?:[^()]|\\([^)]*\\))*)(\\))`, 'gi');
    return segment.replace(inListPattern, (_match, prefix: string, listText: string, suffix: string) => {
      const fieldText = prefix.replace(/\s+(?:not\s+)?in\s*\($/i, '').trim();
      return `${prefix}${this.replaceNamedListValues(listText, value => resolveValue(value, fieldText))}${suffix}`;
    });
  }
  private replaceNamedListValues(listText: string, resolveValue: (value: string) => string | null): string {
    const items = this.splitUqlDelimitedValues(listText, true);
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

  private buildCharacterScopeListClause(fields: string[], listText: string, negated: boolean): string {
    const clauses = fields.map(fieldName => {
      const resolvedList = this.replaceNamedListValues(listText, value => this.resolveCharacterUqlValue(value, fieldName));
      return `${fieldName} ${negated ? 'not in' : 'in'} (${resolvedList})`;
    });
    if (clauses.length === 1) return clauses[0];
    return `(${clauses.join(negated ? ' and ' : ' or ')})`;
  }

  private buildCharacterScopeComparisonClause(fields: string[], operator: string, rawValue: string): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator) || operator;
    const negated = normalizedOperator === '!=';
    const clauses = fields.map(fieldName => {
      const resolvedValue = this.resolveCharacterUqlValue(rawValue, fieldName) || rawValue.trim();
      return `${fieldName} ${normalizedOperator} ${resolvedValue}`;
    });
    if (clauses.length === 1) return clauses[0];
    return `(${clauses.join(negated ? ' and ' : ' or ')})`;
  }

  private resolveNamedUqlValueForField(fieldText: string, rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value || /^\d+$/.test(value) || /^'.*'$|^".*"$/.test(value)) return null;
    const context = this.getUqlValueContextForField(fieldText);
    if (context === 'character') return this.resolveCharacterUqlValue(value, fieldText);
    if (context === 'support-card') return this.resolveSupportCardUqlValue(value);
    if (context === 'race-saddle') {
      const ids = this.resolveRaceSaddleUqlValue(value);
      return ids.length ? ids.join(', ') : null;
    }
    if (context === 'blue-factor' || context === 'pink-factor' || context === 'green-factor' || context === 'white-factor') {
      const factor = this.resolveFactorUqlValue(value, context);
      return factor ? this.buildSparkId(factor.factorId, 1).toString() : null;
    }
    return null;
  }

  private resolveRaceSaddleListItems(listText: string): Array<{ value: string; saddleIds: number[] }> {
    return this.splitUqlRaceSaddleListValues(listText).map(value => ({
      value,
      saddleIds: this.resolveRaceSaddleUqlValue(value)
    }));
  }

  private resolveRaceSaddleUqlValue(rawValue: string): number[] {
    const value = rawValue.trim().replace(/^(?:id|saddle_id|win_saddle_id|race_id|race_instance_id)\s*=\s*/i, '');
    if (!value || /^'.*'$|^".*"$/.test(value)) return [];
    if (/^\d+$/.test(value)) return [parseInt(value, 10)];
    const normalizedValue = this.normalizeUqlName(value);
    const matchedRace = this.getUqlRaceSaddleValues().find(race => [race.label, ...race.aliases]
      .some(alias => this.normalizeUqlName(alias) === normalizedValue));
    return matchedRace?.saddleIds ?? [];
  }

  private splitUqlRaceSaddleListValues(listText: string): string[] {
    const namedValues = this.getUqlRaceSaddleValues()
      .flatMap(race => [race.label, ...race.aliases])
      .filter((value, index, values) => value && values.indexOf(value) === index)
      .sort((left, right) => right.length - left.length);
    return this.splitUqlKnownListValues(listText, namedValues);
  }

  private getUqlRaceSaddleValues(): UqlRaceSaddleValue[] {
    const byRaceInstanceId = new Map<number, UqlRaceSaddleValue>();
    for (const race of (RACE_SADDLE_DATA as any).races ?? []) {
      const raceInstanceId = Number(race.race_instance_id);
      if (!Number.isFinite(raceInstanceId)) continue;
      const saddleIds = (race.win_saddles ?? [])
        .map((winSaddle: any) => Number(winSaddle.saddle_id))
        .filter((saddleId: number) => Number.isFinite(saddleId));
      if (!saddleIds.length) continue;
      const label = race.name || race.short_name || `Race ${raceInstanceId}`;
      const aliases = [race.name, race.short_name, race.race_id?.toString(), raceInstanceId.toString()]
        .filter((alias: string | undefined) => !!alias && alias !== label) as string[];
      const grade = Number(race.grade);
      const requiredRaceIds = (race.win_saddles ?? [])
        .flatMap((winSaddle: any) => winSaddle.required_race_instance_ids ?? [])
        .map((id: unknown) => String(id));
      byRaceInstanceId.set(raceInstanceId, {
        label,
        aliases: [...new Set(aliases)],
        searchText: [race.name, race.short_name, raceInstanceId, race.race_id, ...saddleIds, ...requiredRaceIds].filter(Boolean).join(' '),
        saddleIds: [...new Set<number>(saddleIds)].sort((left, right) => left - right),
        raceInstanceId,
        grade,
        gradeLabel: this.getRaceGradeLabel(grade),
        gradeClass: this.getRaceGradeClass(grade)
      });
    }
    return [...byRaceInstanceId.values()].sort((left, right) => left.label.localeCompare(right.label));
  }

  private getRaceGradeLabel(grade: number): string | undefined {
    switch (grade) {
      case 100: return 'G1';
      case 200: return 'G2';
      case 300: return 'G3';
      default: return undefined;
    }
  }

  private getRaceGradeClass(grade: number): string | undefined {
    switch (grade) {
      case 100: return 'grade-g1';
      case 200: return 'grade-g2';
      case 300: return 'grade-g3';
      default: return undefined;
    }
  }

  private resolveSupportCardUqlValue(rawValue: string): string | null {
    const value = rawValue.trim().replace(/^(?:id|card_id|support_card_id)\s*=\s*/i, '');
    if (!value || /^'.*'$|^".*"$/.test(value)) return null;
    if (/^\d+$/.test(value)) return value;
    const parsed = this.parseSupportCardUqlDisplayValue(value);
    const card = SUPPORT_CARDS.find(entry => {
      if (this.normalizeUqlName(entry.name) !== parsed.name) return false;
      if (parsed.type && this.normalizeUqlName(this.getSupportCardTypeDisplay(entry.type)) !== parsed.type) return false;
      if (parsed.rarity && this.normalizeUqlName(this.getSupportCardRarityDisplay(entry.rarity)) !== parsed.rarity) return false;
      return true;
    });
    return card?.id || null;
  }

  private parseSupportCardUqlDisplayValue(value: string): { name: string; rarity?: string; type?: string } {
    let text = value.trim();
    let type: string | undefined;
    let rarity: string | undefined;
    const typeMatch = text.match(/\s*\(([^)]+)\)\s*$/);
    if (typeMatch) {
      type = this.normalizeUqlName(typeMatch[1]);
      text = text.slice(0, typeMatch.index).trim();
    }
    const rarityMatch = text.match(/\s*\[(R|SR|SSR)\]\s*$/i);
    if (rarityMatch) {
      rarity = this.normalizeUqlName(rarityMatch[1]);
      text = text.slice(0, rarityMatch.index).trim();
    }
    return { name: this.normalizeUqlName(text), rarity, type };
  }

  private applyUqlEditorDirectives(): void {
    const normalizedQuery = this.getNormalizedUqlQuery();
    if (this.shouldOpenUqlOwnedLegacyPicker(normalizedQuery)) {
      this.openUqlOwnedLegacyPicker();
      return;
    }
    this.ensureUqlOwnedLegacyData(normalizedQuery);
    const parsed = this.extractUqlEditorDirectives(normalizedQuery);
    if (parsed.issue) return;

    const targetDirective = [...parsed.directives].reverse().find(directive => directive.kind === 'target');
    const legacyDirective = [...parsed.directives].reverse().find(directive => directive.kind === 'legacy');

    let treeChanged = false;
    if (targetDirective) {
      const resolvedTarget = this.resolveUqlTargetCharacter(targetDirective.value).match;
      if (resolvedTarget && this.treeData.characterId !== resolvedTarget.id) {
        const baseId = Math.floor(resolvedTarget.id / 100);
        this.clearFromMainParents(baseId);
        this.treeData.name = resolvedTarget.name || getCharacterName(resolvedTarget.id);
        this.treeData.image = resolvedTarget.image;
        this.treeData.characterId = resolvedTarget.id;
        treeChanged = true;
      }
    } else if (this.treeData.characterId) {
      this.treeData.name = 'Target (ace)';
      this.treeData.image = undefined;
      this.treeData.characterId = undefined;
      treeChanged = true;
    }

    if (treeChanged) {
      this.updateTreeFilters(false);
    }

    if (legacyDirective) {
      const resolvedLegacy = this.resolveUqlOwnedLegacy(legacyDirective.value).match;
      const selectedVeteranId = this.getVeteranUuid(this.selectedVeteran);
      const resolvedVeteranId = this.getVeteranUuid(resolvedLegacy?.veteran);
      if (resolvedLegacy && (this.selectedAccountId !== resolvedLegacy.accountId
        || (!!resolvedVeteranId && selectedVeteranId !== resolvedVeteranId)
        || (!resolvedVeteranId && this.selectedVeteran?.member_id !== resolvedLegacy.veteran.member_id))) {
        this.applySelectedVeteran(resolvedLegacy.veteran, resolvedLegacy.accountId);
      }
    } else if (this.selectedVeteran) {
      this.selectedVeteran = null;
      this.selectedVeteranName = '';
      this.selectedVeteranImage = '';
      this.pendingVeteranRestore = null;
      this.veteranSelected.emit(null);
      this.syncSelectedVeteranFilterState();
    }
  }

  private clearUqlEditorDirectiveState(): void {
    let treeChanged = false;
    if (this.treeData.characterId) {
      this.treeData.name = 'Target (ace)';
      this.treeData.image = undefined;
      this.treeData.characterId = undefined;
      treeChanged = true;
    }
    if (treeChanged) {
      this.updateTreeFilters(false);
    }
    if (this.selectedVeteran) {
      this.selectedVeteran = null;
      this.selectedVeteranName = '';
      this.selectedVeteranImage = '';
      this.pendingVeteranRestore = null;
      this.veteranSelected.emit(null);
      this.syncSelectedVeteranFilterState();
    }
    this.restoredP2Context = null;
  }

  private shouldOpenUqlOwnedLegacyPicker(query: string): boolean {
    if (!query.trim()) return false;
    const expression = this.stripLeadingWhere(query);
    const clauses = this.splitTopLevelUqlAndClauses(expression);
    return clauses.some(clause => /^(?:owned\s+legacy|your\s+legacy|my\s+legacy|legacy)\s*=\s*\[\s*\]$/i.test(clause.trim()));
  }

  private openUqlOwnedLegacyPicker(forceOpen = false): void {
    if (this.uqlOwnedLegacyPickerOpen || this.uqlOwnedLegacyPickerPending) return;
    if (!this.linkedAccounts.length && !forceOpen) {
      this.uqlOwnedLegacyPickerPending = true;
      this.loadLinkedAccounts(() => {
        this.uqlOwnedLegacyPickerPending = false;
        this.openUqlOwnedLegacyPicker(true);
      }, { preloadSelectedAccount: false, updateSuggestions: false });
      return;
    }
    this.uqlOwnedLegacyPickerOpen = true;
    this.openVeteranDialog(veteran => {
      this.uqlOwnedLegacyPickerOpen = false;
      if (!veteran) return;
      this.replaceUqlOwnedLegacyPickerPlaceholder(veteran);
    }, { suppressFilterChange: true });
  }

  private replaceUqlOwnedLegacyPickerPlaceholder(veteran: VeteranMember): void {
    const accountId = this.getOwnedLegacyAccountIdForVeteran(veteran);
    this.applySelectedVeteran(veteran, accountId || null);
    const value = this.getOwnedLegacyUqlDisplayValue(accountId, veteran);
    const replacement = `owned legacy = [${value}]`;
    const query = this.uqlQuery.trim();
    const placeholderPattern = /(^|\band\s+)((?:owned\s+legacy|your\s+legacy|my\s+legacy|legacy)\s*=\s*)(?:\[\s*\])?(?=\s*(?:\band\b|$))/i;
    if (placeholderPattern.test(query)) {
      this.uqlQuery = query.replace(placeholderPattern, (_match, prefix) => `${prefix}${replacement}`);
    } else if (!query || /^where$/i.test(query)) {
      this.uqlQuery = replacement;
    } else {
      this.uqlQuery = `${query.replace(/\s+and\s*$/i, '').replace(/;\s*$/, '')} and ${replacement}`;
    }
    this.syncSelectedVeteranFilterState();
    if (this.uqlValidationState === 'empty') {
      this.uqlValidationState = 'valid';
      this.uqlValidationMessage = 'Ready';
    }
    if (this.filterMode === 'uql') {
      this.filterState = this.buildUqlOnlyFilterState();
    }
    this.updateActiveFilterChips();
    this.persistCurrentFilterState();
    this.filterChangeSubject.next({ ...this.filterState });
  }

  private ensureUqlOwnedLegacyData(query: string): void {
    if (this.getUqlOwnedLegacyDirectiveSelectedVeteranMatch(query)) return;
    const veteranIdHint = this.getUqlOwnedLegacyVeteranIdHint(query);
    const accountHint = this.getUqlOwnedLegacyAccountHint(query);
    const memberIdHint = this.getUqlOwnedLegacyMemberIdHint(query);
    const hasLegacyDirective = this.hasUqlOwnedLegacyDirective(query);
    if (!hasLegacyDirective) return;

    if (veteranIdHint && !this.fetchedVeteransById.has(veteranIdHint) && !this.loadingVeteransById[veteranIdHint]) {
      this.loadVeteranById(veteranIdHint);
      return;
    }
    if (veteranIdHint) return;

    if (!this.linkedAccountsLoaded && !this.loadingLinkedAccounts) {
      this.loadLinkedAccounts(() => {
        if (accountHint) this.loadVeteransForAccount(accountHint);
        else if (memberIdHint != null) this.loadVeteransForLegacyMemberHint();
        this.onUqlChange();
      }, { preloadSelectedAccount: false, updateSuggestions: true });
      return;
    }

    if (accountHint && !this.veterans[accountHint] && !this.loadingVeterans[accountHint]) {
      this.loadVeteransForAccount(accountHint);
      return;
    }

    if (!accountHint && memberIdHint != null) {
      this.loadVeteransForLegacyMemberHint();
    }
  }

  private isUqlOwnedLegacyResolutionPending(query: string): boolean {
    if (!this.hasUqlOwnedLegacyDirective(query)) return false;
    if (this.getUqlOwnedLegacyDirectiveSelectedVeteranMatch(query)) return false;
    const veteranIdHint = this.getUqlOwnedLegacyVeteranIdHint(query);
    if (veteranIdHint) {
      return !!this.loadingVeteransById[veteranIdHint] || !this.fetchedVeteransById.has(veteranIdHint);
    }
    const accountHint = this.getUqlOwnedLegacyAccountHint(query);
    const memberIdHint = this.getUqlOwnedLegacyMemberIdHint(query);
    if (!this.linkedAccountsLoaded || this.loadingLinkedAccounts) return true;
    if (accountHint) return this.loadingVeterans[accountHint] || !this.veterans[accountHint];
    if (memberIdHint != null) {
      return this.linkedAccounts.some(account => this.loadingVeterans[account.account_id] || !this.veterans[account.account_id]);
    }
    return Object.values(this.loadingVeterans).some(Boolean);
  }

  isCurrentUqlOwnedLegacyResolutionPending(): boolean {
    return this.filterMode === 'uql' && this.isUqlOwnedLegacyResolutionPending(this.getNormalizedUqlQuery());
  }

  currentUqlRequiresOwnedLegacyParams(): boolean {
    return this.filterMode === 'uql'
      && this.uqlValidationState !== 'invalid'
      && this.hasUqlOwnedLegacyDirective(this.getNormalizedUqlQuery());
  }

  private hasUqlOwnedLegacyDirective(query: string): boolean {
    const expression = this.stripLeadingWhere(query);
    if (!expression) return false;
    return this.splitTopLevelUqlAndClauses(expression)
      .some(clause => this.parseUqlEditorDirectiveClause(clause)?.kind === 'legacy');
  }

  private getUqlOwnedLegacyAccountHint(query: string): string | null {
    const expression = this.stripLeadingWhere(query);
    if (!expression) return null;
    for (const clause of this.splitTopLevelUqlAndClauses(expression)) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (directive?.kind !== 'legacy' || !directive.value) continue;
      const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(directive.value));
      const accountMatch = value.match(/@([A-Za-z0-9_-]+)\s*$/);
      if (accountMatch) return accountMatch[1];
      const accountMemberMatch = value.match(/^([A-Za-z0-9_-]+):\d+$/);
      if (accountMemberMatch) return accountMemberMatch[1];
    }
    return null;
  }

  private getUqlOwnedLegacyVeteranIdHint(query: string): string | null {
    const expression = this.stripLeadingWhere(query);
    if (!expression) return null;
    for (const clause of this.splitTopLevelUqlAndClauses(expression)) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (directive?.kind !== 'legacy' || !directive.value) continue;
      const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(directive.value));
      const idMatch = value.match(/#([A-Za-z0-9_-]+)\s*$/);
      if (idMatch && !/^\d+$/.test(idMatch[1])) return idMatch[1];
    }
    return null;
  }

  private getUqlOwnedLegacyMemberIdHint(query: string): number | null {
    const expression = this.stripLeadingWhere(query);
    if (!expression) return null;
    for (const clause of this.splitTopLevelUqlAndClauses(expression)) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (directive?.kind !== 'legacy' || !directive.value) continue;
      const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(directive.value));
      const accountMemberMatch = value.match(/^[A-Za-z0-9_-]+:(\d+)$/);
      if (accountMemberMatch) return Number(accountMemberMatch[1]);
      const idMatch = value.match(/(?:#|member\s+)(\d+)(?=\s*(?:@|$))/i);
      if (idMatch) return Number(idMatch[1]);
    }
    return null;
  }

  private getUqlOwnedLegacyDirectiveSelectedVeteranMatch(query: string): { accountId: string; veteran: VeteranMember } | null {
    if (!this.selectedVeteran) return null;
    const expression = this.stripLeadingWhere(query);
    if (!expression) return null;
    for (const clause of this.splitTopLevelUqlAndClauses(expression)) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (directive?.kind !== 'legacy' || !directive.value) continue;
      const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(directive.value));
      const accountId = this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran);
      if (this.matchesSelectedVeteranLegacyValue(value, accountId, this.selectedVeteran)) {
        return { accountId, veteran: this.selectedVeteran };
      }
    }
    return null;
  }

  private matchesSelectedVeteranLegacyValue(value: string, accountId: string, veteran: VeteranMember): boolean {
    const normalizedValue = this.normalizeLegacyDirectiveValue(value);
    if (!normalizedValue) return false;
    const name = this.getVeteranName(veteran);
    const veteranId = this.getVeteranUuid(veteran);
    const candidates = [
      this.getOwnedLegacyUqlDisplayValue(accountId, veteran),
      name,
      accountId ? `${name} @${accountId}` : undefined,
      veteranId ? `${name} #${veteranId}` : undefined,
      veteran.member_id != null ? `${name} #${veteran.member_id}` : undefined,
      veteran.member_id != null && accountId ? `${name} #${veteran.member_id} @${accountId}` : undefined,
    ];
    return candidates.some(candidate => candidate && this.normalizeLegacyDirectiveValue(candidate) === normalizedValue);
  }

  private normalizeLegacyDirectiveValue(value: string): string {
    return this.normalizeUqlName(value)
      .replace(/\s*@\s*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private loadVeteransForLegacyMemberHint(): void {
    if (!this.linkedAccountsLoaded) return;
    for (const account of this.linkedAccounts) {
      const accountId = account.account_id;
      if (!this.veterans[accountId] && !this.loadingVeterans[accountId]) {
        this.loadVeteransForAccount(accountId);
      }
    }
  }

  private getAccountIdForVeteran(veteran: VeteranMember): string | null {
    if (veteran.trainer_id) return veteran.trainer_id;
    const veteranId = this.getVeteranUuid(veteran);
    for (const [accountId, veterans] of Object.entries(this.veterans)) {
      if (veterans.some(entry => entry === veteran
        || (!!veteranId && this.getVeteranUuid(entry) === veteranId)
        || (entry.member_id != null && entry.member_id === veteran.member_id))) {
        return accountId;
      }
    }
    return null;
  }

  private getOwnedLegacyAccountIdForVeteran(veteran: VeteranMember): string {
    const accountId = this.getAccountIdForVeteran(veteran);
    if (accountId) return accountId;
    if (veteran.share_source === 'manual' || veteran.share_source === 'bookmark') return '';
    return this.selectedAccountId || '';
  }

  private getVeteranUuid(veteran: VeteranMember | null | undefined): string | null {
    if (veteran?.id == null) return null;
    const value = String(veteran.id).trim();
    return value || null;
  }

  private syncSelectedVeteranFilterState(): void {
    if (this.selectedVeteran) {
      const veteran = this.selectedVeteran;
      const winSaddleIds = veteran.win_saddle_id_array ?? [];
      this.filterState.p2_main_chara_id = this.getVeteranMainCharaId(veteran);
      this.filterState.p2_win_saddle = winSaddleIds.length ? winSaddleIds : undefined;
    } else if (this.restoredP2Context) {
      this.filterState.p2_main_chara_id = this.restoredP2Context.mainCharaId;
      this.filterState.p2_win_saddle = this.restoredP2Context.winSaddleIds?.length ? this.restoredP2Context.winSaddleIds : undefined;
    } else {
      this.filterState.p2_main_chara_id = undefined;
      this.filterState.p2_win_saddle = undefined;
    }
  }

  private getVeteranMainCharaId(veteran: VeteranMember): number | undefined {
    const rawId = veteran.card_id ?? veteran.trained_chara_id ?? undefined;
    if (rawId == null) return undefined;
    return rawId >= 10000 ? Math.floor(rawId / 100) : rawId;
  }

  private resolveUqlTargetCharacter(rawValue: string): { match?: (typeof CHARACTERS)[number]; partial: boolean } {
    const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(rawValue));
    const normalizedValue = this.normalizeUqlName(value);
    if (!normalizedValue) return { partial: true };
    if (/^\d+$/.test(value.trim())) {
      const match = getMasterCharacterById(parseInt(value.trim(), 10));
      return match ? { match, partial: false } : { partial: false };
    }
    const candidates = CHARACTERS.map(character => ({
      character,
      values: [
        this.getCharacterUqlDisplayName(character),
        character.name,
        getCharacterName(character.id),
        this.getCharacterSkinName(character.id),
        character.id.toString()
      ].filter(Boolean) as string[]
    }));
    const exact = candidates.find(candidate => candidate.values.some(candidateValue => this.normalizeUqlName(candidateValue) === normalizedValue));
    if (exact) return { match: exact.character, partial: false };
    const partial = candidates.some(candidate => candidate.values.some(candidateValue => this.normalizeUqlName(candidateValue).startsWith(normalizedValue)));
    return { partial };
  }

  private resolveUqlOwnedLegacy(rawValue: string): { match?: { accountId: string; veteran: VeteranMember }; partial: boolean } {
    const value = this.unwrapUqlBracketValue(this.unquoteUqlValue(rawValue));
    const normalizedValue = this.normalizeUqlName(value);
    if (!normalizedValue) return { partial: true };
    if (this.selectedVeteran) {
      const accountId = this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran);
      if (this.matchesSelectedVeteranLegacyValue(value, accountId, this.selectedVeteran)) {
        return { match: { accountId, veteran: this.selectedVeteran }, partial: false };
      }
    }
    const uuidMatch = value.match(/#([A-Za-z0-9_-]+)\s*$/);
    if (uuidMatch && !/^\d+$/.test(uuidMatch[1])) {
      const veteranId = uuidMatch[1];
      if (this.selectedVeteran && this.getVeteranUuid(this.selectedVeteran) === veteranId) {
        return { match: { accountId: this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran), veteran: this.selectedVeteran }, partial: false };
      }
      const fetchedVeteran = this.fetchedVeteransById.get(veteranId);
      if (fetchedVeteran) {
        return { match: { accountId: this.getAccountIdForVeteran(fetchedVeteran) || fetchedVeteran.trainer_id || '', veteran: fetchedVeteran }, partial: false };
      }
      for (const account of this.linkedAccounts) {
        const veteran = (this.veterans[account.account_id] ?? []).find(entry => this.getVeteranUuid(entry) === veteranId);
        if (veteran) return { match: { accountId: account.account_id, veteran }, partial: false };
      }
      return { partial: !!this.loadingVeteransById[veteranId] || !this.fetchedVeteransById.has(veteranId) };
    }
    const idMatch = value.match(/(?:#|member\s+)(\d+)\s*$/i);
    if (idMatch) {
      const memberId = Number(idMatch[1]);
      if (this.selectedVeteran?.member_id === memberId) {
        const accountId = this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran);
        return { match: { accountId, veteran: this.selectedVeteran }, partial: false };
      }
      for (const account of this.linkedAccounts) {
        const veteran = (this.veterans[account.account_id] ?? []).find(entry => entry.member_id === memberId);
        if (veteran) return { match: { accountId: account.account_id, veteran }, partial: false };
      }
    }
    const accountMatch = value.match(/@([A-Za-z0-9_-]+)\s*$/);
    if (accountMatch) {
      const accountId = accountMatch[1];
      const valueBeforeAccount = value.slice(0, accountMatch.index).trim();
      const memberMatch = valueBeforeAccount.match(/(?:#|member\s+)(\d+)\s*$/i);
      const memberId = memberMatch ? Number(memberMatch[1]) : null;
      const normalizedName = this.normalizeUqlName(memberMatch
        ? valueBeforeAccount.slice(0, memberMatch.index).trim()
        : valueBeforeAccount);
      if (this.selectedVeteran && (this.getAccountIdForVeteran(this.selectedVeteran) === accountId || this.selectedVeteran.trainer_id === accountId)) {
        if (memberId == null || this.selectedVeteran.member_id === memberId) {
          return { match: { accountId, veteran: this.selectedVeteran }, partial: false };
        }
      }
      const veteran = (this.veterans[accountId] ?? []).find(entry => {
        if (memberId != null) return entry.member_id === memberId;
        return this.normalizeUqlName(this.getVeteranName(entry)) === normalizedName;
      });
      if (veteran) return { match: { accountId, veteran }, partial: false };
    }

    let partial = false;
    for (const account of this.linkedAccounts) {
      const accountLabel = account.trainer_name || account.account_id;
      for (const veteran of this.veterans[account.account_id] ?? []) {
        if (veteran.member_id == null) continue;
        const name = this.getVeteranName(veteran);
        const values = [
          this.getOwnedLegacyUqlDisplayValue(account.account_id, veteran),
          name,
          `${name} ${veteran.member_id}`,
          `${account.account_id}:${veteran.member_id}`,
          accountLabel
        ];
        for (const candidateValue of values) {
          const normalizedCandidate = this.normalizeUqlName(candidateValue);
          if (normalizedCandidate === normalizedValue) {
            return { match: { accountId: account.account_id, veteran }, partial: false };
          }
          partial ||= normalizedCandidate.startsWith(normalizedValue);
        }
      }
    }
    partial ||= !this.linkedAccountsLoaded || Object.values(this.loadingVeterans).some(Boolean);
    return { partial };
  }

  private resolveCharacterUqlValue(rawValue: string, fieldText?: string): string | null {
    const normalizedValue = this.normalizeUqlName(rawValue);
    const exactVariant = CHARACTERS.find(entry => this.normalizeUqlName(this.getCharacterUqlDisplayName(entry)) === normalizedValue);
    if (exactVariant) return this.formatCharacterUqlId(exactVariant.id, fieldText);
    const originalVariant = CHARACTERS.find(entry => {
      const isOriginal = this.getCharacterSkinName(entry.id) === 'Original';
      return isOriginal && (this.normalizeUqlName(getCharacterName(entry.id)) === normalizedValue || this.normalizeUqlName(entry.name || '') === normalizedValue);
    });
    if (originalVariant) return this.formatCharacterUqlId(originalVariant.id, fieldText);
    const character = CHARACTERS.find(entry => this.normalizeUqlName(getCharacterName(entry.id)) === normalizedValue || this.normalizeUqlName(entry.name || '') === normalizedValue);
    return character ? this.formatCharacterUqlId(character.id, fieldText) : null;
  }
  private formatCharacterUqlId(cardId: number, _fieldText?: string): string {
    return cardId.toString();
  }
  private getCanonicalFriendlyUqlField(fieldText: string): string {
    const normalizedField = fieldText.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:not|where)\s+/, '');
    const matchedField = this.friendlyFieldAliases.find(field => [field.field, field.label, ...field.aliases]
      .some(alias => alias.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim() === normalizedField));
    return matchedField?.field || normalizedField.replace(/\s+/g, '_');
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
    if (this.endsWithAny(normalized, ['characters', 'character', 'umas', 'uma', 'charas', 'chara', 'main character', 'main characters', 'main uma', 'main umas', 'main parent', 'main chara', 'main charas', 'main chara id', 'left parent', 'left character', 'left characters', 'left uma', 'left umas', 'left chara', 'left charas', 'left chara id', 'right parent', 'right character', 'right characters', 'right uma', 'right umas', 'right chara', 'right charas', 'right chara id', 'gp1 character', 'gp1 characters', 'gp1 uma', 'gp1 umas', 'gp1 chara', 'gp1 charas', 'gp2 character', 'gp2 characters', 'gp2 uma', 'gp2 umas', 'gp2 chara', 'gp2 charas', 'gp character', 'gp characters', 'grandparent character', 'grandparent characters', 'great parent character', 'great parent characters'])) {
      return 'character';
    }
    if (this.endsWithAny(normalized, ['support card', 'support', 'card', 'support card id'])) {
      return 'support-card';
    }
    if (this.endsWithAny(normalized, ['race results', 'race wins', 'main race wins', 'left race wins', 'right race wins', 'win saddles', 'main win saddles', 'left win saddles', 'right win saddles'])) {
      return 'race-saddle';
    }
    if (this.endsWithAny(normalized, ['rank', 'parent rank'])) {
      return 'rank';
    }
    if (this.endsWithAny(normalized, ['white sparks', 'white skills', 'white factors', 'main parent white skills', 'main parent skills', 'parent white skills', 'parent skills', 'main white factors', 'main white sparks', 'left white factors', 'left white sparks', 'right white factors', 'right white sparks', 'gp1 white factors', 'gp1 white sparks', 'gp2 white factors', 'gp2 white sparks'])) {
      return 'white-factor';
    }
    if (this.endsWithAny(normalized, ['green sparks', 'unique skills', 'green factors', 'main green sparks', 'main green factors', 'main unique skills', 'left green sparks', 'left green factors', 'left unique skills', 'right green sparks', 'right green factors', 'right unique skills', 'gp1 green sparks', 'gp1 green factors', 'gp1 unique skills', 'gp2 green sparks', 'gp2 green factors', 'gp2 unique skills'])) {
      return 'green-factor';
    }
    if (this.endsWithAny(normalized, ['blue sparks', 'blue factors', 'main blue sparks', 'main blue factors', 'left blue sparks', 'left blue factors', 'right blue sparks', 'right blue factors', 'gp1 blue sparks', 'gp1 blue factors', 'gp2 blue sparks', 'gp2 blue factors'])) {
      return 'blue-factor';
    }
    if (this.endsWithAny(normalized, ['pink sparks', 'pink factors', 'main pink sparks', 'main pink factors', 'left pink sparks', 'left pink factors', 'right pink sparks', 'right pink factors', 'gp1 pink sparks', 'gp1 pink factors', 'gp2 pink sparks', 'gp2 pink factors'])) {
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
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const clauses = field.fields.map(target => target.type === 'array'
      ? this.buildSparkComparison({ ...field, field: target.field }, normalizedOperator, value)
      : this.buildSingleSparkFieldComparison(target.field, field.factorId, normalizedOperator, value, field.maxLevel));
    if (clauses.length === 1) return clauses[0];
    const joiner = normalizedOperator === '!=' ? ' and ' : ' or ';
    return `(${clauses.join(joiner)})`;
  }
  private buildSingleSparkFieldComparison(fieldName: string, factorId: number, operator: string, value: number, maxLevel: number): string {
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const zeroClause = this.buildZeroSparkComparisonClause(fieldName, factorId, normalizedOperator, value, maxLevel);
    if (zeroClause) return zeroClause;
    if (normalizedOperator === '!=') {
      return `${fieldName} != ${this.buildSparkId(factorId, value)}`;
    }
    const levels = this.getSparkLevelsForComparison(normalizedOperator, value, maxLevel);
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
    const normalizedOperator = this.normalizeUqlComparisonOperator(operator);
    const zeroClause = this.buildZeroSparkComparisonClause(field.field, field.factorId, normalizedOperator, value, field.maxLevel);
    if (zeroClause) return zeroClause;
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
  private normalizeUqlComparisonOperator(operator: string): string {
    if (operator === '==' || operator === '=') return '=';
    if (operator === '<>') return '!=';
    return operator;
  }
  private normalizeRestoredUqlQuery(query: string): string {
    if (!query.trim()) return '';
    const displayLabels: Array<{ field: string; label: string }> = [
      { field: 'win_count', label: 'Wins' },
      { field: 'white_count', label: 'White count' },
      { field: 'main_white_count', label: 'Main white count' },
      { field: 'parent_rank', label: 'Rank' },
      { field: 'follower_num', label: 'Followers' },
      { field: 'account_id', label: 'Trainer ID' },
      { field: 'trainer_name', label: 'Trainer name' },
      { field: 'blue_stars_sum', label: 'Blue stars' },
      { field: 'pink_stars_sum', label: 'Pink stars' },
      { field: 'green_stars_sum', label: 'Green stars' },
      { field: 'white_stars_sum', label: 'White stars' },
      { field: 'main_blue_factors', label: 'Main blue sparks' },
      { field: 'main_pink_factors', label: 'Main pink sparks' },
      { field: 'main_green_factors', label: 'Main green sparks' }
    ];
    const comparisonLookahead = '(?=\\s*(?:==|=|!=|<>|>=|<=|>|<|in\\b|not\\s+in\\b|like\\b|ilike\\b|is\\b|between\\b))';

    return this.replaceOutsideStrings(query, segment => {
      let displaySegment = this.normalizeRestoredUqlSparkFunctions(segment);
      displaySegment = this.normalizeRestoredUqlScoringFunctions(displaySegment);
      displaySegment = this.normalizeRestoredUqlCharacterComparisons(displaySegment);
      displayLabels.forEach(({ field, label }) => {
        const pattern = new RegExp(`(^|[^A-Za-z0-9_])${this.escapeRegExp(field)}\\b${comparisonLookahead}`, 'gi');
        displaySegment = displaySegment.replace(pattern, (_match, leadingText: string) => `${leadingText}${label}`);
      });
      return displaySegment;
    });
  }

  private normalizeRestoredUqlSparkFunctions(segment: string): string {
    let displaySegment = segment.replace(/\boverlaps\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*\(([^()]*)\)\s*\)/gi, (match, fieldName: string, listText: string, offset: number, fullText: string) => {
      if (/\bnot\s*$/i.test(fullText.slice(Math.max(0, offset - 8), offset))) return match;
      return this.buildRestoredFriendlySparkClause(fieldName, this.parseUqlNumberList(listText)) ?? match;
    });
    displaySegment = displaySegment.replace(/\bcontains\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)/gi, (match, fieldName: string, rawValue: string, offset: number, fullText: string) => {
      if (/\bnot\s*$/i.test(fullText.slice(Math.max(0, offset - 8), offset))) return match;
      return this.buildRestoredFriendlySparkClause(fieldName, [parseInt(rawValue, 10)]) ?? match;
    });
    return displaySegment;
  }

  private normalizeRestoredUqlScoringFunctions(segment: string): string {
    return segment.replace(/\b(optional_white|optional_main_white|lineage_white)\s*\(((?:[^()]|\([^)]*\))*)\)/gi, (match, functionName: string, argsText: string) => {
      const normalizedFunction = functionName.toLowerCase() as 'optional_white' | 'optional_main_white' | 'lineage_white';
      const parsed = this.splitWhiteScoringFunctionArgs(argsText);
      if (!parsed) return match;
      const factorIds = this.parseUqlNumberList(parsed.skillList).filter(id => id > 0);
      if (!factorIds.length) return match;
      const values = factorIds.map(id => this.getFriendlyWhiteScoringUqlValue(id));
      const params = parsed.params.trim();
      return `${this.getFriendlyWhiteScoringFieldLabel(normalizedFunction)} in (${values.join(', ')}${params ? `, ${params}` : ''})`;
    });
  }

  private normalizeRestoredUqlCharacterComparisons(segment: string): string {
    const characterLabels: Record<string, string> = {
      main_chara_id: 'Main character',
      left_chara_id: 'GP1 character',
      right_chara_id: 'GP2 character'
    };
    const pattern = /(^|[^A-Za-z0-9_])(main_chara_id|left_chara_id|right_chara_id)\s*(not\s+in|in|==|=|!=|<>)\s*(?:\(([^()]*)\)|(\d+))/gi;
    return segment.replace(pattern, (match, leadingText: string, fieldName: string, operator: string, listText: string | undefined, rawValue: string | undefined) => {
      const values = listText !== undefined
        ? this.parseUqlNumberList(listText)
        : [parseInt(rawValue || '', 10)].filter(Number.isFinite);
      if (!values.length) return match;
      const normalizedOperator = this.normalizeUqlComparisonOperator(operator.toLowerCase().replace(/\s+/g, ' '));
      const formattedValues = values.map(id => this.formatFriendlyCharacterUqlValue(id));
      const label = characterLabels[fieldName.toLowerCase()];
      const valueText = normalizedOperator.includes('in') || formattedValues.length > 1
        ? `(${formattedValues.join(', ')})`
        : formattedValues[0];
      return `${leadingText}${label} ${normalizedOperator} ${valueText}`;
    });
  }

  private buildRestoredFriendlySparkClause(fieldName: string, sparkIds: number[]): string | null {
    const field = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const config = this.getRestoredSparkFieldConfig(field);
    if (!config || !sparkIds.length) return null;

    const availableIds = new Set(config.factors.map(factor => parseInt(String(factor.id), 10)).filter(Number.isFinite));
    if (!availableIds.size) return null;
    const uniqueSparkIds = [...new Set(sparkIds.filter(Number.isFinite))];
    const parsed = uniqueSparkIds
      .map(id => ({ id, factorId: Math.floor(id / 10), level: id % 10 }))
      .filter(entry => availableIds.has(entry.factorId) && entry.level >= 1 && entry.level <= config.maxCap);
    if (parsed.length !== uniqueSparkIds.length) return null;

    const factorIds = [...new Set(parsed.map(entry => entry.factorId))].sort((left, right) => left - right);
    const levels = [...new Set(parsed.map(entry => entry.level))].sort((left, right) => left - right);
    if (!this.areContiguousUqlSparkLevels(levels)) return null;

    const sparkIdSet = new Set(uniqueSparkIds);
    const expectedIds = factorIds.flatMap(factorId => levels.map(level => this.buildSparkId(factorId, level)));
    if (expectedIds.length !== sparkIdSet.size || !expectedIds.every(id => sparkIdSet.has(id))) return null;

    if (factorIds.length === 1) {
      const factor = config.factors.find(entry => parseInt(String(entry.id), 10) === factorIds[0]);
      const label = factor?.text?.trim();
      return label ? this.buildRestoredSparkLevelClause(label, levels[0], levels[levels.length - 1], config.maxCap) : null;
    }

    const usesEveryFactor = factorIds.length === availableIds.size && factorIds.every(id => availableIds.has(id));
    return usesEveryFactor
      ? this.buildRestoredSparkLevelClause(config.label, levels[0], levels[levels.length - 1], config.maxCap)
      : null;
  }

  private getRestoredSparkFieldConfig(fieldName: string): { label: string; factors: Array<{ id: number | string; text: string }>; maxCap: number } | null {
    switch (fieldName) {
      case 'blue_sparks':
        return { label: 'Blue sparks', factors: this.getRestoredSparkFactors('blue_sparks'), maxCap: 9 };
      case 'pink_sparks':
        return { label: 'Pink sparks', factors: this.getRestoredSparkFactors('pink_sparks'), maxCap: 9 };
      case 'green_sparks':
        return { label: 'Green sparks', factors: this.getRestoredSparkFactors('green_sparks'), maxCap: 9 };
      default:
        return null;
    }
  }

  private getRestoredSparkFactors(fieldName: FriendlySparkField['field']): Array<{ id: number | string; text: string }> {
    const loadedFactors = fieldName === 'blue_sparks'
      ? this.blueFactors
      : fieldName === 'pink_sparks'
        ? this.pinkFactors
        : this.greenFactors;
    if (loadedFactors.length) return loadedFactors;
    return this.friendlySparkFields
      .filter(field => field.field === fieldName)
      .map(field => ({ id: field.factorId, text: field.label }));
  }

  private areContiguousUqlSparkLevels(levels: number[]): boolean {
    return levels.length > 0 && levels.every((level, index) => index === 0 || level === levels[index - 1] + 1);
  }

  private buildRestoredSparkLevelClause(label: string, min: number, max: number, maxCap: number): string | null {
    if (min === max) return `${label} = ${min}`;
    if (max >= maxCap) return `${label} >= ${min}`;
    if (min <= 1) return `${label} <= ${max}`;
    return null;
  }
  private buildZeroSparkComparisonClause(fieldName: string, factorId: number, operator: string | undefined, value: number, maxLevel: number): string | null {
    if (!Number.isFinite(value) || value !== 0 || !operator) return null;
    const ids = this.rangeInclusive(1, maxLevel).map(level => this.buildSparkId(factorId, level));
    if (!ids.length) return null;
    const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const isArrayField = normalizedField.endsWith('_sparks') || normalizedField.endsWith('_white_factors');
    const anyMatch = isArrayField
      ? `overlaps(${fieldName}, (${ids.join(', ')}))`
      : `${fieldName} in (${ids.join(', ')})`;
    switch (operator) {
      case '=':
      case '<=':
        return `not ${anyMatch}`;
      case '!=':
      case '>':
        return anyMatch;
      case '<':
        return '(1 = 0)';
      case '>=':
        return '(1 = 1)';
      default:
        return null;
    }
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
    let result = '';
    let lastIndex = 0;
    for (let index = 0; index < query.length; index++) {
      if (!this.isUqlQuoteStart(query, index)) {
        continue;
      }

      const stringEnd = this.findUqlStringEnd(query, index);
      result += replaceSegment(query.slice(lastIndex, index));
      result += query.slice(index, stringEnd);
      lastIndex = stringEnd;
      index = stringEnd - 1;
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
      case 'blue_stars_sum':
      case 'pink_stars_sum':
      case 'green_stars_sum':
      case 'white_stars_sum':
        extraTerms.push('total sparks', 'total stars', 'lineage total', 'lineage spark total');
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
    if (field.field === 'support_card_id') return 1;
    if (field.field === 'limit_break_count') return 2;
    if (field.field === 'trainer_name' || field.field === 'account_id') return 4;
    if (field.type === 'string') return 6;
    if (['main_blue_factors', 'main_pink_factors', 'main_green_factors', 'left_blue_factors', 'left_pink_factors', 'left_green_factors', 'right_blue_factors', 'right_pink_factors', 'right_green_factors'].includes(field.field)) return 24;
    if (['win_count', 'white_count', 'follower_num', 'parent_rank', 'affinity', 'computed_race_affinity'].includes(field.field)) return 8;
    if (field.type === 'array') return 16;
    return 12;
  }

  private getFriendlyFieldSuggestionDetail(field: FriendlyFieldAlias): string {
    switch (field.field) {
      case 'blue_stars_sum':
        return 'blue_stars_sum; total blue stars across the lineage, e.g. Blue stars >= 9';
      case 'pink_stars_sum':
        return 'pink_stars_sum; total pink stars across the lineage, e.g. Pink stars >= 6';
      case 'green_stars_sum':
        return 'green_stars_sum; total green stars across the lineage';
      case 'white_stars_sum':
        return 'white_stars_sum; total white stars across the lineage';
      case 'main_blue_factors':
        return 'main_blue_factors; main slot blue category total, max 3. For a specific stat, use Main Speed >= 1';
      case 'main_pink_factors':
        return 'main_pink_factors; main slot pink category total, max 3. For a specific aptitude, use Main End Closer >= 1';
      case 'main_green_factors':
        return 'main_green_factors; main slot green category total, max 3. For a specific unique skill, use Main [skill] >= 1';
      case 'left_blue_factors':
      case 'right_blue_factors':
        return `${field.field}; category star count. For a specific stat, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} Speed >= 1`;
      case 'left_pink_factors':
      case 'right_pink_factors':
        return `${field.field}; category star count. For a specific aptitude, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} End Closer >= 1`;
      case 'left_green_factors':
      case 'right_green_factors':
        return `${field.field}; category star count. For a specific unique skill, use ${field.field.startsWith('left') ? 'GP1' : 'GP2'} [skill] >= 1`;
      default:
        return field.field;
    }
  }

  private getScopedSparkFieldSearchText(field: FriendlyScopedSparkField): string {
    const colorLabel = this.getUqlFactorColorLabel(field.valueContext);
    const coloredLabel = field.label.replace(/^(\S+)/, `$1 ${colorLabel}`);
    return [
      field.label,
      `${field.label} stars`,
      `${field.label} spark`,
      coloredLabel,
      `${coloredLabel} sparks`,
      `${coloredLabel} factors`,
      ...field.aliases
    ].join(' ');
  }

  private getUqlFactorColorLabel(context: UqlFactorValueContext): string {
    switch (context) {
      case 'blue-factor': return 'blue';
      case 'pink-factor': return 'pink';
      case 'green-factor': return 'green';
      case 'white-factor': return 'white';
    }
    return 'spark';
  }

  private getScopedSparkFieldPriority(field: FriendlyScopedSparkField): number {
    return field.valueContext === 'blue-factor' || field.valueContext === 'pink-factor' ? 7 : 28;
  }

  private getScopedSparkCategorySuggestions(): UqlSuggestion[] {
    return [
      {
        label: 'Great parent blue sparks',
        insertText: 'Great parent Blue Sparks',
        detail: 'left_blue_factors or right_blue_factors; max 3 stars on either great parent',
        matchPhrases: ['great parent blue sparks', 'great parent blue factors', 'grandparent blue sparks', 'grandparent blue factors', 'gp blue sparks', 'gp blue factors', 'any gp blue sparks', 'any gp blue factors'],
        valueContext: 'blue-factor' as const
      },
      {
        label: 'Great parent pink sparks',
        insertText: 'Great parent Pink Sparks',
        detail: 'left_pink_factors or right_pink_factors; max 3 stars on either great parent',
        matchPhrases: ['great parent pink sparks', 'great parent pink factors', 'grandparent pink sparks', 'grandparent pink factors', 'gp pink sparks', 'gp pink factors', 'any gp pink sparks', 'any gp pink factors'],
        valueContext: 'pink-factor' as const
      },
      {
        label: 'Great parent green sparks',
        insertText: 'Great parent Green Sparks',
        detail: 'left_green_factors or right_green_factors; max 3 stars on either great parent',
        matchPhrases: ['great parent green sparks', 'great parent green factors', 'great parent unique skills', 'grandparent green sparks', 'grandparent green factors', 'grandparent unique skills', 'gp green sparks', 'gp green factors', 'gp unique skills', 'any gp green sparks', 'any gp green factors', 'any gp unique skills'],
        valueContext: 'green-factor' as const
      }
    ].map(field => ({
      label: field.label,
      insertText: field.insertText,
      kind: 'field' as const,
      detail: field.detail,
      searchText: field.matchPhrases.join(' '),
      matchPhrases: field.matchPhrases,
      priority: 11,
      scopeContext: 'any-gp' as const,
      valueContext: field.valueContext,
      fieldType: 'number' as UqlFieldType
    }));
  }

  private getSyntaxSuggestionPriority(suggestion: UqlSuggestion): number {
    if (suggestion.kind === 'keyword') return 10;
    if (suggestion.kind === 'operator') return 12;
    return 70;
  }

  private updateUqlSuggestions(): void {
    if (this.staticUqlSuggestionsCache) {
      this.uqlSuggestions = [
        ...this.staticUqlSuggestionsCache,
        ...this.getOwnedLegacyUqlSuggestions()
      ];
      return;
    }
    const syntaxSuggestions: UqlSuggestion[] = [
      { label: 'where', insertText: 'where ', kind: 'keyword', detail: 'Start a filter expression' },
      { label: 'and', insertText: ' and ', kind: 'keyword', detail: 'Require both sides' },
      { label: 'or', insertText: ' or ', kind: 'keyword', detail: 'Match either side' },
      { label: 'not', insertText: 'not ', kind: 'keyword', detail: 'Negate a predicate' },
      { label: 'greater than or equal', insertText: '>= ', kind: 'operator', detail: 'At least' },
      { label: 'less than or equal', insertText: '<= ', kind: 'operator', detail: 'At most' },
      { label: 'equals', insertText: '= ', kind: 'operator', detail: 'Exact match' },
      { label: 'match list', insertText: 'in ()', kind: 'operator', detail: 'Match any listed value' },
      { label: 'omit list', insertText: 'not in ()', kind: 'operator', detail: 'Reject listed values' },
      { label: 'Parentheses', insertText: '(Speed >= 3 or Stamina >= 3)', kind: 'snippet', detail: 'Group OR logic' },
      { label: 'Modulo search', insertText: 'Wins % 2 = 0', kind: 'snippet', detail: 'Use arithmetic operators in numeric comparisons' },
      { label: 'Match list', insertText: 'Main character in (Special Week, Silence Suzuka)', kind: 'snippet', detail: 'Use in (...) for listed values' },
      { label: 'Omit list', insertText: 'Main character not in (Special Week, Silence Suzuka)', kind: 'snippet', detail: 'Use not in (...) for omitted values' },
      { label: 'has skill', insertText: 'has Right-Handed ○', kind: 'snippet', detail: 'Skill present on any parent' },
      { label: 'has any skills', insertText: 'has any (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'At least one skill present on any parent' },
      { label: 'has all skills', insertText: 'has all (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Every listed skill present across all parents' },
      { label: 'optional white skills', insertText: 'optional white in (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Require and rank global white skill matches' },
      { label: 'optional white priority group', insertText: 'optional white in (Right-Handed ○, Left-Handed ○, priority = 0)', kind: 'snippet', detail: 'Require and rank global white skill matches in priority group 0' },
      { label: 'optional main white skills', insertText: 'optional main white in (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Require and rank main-parent white skill matches' },
      { label: 'optional main white priority group', insertText: 'optional main white in (Right-Handed ○, Left-Handed ○, priority_group = 1)', kind: 'snippet', detail: 'Require and rank main-parent white skill matches in priority group 1' },
      { label: 'lineage white skills', insertText: 'lineage white in (Right-Handed ○, Left-Handed ○)', kind: 'snippet', detail: 'Sort by lineage-style white skill stacking' },
      { label: 'lineage white priority group', insertText: 'lineage white in (Right-Handed ○, Left-Handed ○, group = 2)', kind: 'snippet', detail: 'Sort by lineage-style white skill stacking in priority group 2' },
      { label: 'Main speed stars', insertText: 'Main Speed >= 3', kind: 'snippet', detail: 'Main slot Speed stars, max 3' },
      { label: 'GP1 speed stars', insertText: 'GP1 Speed >= 3', kind: 'snippet', detail: 'Great parent 1 Speed stars, max 3' },
      { label: 'GP2 speed stars', insertText: 'GP2 Speed >= 3', kind: 'snippet', detail: 'Great parent 2 Speed stars, max 3' },
      { label: 'Great parent speed stars', insertText: 'Great parent Speed >= 3', kind: 'snippet', detail: 'Either great parent has Speed stars, max 3' },
      { label: 'Main has skill', insertText: 'Main has Right-Handed ○', kind: 'snippet', detail: 'Specific white factor on the main slot' },
      { label: 'Great parent has skill', insertText: 'Great parent has Right-Handed ○', kind: 'snippet', detail: 'Either great parent has this white factor' },
    ];
    const friendlyFieldSuggestions: UqlSuggestion[] = [
      ...[
        { label: 'Target (ace)', insertText: 'target', detail: 'Editor context target character', matchPhrases: ['target', 'target ace', 'affinity target'], valueContext: 'character' as const },
        { label: 'Owned legacy', insertText: 'owned legacy = []', cursorOffset: -1, detail: 'Pick a legacy from your account', matchPhrases: ['owned legacy', 'legacy', 'your legacy', 'my legacy'], valueContext: 'legacy' as const }
      ].map(field => ({
        label: field.label,
        insertText: field.insertText || field.label,
        kind: 'field' as const,
        detail: field.detail,
        searchText: field.matchPhrases.join(' '),
        matchPhrases: field.matchPhrases,
        priority: 0,
        valueContext: field.valueContext,
        fieldType: 'directive' as UqlFieldType,
        cursorOffset: field.cursorOffset
      })),
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
        detail: this.getFriendlyFieldSuggestionDetail(alias),
        searchText: this.getFriendlyFieldSearchText(alias),
        matchPhrases: [alias.label, ...alias.aliases],
        priority: this.getFriendlyFieldPriority(alias),
        fieldType: alias.type,
        valueContext: this.getUqlValueContextForField(alias.field) || undefined
      })),
      ...this.getScopedSparkCategorySuggestions(),
      ...[
        { label: 'Optional white', detail: 'Ranks rows with these global white skill matches', matchPhrases: ['optional white', 'optional skills', 'optional white skills'] },
        { label: 'Optional main white', detail: 'Ranks rows with these main-parent white skill matches', matchPhrases: ['optional main white', 'optional parent white', 'optional main skills'] },
        { label: 'Lineage white', detail: 'Ranks rows by lineage-style white skill stacking', matchPhrases: ['lineage white', 'lineage skills', 'lineage white skills'] }
      ].map(field => ({
        label: field.label,
        insertText: field.label,
        kind: 'field' as const,
        detail: field.detail,
        searchText: field.matchPhrases.join(' '),
        matchPhrases: field.matchPhrases,
        priority: 13,
        valueContext: 'white-factor' as const,
        fieldType: 'array' as UqlFieldType
      })),
      ...[
        { label: 'Main', detail: 'main_white_factors; white factors on the main slot', searchText: 'main parent main has parent has', matchPhrases: ['main', 'parent', 'main parent'], scopeContext: 'main' as const },
        { label: 'GP1', detail: 'left_white_factors; white factors on great parent 1', searchText: 'gp1 left grandparent 1 grand parent 1 great parent 1 left has', matchPhrases: ['gp1', 'left', 'left parent', 'grandparent 1', 'grand parent 1', 'great parent 1'], scopeContext: 'gp1' as const },
        { label: 'GP2', detail: 'right_white_factors; white factors on great parent 2', searchText: 'gp2 right grandparent 2 grand parent 2 great parent 2 right has', matchPhrases: ['gp2', 'right', 'right parent', 'grandparent 2', 'grand parent 2', 'great parent 2'], scopeContext: 'gp2' as const },
        { label: 'Any GP', detail: 'left_white_factors or right_white_factors; white factors on either great parent', searchText: 'gp any gp grandparent grand parent great parent any grandparent any great parent has', matchPhrases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], scopeContext: 'any-gp' as const },
        { label: 'Great parent', detail: 'left_white_factors or right_white_factors; white factors on either great parent', searchText: 'gp any gp grandparent grand parent great parent any grandparent any great parent has', matchPhrases: ['gp', 'any gp', 'grandparent', 'grand parent', 'great parent', 'any grandparent', 'any grand parent', 'any great parent'], scopeContext: 'any-gp' as const }
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
      ...this.getScopedSparkFields().filter(field => field.valueContext !== 'green-factor').map(field => ({
        label: field.label,
        insertText: field.label,
        kind: 'field' as const,
        detail: `${field.fields.map(entry => entry.field).join(' or ')}; max 3 stars on a specific slot; compare a named factor like Main End Closer >= 1`,
        searchText: this.getScopedSparkFieldSearchText(field),
        matchPhrases: [field.label, ...field.aliases],
        priority: this.getScopedSparkFieldPriority(field),
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
    const supportCardSuggestions = SUPPORT_CARDS.map(card => {
      const typeLabel = this.getSupportCardTypeDisplay(card.type);
      const rarityLabel = this.getSupportCardRarityDisplay(card.rarity);
      const displayLabel = `${card.name} [${rarityLabel}] (${typeLabel})`;
      return {
        label: displayLabel,
        insertText: displayLabel,
        kind: 'value' as const,
        detail: `Support card id ${card.id}`,
        searchText: `${card.name} ${typeLabel} ${rarityLabel} ${card.id} ${card.rarity} ${card.type}`,
        matchPhrases: [card.name, `${card.name} (${typeLabel})`, displayLabel],
        valueContext: 'support-card' as const,
        priority: 2,
        backendValue: card.id,
        imageUrl: card.imageUrl,
        rarityClass: rarityLabel.toLowerCase()
      };
    });
    const raceSaddleSuggestions = this.getUqlRaceSaddleValues().map(race => ({
      label: race.label,
      insertText: race.label,
      kind: 'value' as const,
      detail: `${race.gradeLabel ? `${race.gradeLabel} · ` : ''}Win saddle ids ${race.saddleIds.join(', ')}`,
      searchText: race.searchText,
      matchPhrases: [race.label, ...race.aliases],
      valueContext: 'race-saddle' as const,
      priority: 8,
      backendValue: race.saddleIds.join(', '),
      badgeText: race.gradeLabel,
      badgeClass: race.gradeClass
    }));
    const rankSuggestions = this.rankOptions.map(rank => ({
      label: `Rank ${rank}`,
      insertText: rank.toString(),
      kind: 'value' as const,
      detail: `Minimum parent rank ${rank}`,
      searchText: `rank parent rank ${rank}`,
      valueContext: 'rank' as const,
      priority: 4,
      backendValue: rank.toString(),
      imageUrl: this.getRankIconPath(rank)
    }));
    const ownedLegacySuggestions = this.getOwnedLegacyUqlSuggestions();
    this.staticUqlSuggestionsCache = [
      ...friendlyFieldSuggestions,
      ...syntaxSuggestions.map(suggestion => ({ ...suggestion, priority: this.getSyntaxSuggestionPriority(suggestion) })),
      ...characterSuggestions,
      ...supportCardSuggestions,
      ...raceSaddleSuggestions,
      ...rankSuggestions,
      ...factorSuggestions
    ];
    this.uqlSuggestions = [
      ...this.staticUqlSuggestionsCache,
      ...ownedLegacySuggestions
    ];
  }

  private getOwnedLegacyUqlSuggestions(): UqlSuggestion[] {
    const suggestions: UqlSuggestion[] = [];
    const seen = new Set<string>();
    const addLegacySuggestion = (accountId: string, veteran: VeteranMember, accountLabel = accountId): void => {
      const veteranId = this.getVeteranUuid(veteran);
      const localIdentity = veteran.share_local_id ?? veteran.share_inheritance_id;
      if (!accountId && veteran.member_id == null && !veteranId && localIdentity == null && !veteran.share_source) return;
      const label = this.getOwnedLegacyUqlDisplayValue(accountId, veteran);
      const name = this.getVeteranName(veteran);
      const identity = veteranId
        ? `veteran:${veteranId}`
        : veteran.member_id != null
          ? `member:${accountId}:${veteran.member_id}`
          : accountId
            ? `account:${accountId}`
            : `${veteran.share_source ?? 'selected'}:${localIdentity ?? label}`;
      if (seen.has(identity)) return;
      seen.add(identity);
      const idText = veteranId
        || (veteran.member_id != null ? veteran.member_id.toString() : '')
        || accountId
        || (localIdentity != null ? String(localIdentity) : veteran.share_source ?? 'selected');
      const detail = veteranId
        ? `${accountLabel} - veteran ${veteranId}`
        : veteran.member_id != null
          ? `${accountLabel || 'Selected legacy'} - member ${veteran.member_id}`
          : accountId
            ? `${accountLabel} - account ${accountId}`
            : veteran.share_source === 'manual'
              ? 'Manual legacy'
              : veteran.share_source === 'partner'
                ? 'Practice partner'
                : veteran.share_source === 'bookmark'
                  ? 'Bookmarked legacy'
                  : 'Selected legacy';
      suggestions.push({
        label,
        insertText: `[${label}]`,
        kind: 'value' as const,
        detail,
        searchText: `${name} ${label} ${accountLabel} ${accountId} ${idText}`,
        matchPhrases: [label, name, `${name} ${idText}`],
        valueContext: 'legacy' as const,
        priority: 1,
        backendValue: veteranId || (veteran.member_id != null ? `${accountId}:${veteran.member_id}` : accountId || undefined),
        imageUrl: this.getVeteranUqlCharacterImage(veteran)
      });
    };
    if (this.selectedVeteran) {
      const accountId = this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran);
      addLegacySuggestion(accountId, this.selectedVeteran, accountId);
    }
    return suggestions;
  }

  private getScopeContextForLabel(label: string): UqlSuggestion['scopeContext'] {
    const normalized = label.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:main|parent|main parent)\b/.test(normalized)) return 'main';
    if (/^(?:gp1|left|left parent|grandparent 1|grand parent 1|great parent 1)\b/.test(normalized)) return 'gp1';
    if (/^(?:gp2|right|right parent|grandparent 2|grand parent 2|great parent 2)\b/.test(normalized)) return 'gp2';
    if (/^(?:gp|any gp|grandparent|grand parent|great parent|any grandparent|any grand parent|any great parent)\b/.test(normalized)) return 'any-gp';
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
  private getEditableUqlQuery(): string {
    return (this.uqlQuery || '').replace(/^\s*where\b\s*/i, '');
  }
  private setUqlValidation(state: UqlValidationState, message: string, issue: UqlValidationIssue | null = null): void {
    this.uqlValidationState = state;
    this.uqlValidationMessage = message;
    this.uqlValidationIssue = issue;
  }
  private createUqlValidationIssue(
    query: string,
    state: Extract<UqlValidationState, 'incomplete' | 'invalid'>,
    message: string,
    from: number,
    to: number,
  ): UqlValidationIssue {
    const length = query.length;
    const issueFrom = Math.max(0, Math.min(length, from));
    const issueTo = Math.max(issueFrom + 1, Math.min(length, to));
    return {
      from: issueFrom,
      to: Math.min(length, issueTo),
      message,
      state,
    };
  }
  private getTrailingUqlIssueRange(query: string): [number, number] {
    const trimmedEnd = query.replace(/\s+$/g, '').replace(/;\s*$/g, '');
    const match = trimmedEnd.match(/\S+$/);
    if (!match || match.index === undefined) return [Math.max(0, query.length - 1), query.length];
    return [match.index, match.index + match[0].length];
  }
  private getEmptyUqlValueListRange(query: string): [number, number] {
    const patterns = [
      /(?:^|[\s(])(?:has\s+any|has\s+all|contains\s+any|contains\s+all|not\s+in|in)\s*(\(\s*\))/i,
      /\b(?:overlaps|has_all|contains_all|all)\s*\(\s*[^,()]+\s*,\s*(\(\s*\))/i,
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(query);
      if (!match?.[1] || match.index === undefined) continue;
      const from = match.index + match[0].indexOf(match[1]);
      return [from, from + match[1].length];
    }
    return this.getTrailingUqlIssueRange(query);
  }
  private getUnknownIdentifierIssueRange(query: string, unknownIdentifier: string): [number, number] {
    const identifier = unknownIdentifier.replace(/\(\)$/g, '');
    const escaped = this.escapeRegExp(identifier);
    const pattern = new RegExp(`(^|[^A-Za-z0-9_.])(${escaped})(?=[^A-Za-z0-9_.]|$)`, 'i');
    const match = pattern.exec(query);
    if (match?.[2] && match.index !== undefined) {
      const from = match.index + match[0].indexOf(match[2]);
      return [from, from + match[2].length];
    }
    return this.getTrailingUqlIssueRange(query);
  }
  private getUqlDelimiterIssue(query: string): UqlDelimiterIssue | null {
    let quoteCharacter: string | null = null;
    let quoteStart = -1;
    const openParentheses: number[] = [];
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
      if (this.isUqlQuoteStart(query, index)) {
        quoteCharacter = character;
        quoteStart = index;
      } else if (character === '(') {
        openParentheses.push(index);
      } else if (character === ')') {
        if (!openParentheses.length) return { kind: 'closing-paren', from: index, to: index + 1 };
        openParentheses.pop();
      }
    }
    if (quoteCharacter) return { kind: 'unterminated-string', from: Math.max(0, quoteStart), to: query.length };
    if (openParentheses.length > 0) {
      const from = openParentheses[openParentheses.length - 1];
      return { kind: 'open-paren', from, to: from + 1 };
    }
    return null;
  }
  private endsWithIncompleteUqlToken(expression: string): boolean {
    const trimmedExpression = expression.replace(/;\s*$/, '').trim();
    return /(?:\bwhere\b|\band\b|\bor\b|\bnot\b|\bin\b|\bbetween\b|\blike\b|\bilike\b|\bmod\b|\bhas\b|\bhas\s+any\b|\bhas\s+all\b|\bdoes\s+not\s+have\b|\bcontains\b|\bcontains\s+any\b|\bcontains\s+all\b|[,(+\-*\/%]|=|!=|<>|<=|>=|<|>)$/i.test(trimmedExpression);
  }
  private hasEmptyUqlValueList(expression: string): boolean {
    return /(?:^|[\s(])(?:has\s+any|has\s+all|contains\s+any|contains\s+all|not\s+in|in)\s*\(\s*\)(?=\s*(?:\)|;|$|\band\b|\bor\b))/i.test(expression)
      || /\b(?:overlaps|has_all|contains_all|all)\s*\(\s*[^,()]+\s*,\s*\(\s*\)\s*\)/i.test(expression);
  }
  private findInvalidCompiledUqlSyntax(query: string): { message: string; from: number; to: number } | null {
    const message = 'IN lists only accept literal values, not nested functions';
    const queryWithoutStrings = this.replaceUqlStrings(query, match => ' '.repeat(match.length));
    const inPattern = /\b(?:not\s+)?in\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = inPattern.exec(queryWithoutStrings)) !== null) {
      const openParenIndex = queryWithoutStrings.indexOf('(', match.index);
      if (openParenIndex < 0) continue;
      let depth = 0;
      let closeParenIndex = -1;
      for (let index = openParenIndex; index < queryWithoutStrings.length; index++) {
        const character = queryWithoutStrings[index];
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth === 0) {
          closeParenIndex = index;
          break;
        }
      }
      if (closeParenIndex < 0) break;
      const listText = queryWithoutStrings.slice(openParenIndex + 1, closeParenIndex);
      if (/[()]/.test(listText)) {
        const nestedOffset = listText.search(/[()]/);
        const from = nestedOffset >= 0 ? openParenIndex + 1 + nestedOffset : openParenIndex;
        return { message, from, to: from + 1 };
      }
      inPattern.lastIndex = closeParenIndex + 1;
    }
    return null;
  }
  private findInvalidUqlSyntaxIssue(query: string): { message: string; from: number; to: number } | null {
    return this.findInvalidCompiledUqlSyntax(query);
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

  private applyCompiledUqlToStructuredFilters(compiledQuery: string): { appliedAny: boolean; fullyRepresented: boolean } {
    const expression = this.stripLeadingWhere(compiledQuery);
    const clauses = this.splitTopLevelConjunctions(expression);
    if (!clauses.length) return { appliedAny: false, fullyRepresented: false };

    this.clearUqlRepresentableStructuredFilters();
    let appliedAny = false;
    let unhandledCount = 0;
    const pendingExcludeParentIds: { left?: number[]; right?: number[] } = {};

    for (const clause of clauses) {
      const trimmedClause = this.stripOuterParens(clause.trim());
      if (!trimmedClause) continue;
      if (this.applyNumericUqlClauseToStructuredFilters(trimmedClause)) { appliedAny = true; continue; }
      if (this.applySearchUqlClauseToStructuredFilters(trimmedClause)) { appliedAny = true; continue; }
      if (this.applySupportCardUqlClauseToStructuredFilters(trimmedClause)) { appliedAny = true; continue; }
      if (this.applyFactorUqlClauseToStructuredFilters(trimmedClause)) { appliedAny = true; continue; }
      if (this.applyCharacterUqlClauseToStructuredFilters(trimmedClause, pendingExcludeParentIds)) { appliedAny = true; continue; }
      unhandledCount++;
    }

    const pairedExcludeParentIds = this.getSharedNumberList(pendingExcludeParentIds.left, pendingExcludeParentIds.right);
    if (pairedExcludeParentIds.length) {
      this.excludeParentCharacters = pairedExcludeParentIds.map(id => this.toCharacterSelection(id));
      appliedAny = true;
    }

    return { appliedAny, fullyRepresented: appliedAny && unhandledCount === 0 };
  }

  private applyNumericUqlClauseToStructuredFilters(clause: string): boolean {
    const minimumMatch = clause.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*>=\s*(\d+)$/i);
    if (minimumMatch) {
      const field = minimumMatch[1].toLowerCase();
      const value = parseInt(minimumMatch[2], 10);
      switch (field) {
        case 'win_count': this.filterState.min_win_count = value; return true;
        case 'white_count': this.filterState.min_white_count = value; return true;
        case 'main_white_count': this.filterState.min_main_white_count = value; return true;
        case 'parent_rank': this.filterState.parent_rank = value; return true;
        case 'blue_stars_sum': this.filterState.min_blue_stars_sum = value; return true;
        case 'pink_stars_sum': this.filterState.min_pink_stars_sum = value; return true;
        case 'green_stars_sum': this.filterState.min_green_stars_sum = value; return true;
        case 'white_stars_sum': this.filterState.min_white_stars_sum = value; return true;
        case 'main_blue_factors': this.mainBlueFactorFilters = [this.createAnyFactorFilter(value, 3)]; return true;
        case 'main_pink_factors': this.mainPinkFactorFilters = [this.createAnyFactorFilter(value, 3)]; return true;
        case 'main_green_factors': this.mainGreenFactorFilters = [this.createAnyFactorFilter(value, 3)]; return true;
      }
    }

    const followerMatch = clause.match(/^follower_num\s*<=\s*(\d+)$/i);
    if (followerMatch) {
      this.filterState.max_follower_num = parseInt(followerMatch[1], 10);
      this.includeMaxFollowers = this.filterState.max_follower_num >= 1000;
      this.maxFollowersToggled.emit(this.includeMaxFollowers);
      return true;
    }

    return false;
  }

  private applySearchUqlClauseToStructuredFilters(clause: string): boolean {
    const accountMatch = clause.match(/^account_id\s*=\s*'((?:''|[^'])*)'$/i);
    if (accountMatch) {
      this.searchUserId = accountMatch[1].replace(/''/g, "'");
      return true;
    }
    const trainerNameMatch = clause.match(/^trainer_name\s+ilike\s+'%?((?:''|[^'])*)%?'$/i);
    if (trainerNameMatch) {
      this.searchUsername = trainerNameMatch[1].replace(/''/g, "'").replace(/^%|%$/g, '');
      return true;
    }
    return false;
  }

  private applySupportCardUqlClauseToStructuredFilters(clause: string): boolean {
    const supportCardMatch = clause.match(/^(?:has_)?support_card\s*\((.*)\)$/i);
    if (!supportCardMatch) return false;
    const args = this.splitUqlListValues(supportCardMatch[1]);
    let supportCardId: number | undefined;
    let limitBreak: number | undefined;
    for (const arg of args) {
      const trimmedArg = arg.trim();
      const idMatch = trimmedArg.match(/^(?:(?:id|card_id|support_card_id)\s*=\s*)?(\d+)$/i);
      if (idMatch && supportCardId === undefined) {
        supportCardId = parseInt(idMatch[1], 10);
        continue;
      }
      const lbMatch = trimmedArg.match(/^(?:lb|limitbreak|limit_break|limit_break_count)\s*>=\s*(\d+)$/i);
      if (lbMatch) limitBreak = parseInt(lbMatch[1], 10);
    }
    if (supportCardId !== undefined) this.restoreSelectedSupportCard(supportCardId);
    if (limitBreak !== undefined) this.selectedLimitBreak = Math.max(0, Math.min(4, limitBreak));
    return supportCardId !== undefined || limitBreak !== undefined;
  }

  private applyFactorUqlClauseToStructuredFilters(clause: string): boolean {
    const scoringMatch = clause.match(/^(optional_white|optional_main_white|lineage_white)\s*\(((?:[^()]|\([^)]*\))*)\)$/i);
    if (scoringMatch) {
      const factorIds = this.parseUqlScoringFactorIds(scoringMatch[2]);
      if (!factorIds.length) return false;
      const priority = this.parseUqlScoringPriority(scoringMatch[2]);
      const functionName = scoringMatch[1].toLowerCase();
      const target = functionName === 'optional_main_white'
        ? this.optionalMainWhiteFactorFilters
        : functionName === 'lineage_white'
          ? this.lineageWhiteFactorFilters
          : this.optionalWhiteFactorFilters;
      const optionTarget = functionName === 'optional_main_white'
        ? this.filteredOptionalMainWhiteFactorOptions
        : functionName === 'lineage_white'
          ? this.filteredLineageWhiteFactorOptions
          : this.filteredOptionalWhiteFactorOptions;
      factorIds.forEach(factorId => this.addRestoredWhiteScoringFilter(target, optionTarget, factorId, priority));
      return true;
    }

    const containsMatch = clause.match(/^contains\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(\d+)\s*\)$/i);
    if (containsMatch) {
      return this.applySparkIdGroupToStructuredFilters(containsMatch[1], [parseInt(containsMatch[2], 10)]);
    }
    const overlapsMatch = clause.match(/^overlaps\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*\(([^()]*)\)\s*\)$/i);
    if (overlapsMatch) {
      return this.applySparkIdGroupToStructuredFilters(overlapsMatch[1], this.parseUqlNumberList(overlapsMatch[2]));
    }
    return false;
  }

  private clearUqlRepresentableStructuredFilters(): void {
    const mainParent = this.treeData.children?.[0];
    if (mainParent) {
      mainParent.name = 'Parent 1';
      mainParent.image = undefined;
      mainParent.characterId = undefined;
      if (mainParent.children?.[0]) {
        mainParent.children[0].name = 'Great parent 1';
        mainParent.children[0].image = undefined;
        mainParent.children[0].characterId = undefined;
      }
      if (mainParent.children?.[1]) {
        mainParent.children[1].name = 'Great parent 2';
        mainParent.children[1].image = undefined;
        mainParent.children[1].characterId = undefined;
      }
    }
    this.includeMainParentCharacters = [];
    this.includeParentCharacters = [];
    this.excludeParentCharacters = [];
    this.excludeMainParentCharacters = [];
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
    this.filteredOptionalWhiteFactorOptions = [];
    this.filteredOptionalMainWhiteFactorOptions = [];
    this.filteredLineageWhiteFactorOptions = [];
    this.selectedSupportCard = null;
    this.selectedLimitBreak = 0;
    this.searchUserId = '';
    this.searchUsername = '';
    this.includeMaxFollowers = false;
    this.filterState.min_win_count = undefined;
    this.filterState.min_white_count = undefined;
    this.filterState.min_main_white_count = undefined;
    this.filterState.parent_rank = undefined;
    this.filterState.max_follower_num = undefined;
    this.filterState.min_blue_stars_sum = undefined;
    this.filterState.min_pink_stars_sum = undefined;
    this.filterState.min_green_stars_sum = undefined;
    this.filterState.min_white_stars_sum = undefined;
  }

  private applyCharacterUqlClauseToStructuredFilters(clause: string, pendingExcludeParentIds: { left?: number[]; right?: number[] }): boolean {
    const globalIncludeMatch = clause.match(/^main_chara_id\s+in\s*\(([^()]*)\)\s+or\s+left_chara_id\s+in\s*\(([^()]*)\)\s+or\s+right_chara_id\s+in\s*\(([^()]*)\)$/i);
    if (globalIncludeMatch) {
      const values = this.getSharedNumberList(
        this.parseUqlNumberList(globalIncludeMatch[1]),
        this.getSharedNumberList(this.parseUqlNumberList(globalIncludeMatch[2]), this.parseUqlNumberList(globalIncludeMatch[3]))
      );
      this.includeMainParentCharacters = values.map(id => this.toCharacterSelection(id));
      this.includeParentCharacters = values.map(id => this.toCharacterSelection(id));
      return true;
    }

    const globalExcludeMatch = clause.match(/^main_chara_id\s+not\s+in\s*\(([^()]*)\)\s+and\s+left_chara_id\s+not\s+in\s*\(([^()]*)\)\s+and\s+right_chara_id\s+not\s+in\s*\(([^()]*)\)$/i);
    if (globalExcludeMatch) {
      const values = this.getSharedNumberList(
        this.parseUqlNumberList(globalExcludeMatch[1]),
        this.getSharedNumberList(this.parseUqlNumberList(globalExcludeMatch[2]), this.parseUqlNumberList(globalExcludeMatch[3]))
      );
      this.excludeMainParentCharacters = values.map(id => this.toCharacterSelection(id));
      this.excludeParentCharacters = values.map(id => this.toCharacterSelection(id));
      return true;
    }

    const gpIncludeMatch = clause.match(/^left_chara_id\s+in\s*\(([^()]*)\)\s+or\s+right_chara_id\s+in\s*\(([^()]*)\)$/i);
    if (gpIncludeMatch) {
      const values = this.getSharedNumberList(this.parseUqlNumberList(gpIncludeMatch[1]), this.parseUqlNumberList(gpIncludeMatch[2]));
      this.includeParentCharacters = values.map(id => this.toCharacterSelection(id));
      return true;
    }

    const gpExcludeMatch = clause.match(/^left_chara_id\s+not\s+in\s*\(([^()]*)\)\s+and\s+right_chara_id\s+not\s+in\s*\(([^()]*)\)$/i);
    if (gpExcludeMatch) {
      const values = this.getSharedNumberList(this.parseUqlNumberList(gpExcludeMatch[1]), this.parseUqlNumberList(gpExcludeMatch[2]));
      this.excludeParentCharacters = values.map(id => this.toCharacterSelection(id));
      return true;
    }

    const comparisonMatch = clause.match(/^(main_chara_id|left_chara_id|right_chara_id)\s*(=|!=|<>|in|not\s+in)\s*(?:\(([^()]*)\)|(\d+))$/i);
    if (!comparisonMatch) return false;
    const field = comparisonMatch[1].toLowerCase();
    const operator = comparisonMatch[2].toLowerCase().replace(/\s+/g, ' ');
    const values = comparisonMatch[3]
      ? this.parseUqlNumberList(comparisonMatch[3])
      : [parseInt(comparisonMatch[4], 10)];
    if (!values.length) return false;

    if (field === 'main_chara_id') {
      if (operator === '=' || operator === 'in') {
        this.includeMainParentCharacters = values.map(id => this.toCharacterSelection(id));
      } else {
        this.excludeMainParentCharacters = values.map(id => this.toCharacterSelection(id));
      }
      return true;
    }

    if (operator === '=' || operator === 'in') {
      const node = field === 'left_chara_id'
        ? this.treeData.children?.[0]?.children?.[0]
        : this.treeData.children?.[0]?.children?.[1];
      if (node) this.setTreeNodeCharacter(node, values[0]);
      return true;
    }

    if (field === 'left_chara_id') pendingExcludeParentIds.left = values;
    if (field === 'right_chara_id') pendingExcludeParentIds.right = values;
    return true;
  }

  private applySparkIdGroupToStructuredFilters(fieldName: string, sparkIds: number[]): boolean {
    const field = fieldName.toLowerCase();
    const target = field === 'blue_sparks' ? this.blueFactorFilters
      : field === 'pink_sparks' ? this.pinkFactorFilters
      : field === 'green_sparks' ? this.greenFactorFilters
      : field === 'white_sparks' ? this.whiteFactorFilters
      : field === 'main_white_factors' || field === 'main_white_sparks' ? this.mainWhiteFactorFilters
      : null;
    const availableFactors = field === 'blue_sparks' ? this.blueFactors
      : field === 'pink_sparks' ? this.pinkFactors
      : field === 'green_sparks' ? this.greenFactors
      : field === 'white_sparks' || field === 'main_white_factors' || field === 'main_white_sparks' ? this.whiteFactors
      : null;
    if (!target || !availableFactors) return false;
    const filter = this.createFactorFilterFromSparkIds(sparkIds, availableFactors, field.startsWith('main_') ? 3 : 9);
    if (!filter) return false;
    target.push(filter);
    return true;
  }

  private createFactorFilterFromSparkIds(sparkIds: number[], availableFactors: any[], maxCap: number): FactorFilter | null {
    const parsed = sparkIds
      .map(id => ({ factorId: Math.floor(id / 10), level: id % 10 }))
      .filter(entry => entry.level > 0 && entry.level <= maxCap);
    if (!parsed.length) return null;
    const factorIds = [...new Set(parsed.map(entry => entry.factorId))];
    const levels = [...new Set(parsed.map(entry => entry.level))].sort((left, right) => left - right);
    const availableIds = new Set(availableFactors.map(factor => parseInt(factor.id, 10)));
    const factorId = factorIds.length === 1
      ? factorIds[0]
      : factorIds.every(id => availableIds.has(id)) ? null : undefined;
    if (factorId === undefined) return null;
    return {
      uuid: this.getUuid(),
      factorId,
      min: levels[0],
      max: levels[levels.length - 1]
    };
  }

  private createAnyFactorFilter(min: number, max: number): FactorFilter {
    return {
      uuid: this.getUuid(),
      factorId: null,
      min,
      max
    };
  }

  private restoreSelectedSupportCard(id: number): void {
    this.supportCardService.getSupportCards().subscribe((cards: SupportCardShort[]) => {
      const card = cards.find((entry: SupportCardShort) => entry.id.toString() === id.toString());
      if (!card) return;
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
    });
  }

  private splitTopLevelConjunctions(expression: string): string[] {
    const clauses: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let start = 0;
    for (let index = 0; index < expression.length; index++) {
      const character = expression[index];
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (this.isUqlQuoteStart(expression, index)) { quote = character; continue; }
      if (character === '(') { depth++; continue; }
      if (character === ')') { depth--; continue; }
      if (depth !== 0) continue;
      const match = expression.slice(index).match(/^\s+and\s+/i);
      if (!match) continue;
      clauses.push(expression.slice(start, index).trim());
      index += match[0].length - 1;
      start = index + 1;
    }
    clauses.push(expression.slice(start).trim());
    return clauses.filter(Boolean);
  }

  private parseUqlNumberList(listText: string): number[] {
    return listText.split(',').map(value => parseInt(value.trim(), 10)).filter(value => Number.isFinite(value));
  }

  private getSharedNumberList(left: number[] | undefined, right: number[] | undefined): number[] {
    if (!left?.length || !right?.length) return [];
    const rightSet = new Set(right);
    return [...new Set(left.filter(value => rightSet.has(value)))];
  }

  private toCharacterSelection(rawId: number): { id: number; name: string; image?: string } {
    const id = this.resolveUqlCharacterSelectionId(rawId);
    const character = getMasterCharacterById(id);
    return character
      ? { id, name: character.name || `ID: ${id}`, image: character.image }
      : { id, name: `ID: ${id}` };
  }

  private resolveUqlCharacterSelectionId(rawId: number): number {
    if (getMasterCharacterById(rawId)) return rawId;
    const variants = CHARACTERS.filter(character => Math.floor(character.id / 100) === rawId);
    const originalVariant = variants.find(character => this.getCharacterSkinName(character.id) === 'Original');
    const matchingVariant = originalVariant || variants.find(character => character.id % 100 === 1) || variants[0];
    return matchingVariant?.id ?? rawId;
  }

  private setTreeNodeCharacter(node: TreeNode, rawId: number): void {
    const selection = this.toCharacterSelection(rawId);
    node.characterId = selection.id;
    node.name = selection.name;
    node.image = selection.image;
  }

  private stripOuterParens(value: string): string {
    let text = value.trim();
    while (text.startsWith('(') && text.endsWith(')')) {
      let depth = 0;
      let wrapsWholeText = true;
      for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (character === '(') depth++;
        if (character === ')') depth--;
        if (depth === 0 && index < text.length - 1) {
          wrapsWholeText = false;
          break;
        }
      }
      if (!wrapsWholeText) break;
      text = text.slice(1, -1).trim();
    }
    return text;
  }

  private buildStructuredUqlExpression(): string {
    const clauses: string[] = [];
    const addMinimumClause = (fieldLabel: string, value: number | undefined) => {
      if (value !== undefined && value > 0) clauses.push(`${fieldLabel} >= ${value}`);
    };
    const addCharacterClause = (fieldLabel: string, values: Array<number | undefined>, negated = false) => {
      const uniqueValues = this.getUniqueNumbers(values);
      if (!uniqueValues.length) return;
      const formattedValues = uniqueValues.map(id => this.formatFriendlyCharacterUqlValue(id));
      if (formattedValues.length === 1) {
        clauses.push(`${fieldLabel} ${negated ? '!=' : '='} ${formattedValues[0]}`);
      } else {
        clauses.push(`${fieldLabel} ${negated ? 'not in' : 'in'} (${formattedValues.join(', ')})`);
      }
    };
    const mainParent = this.treeData.children?.[0];
    addCharacterClause('Main character', [
      mainParent?.characterId,
      ...this.includeMainParentCharacters.map(character => character.id)
    ]);
    addCharacterClause('GP1 character', [mainParent?.children?.[0]?.characterId]);
    addCharacterClause('GP2 character', [mainParent?.children?.[1]?.characterId]);
    const includeParentIds = this.getUniqueNumbers(this.includeParentCharacters.map(character => character.id));
    addCharacterClause('GP character', includeParentIds);
    const excludeParentIds = this.getUniqueNumbers(this.excludeParentCharacters.map(character => character.id));
    addCharacterClause('GP character', excludeParentIds, true);
    const excludeMainParentIds = this.getUniqueNumbers(this.excludeMainParentCharacters.map(character => character.id));
    if (excludeMainParentIds.length) {
      addCharacterClause('Main character', excludeMainParentIds, true);
    }
    this.appendFactorFilterUqlClauses(clauses, this.blueFactorFilters, this.blueFactors, 'blue_sparks');
    this.appendFactorFilterUqlClauses(clauses, this.pinkFactorFilters, this.pinkFactors, 'pink_sparks');
    this.appendFactorFilterUqlClauses(clauses, this.greenFactorFilters, this.greenFactors, 'green_sparks');
    this.appendFactorFilterUqlClauses(clauses, this.whiteFactorFilters, this.whiteFactors, 'white_sparks');
    this.appendFactorFilterUqlClauses(clauses, this.mainBlueFactorFilters, this.blueFactors, 'main_blue_factors', 'Main ', 3);
    this.appendFactorFilterUqlClauses(clauses, this.mainPinkFactorFilters, this.pinkFactors, 'main_pink_factors', 'Main ', 3);
    this.appendFactorFilterUqlClauses(clauses, this.mainGreenFactorFilters, this.greenFactors, 'main_green_factors', 'Main ', 3);
    this.appendFactorFilterUqlClauses(clauses, this.mainWhiteFactorFilters, this.whiteFactors, 'main_white_factors', 'Main ', 3);
    this.appendPriorityScoringUqlClauses(clauses, this.optionalWhiteFactorFilters, 'optional_white');
    this.appendPriorityScoringUqlClauses(clauses, this.optionalMainWhiteFactorFilters, 'optional_main_white');
    this.appendPriorityScoringUqlClauses(clauses, this.lineageWhiteFactorFilters, 'lineage_white');
    if (!this.mainBlueFactorFilters.length) addMinimumClause('Main blue sparks', this.filterState.min_main_blue_factors);
    if (!this.mainPinkFactorFilters.length) addMinimumClause('Main pink sparks', this.filterState.min_main_pink_factors);
    if (!this.mainGreenFactorFilters.length) addMinimumClause('Main green sparks', this.filterState.min_main_green_factors);
    addMinimumClause('Main white count', this.filterState.min_main_white_count);
    addMinimumClause('Wins', this.filterState.min_win_count);
    addMinimumClause('White count', this.filterState.min_white_count);
    if (this.filterState.parent_rank && this.filterState.parent_rank > 1) {
      addMinimumClause('Rank', this.filterState.parent_rank);
    }
    if (this.selectedSupportCard) {
      clauses.push(`support_card_id = ${this.selectedSupportCard.id}`);
      if (this.selectedLimitBreak > 0) clauses.push(`limitbreak >= ${this.selectedLimitBreak}`);
    } else if (this.selectedLimitBreak > 0) {
      clauses.push(`limitbreak >= ${this.selectedLimitBreak}`);
    }
    if (this.includeMaxFollowers && this.filterState.max_follower_num) {
      clauses.push(`Followers <= ${this.filterState.max_follower_num}`);
    }
    addMinimumClause('Blue stars', this.filterState.min_blue_stars_sum);
    addMinimumClause('Pink stars', this.filterState.min_pink_stars_sum);
    addMinimumClause('Green stars', this.filterState.min_green_stars_sum);
    addMinimumClause('White stars', this.filterState.min_white_stars_sum);
    this.appendArrayOverlapClauses(clauses, 'main_win_saddles', this.filterState.main_win_saddle ? [this.filterState.main_win_saddle] : undefined);
    if (this.searchUserId) {
      clauses.push(`Trainer ID = ${this.quoteUqlString(this.searchUserId)}`);
    }
    if (this.searchUsername) {
      clauses.push(`Trainer name ilike ${this.quoteUqlString(`%${this.searchUsername}%`)}`);
    }
    return clauses.join(' and ');
  }

  private appendPriorityScoringUqlClauses(
    clauses: string[],
    filters: FactorFilter[],
    functionName: 'optional_white' | 'optional_main_white' | 'lineage_white',
  ): void {
    const groups = new Map<number, Array<{ id: number; value: string }>>();
    for (const filter of filters) {
      const factorId = this.getNormalizedFactorFilterId(filter);
      if (!factorId) continue;
      const priority = this.getPriorityGroup(filter);
      const values = groups.get(priority) ?? [];
      if (!values.some(item => item.id === factorId)) {
        values.push({
          id: factorId,
          value: this.getFriendlyWhiteScoringUqlValue(factorId)
        });
      }
      groups.set(priority, values);
    }

    [...groups.entries()]
      .sort(([left], [right]) => left - right)
      .forEach(([priority, factorValues]) => {
        factorValues.sort((left, right) => left.id - right.id);
        const valuesArgument = factorValues.map(item => item.value).join(', ');
        clauses.push(`${this.getFriendlyWhiteScoringFieldLabel(functionName)} in (${valuesArgument}, priority = ${priority})`);
      });
  }

  private getFriendlyWhiteScoringFieldLabel(functionName: 'optional_white' | 'optional_main_white' | 'lineage_white'): string {
    switch (functionName) {
      case 'optional_main_white':
        return 'optional main white';
      case 'lineage_white':
        return 'lineage white';
      default:
        return 'optional white';
    }
  }

  private getFriendlyWhiteScoringUqlValue(factorId: number): string {
    const factorName = this.whiteFactors
      .find(factor => parseInt(factor.id, 10) === factorId)
      ?.text
      ?.trim();
    if (!factorName || !this.isSafeFriendlyWhiteScoringLabel(factorName)) return `${factorId}`;
    return factorName;
  }

  private isSafeFriendlyWhiteScoringLabel(value: string): boolean {
    return !!value.trim() && !/[;'"()]/.test(value);
  }

  private formatFriendlyCharacterUqlValue(id: number): string {
    const character = getMasterCharacterById(id);
    const value = character ? this.getCharacterUqlDisplayName(character) : id.toString();
    return this.formatFriendlyUqlValue(value);
  }

  private formatFriendlyUqlValue(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || /[(),;'""]/.test(trimmed)) return this.quoteUqlString(trimmed);
    return trimmed;
  }

  private buildUqlEditorDirectiveClauses(): string[] {
    const clauses: string[] = [];
    if (this.treeData.characterId) {
      const character = getMasterCharacterById(this.treeData.characterId);
      const value = character ? this.getCharacterUqlDisplayName(character) : this.treeData.name;
      clauses.push(`target = ${value}`);
    }
    if (this.selectedVeteran) {
      const accountId = this.getOwnedLegacyAccountIdForVeteran(this.selectedVeteran);
      clauses.push(`owned legacy = [${this.getOwnedLegacyUqlDisplayValue(accountId, this.selectedVeteran)}]`);
    }
    return clauses;
  }

  private appendFactorFilterUqlClauses(
    clauses: string[],
    filters: FactorFilter[],
    availableFactors: any[],
    fieldName: string,
    labelPrefix = '',
    maxCap = 9,
  ): void {
    for (const filter of filters) {
      const friendlyClause = this.buildFriendlyFactorFilterUqlClause(filter, availableFactors, labelPrefix, maxCap);
      if (friendlyClause) {
        clauses.push(friendlyClause);
        continue;
      }

      const friendlyAnyClause = this.buildFriendlyAnyFactorFilterUqlClause(filter, fieldName, labelPrefix, maxCap);
      if (friendlyAnyClause) {
        clauses.push(friendlyAnyClause);
        continue;
      }

      const groups = this.generateSparkIdGroups([filter], availableFactors, maxCap);
      groups.forEach(group => clauses.push(this.buildSparkGroupUqlClause(fieldName, group)));
    }
  }

  private buildFriendlyFactorFilterUqlClause(
    filter: FactorFilter,
    availableFactors: any[],
    labelPrefix: string,
    maxCap: number,
  ): string | null {
    const factorId = this.getNormalizedFactorFilterId(filter);
    if (!factorId) return null;
    const factorName = availableFactors.find(factor => parseInt(factor.id, 10) === factorId)?.text?.trim();
    if (!factorName || !this.isSafeFriendlyUqlLabel(factorName)) return null;

    const min = Math.max(1, Math.min(maxCap, filter.min || 1));
    const max = Math.max(min, Math.min(maxCap, filter.max ?? maxCap));
    const label = `${labelPrefix}${factorName}`;
    if (min === max) return `${label} = ${min}`;
    if (min <= 1 && max >= maxCap) return `${label} >= 1`;
    if (min <= 1) return `${label} <= ${max}`;
    if (max >= maxCap) return `${label} >= ${min}`;
    return null;
  }

  private buildFriendlyAnyFactorFilterUqlClause(
    filter: FactorFilter,
    fieldName: string,
    labelPrefix: string,
    maxCap: number,
  ): string | null {
    if (this.getNormalizedFactorFilterId(filter)) return null;
    const label = this.getFriendlySparkCategoryLabel(fieldName, labelPrefix);
    if (!label) return null;

    const min = Math.max(1, Math.min(maxCap, filter.min || 1));
    const max = Math.max(min, Math.min(maxCap, filter.max ?? maxCap));
    if (min === max) return `${label} = ${min}`;
    if (min <= 1 && max >= maxCap) return `${label} >= 1`;
    if (min <= 1) return `${label} <= ${max}`;
    if (max >= maxCap) return `${label} >= ${min}`;
    return null;
  }

  private getNormalizedFactorFilterId(filter: FactorFilter): number | null {
    const id = filter.factorId == null ? null : Number(filter.factorId);
    return id && Number.isFinite(id) && id > 0 ? id : null;
  }

  private getFriendlySparkCategoryLabel(fieldName: string, labelPrefix: string): string | null {
    const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const prefix = labelPrefix.trim();
    switch (normalizedField) {
      case 'blue_sparks':
        return 'Blue sparks';
      case 'pink_sparks':
        return 'Pink sparks';
      case 'green_sparks':
        return 'Green sparks';
      case 'main_blue_factors':
        return `${prefix || 'Main'} blue sparks`;
      case 'main_pink_factors':
        return `${prefix || 'Main'} pink sparks`;
      case 'main_green_factors':
        return `${prefix || 'Main'} green sparks`;
      default:
        return null;
    }
  }

  private isSafeFriendlyUqlLabel(value: string): boolean {
    return !/['";]/.test(value);
  }

  private buildSparkGroupUqlClause(fieldName: string, group: number[]): string {
    const values = this.getUniqueNumbers(group);
    if (!values.length) return '(1 = 0)';
    const normalizedField = fieldName.toLowerCase().replace(/[_\s-]+/g, '_').trim();
    const arrayField = normalizedField.endsWith('_sparks') || normalizedField.endsWith('_white_factors');
    if (arrayField) {
      return values.length === 1
        ? `contains(${fieldName}, ${values[0]})`
        : `overlaps(${fieldName}, (${this.formatUqlNumberList(values)}))`;
    }
    return values.length === 1
      ? `${fieldName} = ${values[0]}`
      : `${fieldName} in (${this.formatUqlNumberList(values)})`;
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

  private extractUqlEditorDirectives(query: string): UqlEditorDirectiveParseResult {
    const hadWhere = /^\s*where\b/i.test(query);
    const expression = this.stripLeadingWhere(query);
    if (!expression) return { queryWithoutDirectives: '', directives: [] };
    if (/\band\s*$/i.test(expression)) {
      return {
        queryWithoutDirectives: query,
        directives: [],
        issue: { state: 'incomplete', message: 'Finish the boolean operator' }
      };
    }
    const clauses = this.splitTopLevelUqlAndClauses(expression);
    const remainingClauses: string[] = [];
    const directives: UqlEditorDirective[] = [];

    for (const clause of clauses) {
      const directive = this.parseUqlEditorDirectiveClause(clause);
      if (!directive) {
        remainingClauses.push(clause);
        continue;
      }
      if (directive.operator !== '=') {
        return {
          queryWithoutDirectives: query,
          directives,
          issue: { state: 'invalid', message: `${directive.label} only supports =` }
        };
      }
      if (!directive.value) {
        return {
          queryWithoutDirectives: query,
          directives,
          issue: { state: 'incomplete', message: `Choose a ${directive.kind === 'target' ? 'target' : 'legacy'}` }
        };
      }

      const resolution = directive.kind === 'target'
        ? this.resolveUqlTargetCharacter(directive.value)
        : this.resolveUqlOwnedLegacy(directive.value);
      if (!resolution.match) {
        return {
          queryWithoutDirectives: query,
          directives,
          issue: {
            state: resolution.partial ? 'incomplete' : 'invalid',
            message: resolution.partial
              ? `Choose a ${directive.kind === 'target' ? 'target' : 'legacy'} from autocomplete`
              : `Unknown ${directive.kind === 'target' ? 'target' : 'legacy'}: ${directive.value}`
          }
        };
      }
      directives.push({ kind: directive.kind, value: directive.value });
    }

    const queryWithoutDirectives = remainingClauses.length
      ? `${hadWhere ? 'where ' : ''}${remainingClauses.join(' and ')}`
      : '';
    return { queryWithoutDirectives, directives };
  }

  private splitTopLevelUqlAndClauses(expression: string): string[] {
    const clauses: string[] = [];
    let start = 0;
    let depth = 0;
    let quote: string | null = null;
    for (let index = 0; index < expression.length; index++) {
      const character = expression[index];
      if (quote) {
        if (character === quote) {
          const next = expression[index + 1];
          if (next === quote) {
            index++;
          } else {
            quote = null;
          }
        }
        continue;
      }
      if (this.isUqlQuoteStart(expression, index)) {
        quote = character;
        continue;
      }
      if (character === '(') {
        depth++;
        continue;
      }
      if (character === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (depth === 0
        && /^and\b/i.test(expression.slice(index))
        && (!expression[index - 1] || /\s|\)/.test(expression[index - 1]))
        && (!expression[index + 3] || /\s|\(/.test(expression[index + 3]))) {
        const clause = expression.slice(start, index).trim();
        if (clause) clauses.push(clause);
        index += 2;
        start = index + 1;
      }
    }
    const finalClause = expression.slice(start).trim();
    if (finalClause) clauses.push(finalClause);
    return clauses;
  }

  private parseUqlEditorDirectiveClause(clause: string): { kind: UqlEditorDirectiveKind; label: string; operator: string; value: string } | null {
    const match = clause.trim().match(/^(target|owned\s+legacy|your\s+legacy|my\s+legacy|legacy)\s*(not\s+in|has\s+any|has\s+all|has|!=|<>|>=|<=|==|=|>|<|in|contains)\s*(.*)$/i);
    if (!match) return null;
    const label = match[1].replace(/\s+/g, ' ').trim();
    return {
      kind: /^target$/i.test(label) ? 'target' : 'legacy',
      label,
      operator: this.normalizeUqlComparisonOperator(match[2].replace(/\s+/g, ' ').toLowerCase()) || match[2].replace(/\s+/g, ' ').toLowerCase(),
      value: this.unwrapUqlBracketValue(this.unquoteUqlValue(match[3].trim()))
    };
  }

  private unwrapUqlBracketValue(value: string): string {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  private unquoteUqlValue(value: string): string {
    const trimmed = value.trim().replace(/;\s*$/, '').trim();
    if ((trimmed.startsWith('\'') && trimmed.endsWith('\'')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(1, -1).replace(/''/g, '\'').replace(/""/g, '"').trim();
    }
    return trimmed;
  }

  private replaceUqlStrings(query: string, replaceString: (value: string) => string): string {
    let result = '';
    let lastIndex = 0;
    for (let index = 0; index < query.length; index++) {
      if (!this.isUqlQuoteStart(query, index)) {
        continue;
      }

      const stringEnd = this.findUqlStringEnd(query, index);
      result += query.slice(lastIndex, index);
      result += replaceString(query.slice(index, stringEnd));
      lastIndex = stringEnd;
      index = stringEnd - 1;
    }
    return result + query.slice(lastIndex);
  }

  private findUqlStringEnd(query: string, start: number): number {
    const quote = query[start];
    let index = start + 1;
    while (index < query.length) {
      if (query[index] === quote) {
        if (query[index + 1] === quote) {
          index += 2;
          continue;
        }
        return index + 1;
      }
      index++;
    }
    return query.length;
  }

  private isUqlQuoteStart(text: string, index: number): boolean {
    const character = text[index];
    if (character !== '\'' && character !== '"') {
      return false;
    }

    return character !== '\'' || !this.isUqlIdentifierCharacter(text[index - 1]);
  }

  private isUqlIdentifierCharacter(character: string | undefined): boolean {
    return !!character && /[A-Za-z0-9_\u00C0-\uFFFF]/.test(character);
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
  getSupportCardDisplayTitle(card: SupportCardShort): string {
    return getSupportCardDataDisplayTitle(card) ?? getSupportCardDataDisplayName(card);
  }
  getSupportCardDisplayName(card: SupportCardShort): string {
    const title = this.getSupportCardDisplayTitle(card).trim().toLowerCase();
    const name = getSupportCardDataDisplayName(card);
    return name.trim().toLowerCase() === title ? '' : name;
  }
  getSupportCardDisplayLabel(card: SupportCardShort): string {
    const title = this.getSupportCardDisplayTitle(card);
    const name = this.getSupportCardDisplayName(card);
    return name ? `${title} ${name}` : title;
  }
  selectVeteran() {
    if (this.linkedAccounts.length === 0) {
      this.loadLinkedAccounts(() => this.openVeteranDialog(), { preloadSelectedAccount: false, updateSuggestions: false });
    } else {
      this.openVeteranDialog();
    }
  }
  private openVeteranDialog(afterSelected?: (veteran: VeteranMember | undefined) => void, options: { suppressFilterChange?: boolean } = {}) {
    const targetCharaId = this.treeData.characterId
      ? Math.floor(this.treeData.characterId / 100)
      : null;
    const dialogRef = this.dialog.open(VeteranPickerDialogComponent, {
      width: '92vw',
      maxWidth: '1100px',
      panelClass: 'modern-dialog-panel',
      autoFocus: false,
      restoreFocus: false,
      exitAnimationDuration: '0ms',
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
        const accountId = this.getAccountIdForVeteran(vet) || this.selectedAccountId || vet.trainer_id || null;
        this.applySelectedVeteran(vet, accountId);
        if (!options.suppressFilterChange) {
          this.onFilterChange();
        }
      }
      afterSelected?.(vet);
    });
  }
  private loadLinkedAccounts(callback?: () => void, options: { preloadSelectedAccount?: boolean; updateSuggestions?: boolean } = {}) {
    const preloadSelectedAccount = options.preloadSelectedAccount !== false;
    const updateSuggestions = options.updateSuggestions !== false;
    this.loadingLinkedAccounts = true;
    this.authService.getLinkedAccounts()
      .pipe(takeUntil(this.destroy$), catchError(() => of([])))
      .subscribe(accounts => {
        this.loadingLinkedAccounts = false;
        this.linkedAccountsLoaded = true;
        this.linkedAccounts = accounts;
        if (accounts.length > 0 && !this.selectedAccountId) {
          this.selectedAccountId = accounts[0].account_id;
        }
        if (preloadSelectedAccount && this.selectedAccountId) {
          this.loadVeteransForAccount(this.selectedAccountId);
        }
        if (updateSuggestions) {
          this.updateUqlSuggestions();
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
        this.updateUqlSuggestions();
        if (this.filterMode === 'uql' && this.hasUqlOwnedLegacyDirective(this.uqlQuery)) {
          this.onUqlChange();
        }
        this.cdr.markForCheck();
      });
  }

  private loadVeteranById(veteranId: string): void {
    if (!veteranId || this.loadingVeteransById[veteranId] || this.fetchedVeteransById.has(veteranId)) return;
    this.loadingVeteransById[veteranId] = true;
    this.profileService.getVeteranById(veteranId)
      .pipe(takeUntil(this.destroy$), catchError(() => of(null)))
      .subscribe(veteran => {
        this.loadingVeteransById[veteranId] = false;
        this.fetchedVeteransById.set(veteranId, veteran);
        if (veteran?.trainer_id) {
          const accountVeterans = this.veterans[veteran.trainer_id] ?? [];
          const veteranUuid = this.getVeteranUuid(veteran);
          const existingIndex = accountVeterans.findIndex(entry =>
            (!!veteranUuid && this.getVeteranUuid(entry) === veteranUuid)
            || (entry.member_id != null && entry.member_id === veteran.member_id)
          );
          this.veterans[veteran.trainer_id] = existingIndex >= 0
            ? accountVeterans.map((entry, index) => index === existingIndex ? veteran : entry)
            : [...accountVeterans, veteran];
        }
        this.updateUqlSuggestions();
        if (this.filterMode === 'uql' && this.hasUqlOwnedLegacyDirective(this.uqlQuery)) {
          this.onUqlChange();
        }
        this.cdr.markForCheck();
      });
  }

  removeVeteran() {
    this.selectedVeteran = null;
    this.selectedVeteranName = '';
    this.selectedVeteranImage = '';
    this.pendingVeteranRestore = null;
    this.restoredP2Context = null;
    this.veteranSelected.emit(null);
    this.onFilterChange();
  }

  private tryRestoreVeteran() {
    if (!this.pendingVeteranRestore) return;
    const { accountId, memberId } = this.pendingVeteranRestore;
    const vets = this.veterans[accountId];
    if (!vets) return;
    const vet = vets.find(v => v.member_id === memberId);
    if (vet) {
      this.applySelectedVeteran(vet, accountId);
      this.onFilterChange();
    }
  }
  private getOwnedLegacyUqlDisplayValue(accountId: string, veteran: VeteranMember): string {
    const name = this.getVeteranName(veteran);
    const veteranId = this.getVeteranUuid(veteran);
    if (veteranId) return `${name} #${veteranId}`;
    if (veteran.member_id != null && accountId) return `${name} #${veteran.member_id} @${accountId}`;
    if (veteran.member_id != null) return `${name} #${veteran.member_id}`;
    return accountId ? `${name} @${accountId}` : name;
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
  private getVeteranUqlCharacterImage(vet: VeteranMember): string {
    if (vet.card_id) return `/assets/images/character_stand/chara_stand_${vet.card_id}.png`;
    if (vet.trained_chara_id) {
      const c = CHARACTERS.find(ch => Math.floor(ch.id / 100) === vet.trained_chara_id);
      return c ? `/assets/images/character_stand/chara_stand_${c.id}.png` : '';
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
    node.name = node.layer === 0 ? 'Target (ace)' : (node.layer === 1 ? 'Parent' : 'Great parent');
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
