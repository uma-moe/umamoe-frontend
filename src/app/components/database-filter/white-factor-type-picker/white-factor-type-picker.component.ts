import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FactorService } from '../../../services/factor.service';

export interface WhiteFactorPickerOption {
  id: number | string;
  text: string;
  type: number;
}

export interface WhiteFactorPickerSelection {
  factorIds: number[];
  priority: number;
}

type WhiteFactorCategoryTone = 'benefit' | 'debuff' | 'penalty' | 'neutral';
type WhiteFactorCategoryFamily = 'passive' | 'active' | 'race' | 'scenario' | 'other';

interface WhiteFactorCategory {
  key: string;
  label: string;
  detail: string;
  order: number;
  tone: WhiteFactorCategoryTone;
  family: WhiteFactorCategoryFamily;
  iconUrl?: string;
  materialIcon?: string;
  factorCount: number;
  variant: 'normal' | 'upgraded';
}

interface BrowseableWhiteFactor {
  id: number;
  text: string;
  categoryKey: string;
  iconUrl?: string;
  searchText: string;
}

interface CategoryMetadata {
  label: string;
  detail: string;
  order: number;
  tone: WhiteFactorCategoryTone;
  family: WhiteFactorCategoryFamily;
  variant?: 'normal' | 'upgraded';
}

interface WhiteFactorBrowseCatalog {
  categories: WhiteFactorCategory[];
  standardCategories: WhiteFactorCategory[];
  factors: BrowseableWhiteFactor[];
}

// Basic, Advanced, and the hide-sparks dialog all browse the same immutable
// factor array. Share the expensive icon/category derivation while allowing
// the whole catalogue to be collected as soon as that source array is gone.
const BROWSE_CATALOG_CACHE = new WeakMap<object, WhiteFactorBrowseCatalog>();

const CATEGORY_METADATA: Record<string, CategoryMetadata> = {
  race: {
    label: 'Race',
    detail: 'G1 and other race factors',
    order: 10,
    tone: 'neutral',
    family: 'race',
  },
  scenario: {
    label: 'Scenario',
    detail: 'Scenario and campaign factors',
    order: 20,
    tone: 'neutral',
    family: 'scenario',
  },
  'passive-speed': {
    label: 'Speed conditions',
    detail: 'Green passive skills that change Speed',
    order: 30,
    tone: 'benefit',
    family: 'passive',
  },
  'passive-stamina': {
    label: 'Stamina conditions',
    detail: 'Green passive skills that change Stamina',
    order: 31,
    tone: 'benefit',
    family: 'passive',
  },
  'passive-power': {
    label: 'Power conditions',
    detail: 'Green passive skills that change Power',
    order: 32,
    tone: 'benefit',
    family: 'passive',
  },
  'passive-guts': {
    label: 'Guts conditions',
    detail: 'Green passive skills that change Guts',
    order: 33,
    tone: 'benefit',
    family: 'passive',
  },
  'passive-wit': {
    label: 'Wit conditions',
    detail: 'Green passive skills that change Wit',
    order: 34,
    tone: 'benefit',
    family: 'passive',
  },
  'passive-other': {
    label: 'Other conditions',
    detail: 'Other green passive skills',
    order: 35,
    tone: 'benefit',
    family: 'passive',
  },
  recovery: {
    label: 'Recovery',
    detail: 'Skills that recover stamina',
    order: 40,
    tone: 'benefit',
    family: 'active',
  },
  speed: {
    label: 'Speed up',
    detail: 'Skills that increase target speed',
    order: 41,
    tone: 'benefit',
    family: 'active',
  },
  acceleration: {
    label: 'Acceleration',
    detail: 'Skills that increase acceleration',
    order: 42,
    tone: 'benefit',
    family: 'active',
  },
  position: {
    label: 'Position',
    detail: 'Lane movement and positioning skills',
    order: 43,
    tone: 'benefit',
    family: 'active',
  },
  start: {
    label: 'Start',
    detail: 'Skills that improve starting reaction',
    order: 44,
    tone: 'benefit',
    family: 'active',
  },
  vision: {
    label: 'Vision',
    detail: 'Skills that increase field of view',
    order: 45,
    tone: 'benefit',
    family: 'active',
  },
  special: {
    label: 'Special',
    detail: 'Special-effect skills',
    order: 46,
    tone: 'benefit',
    family: 'active',
  },
  'special-upgraded': {
    label: 'Special',
    detail: 'Upgraded special-effect skills',
    order: 47,
    tone: 'benefit',
    family: 'active',
    variant: 'upgraded',
  },
  'speed-debuff': {
    label: 'Speed debuff',
    detail: 'Skills that slow other runners',
    order: 50,
    tone: 'debuff',
    family: 'active',
  },
  'acceleration-debuff': {
    label: 'Acceleration debuff',
    detail: 'Skills that reduce another runner\'s acceleration',
    order: 51,
    tone: 'debuff',
    family: 'active',
  },
  'rush-debuff': {
    label: 'Rush debuff',
    detail: 'Skills that make other runners rush',
    order: 52,
    tone: 'debuff',
    family: 'active',
  },
  'stamina-debuff': {
    label: 'Stamina debuff',
    detail: 'Skills that drain another runner\'s stamina',
    order: 53,
    tone: 'debuff',
    family: 'active',
  },
  'vision-debuff': {
    label: 'Vision debuff',
    detail: 'Skills that reduce another runner\'s field of view',
    order: 54,
    tone: 'debuff',
    family: 'active',
  },
  'other-debuff': {
    label: 'Other debuff',
    detail: 'Other skills that target opposing runners',
    order: 55,
    tone: 'debuff',
    family: 'active',
  },
  penalty: {
    label: 'Penalty',
    detail: 'Red negative-condition factors',
    order: 60,
    tone: 'penalty',
    family: 'active',
  },
};

