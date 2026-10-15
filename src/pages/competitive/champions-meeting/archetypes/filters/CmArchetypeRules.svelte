<script lang="ts">
  import type { Card, Requirement, TeamMatcher } from '../../../hakuraku-types';
  import { styleNames } from '../../cm-data';
  import { hasRequirement } from '../../../hakuraku-query';
  import { portrait } from '../../../analysis-view';
  import {
    charaCardId,
    matcherCard,
    matcherLabel,
    sameMatcher,
    selectionMatcher,
    styleChoices
  } from './archetype-matchers';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import Icon from '@/components/Icon.svelte';

  interface Props {
    cards: Record<number, Card>;
    colors: Record<number, string>;
    parsed: { slots: Requirement[]; error: string };
    runnerChoices: { value: string; label: string; image?: string; keywords?: string }[];
    onapply: (slots: Requirement[]) => void;
  }

  let { cards, colors, parsed, runnerChoices, onapply }: Props = $props();

  let advancedOpen = $state(false),
    ruleTarget = $state('exclude'),
    ruleUma = $state(''),
    ruleStyle = $state('');

  const label = (matcher: TeamMatcher) => matcherLabel(cards, matcher);

  const advancedCount = $derived(
    parsed.slots.reduce(
      (count, slot) => count + (slot.exclude ? 1 : Math.max(0, (slot.anyOf?.length ?? 1) - 1)),
      0
    )
  );
  const ruleMatcher = $derived(selectionMatcher(cards, ruleUma, ruleStyle));
  const ruleOptions = $derived(
    parsed.slots[Number(ruleTarget)]?.anyOf ?? [parsed.slots[Number(ruleTarget)] ?? {}]
  );
  const ruleHasBase = $derived(
    ruleTarget === 'exclude' || hasRequirement(parsed.slots[Number(ruleTarget)] ?? {})
  );
  const ruleRows = $derived(
    [0, 1, 2].map((index) => ({
      value: String(index),
      label:
        'Runner ' +
        (index + 1) +
        ' · ' +
        ((parsed.slots[index]?.anyOf ?? [parsed.slots[index] ?? {}])
          .filter(hasRequirement)
          .map(label)
          .join(' or ') || 'Any runner')
    }))
  );
  const ruleDuplicate = $derived(
    hasRequirement(ruleMatcher) &&
      (ruleTarget === 'exclude'
        ? parsed.slots.some((slot) => slot.exclude && sameMatcher(slot, ruleMatcher))
        : ruleOptions.some((option) => sameMatcher(option, ruleMatcher)))
  );

  function addRule() {
    if (!hasRequirement(ruleMatcher) || ruleDuplicate || parsed.error) return;
    const slots = parsed.slots.map((slot) => ({ ...slot }));
    if (ruleTarget === 'exclude') slots.push({ ...ruleMatcher, exclude: true });
    else {
      const index = Number(ruleTarget),
        slot = slots[index] ?? {},
        choices = [...(slot.anyOf ?? (hasRequirement(slot) ? [slot] : [])), ruleMatcher];
      slots[index] = choices.length > 1 ? { anyOf: choices } : choices[0]!;
    }
    onapply(slots);
    ruleUma = '';
    ruleStyle = '';
  }

  function removeRule(index: number, alternative?: number) {
    const slots = parsed.slots.map((slot) => ({ ...slot }));
    if (alternative === undefined) slots.splice(index, 1);
    else {
      const choices = slots[index]!.anyOf!.filter((_, i) => i !== alternative);
      slots[index] = choices.length > 1 ? { anyOf: choices } : (choices[0] ?? {});
    }
    onapply(slots);
  }
</script>

