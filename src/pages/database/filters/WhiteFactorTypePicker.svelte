<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import Icon from '@/components/Icon.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import NumberStepper from '@/components/controls/NumberStepper.svelte';
  import { factorImage, factorOptions, type FactorMetadata } from '@/lib/catalog/factor-catalog';

  let normalRange = $state<VirtualRange>({ start: 0, end: 0 }),
    upgradedRange = $state<VirtualRange>({ start: 0, end: 0 });

  type CategoryTone = 'benefit' | 'debuff' | 'penalty' | 'neutral';

  type CategoryFamily = 'passive' | 'active' | 'race' | 'scenario';

  interface CategoryMetadata {
    label: string;
    detail: string;
    order: number;
    tone: CategoryTone;
    family: CategoryFamily;
    variant?: 'normal' | 'upgraded';
  }

  interface WhiteFactorCategory extends CategoryMetadata {
    key: string;
    icon?: string;
    factorCount: number;
  }

  interface BrowseableFactor {
    id: number;
    text: string;
    categoryKey: string;
    icon?: string;
    searchText: string;
  }

  interface Props {
    id: string;
    browseLabel?: string;
    selectedFactorIds?: number[];
    mode?: 'add' | 'hide' | 'browse';
    onadd?: (factorIds: number[], priority: number) => void;
    onremove?: (factorId: number) => void;
  }

  const categoryMetadata: Record<string, CategoryMetadata> = {
    race: {
      label: 'Race',
      detail: 'G1 and other race factors',
      order: 10,
      tone: 'neutral',
      family: 'race'
    },
    scenario: {
      label: 'Scenario',
      detail: 'Scenario and campaign factors',
      order: 20,
      tone: 'neutral',
      family: 'scenario'
    },
    'passive-speed': {
      label: 'Speed conditions',
      detail: 'Green passive skills that change Speed',
      order: 30,
      tone: 'benefit',
      family: 'passive'
    },
    'passive-stamina': {
      label: 'Stamina conditions',
      detail: 'Green passive skills that change Stamina',
      order: 31,
      tone: 'benefit',
      family: 'passive'
    },
    'passive-power': {
      label: 'Power conditions',
      detail: 'Green passive skills that change Power',
      order: 32,
      tone: 'benefit',
      family: 'passive'
    },
    'passive-guts': {
      label: 'Guts conditions',
      detail: 'Green passive skills that change Guts',
      order: 33,
      tone: 'benefit',
      family: 'passive'
    },
    'passive-wit': {
      label: 'Wit conditions',
      detail: 'Green passive skills that change Wit',
      order: 34,
      tone: 'benefit',
      family: 'passive'
    },
    'passive-other': {
      label: 'Other conditions',
      detail: 'Other green passive skills',
      order: 35,
      tone: 'benefit',
      family: 'passive'
    },
    recovery: {
      label: 'Recovery',
      detail: 'Skills that recover stamina',
      order: 40,
      tone: 'benefit',
      family: 'active'
    },
    speed: {
      label: 'Speed up',
      detail: 'Skills that increase target speed',
      order: 41,
      tone: 'benefit',
      family: 'active'
    },
    acceleration: {
      label: 'Acceleration',
      detail: 'Skills that increase acceleration',
      order: 42,
      tone: 'benefit',
      family: 'active'
    },
    position: {
      label: 'Position',
      detail: 'Lane movement and positioning skills',
      order: 43,
      tone: 'benefit',
      family: 'active'
    },
    start: {
      label: 'Start',
      detail: 'Skills that improve starting reaction',
      order: 44,
      tone: 'benefit',
      family: 'active'
    },
    vision: {
      label: 'Vision',
      detail: 'Skills that increase field of view',
      order: 45,
      tone: 'benefit',
      family: 'active'
    },
    special: {
      label: 'Special',
      detail: 'Special-effect skills',
      order: 46,
      tone: 'benefit',
      family: 'active'
    },
    'special-upgraded': {
      label: 'Special',
      detail: 'Upgraded special-effect skills',
      order: 47,
      tone: 'benefit',
      family: 'active',
      variant: 'upgraded'
    },
    'speed-debuff': {
      label: 'Speed debuff',
      detail: 'Skills that slow other runners',
      order: 50,
      tone: 'debuff',
      family: 'active'
    },
    'acceleration-debuff': {
      label: 'Acceleration debuff',
      detail: 'Skills that reduce acceleration',
      order: 51,
      tone: 'debuff',
      family: 'active'
    },
    'rush-debuff': {
      label: 'Rush debuff',
      detail: 'Skills that make other runners rush',
      order: 52,
      tone: 'debuff',
      family: 'active'
    },
    'stamina-debuff': {
      label: 'Stamina debuff',
      detail: 'Skills that drain stamina',
      order: 53,
      tone: 'debuff',
      family: 'active'
    },
    'vision-debuff': {
      label: 'Vision debuff',
      detail: 'Skills that reduce field of view',
      order: 54,
      tone: 'debuff',
      family: 'active'
    },
    'other-debuff': {
      label: 'Other debuff',
      detail: 'Other skills that target opponents',
      order: 55,
      tone: 'debuff',
      family: 'active'
    },
    penalty: {
      label: 'Penalty',
      detail: 'Red negative-condition factors',
      order: 60,
      tone: 'penalty',
      family: 'active'
    }
  };
  const categoryIcons: Partial<Record<string, string>> = {
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
    penalty: '/assets/images/skills/utx_ico_skill_10014.webp'
  };

  function normalize(value: string): string {
    return value
      .toLocaleLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function iconCode(icon?: string): string {
    return icon?.match(/utx_ico_skill_(\d{5})/i)?.[1] ?? '';
  }

  function categoryKey(factor: FactorMetadata, icon?: string): string {
    if (factor.type === 2) return 'race';
    if (factor.type === 4) return 'scenario';
    const code = iconCode(icon);
    if (!code) return 'special-upgraded';
    if (/^1001[12]$/.test(code)) return 'passive-speed';
    if (/^1002[12]$/.test(code)) return 'passive-stamina';
    if (/^1003[12]$/.test(code)) return 'passive-power';
    if (/^1004[12]$/.test(code)) return 'passive-guts';
    if (/^1005[12]$/.test(code)) return 'passive-wit';
    if (/^100\d[12]$/.test(code)) return 'passive-other';
    if (/^(?:100|200)\d4$/.test(code)) return 'penalty';
    if (/^2001[12]$/.test(code)) return 'speed';
    if (/^2002[12]$/.test(code)) return 'recovery';
    if (/^2004[12]$/.test(code)) return 'acceleration';
    if (/^2005[12]$/.test(code)) return 'position';
    if (/^2006[12]$/.test(code)) return 'start';
    if (/^2009[12]$/.test(code)) return 'vision';
    if (/^201\d\d$/.test(code)) return 'special';
    if (/^20[23]\d\d$/.test(code)) return 'special-upgraded';
    if (/^3001[12]$/.test(code)) return 'speed-debuff';
    if (/^3002[12]$/.test(code)) return 'acceleration-debuff';
    if (/^3004[12]$/.test(code)) return 'rush-debuff';
    if (/^3005[12]$/.test(code)) return 'stamina-debuff';
    if (/^3007[12]$/.test(code)) return 'vision-debuff';
    if (code.startsWith('3')) return 'other-debuff';
    return 'special-upgraded';
  }

  function buildCatalog(): { categories: WhiteFactorCategory[]; factors: BrowseableFactor[] } {
    const categoryMap = new Map<string, WhiteFactorCategory>();
    const factors: BrowseableFactor[] = [];
    for (const factor of factorOptions('skills-races')) {
      const id = Number(factor.id);
      const icon = factorImage(id);
      const key = categoryKey(factor, icon);
      const metadata = categoryMetadata[key] ?? categoryMetadata['special-upgraded']!;
      const existing = categoryMap.get(key);
      if (existing) existing.factorCount += 1;
      else
        categoryMap.set(key, {
          key,
          ...metadata,
          icon: categoryIcons[key] ?? icon,
          factorCount: 1
        });
      factors.push({
        id,
        text: factor.text,
        categoryKey: key,
        icon,
        searchText: normalize(`${factor.text} ${metadata.label} ${metadata.detail}`)
      });
    }
    return {
      categories: [...categoryMap.values()].sort(
        (left, right) => left.order - right.order || left.label.localeCompare(right.label)
      ),
      factors: factors.sort((left, right) => left.text.localeCompare(right.text))
    };
  }

  const catalog = $derived(buildCatalog());
  const standardCategories = $derived(
    catalog.categories.filter(
      (category) =>
        category.variant !== 'upgraded' ||
        !catalog.categories.some((entry) => entry.key === 'special')
    )
  );

  let {
    id,
    browseLabel = 'Find white factors',
    selectedFactorIds = [],
    mode = 'add',
    onadd,
    onremove
  }: Props = $props();

  const hiding = $derived(mode === 'hide');
  const browsing = $derived(mode === 'browse');

  let expanded = $state(false);
  let searchTerm = $state('');
  let priority = $state(0);
  let selectedCategoryKeys = $state<string[]>([]);
  let browseFamily = $state<CategoryFamily | null>(null);

  const familyLabels: Record<CategoryFamily, string> = {
    passive: 'Conditions',
    active: 'Skills',
    race: 'Races',
    scenario: 'Scenario'
  };

  function openFamily(family: CategoryFamily | null) {
    browseFamily = family;
    selectedCategoryKeys = [];
  }

  const hasCriteria = $derived(
    browsing || Boolean(searchTerm.trim()) || selectedCategoryKeys.length > 0
  );
  const matchingFactors = $derived.by(() => {
    if (!hasCriteria) return [];
    const search = normalize(searchTerm);
    return catalog.factors.filter((factor) => {
      const matchesCategory =
        selectedCategoryKeys.length === 0 ||
        selectedCategoryKeys.includes(factor.categoryKey) ||
        (factor.categoryKey === 'special-upgraded' && selectedCategoryKeys.includes('special'));
      const matchesFamily =
        !browsing || !browseFamily || categoryMetadata[factor.categoryKey]?.family === browseFamily;
      return matchesFamily && matchesCategory && (!search || factor.searchText.includes(search));
    });
  });
  const normalMatches = $derived(
    selectedCategoryKeys.includes('special')
      ? matchingFactors.filter((factor) => factor.categoryKey !== 'special-upgraded')
      : matchingFactors
  );
  const upgradedMatches = $derived(
    selectedCategoryKeys.includes('special')
      ? matchingFactors.filter((factor) => factor.categoryKey === 'special-upgraded')
      : []
  );

  function toggleCategory(key: string): void {
    if (selectedCategoryKeys.includes(key))
      selectedCategoryKeys = selectedCategoryKeys.filter(
        (entry) => entry !== key && !(key === 'special' && entry === 'special-upgraded')
      );
    else selectedCategoryKeys = [...selectedCategoryKeys, key];
  }

  function clearCriteria(): void {
    searchTerm = '';
    selectedCategoryKeys = [];
  }

  function setPriority(value: number): void {
    priority = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  function addFactor(factor: BrowseableFactor): void {
    if (!selectedFactorIds.includes(factor.id)) onadd?.([factor.id], priority);
    else if (hiding) onremove?.(factor.id);
  }
</script>

{#snippet factorResult(factor: BrowseableFactor, index: number)}
  {@const selected = selectedFactorIds.includes(factor.id)}
  <button
    data-virtual-index={index}
    type="button"
    class="factor-result"
    class:selected
    disabled={selected && !hiding}
    aria-pressed={hiding ? selected : undefined}
    title={selected
      ? hiding
        ? 'Show this spark again'
        : 'Already selected'
      : hiding
        ? 'Hide'
        : browsing
          ? 'Add spark'
          : `Add to P${priority}`}
    onclick={() => addFactor(factor)}
  >
    {#if factor.icon}
      <img
        src={factor.icon}
        alt=""
        loading="lazy"
      />
    {:else}
      <Icon
        name="star"
        size={16}
      />
    {/if}
    <span>{factor.text}</span>
    <Icon
      name={hiding ? (selected ? 'eye-off' : 'eye') : selected ? 'check' : 'add'}
      size={15}
    />
  </button>
{/snippet}

<div
  class="white-factor-browser"
  class:expanded={expanded || hiding || browsing}
  class:hide-mode={hiding}
  class:browse-mode={browsing}
>
  {#if !hiding && !browsing}
    <button
      class="browser-toggle"
      type="button"
      aria-expanded={expanded}
      aria-controls="{id}-panel"
      onclick={() => (expanded = !expanded)}
    >
      <span class="browser-toggle-copy">
        <Icon
          name="filter"
          size={16}
        />
        <span>{browseLabel}</span>
      </span>
      {#if selectedCategoryKeys.length}
        <span class="browser-toggle-summary">
          {selectedCategoryKeys.length}
          {selectedCategoryKeys.length === 1 ? 'type' : 'types'}
        </span>
      {/if}
      <span class="browser-toggle-chevron">
        <Icon
          name="chevron"
          size={16}
        />
      </span>
    </button>
  {/if}

  {#if expanded || hiding || browsing}
    <div
      id="{id}-panel"
      class="browser-panel"
    >
      {#if browsing}
        <label class="factor-search">
          <Icon
            name="search"
            size={16}
          />
          <input
            type="search"
            bind:value={searchTerm}
            placeholder="Skill, race or scenario name…"
            aria-label="Search skills and races"
          />
        </label>
        <div
          class="browse-families"
          role="group"
          aria-label="Skill and race categories"
        >
          <button
            type="button"
            class:selected={!browseFamily}
            aria-pressed={!browseFamily}
            onclick={() => openFamily(null)}
          >
            All
          </button>
          {#each ['active', 'passive', 'race', 'scenario'] as key}
            {@const family = key as CategoryFamily}
            <button
              type="button"
              class:selected={browseFamily === family}
              aria-pressed={browseFamily === family}
              onclick={() => openFamily(family)}
            >
              {familyLabels[family]}
            </button>
          {/each}
        </div>
        {#if browseFamily === 'active' || browseFamily === 'passive'}
          <div class="browse-subtype">
            <SelectFieldSlim
              id={id + '-type'}
              label="Spark type"
              hideLabel
              value={selectedCategoryKeys[0] ?? ''}
              options={[
                { value: '', label: 'All ' + familyLabels[browseFamily].toLowerCase() },
                ...standardCategories
                  .filter((category) => category.family === browseFamily)
                  .map((category) => ({ value: category.key, label: category.label }))
              ]}
              onchange={(value) => (selectedCategoryKeys = value ? [value] : [])}
            />
          </div>
        {/if}
      {:else}
        <div class="browser-controls">
          <label class="factor-search">
            <Icon
              name="search"
              size={16}
            />
            <input
              type="search"
              bind:value={searchTerm}
              placeholder="Search white factors"
              aria-label="Search white factors"
            />
          </label>
          {#if !hiding}
            <label
              class="browser-priority"
              title="New factors are added to this priority group. P0 sorts first."
            >
              <span>Add to</span>
              <span class="priority-value">
                <strong>P</strong>
                <input
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  value={priority}
                  aria-label="Priority group for newly added factors"
                  onchange={(event) => setPriority(Number(event.currentTarget.value))}
                />
                <NumberStepper
                  increaseLabel="Increase priority group"
                  decreaseLabel="Decrease priority group"
                  decreaseDisabled={priority === 0}
                  onstep={(direction) => setPriority(priority + direction)}
                />
              </span>
            </label>
          {/if}
        </div>

        <section
          class="effect-section"
          aria-label="White factor effect types"
        >
          <span class="effect-section-label">Types</span>
          <div class="effect-grid">
            {#each standardCategories as category (category.key)}
              <button
                type="button"
                class="effect-button {category.tone}"
                class:selected={selectedCategoryKeys.includes(category.key)}
                aria-label={category.label}
                aria-pressed={selectedCategoryKeys.includes(category.key)}
                title="{category.label} · {category.factorCount} factors"
                onclick={() => toggleCategory(category.key)}
              >
                {#if category.icon}
                  <img
                    src={category.icon}
                    alt=""
                    loading="lazy"
                  />
                {:else}
                  <Icon
                    name={category.family === 'race' ? 'trophy' : 'star'}
                    size={21}
                  />
                {/if}
              </button>
            {/each}
            {#if hasCriteria}
              <button
                type="button"
                class="clear-button"
                aria-label="Clear skill filters"
                title="Clear skill filters"
                onclick={clearCriteria}
              >
                <Icon
                  name="refresh"
                  size={17}
                />
              </button>
            {/if}
          </div>
        </section>
      {/if}

      {#if hasCriteria}
        <div class="result-summary">
          <strong>{matchingFactors.length}</strong>
          {matchingFactors.length === 1 ? 'factor' : 'factors'}
        </div>
        {#if matchingFactors.length}
          <div class="factor-result-groups">
            <div
              class="factor-results"
              use:virtualScroll={{
                items: normalMatches,
                key: (factor) => factor.id,
                root: 'closest',
                estimate: 40,
                onrange: (range) => (normalRange = range)
              }}
            >
              {#each normalMatches.slice(normalRange.start, normalRange.end) as factor, index (factor.id)}
                {@render factorResult(factor, normalRange.start + index)}
              {/each}
            </div>

            {#if upgradedMatches.length}
              <section class="upgraded-result-section">
                <div class="result-section-divider"><span>Upgraded</span></div>
                <div
                  class="factor-results"
                  use:virtualScroll={{
                    items: upgradedMatches,
                    key: (factor) => factor.id,
                    root: 'closest',
                    estimate: 40,
                    onrange: (range) => (upgradedRange = range)
                  }}
                >
                  {#each upgradedMatches.slice(upgradedRange.start, upgradedRange.end) as factor, index (factor.id)}
                    {@render factorResult(factor, upgradedRange.start + index)}
                  {/each}
                </div>
              </section>
            {/if}
          </div>
        {:else}
          <div class="empty-browser-state">
            <Icon
              name="search"
              size={17}
            />
            <span>No white factors match these types and search terms.</span>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  @import './white-factor-type-picker.css';
</style>