const CATEGORY_ICON_URLS: Partial<Record<string, string>> = {
  'passive-speed': '/assets/images/skills/utx_ico_skill_10011.webp',
  'passive-stamina': '/assets/images/skills/utx_ico_skill_10021.webp',
  'passive-power': '/assets/images/skills/utx_ico_skill_10031.webp',
  'passive-guts': '/assets/images/skills/utx_ico_skill_10041.webp',
  'passive-wit': '/assets/images/skills/utx_ico_skill_10051.webp',
  'passive-other': '/assets/images/skills/utx_ico_skill_10061.webp',
  speed: '/assets/images/skills/utx_ico_skill_20011.webp',
  recovery: '/assets/images/skills/utx_ico_skill_20021.webp',
  acceleration: '/assets/images/skills/utx_ico_skill_20041.webp',
  position: '/assets/images/skills/utx_ico_skill_20051.webp',
  start: '/assets/images/skills/utx_ico_skill_20061.webp',
  vision: '/assets/images/skills/utx_ico_skill_20091.webp',
  special: '/assets/images/skills/utx_ico_skill_20101.webp',
  'special-upgraded': '/assets/images/skills/utx_ico_skill_20201.webp',
  'speed-debuff': '/assets/images/skills/utx_ico_skill_30011.webp',
  'acceleration-debuff': '/assets/images/skills/utx_ico_skill_30021.webp',
  'rush-debuff': '/assets/images/skills/utx_ico_skill_30041.webp',
  'stamina-debuff': '/assets/images/skills/utx_ico_skill_30051.webp',
  'vision-debuff': '/assets/images/skills/utx_ico_skill_30071.webp',
  'other-debuff': '/assets/images/skills/utx_ico_skill_30061.webp',
  penalty: '/assets/images/skills/utx_ico_skill_10014.webp',
};

