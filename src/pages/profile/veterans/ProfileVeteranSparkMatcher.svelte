<script lang="ts">
  import { tick } from 'svelte';
  import { factorOptions } from '@/lib/game-data/factors/factors';
  import type { CharacterData } from '@/lib/game-data/characters';
  import type { FactorScope, VeteranFactorFilter } from '@/lib/profile/veterans/profile-veterans';
  import SparkBrowser from '@/components/sparks/SparkBrowser.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Slider from '@/components/controls/Slider.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';

  let {
    filters = $bindable([]),
    category = $bindable('all'),
    characters,
    scopeLabels
  }: {
    filters?: VeteranFactorFilter[];
    category?: string;
    characters: Map<number, CharacterData>;
    scopeLabels: Record<FactorScope, string>;
  } = $props();

  const factors = $derived(factorOptions());

  const scopes: Record<FactorScope, string> = {
    parent: 'Main',
    grandparent: 'Parents',
    greatgrandparent: 'Grandparents',
    family: 'Main + parents',
    any: 'Any generation',
    p1: 'P1',
    p2: 'P2'
  };

  function starCap(scope: FactorScope, mode: VeteranFactorFilter['mode']) {
    return mode !== 'total'
      ? 3
      : { any: 9, family: 9, greatgrandparent: 12, grandparent: 6, parent: 3, p1: 3, p2: 3 }[scope];
  }

  function update(index: number, patch: Partial<VeteranFactorFilter>) {
    filters = filters.map((filter, i) => (i === index ? { ...filter, ...patch } : filter));
  }

  function selectedIndex(id: number) {
    return filters.findIndex((filter) => filter.factorId === id);
  }

  async function choose(factorId: number) {
    let index = selectedIndex(factorId);
    if (index < 0) {
      index = filters.length;
      filters = [
        ...filters,
        { factorId, minLevel: 1, scope: 'any', mode: 'total', operator: 'and' }
      ];
    }

    category = 'all';
    await tick();
    document.getElementById('factor-stars-' + index + '-start')?.focus({ preventScroll: true });
  }

  async function remove(index: number) {
    filters = filters.filter((_, i) => i !== index);
    await tick();
    document
      .getElementById('factor-stars-' + Math.min(index, filters.length - 1) + '-start')
      ?.focus({ preventScroll: true });
  }

  async function duplicate(index: number) {
    filters = [...filters, { ...filters[index]!, operator: 'and' }];
    category = 'all';
    await tick();
    document
      .getElementById('factor-stars-' + (filters.length - 1) + '-start')
      ?.focus({ preventScroll: true });
  }

  function closeOptions(event: MouseEvent) {
    (event.currentTarget as HTMLElement).closest<HTMLElement>('[popover]')?.hidePopover();
  }

  function sumStars(index: number, combined: boolean) {
    const filter = filters[index]!,
      mode = combined ? 'total' : 'minimum';

    update(index, {
      mode,
      minLevel: Math.min(starCap(filter.scope, mode), filter.minLevel),
      maxLevel: undefined
    });
  }

  function setRange(index: number, minLevel: number, maxLevel: number) {
    const filter = filters[index]!,
      mode = filter.mode === 'total' ? 'total' : minLevel === maxLevel ? 'exact' : 'minimum';

    update(index, {
      mode,
      minLevel,
      maxLevel: maxLevel === starCap(filter.scope, mode) ? undefined : maxLevel
    });
  }
</script>

