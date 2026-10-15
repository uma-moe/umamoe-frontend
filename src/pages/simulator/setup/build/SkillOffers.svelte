<script lang="ts">
  import Button from '@/components/controls/Button.svelte';
  import Combobox, { type ComboboxOption } from '@/components/controls/Combobox.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import { skillImage, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import SimSection from '../../shell/SimSection.svelte';
  import { buildSearch } from './build-search.svelte';
  import { baseCost, HINT_DISCOUNT, offerPurchases, type PricedOffer } from './skill-offers';

  /**
   * The skills she can buy at the end of her career, each with its hint level and what it costs with it, and the SP
   * budget the search spends. Gold and ◎ skills show what they upgrade and how that is covered.
   */
  let {
    number = 3,
    catalog,
    owned = []
  }: {
    number?: number;
    catalog: Map<number, SkillCatalogEntry>;
    /** Skills she already has, which upgrades build on. */
    owned?: number[];
  } = $props();

  const offers = $derived(
    offerPurchases(buildSearch.offers, owned, catalog, buildSearch.fastLearner)
  );
  const total = $derived(offers.priced.reduce((sum, offer) => sum + offer.cost, 0));
  const budget = $derived(Number(buildSearch.budget) || 0);

  // Everything she could buy and does not have or have on offer yet: not her own unique, priced in the catalog.
  const options = $derived<ComboboxOption[]>(
    [...catalog.values()]
      .filter(
        (skill) =>
          !skill.unique &&
          skill.name &&
          baseCost(skill) != null &&
          !owned.includes(skill.skill_id) &&
          !buildSearch.offers.some((offer) => offer.skillId === skill.skill_id)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((skill) => ({
        value: String(skill.skill_id),
        label: skill.name,
        keywords: 'skill ' + skill.skill_id,
        image: skillImage(skill.icon)
      }))
  );
  let query = $state('');
  let anchor = $state<HTMLDivElement>();

  function add(value: string) {
    const skillId = Number(value);
    if (!Number.isInteger(skillId) || buildSearch.offers.some((offer) => offer.skillId === skillId))
      return;
    buildSearch.offers.push({ skillId, hint: 0 });
  }
  function remove(skillId: number) {
    buildSearch.offers = buildSearch.offers.filter((offer) => offer.skillId !== skillId);
  }
  function setHint(skillId: number, hint: string) {
    const offer = buildSearch.offers.find((item) => item.skillId === skillId);
    if (offer) offer.hint = Number(hint);
  }
  const HINT_OPTIONS = HINT_DISCOUNT.map((discount, level) => ({
    value: String(level),
    label: level ? 'Hint ' + level + ' · −' + discount + '%' : 'No hint'
  }));
  const tier = (skill: SkillCatalogEntry) =>
    skill.rarity >= 3 ? 'unique' : skill.rarity === 2 ? 'gold' : 'white';
  /** What an upgrade builds on, in words. */
  function needs(offer: PricedOffer) {
    const parts = [];
    if (offer.bundled)
      parts.push('includes ' + offer.bundled.map((skill) => skill.name).join(' and '));
    if (offer.buildsOn?.owned) parts.push('upgrades her ' + offer.buildsOn.skill.name);
    else if (offer.buildsOn) parts.push('needs ' + offer.buildsOn.skill.name + ' first');
    return parts.join(', ');
  }
</script>

<SimSection
  {number}
  title="Skills to buy"
  note="What she can buy, with the hints she has"
>
  {#snippet actions()}
    {#if buildSearch.offers.length}<Button
        variant="ghost"
        size="sm"
        onclick={() => (buildSearch.offers = [])}
      >
        Clear
      </Button>{/if}
  {/snippet}
  <div class="budget-row">
    <TextField
      id="build-budget"
      label="SP available"
      type="number"
      min={0}
      bind:value={buildSearch.budget}
    />
    <TextField
      id="build-fans"
      label="Fans"
      type="number"
      min={0}
      placeholder="—"
      bind:value={
        () => (buildSearch.uma.fanCount === undefined ? '' : String(buildSearch.uma.fanCount)),
        (value) =>
          (buildSearch.uma.fanCount =
            value === '' || !Number.isFinite(Number(value))
              ? undefined
              : Math.max(0, Math.round(Number(value))))
      }
    />
    <label class="fast-learner">
      <input
        type="checkbox"
        bind:checked={buildSearch.fastLearner}
      />
      <span>
        Fast Learner
        <small>another 10% off every skill</small>
      </span>
    </label>
    <p
      class="total"
      class:over={total > budget}
    >
      All on offer <strong>{total.toLocaleString()} SP</strong>
      <span>
        {total > budget
          ? (total - budget).toLocaleString() + ' over, so the search chooses'
          : 'fits'}
      </span>
    </p>
  </div>
  <div
    class="add"
    bind:this={anchor}
  >
    <Combobox
      id="build-skill-search"
      label="Add a skill on offer"
      hideLabel
      placeholder="Type a skill name to add it…"
      prefixIcon="search"
      {options}
      bind:query
      action
      popupAnchor={anchor}
      maxResults={12}
      emptyText={catalog.size ? 'No skill matches.' : 'Skill data is loading…'}
      onchange={add}
    />
  </div>
  {#if offers.priced.length || offers.missing.length}
    <ul
      class="offers"
      aria-label="Skills on offer"
    >
      {#each offers.priced as offer (offer.skillId)}
        <li class="offer tier-{tier(offer.skill)}">
          <img
            src={skillImage(offer.skill.icon)}
            alt=""
            width="24"
            height="24"
            loading="lazy"
          />
          <span class="name">
            <strong>{offer.skill.name}</strong>
            {#if offer.upgrades}<small>{needs(offer)}</small>{/if}
          </span>
          <SelectFieldSlim
            id="build-hint-{offer.skillId}"
            label={'Hint for ' + offer.skill.name}
            hideLabel
            options={HINT_OPTIONS}
            value={String(offer.hint)}
            onchange={(value) => setHint(offer.skillId, value)}
          />
          <span class="cost">
            {#if offer.cost !== offer.base && offer.needs !== 'bundled'}<s>{offer.base}</s>{/if}
            <strong>{offer.cost}</strong>
            SP
          </span>
          <button
            type="button"
            class="remove"
            aria-label={'Remove ' + offer.skill.name}
            onclick={() => remove(offer.skillId)}
          >
            ×
          </button>
        </li>
      {/each}
      {#each offers.missing as offer (offer.skillId)}
        <li class="offer missing">
          <span class="name">
            <strong>{catalog.get(offer.skillId)?.name ?? 'Skill ' + offer.skillId}</strong>
            <small>no cost data, so the search leaves it out</small>
          </span>
          <button
            type="button"
            class="remove"
            aria-label="Remove skill {offer.skillId}"
            onclick={() => remove(offer.skillId)}
          >
            ×
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">
      Add the skills she can buy; the search finds the best set within the budget.
    </p>
  {/if}
</SimSection>

<style>
  .budget-row {
    --control-height: var(--setup-control-height, 36px);
    display: grid;
    grid-template-columns: 120px 130px auto minmax(0, 1fr);
    gap: 10px 14px;
    align-items: end;
  }
  .budget-row :global(.field) {
    gap: 4px;
  }
  .budget-row :global(label) {
    font-size: 12px;
  }
  .fast-learner {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control-height);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .fast-learner input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary);
  }
  .fast-learner span {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 8px;
    line-height: 1.3;
  }
  .fast-learner small {
    font-weight: 400;
    color: var(--text-secondary);
  }
  .total {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 2px 8px;
    min-height: var(--control-height);
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
    align-content: center;
  }
  .total strong {
    font-size: 15px;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
  .total.over strong {
    color: var(--accent-warning);
  }
  .add {
    --control-height: var(--setup-control-height, 36px);
  }
  .add :global(input) {
    font-size: 13px;
  }
  /* Two a row only when both rows still fit the whole name. */
  .offers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 500px), 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .offer {
    --tier: 148 163 184;
    --tier-text: var(--text-primary);
    display: grid;
    --remove: 28px;
    grid-template-columns: 24px minmax(0, 1fr) 128px 76px var(--remove);
    grid-template-areas: 'icon name hint cost remove';
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 3px 4px 3px 8px;
    border: 1px solid rgb(var(--tier) / 0.35);
    border-radius: 8px;
    background: rgb(var(--tier) / 0.06);
  }
  .tier-gold {
    --tier: 255 193 7;
    --tier-text: #ffe08a;
  }
  .tier-unique {
    --tier: 206 147 216;
    --tier-text: #e1bee7;
  }
  :global(:root[data-theme='light']) .tier-gold {
    --tier: 217 119 6;
    --tier-text: #92400e;
  }
  :global(:root[data-theme='light']) .tier-unique {
    --tier: 126 34 206;
    --tier-text: #6b21a8;
  }
  .offer img {
    grid-area: icon;
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .name {
    grid-area: name;
    display: grid;
    min-width: 0;
    line-height: 1.25;
  }
  .name strong {
    overflow: hidden;
    color: var(--tier-text);
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name small {
    overflow: hidden;
    font-size: 11px;
    color: var(--text-secondary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .offer :global(.select-field-slim) {
    grid-area: hint;
  }
  .offer :global(button.select-control) {
    min-height: 28px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 12px;
  }
  .cost {
    grid-area: cost;
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }
  .cost strong {
    font-size: 13px;
    color: var(--text-primary);
  }
  .cost s {
    opacity: 0.7;
  }
  .remove {
    grid-area: remove;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }
  .remove:hover {
    background: var(--tab-btn-hover-bg);
    color: var(--text-primary);
  }
  .offer.missing {
    grid-template-columns: minmax(0, 1fr) var(--remove);
    grid-template-areas: 'name remove';
    border-style: dashed;
  }
  .empty {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  @container build-form (max-width:620px) {
    .budget-row {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .fast-learner,
    .total {
      grid-column: 1 / -1;
    }
    .total {
      justify-content: flex-start;
    }
    .offers {
      grid-template-columns: minmax(0, 1fr);
    }
    /* The name and cost on top, the hint under them. */
    .offer {
      grid-template-columns: 24px minmax(0, 1fr) auto var(--remove);
      grid-template-areas:
        'icon name cost remove'
        '. hint hint remove';
      row-gap: 4px;
      padding-block: 6px;
    }
  }
  @media (max-width: 767px) {
    .offer {
      --remove: 44px;
    }
    .remove {
      width: 44px;
      height: 44px;
    }
    .offer :global(button.select-control) {
      min-height: 44px;
    }
  }
</style>