@Component({
  selector: 'app-white-factor-type-picker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './white-factor-type-picker.component.html',
  styleUrl: './white-factor-type-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhiteFactorTypePickerComponent implements OnChanges {
  @Input() factors: WhiteFactorPickerOption[] = [];
  @Input() selectedFactors: readonly { factorId: number | null }[] = [];
  @Input() browseLabel = 'Find white factors';
  @Input() embedded = false;
  @Input() showPriority = true;
  @Input() actionVerb = 'Add';
  @Input() allowSelectionToggle = false;
  @Output() addFactors = new EventEmitter<WhiteFactorPickerSelection>();
  @Output() removeFactor = new EventEmitter<number>();

  expanded = false;
  searchTerm = '';
  priority = 0;
  categories: WhiteFactorCategory[] = [];
  browseableFactors: BrowseableWhiteFactor[] = [];
  standardCategories: WhiteFactorCategory[] = [];
  matchingFactors: BrowseableWhiteFactor[] = [];
  normalMatchingFactors: BrowseableWhiteFactor[] = [];
  upgradedMatchingFactors: BrowseableWhiteFactor[] = [];
  readonly selectedCategoryKeys = new Set<string>();
  private browseDataDirty = true;

  constructor(private factorService?: FactorService) {}

  ngOnChanges(): void {
    this.browseDataDirty = true;
    if (this.embedded || this.expanded) {
      this.ensureBrowseData();
    }
  }

  get hasCriteria(): boolean {
    return this.selectedCategoryKeys.size > 0 || this.searchTerm.trim().length > 0;
  }

  get activeCategoryCount(): number {
    return this.selectedCategoryKeys.size;
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.ensureBrowseData();
    } else {
      // Closed pickers only need their selection summary. Release hundreds of
      // derived rows until the user opens the browser again.
      this.categories = [];
      this.standardCategories = [];
      this.browseableFactors = [];
      this.resetMatchingFactors();
      this.browseDataDirty = true;
    }
  }

  toggleCategory(categoryKey: string): void {
    if (this.selectedCategoryKeys.has(categoryKey)) {
      this.selectedCategoryKeys.delete(categoryKey);
      if (categoryKey === 'special') this.selectedCategoryKeys.delete('special-upgraded');
    } else {
      this.selectedCategoryKeys.add(categoryKey);
    }
    this.refreshMatchingFactors();
  }

  isCategorySelected(categoryKey: string): boolean {
    return this.selectedCategoryKeys.has(categoryKey);
  }

  clearCriteria(): void {
    this.searchTerm = '';
    this.selectedCategoryKeys.clear();
    this.refreshMatchingFactors();
  }

  setSearchTerm(value: string): void {
    this.searchTerm = value;
    this.refreshMatchingFactors();
  }

  normalizePriority(value: unknown): void {
    const parsed = Number(value);
    this.priority = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }

  adjustPriority(delta: number): void {
    this.priority = Math.max(0, this.priority + delta);
  }

  isFactorSelected(factorId: number): boolean {
    return this.selectedFactors.some(filter => filter.factorId === factorId);
  }

  addFactor(factor: BrowseableWhiteFactor): void {
    if (this.isFactorSelected(factor.id)) {
      if (this.allowSelectionToggle) this.removeFactor.emit(factor.id);
      return;
    }
    this.emitSelection([factor.id]);
  }

  getFactorActionTooltip(factor: BrowseableWhiteFactor): string {
    if (this.isFactorSelected(factor.id)) {
      if (!this.allowSelectionToggle) return 'Already selected';
      return this.actionVerb === 'Hide' ? 'Show this spark again' : 'Remove selection';
    }
    return this.actionVerb + (this.showPriority ? ' to P' + this.priority : '');
  }

  getFactorActionIcon(factor: BrowseableWhiteFactor): string {
    if (this.isFactorSelected(factor.id)) {
      return this.allowSelectionToggle && this.actionVerb === 'Hide' ? 'visibility_off' : 'check';
    }
    return this.actionVerb === 'Hide' ? 'visibility' : 'add';
  }

  trackCategory(_index: number, category: WhiteFactorCategory): string {
    return category.key;
  }

  trackFactor(_index: number, factor: BrowseableWhiteFactor): number {
    return factor.id;
  }

  private emitSelection(factorIds: number[]): void {
    const uniqueIds = [...new Set(factorIds)];
    if (!uniqueIds.length) return;
    this.addFactors.emit({
      factorIds: uniqueIds,
      priority: this.priority,
    });
  }

  private ensureBrowseData(): void {
    if (!this.browseDataDirty) return;
    this.rebuildBrowseData();
    this.browseDataDirty = false;
  }

  private rebuildBrowseData(): void {
    const sourceKey = this.factors as object;
    const cached = BROWSE_CATALOG_CACHE.get(sourceKey);
    if (cached) {
      this.categories = cached.categories;
      this.standardCategories = cached.standardCategories;
      this.browseableFactors = cached.factors;
      this.pruneUnavailableCategories();
      this.refreshMatchingFactors();
      return;
    }

    const categoryMap = new Map<string, WhiteFactorCategory>();
    const factors: BrowseableWhiteFactor[] = [];

    for (const factor of this.factors) {
      const id = Number(factor.id);
      if (!Number.isFinite(id) || id <= 0) continue;

      const iconUrl = this.factorService?.getFactorImageUrl({
        factorId: String(id),
        level: 1,
        name: factor.text,
        type: factor.type,
      }) ?? undefined;
      const categoryKey = this.getCategoryKey(factor, iconUrl);
      const metadata = CATEGORY_METADATA[categoryKey] ?? CATEGORY_METADATA['special-upgraded'];
      const categoryIconUrl = CATEGORY_ICON_URLS[categoryKey] ?? iconUrl;
      const existingCategory = categoryMap.get(categoryKey);

      if (existingCategory) {
        existingCategory.factorCount += 1;
        if (!existingCategory.iconUrl && categoryIconUrl) existingCategory.iconUrl = categoryIconUrl;
      } else {
        categoryMap.set(categoryKey, {
          key: categoryKey,
          ...metadata,
          iconUrl: categoryIconUrl,
          materialIcon: this.getMaterialIcon(categoryKey),
          factorCount: 1,
          variant: metadata.variant ?? 'normal',
        });
      }

      factors.push({
        id,
        text: factor.text,
        categoryKey,
        iconUrl,
        searchText: this.normalizeSearchText([
          factor.text,
          metadata.label,
          metadata.detail,
        ].join(' ')),
      });
    }

    this.categories = [...categoryMap.values()]
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label));
    this.standardCategories = this.categories
      .filter(category => category.key !== 'special-upgraded');
    this.browseableFactors = factors
      .sort((left, right) => left.text.localeCompare(right.text));

    BROWSE_CATALOG_CACHE.set(sourceKey, {
      categories: this.categories,
      standardCategories: this.standardCategories,
      factors: this.browseableFactors,
    });
    this.pruneUnavailableCategories();
    this.refreshMatchingFactors();
  }

  private pruneUnavailableCategories(): void {
    const availableKeys = new Set(this.categories.map(category => category.key));
    [...this.selectedCategoryKeys]
      .filter(key => !availableKeys.has(key))
      .forEach(key => this.selectedCategoryKeys.delete(key));
  }

  private refreshMatchingFactors(): void {
    if (!this.hasCriteria || !this.browseableFactors.length) {
      this.resetMatchingFactors();
      return;
    }

    const search = this.normalizeSearchText(this.searchTerm);
    this.matchingFactors = this.browseableFactors.filter(factor => {
      const matchesCategory = this.selectedCategoryKeys.size === 0
        || this.selectedCategoryKeys.has(factor.categoryKey)
        || (
          factor.categoryKey === 'special-upgraded'
          && this.selectedCategoryKeys.has('special')
        );
      return matchesCategory && (!search || factor.searchText.includes(search));
    });
    if (this.selectedCategoryKeys.has('special')) {
      this.normalMatchingFactors = this.matchingFactors
        .filter(factor => factor.categoryKey !== 'special-upgraded');
      this.upgradedMatchingFactors = this.matchingFactors
        .filter(factor => factor.categoryKey === 'special-upgraded');
    } else {
      this.normalMatchingFactors = this.matchingFactors;
      this.upgradedMatchingFactors = [];
    }
  }

  private resetMatchingFactors(): void {
    this.matchingFactors = [];
    this.normalMatchingFactors = [];
    this.upgradedMatchingFactors = [];
  }

  private getCategoryKey(factor: WhiteFactorPickerOption, iconUrl: string | undefined): string {
    if (factor.type === 2) return 'race';
    if (factor.type === 4) return 'scenario';

    const iconCode = this.getIconCode(iconUrl);
    if (!iconCode) return 'special-upgraded';

    if (/^1001[12]$/.test(iconCode)) return 'passive-speed';
    if (/^1002[12]$/.test(iconCode)) return 'passive-stamina';
    if (/^1003[12]$/.test(iconCode)) return 'passive-power';
    if (/^1004[12]$/.test(iconCode)) return 'passive-guts';
    if (/^1005[12]$/.test(iconCode)) return 'passive-wit';
    if (/^100\d[12]$/.test(iconCode)) return 'passive-other';
    if (/^(?:100|200)\d4$/.test(iconCode)) return 'penalty';

    if (/^2001[12]$/.test(iconCode)) return 'speed';
    if (/^2002[12]$/.test(iconCode)) return 'recovery';
    if (/^2004[12]$/.test(iconCode)) return 'acceleration';
    if (/^2005[12]$/.test(iconCode)) return 'position';
    if (/^2006[12]$/.test(iconCode)) return 'start';
    if (/^2009[12]$/.test(iconCode)) return 'vision';
    if (/^201\d\d$/.test(iconCode)) return 'special';
    if (/^20[23]\d\d$/.test(iconCode)) return 'special-upgraded';

    if (/^3001[12]$/.test(iconCode)) return 'speed-debuff';
    if (/^3002[12]$/.test(iconCode)) return 'acceleration-debuff';
    if (/^3004[12]$/.test(iconCode)) return 'rush-debuff';
    if (/^3005[12]$/.test(iconCode)) return 'stamina-debuff';
    if (/^3007[12]$/.test(iconCode)) return 'vision-debuff';
    if (iconCode.startsWith('3')) return 'other-debuff';
    return 'special-upgraded';
  }

  private getIconCode(icon: string | undefined): string {
    return icon?.match(/utx_ico_skill_(\d{5})/i)?.[1] ?? '';
  }

  private getMaterialIcon(categoryKey: string): string | undefined {
    if (categoryKey === 'race') return 'emoji_events';
    if (categoryKey === 'scenario') return 'auto_awesome';
    if (categoryKey === 'special-upgraded') return 'auto_awesome';
    return undefined;
  }

  private normalizeSearchText(value: string): string {
    return (value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