<div class="spark-matcher">
  {#if category !== 'all'}
    <div class="spark-browser">
      <header>
        <span>{filters.length ? 'Add another spark' : 'Choose a spark'}</span>
        <IconButton
          icon="close"
          label="Close spark choices"
          onclick={() => (category = 'all')}
        />
      </header>
      <SparkBrowser
        {category}
        {characters}
        selectedFactorIds={filters.map((filter) => filter.factorId)}
        onchoose={choose}
      />
    </div>
  {/if}
  {#if filters.length}
    <div
      class="requirements"
      aria-label="Selected spark rules"
    >
      {#each filters as filter, index}
        {@const factor = factors.find((factor) => Number(factor.id) === filter.factorId)}
        {@const type = factor?.type}
        {@const cap = Math.max(starCap(filter.scope, filter.mode), filter.minLevel)}
        {#if index}
          <div class="rule-join">
            <SegmentedControl
              label={'Rule ' + (index + 1) + ' operator'}
              options={[
                { value: 'and', label: 'AND' },
                { value: 'or', label: 'OR' }
              ]}
              value={filter.operator ?? 'and'}
              onchange={(value) => update(index, { operator: value as 'and' | 'or' })}
            />
          </div>
        {/if}
        <div class="requirement">
          <div class="rule-heading">
            <div class="rule-menu">
              <InspectPopover
                label={'Spark options for rule ' + (index + 1)}
                align="end"
              >
                {#snippet trigger()}
                  <span
                    class="spark-star"
                    class:blue={type === 0}
                    class:pink={type === 1}
                    class:green={type === 5}
                    aria-hidden="true"
                  >
                    ★
                  </span>
                  <strong
                    class="rule-name"
                    title="Change spark and matching options"
                  >
                    {factor?.text ?? 'Unknown spark'}
                  </strong>
                {/snippet}
                <div class="advanced-spark">
                  <h4>Spark options</h4>
                  <div class="option-field">
                    <SelectFieldSlim
                      id={'factor-name-' + index}
                      label="Spark"
                      value={String(filter.factorId)}
                      options={factors
                        .filter((item) => item.type === type)
                        .sort((a, b) => a.text.localeCompare(b.text))
                        .map((item) => ({ value: String(item.id), label: item.text }))}
                      onchange={(value) => update(index, { factorId: Number(value) })}
                    />
                  </div>
                  <label class="combine-stars">
                    <input
                      type="checkbox"
                      aria-label="Sum stars across family"
                      checked={filter.mode === 'total'}
                      onchange={(event) => sumStars(index, event.currentTarget.checked)}
                    />
                    <span>Combine stars across family</span>
                  </label>
                  <div class="option-actions">
                    <button
                      type="button"
                      aria-label={'Duplicate rule ' + (index + 1)}
                      onclick={(event) => {
                        closeOptions(event);
                        void duplicate(index);
                      }}
                    >
                      <Icon
                        name="copy"
                        size={13}
                      />Duplicate
                    </button>
                  </div>
                </div>
              </InspectPopover>
            </div>
            <div class="rule-scope">
              <SelectFieldSlim
                id={'factor-scope-' + index}
                label="Where to match"
                hideLabel
                value={filter.scope}
                options={Object.keys(scopeLabels).map((scope) => ({
                  value: scope,
                  label: scopes[scope as FactorScope]
                }))}
                onchange={(value) => {
                  const scope = value as FactorScope,
                    cap = starCap(scope, filter.mode);
                  update(index, {
                    scope,
                    maxLevel: filter.maxLevel == null ? undefined : Math.min(cap, filter.maxLevel),
                    minLevel: Math.min(cap, filter.minLevel)
                  });
                }}
              />
            </div>
            <span class="rule-remove">
              <IconButton
                icon="trash"
                size="sm"
                label={'Remove rule ' + (index + 1)}
                title={'Remove ' + (factor?.text ?? 'spark') + ' filter'}
                onclick={() => void remove(index)}
              />
            </span>
          </div>
          <div class="factor-range">
            <Slider
              id={'factor-stars-' + index}
              label="Stars"
              hideLabel
              showOutput={cap > 9}
              unit="★"
              min={1}
              max={cap}
              step={1}
              range
              value={filter.minLevel}
              endValue={filter.mode === 'exact' ? filter.minLevel : (filter.maxLevel ?? cap)}
              tone={type === 0 ? 'blue' : type === 1 ? 'pink' : type === 5 ? 'green' : 'white'}
              showTicks={cap <= 9}
              showTickLabels={cap <= 9}
              tickLabels={Array.from(
                { length: cap },
                (_, i) =>
                  i +
                  1 +
                  '★' +
                  (filter.scope === 'any' && filter.mode === 'total' && i + 1 === cap ? '+' : '')
              )}
              onchange={(min, max) => setRange(index, min, max ?? cap)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  @import './profile-veteran-spark-matcher.css';
</style>