{#snippet matcherSummary(matcher: TeamMatcher)}
  {@const card = matcherCard(cards, matcher)}
  <span
    class="applied-choice"
    title={label(matcher)}
  >
    {#if card}
      <img
        src={portrait(matcher.card ?? charaCardId(cards, matcher.chara))}
        alt=""
        width="20"
        height="20"
      />
      <span>
        <strong>{card.name}</strong>
        <small>
          {' · ' + (matcher.card ? card.outfit : 'Any outfit')}{#if matcher.style}
            <span style:color={colors[matcher.style]}>
              {' · ' + styleNames[matcher.style]}
            </span>
          {/if}
        </small>
      </span>
    {:else}
      <span>
        <strong>{matcher.style ? styleNames[matcher.style] : 'Any Uma'}</strong>
        {#if matcher.style}
          <small>· Any Uma</small>
        {/if}
      </span>
    {/if}
  </span>
{/snippet}
{#snippet appliedRules()}
  {#each parsed.slots as slot, index}
    {#if slot.exclude}
      <li>
        <span class="rule-kind">Exclude</span>
        <span class="rule-matches">
          {#each slot.anyOf ?? [slot] as matcher, option}
            {#if option}
              <span class="rule-or">or</span>
            {/if}{@render matcherSummary(matcher)}
          {/each}
        </span>
        <button
          type="button"
          aria-label={'Remove exclusion ' + (slot.anyOf ?? [slot]).map(label).join(' or ')}
          onclick={() => removeRule(index)}
        >
          <Icon
            name="close"
            size={14}
          />
        </button>
      </li>
    {:else if slot.anyOf}
      {#each slot.anyOf.slice(1) as alternative, option}
        <li>
          <span class="rule-kind">
            Runner {index + 1}
            <small>or</small>
          </span>
          <span class="rule-matches">{@render matcherSummary(alternative)}</span>
          <button
            type="button"
            aria-label={'Remove Runner ' + (index + 1) + ' alternative ' + label(alternative)}
            onclick={() => removeRule(index, option + 1)}
          >
            <Icon
              name="close"
              size={14}
            />
          </button>
        </li>
      {/each}
    {/if}
  {/each}
{/snippet}
<section
  class="advanced-filters"
  aria-label="Advanced filters"
>
  <Disclosure
    compact
    id="cm-advanced-filter-editor"
    title="Advanced filters"
    description={advancedCount ? advancedCount + ' applied' : undefined}
    bind:open={advancedOpen}
  >
    <div class="advanced-content">
      <div class="rule-mode">
        <SegmentedControl
          compact
          label="Filter type"
          value={ruleTarget === 'exclude' ? 'exclude' : 'alternative'}
          onchange={(value) =>
            (ruleTarget =
              value === 'exclude'
                ? 'exclude'
                : String(Math.max(0, parsed.slots.slice(0, 3).findIndex(hasRequirement))))}
          options={[
            { value: 'exclude', label: 'Exclude runners' },
            { value: 'alternative', label: 'Add another choice' }
          ]}
        />
      </div>
      {#if ruleTarget !== 'exclude'}
        <div class="rule-runner">
          <SelectField
            id="cm-rule-target"
            label="Lineup row"
            bind:value={ruleTarget}
            options={ruleRows}
          />
        </div>
      {/if}
      <p class="rule-help">
        {ruleTarget === 'exclude'
          ? 'Hide teams containing a runner that matches both fields.'
          : !ruleHasBase
            ? 'Add this row’s first choice below, then add another to allow either.'
            : 'Match any choice in this row. The other rows still need separate runners.'}
      </p>
      <div class="rule-fields">
        <Combobox
          id="cm-rule-uma"
          label="Uma / outfit"
          placeholder="Any Uma"
          prefixIcon="search"
          emptyValue=""
          bind:value={ruleUma}
          options={runnerChoices}
        />
        <SelectField
          id="cm-rule-style"
          label="Running style"
          bind:value={ruleStyle}
          options={styleChoices}
        />
      </div>
      <div class="rule-footer">
        <p
          class="rule-preview"
          class:ready={hasRequirement(ruleMatcher) && !ruleDuplicate}
        >
          {#if ruleDuplicate}
            This choice is already applied.
          {:else if !hasRequirement(ruleMatcher)}
            {ruleTarget === 'exclude'
              ? 'Example: Any Uma + Debuffer hides teams with a debuffer.'
              : 'Choose an Uma, a style, or both.'}
          {:else if ruleTarget !== 'exclude'}
            <strong>
              Runner {Number(ruleTarget) + 1}:
            </strong>
            {ruleOptions.filter(hasRequirement).map(label).join(' or ')}{#if ruleHasBase}
              <strong>{' or '}</strong>
            {/if}{label(ruleMatcher)}
          {:else}
            <strong>Hide:</strong>
            {label(ruleMatcher)}
          {/if}
        </p>
        <Button
          size="sm"
          disabled={!hasRequirement(ruleMatcher) || ruleDuplicate || Boolean(parsed.error)}
          onclick={addRule}
        >
          {ruleTarget === 'exclude' ? 'Add exclusion' : 'Add option'}
        </Button>
      </div>
    </div>
  </Disclosure>
  {#if advancedCount}
    <ul
      class="applied-rules inline-rules"
      aria-label="Applied advanced filters"
    >
      {@render appliedRules()}
    </ul>
  {/if}
</section>

<style>
  @import '../archetype-text.css';
  @import './cm-archetype-rules.css';
</style>
