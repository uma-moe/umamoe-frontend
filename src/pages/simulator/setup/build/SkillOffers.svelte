<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Combobox, { type ComboboxOption } from '@/components/controls/Combobox.svelte';
  import { skillImage, type SkillData } from '@/lib/game-data/skills/skills';
  import SimSection from '../../shell/SimSection.svelte';
  import BuildBudget from './BuildBudget.svelte';
  import { buildSearch } from './build-search.svelte';
  import {
    baseCost,
    HINT_DISCOUNT,
    isInheritedUnique,
    MAX_HINT,
    offerPurchases,
    skillTier,
    type PricedOffer
  } from './skill-offers';
  import SkillPoints from '@/components/game/SkillPoints.svelte';

  /**
   * The skills she can buy at the end of her career, each with its hint level and what it costs with it, against the SP
   * budget the search spends. Gold and ◎ skills show what they upgrade and how that is covered; a locked skill is in
   * every build.
   */
  let {
    number = 3,
    skillLookup,
    owned = [],
    showBudget = true
  }: {
    number?: number;
    skillLookup: Map<number, SkillData>;
    /** Skills she already has, which upgrades build on. */
    owned?: number[];
    /** Her SP, fans and Fast Learner sit here, above the skills, unless the Setup row has room for them. */
    showBudget?: boolean;
  } = $props();

  const offers = $derived(
    offerPurchases(buildSearch.offers, owned, skillLookup, buildSearch.fastLearner)
  );

  const total = $derived(offers.priced.reduce((sum, offer) => sum + offer.cost, 0));
  const budget = $derived(Number(buildSearch.budget) || 0);

  // Everything she could buy and does not have or have on offer yet: inherited uniques but not her own unique, priced
  // in the catalog.
  const options = $derived<ComboboxOption[]>(
    [...skillLookup.values()]
      .filter(
        (skill) =>
          (isInheritedUnique(skill) || !skill.unique) &&
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

  function toggleLock(skillId: number) {
    const offer = buildSearch.offers.find((item) => item.skillId === skillId);
    if (offer) offer.locked = !offer.locked;
  }

  /** One hint level up or down, within 0 (no hint) and the highest level. */
  function stepHint(skillId: number, step: 1 | -1) {
    const offer = buildSearch.offers.find((item) => item.skillId === skillId);
    if (!offer) return;
    offer.hint = Math.min(MAX_HINT, Math.max(0, offer.hint + step));
  }

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

<!-- What everything on offer costs against her SP; on one line in the header when her SP sits in the Setup row. -->
{#snippet totals(inline: boolean)}
  <div
    class="totals"
    class:inline
  >
    <dl>
      <div class:over={total > budget}>
        <dt>On offer</dt>
        <dd><SkillPoints value={total} /></dd>
      </div>
      {#if offers.locked.length}
        <div
          class="locked-total"
          class:over={offers.lockedCost > budget}
        >
          <dt>Locked</dt>
          <dd><SkillPoints value={offers.lockedCost} /></dd>
        </div>
      {/if}
    </dl>
    <p>
      {total > budget
        ? (total - budget).toLocaleString('en-US') + ' SP over the budget, so the search chooses'
        : 'Everything fits'}
    </p>
  </div>
{/snippet}

<SimSection
  {number}
  title="Skills to buy"
  note="What she can buy, with the hints she has"
>
  {#snippet actions()}
    {#if !showBudget}{@render totals(true)}{/if}
    {#if buildSearch.offers.length}
      <Button
        variant="ghost"
        size="sm"
        onclick={() => (buildSearch.offers = [])}
      >
        Clear
      </Button>
    {/if}
  {/snippet}
  {#if showBudget}
    <div class="budget-row">
      <BuildBudget />
      {@render totals(false)}
    </div>
  {/if}
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
      emptyText={skillLookup.size ? 'No skill matches.' : 'Skill data is loading…'}
      onchange={add}
    />
  </div>
  {#if offers.priced.length || offers.missing.length}
    <ul
      class="offers"
      aria-label="Skills on offer"
    >
      {#each offers.priced as offer (offer.skillId)}
        <li
          class="offer tier-{skillTier(offer.skill)}"
          class:locked={offer.locked}
        >
          <img
            src={skillImage(offer.skill.icon)}
            alt=""
            width="22"
            height="22"
            loading="lazy"
          />
          <span class="name">
            <strong>{offer.skill.name}</strong>
            {#if offer.upgrades}
              <small>{needs(offer)}</small>
            {/if}
          </span>
          <div
            class="hint"
            role="group"
            aria-label={'Hint for ' + offer.skill.name}
          >
            <button
              type="button"
              aria-label={'Lower the hint for ' + offer.skill.name}
              disabled={offer.hint <= 0}
              onclick={() => stepHint(offer.skillId, -1)}
            >
              <Icon
                name="minus"
                size={14}
              />
            </button>
            <output aria-live="polite">{offer.hint}</output>
            <button
              type="button"
              aria-label={'Raise the hint for ' + offer.skill.name}
              disabled={offer.hint >= MAX_HINT}
              onclick={() => stepHint(offer.skillId, 1)}
            >
              <Icon
                name="add"
                size={14}
              />
            </button>
            <span
              class="discount"
              class:none={!offer.hint}
            >
              {offer.hint ? '−' + HINT_DISCOUNT[offer.hint] + '%' : 'no hint'}
            </span>
          </div>
          <span class="cost">
            {#if offer.cost !== offer.base && offer.needs !== 'bundled'}
              <s>{offer.base}</s>
            {/if}
            <SkillPoints value={offer.cost} />
          </span>
          <span class="lock">
            <Button
              variant="secondary"
              size="sm"
              icon={offer.locked ? 'lock' : 'lock-open'}
              ariaPressed={Boolean(offer.locked)}
              ariaLabel={'Lock ' + offer.skill.name + ' so every build buys it'}
              title={offer.locked ? 'Every build buys it' : 'Lock it so every build buys it'}
              onclick={() => toggleLock(offer.skillId)}
            >
              <span class="lock-label">{offer.locked ? 'Locked' : 'Lock'}</span>
            </Button>
          </span>
          <span class="remove">
            <IconButton
              icon="close"
              size="sm"
              label={'Remove ' + offer.skill.name}
              onclick={() => remove(offer.skillId)}
            />
          </span>
        </li>
      {/each}
      {#each offers.missing as offer (offer.skillId)}
        <li class="offer missing">
          <span class="name">
            <strong>{skillLookup.get(offer.skillId)?.name ?? 'Skill ' + offer.skillId}</strong>
            <small>no cost data, so the search leaves it out</small>
          </span>
          <span class="remove">
            <IconButton
              icon="close"
              size="sm"
              label={'Remove skill ' + offer.skillId}
              onclick={() => remove(offer.skillId)}
            />
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">
      Add the skills she can buy, and the search finds the best set within the budget.
    </p>
  {/if}
</SimSection>

<style>
  @import './skill-offers.css';
  @import './skill-tier.css';
</style>
