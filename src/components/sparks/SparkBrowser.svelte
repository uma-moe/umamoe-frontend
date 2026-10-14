<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { factorImage, factorOptions, type FactorMetadata } from '@/lib/catalog/factor-catalog';
  import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
  import WhiteFactorTypePicker from '@/pages/database/filters/WhiteFactorTypePicker.svelte';
  import Button from '../controls/Button.svelte';
  import Icon from '../Icon.svelte';
  import TextField from '../controls/TextField.svelte';

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });

  let {
    category,
    characters,
    selectedFactorIds = [],
    onchoose
  }: {
    category: string;
    characters: Map<number, CharacterCatalogEntry>;
    selectedFactorIds?: number[];
    onchoose: (factorId: number) => void;
  } = $props();
  const id = $props.id();

  let uniqueSearch = $state('');

  const factors = $derived(factorOptions());
  // Unique factor IDs contain the outfit card ID followed by a zero.
  const uniqueSparks = $derived(
    factors
      .filter((factor) => factor.type === 5)
      .map((factor) => ({ factor, character: characters.get(Number(factor.id) / 10) }))
      .sort((a, b) => a.factor.text.localeCompare(b.factor.text))
  );
  const visibleUniques = $derived(
    uniqueSparks.filter(({ factor, character }) =>
      ((character?.name ?? '') + ' ' + factor.text)
        .toLocaleLowerCase()
        .includes(uniqueSearch.trim().toLocaleLowerCase())
    )
  );
</script>

{#snippet choice(factor: FactorMetadata, stat = false)}
  <div
    class="spark-choice"
    class:stat
  >
    <Button
      variant="secondary"
      ariaLabel={'Add ' + factor.text + ' spark'}
      ariaPressed={selectedFactorIds.includes(Number(factor.id))}
      onclick={() => onchoose(Number(factor.id))}
    >
      <span class="choice-copy">
        {#if stat}
          <img
            src={'/assets/images/icon/stats/' + factor.text.toLowerCase() + '.webp'}
            alt=""
          />
        {/if}
        <span>{factor.text}</span>
        {#if selectedFactorIds.includes(Number(factor.id))}
          <Icon
            name="check"
            size={12}
          />
        {/if}
      </span>
    </Button>
  </div>
{/snippet}

<div class="spark-browser-choices">
  {#if category === '0'}
    <div
      class="quick-stats"
      role="group"
      aria-label="Add a blue stat spark"
    >
      {#each factors.filter((factor) => factor.type === 0) as factor}
        {@render choice(factor, true)}
      {/each}
    </div>
  {:else if category === '1'}
    <div
      class="quick-aptitudes"
      role="group"
      aria-label="Add an aptitude spark"
    >
      {#each [{ label: 'Track', ids: [110, 120] }, { label: 'Distance', ids: [310, 320, 330, 340] }, { label: 'Running style', ids: [210, 220, 230, 240] }] as group}
        <fieldset>
          <legend>{group.label}</legend>
          <div>
            {#each factors.filter((factor) => group.ids.includes(Number(factor.id))) as factor}
              {@render choice(factor)}
            {/each}
          </div>
        </fieldset>
      {/each}
    </div>
  {:else if category === '5'}
    <div
      class="unique-sparks"
      role="group"
      aria-label="Add a unique spark"
    >
      <TextField
        id={id + '-unique-search'}
        label="Search unique sparks"
        hideLabel
        type="search"
        prefixIcon="search"
        placeholder="Character or skill name…"
        bind:value={uniqueSearch}
      />
      <div
        class="unique-options"
        use:virtualScroll={{
          items: visibleUniques,
          key: (item) => item.factor.id,
          root: 'closest',
          estimate: 48,
          onrange: (range) => (virtualRange = range)
        }}
      >
        {#each visibleUniques.slice(virtualRange.start, virtualRange.end) as { factor }, index (factor.id)}
          {@const image = factorImage(Number(factor.id))}
          <div data-virtual-index={virtualRange.start + index}>
            <Button
              variant="secondary"
              ariaLabel={'Add ' + factor.text + ' spark'}
              ariaPressed={selectedFactorIds.includes(Number(factor.id))}
              onclick={() => onchoose(Number(factor.id))}
            >
              <span class="unique-choice">
                {#if image}
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                  />
                {:else}
                  <Icon
                    name="star"
                    size={24}
                  />
                {/if}
                <span>{factor.text}</span>
                <Icon
                  name={selectedFactorIds.includes(Number(factor.id)) ? 'check' : 'add'}
                  size={15}
                />
              </span>
            </Button>
          </div>
        {/each}
      </div>
      {#if !visibleUniques.length}
        <p class="no-unique-matches">No characters or unique skills match.</p>
      {/if}
    </div>
  {:else if category === 'white'}
    <WhiteFactorTypePicker
      id={id + '-white'}
      mode="browse"
      {selectedFactorIds}
      onadd={(ids) => onchoose(ids[0]!)}
    />
  {/if}
</div>

<style>
  .unique-options > [data-virtual-index] {
    display: grid;
    min-width: 0;
  }
  .spark-browser-choices {
    --control-height: 34px;
    min-width: 0;
  }
  .spark-choice :global(.ui-button) {
    width: 100%;
    min-height: 32px;
    padding: 5px 9px;
    border-color: var(--border-secondary);
    border-radius: 5px;
    font-size: 11px;
    font-weight: 400;
  }
  .spark-choice :global(.ui-button:hover),
  .unique-options :global(.ui-button:hover) {
    background: var(--surface-3);
    border-color: var(--accent-primary);
  }
  .spark-choice :global(.ui-button[aria-pressed='true']),
  .unique-options :global(.ui-button[aria-pressed='true']) {
    border-color: var(--accent-primary);
    background: var(--factor-option-selected-bg);
    color: var(--factor-option-selected-text);
  }
  .choice-copy {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
  }
  .quick-stats {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
  }
  .stat :global(.ui-button) {
    position: relative;
    min-height: 54px;
    padding: 5px 1px;
    font-size: 10px;
  }
  .stat .choice-copy {
    display: grid;
    justify-items: center;
  }
  .stat img {
    width: 18px;
    height: 18px;
  }
  .stat :global(svg) {
    position: absolute;
    top: 2px;
    right: 2px;
  }
  .quick-aptitudes,
  .unique-sparks {
    display: grid;
    gap: 10px;
  }
  .quick-aptitudes fieldset {
    min-width: 0;
    padding: 0;
    margin: 0;
    border: 0;
  }
  .quick-aptitudes legend {
    padding: 0;
    margin-bottom: 6px;
    color: var(--color-text-muted);
    font-size: 10px;
  }
  .quick-aptitudes fieldset > div {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .unique-sparks :global(input) {
    font-size: 11px;
  }
  .no-unique-matches {
    margin: 8px 0;
    color: var(--color-text-muted);
    font-size: 11px;
  }
  .unique-options {
    display: grid;
    gap: 4px;
  }
  .unique-options :global(.ui-button) {
    min-width: 0;
    min-height: 38px;
    padding: 4px 6px;
    border-color: var(--border-primary);
    border-radius: 5px;
    text-align: left;
    font-size: 11px;
    font-weight: 400;
  }
  .unique-options :global(.ui-button > span) {
    width: 100%;
    min-width: 0;
  }
  .unique-choice {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 6px;
  }
  .unique-choice img {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }
  .unique-choice > span {
    min-width: 0;
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  @media (max-width: 767px) {
    .spark-choice :global(.ui-button),
    .unique-sparks :global(input),
    .unique-options :global(.ui-button) {
      min-height: var(--touch-target);
    }
  }
</style>
