<script lang="ts">
  import { simulatorUmaFromCm } from '@/pages/simulator/simulator-uma';
  import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
  import { onMount } from 'svelte';
  import type {
    Summary,
    Performer,
    Build,
    TeamDetail,
    TeamSearchResponse,
    TeamDistributionResponse,
    TeamMatcher,
    Requirement,
    Snapshot
  } from '../hakuraku-types';
  import { cmGet, snapshotPath, pct, number, buildRunner, styleOrder, styleNames } from './cm-data';
  import { parseQuery, queryText, SHORT_STYLE, hasRequirement } from '../hakuraku-query';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import Combobox from '@/components/controls/Combobox.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Disclosure from '@/components/overlays/Disclosure.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RunnerBuildDetails from '../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../runners/RunnerBuildGroup.svelte';
  import RunnerTraining from '../runners/RunnerTraining.svelte';
  import RunnerLineupRow from '../runners/RunnerLineupRow.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import { portrait } from '../analysis-view';
  import { theme } from '@/stores/theme';

  let {
    data,
    colors,
    snapshot,
    query = $bindable(''),
    lobby,
    teamDraft,
    pendingTeams,
    pendingRunners,
    teamError,
    onrunner,
    onbuildteam,
    onremoverunner,
    onclearteam,
    ontoggle,
    onlobby
  }: {
    data: Summary;
    snapshot?: Snapshot;
    colors: Record<number, string>;
    query?: string;
    lobby: Performer[];
    pendingTeams: string[];
    teamDraft: { key: string; build: Build }[];
    pendingRunners: string[];
    teamError: string;
    onrunner: (team: Performer, index: number) => void;
    onbuildteam: () => void;
    onremoverunner: (key: string) => void;
    onclearteam: () => void;
    ontoggle: (team: Performer) => void;
    onlobby: () => void;
  } = $props();

  let simBusy = $state(false),
    simError = $state('');

  async function simulate(builds: Build[], replace = false) {
    simBusy = true;
    simError = '';
    try {
      await openSimulatorField(
        builds.map((build) => simulatorUmaFromCm(build, data, replace ? 1 : 0)),
        {
          replace,
          raceInstanceId: snapshot?.raceInstanceId,
          startTimeType: snapshot?.startTimeType
        }
      );
      selected = '';
    } catch (error) {
      simError = (error as Error).message;
    } finally {
      simBusy = false;
    }
  }

  let mode = $state('all'),
    sort = $state('lower'),
    offset = $state(0),
    loading = $state(false),
    exhausted = $state(false),
    range = $state<VirtualRange>({ start: 0, end: 0 }),
    attempt = $state(0),
    result = $state<TeamSearchResponse>(),
    distribution = $state<TeamDistributionResponse>(),
    error = $state(''),
    distributionError = $state('');
  let filtersOpen = $state(true),
    showStats = $state(true),
    distributionExpanded = $state(false);
  let buildTeam = $state(false);

  const selectedRunners = $derived(new Set(teamDraft.map((r) => r.key)));

  let advancedOpen = $state(false),
    ruleTarget = $state('exclude'),
    ruleUma = $state(''),
    ruleStyle = $state('');
  let fieldGraphHeight = $state(144);
  let mobileTraining = $state(false);
  let selected = $state(''),
    detail = $state<TeamDetail>(),
    detailError = $state(''),
    copied = $state(false);

  const parsed = $derived.by(() => {
    try {
      return { slots: parseQuery(query, data.cards), error: '' };
    } catch (e) {
      return { slots: [], error: (e as Error).message };
    }
  });

  onMount(() => {
    const narrow = matchMedia('(max-width:1050px)');
    const mobile = matchMedia('(max-width:767px)');
    const adapt = () => (filtersOpen = !narrow.matches || Boolean(query));
    const adaptTraining = () => (mobileTraining = mobile.matches);
    adapt();
    narrow.addEventListener('change', adapt);
    adaptTraining();
    mobile.addEventListener('change', adaptTraining);
    return () => {
      narrow.removeEventListener('change', adapt);
      mobile.removeEventListener('change', adaptTraining);
    };
  });

  $effect(() => {
    if (query) filtersOpen = true;
  });

  const activeFilters = $derived(parsed.slots.filter(hasRequirement).length);
  const advancedCount = $derived(
    parsed.slots.reduce(
      (count, slot) => count + (slot.exclude ? 1 : Math.max(0, (slot.anyOf?.length ?? 1) - 1)),
      0
    )
  );
  const ruleMatcher = $derived(selectionMatcher(ruleUma, ruleStyle));
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
          .map(matcherLabel)
          .join(' or ') || 'Any runner')
    }))
  );
  const ruleDuplicate = $derived(
    hasRequirement(ruleMatcher) &&
      (ruleTarget === 'exclude'
        ? parsed.slots.some((slot) => slot.exclude && sameMatcher(slot, ruleMatcher))
        : ruleOptions.some((option) => sameMatcher(option, ruleMatcher)))
  );
  const lobbyIds = $derived(new Set(lobby.map((t) => t.id)));
  const population = $derived(
    parsed.slots.length === 3 &&
      parsed.slots.every((s) => s.style && !s.card && !s.chara && !s.anyOf && !s.exclude)
      ? data.archetypes.find(
          (r) =>
            r.key ===
            parsed.slots
              .map((s) => s.style)
              .sort((a, b) => a! - b!)
              .join('-')
        )
      : undefined
  );
  const total = $derived(
    mode === 'unique' ? (result?.totalOwners ?? 0) : (result?.totalTeams ?? 0)
  );

  $effect(() => {
    data.snapshotId;
    query;
    mode;
    sort;
    offset = 0;
    result = undefined;
    exhausted = false;
  });

  $effect(() => {
    const id = data.snapshotId;
    const params = new URLSearchParams({
      slots: JSON.stringify(parsed.slots),
      players: mode,
      sort,
      limit: '30',
      offset: String(offset)
    });
    attempt;
    if (offset === 0) result = undefined;
    error = '';
    if (parsed.error) return;
    loading = true;
    const controller = new AbortController();
    cmGet<TeamSearchResponse>(snapshotPath(id, 'teams?' + params), controller.signal, id)
      .then((v) => {
        if (!controller.signal.aborted) {
          result = { ...v, teams: offset === 0 ? v.teams : [...(result?.teams ?? []), ...v.teams] };
          exhausted = v.teams.length < 30;
          loading = false;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          error = e.message;
          loading = false;
        }
      });
    return () => controller.abort();
  });

  $effect(() => {
    const id = data.snapshotId;
    const params = new URLSearchParams({
      slots: JSON.stringify(parsed.slots),
      players: mode,
      sort
    });
    attempt;
    distribution = undefined;
    distributionError = '';
    if (parsed.error) return;
    const controller = new AbortController();
    cmGet<TeamDistributionResponse>(
      snapshotPath(id, 'team-distribution?' + params),
      controller.signal,
      id
    )
      .then((v) => {
        if (!controller.signal.aborted) distribution = v;
      })
      .catch((e) => {
        if (!controller.signal.aborted) distributionError = e.message;
      });
    return () => controller.abort();
  });

  $effect(() => {
    const id = data.snapshotId,
      team = selected;
    detail = undefined;
    detailError = '';
    copied = false;
    if (!team) return;
    const controller = new AbortController();
    cmGet<TeamDetail>(snapshotPath(id, 'teams/' + encodeURIComponent(team)), controller.signal, id)
      .then((v) => {
        if (!controller.signal.aborted) {
          detail = v;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) detailError = e.message;
      });
    return () => controller.abort();
  });

  function more() {
    if (!loading && !error && !exhausted && result && result.teams.length < total) {
      loading = true;
      offset += 30;
    }
  }

  function selectionMatcher(uma: string, style: string): TeamMatcher {
    return {
      ...(uma.startsWith('chara:')
        ? { chara: Number(uma.slice(6)) }
        : uma
          ? { card: Number(uma), chara: data.cards[Number(uma)]?.chara }
          : {}),
      ...(style ? { style: Number(style) } : {})
    };
  }

  function matcherValue(matcher: TeamMatcher) {
    return matcher.card ? String(matcher.card) : matcher.chara ? 'chara:' + matcher.chara : '';
  }

  function matcherLabel(matcher: TeamMatcher): string {
    const card = matcher.card
      ? data.cards[matcher.card]
      : Object.values(data.cards).find((card) => card.chara === matcher.chara);
    return [
      card ? card.name + ' · ' + (matcher.card ? card.outfit : 'Any outfit') : 'Any Uma',
      matcher.style ? styleNames[matcher.style] : undefined
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function sameMatcher(a: TeamMatcher, b: TeamMatcher) {
    return a.card === b.card && a.chara === b.chara && a.style === b.style;
  }

  function applySlots(slots: Requirement[]) {
    query = slots.some(hasRequirement) ? queryText(slots, data.cards) : '';
  }

  function filterSlot(index: number, key: 'card' | 'style', value: string) {
    const slots: Requirement[] = parsed.error ? [{}, {}, {}] : parsed.slots.map((s) => ({ ...s }));
    const slot = slots[index] ?? {},
      first = slot.anyOf?.[0] ?? slot;
    const matcher =
      key === 'card'
        ? selectionMatcher(value, String(first.style ?? ''))
        : { ...first, style: value ? Number(value) : undefined };
    const choices = [matcher, ...(slot.anyOf?.slice(1) ?? [])].filter(hasRequirement);
    slots[index] = choices.length > 1 ? { anyOf: choices } : (choices[0] ?? {});
    applySlots(slots);
  }

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
    applySlots(slots);
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
    applySlots(slots);
  }

  const chart = $derived({
    animationDuration: 350,
    backgroundColor: 'transparent',
    textStyle: { color: $theme === 'dark' ? '#aebdd0' : '#526178' },
    grid: { top: 38, right: 12, bottom: 42, left: 46 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: mobileTraining ? 20 : 10,
      name: 'Lower estimate of team win rate',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: { formatter: '{value}%', color: $theme === 'dark' ? '#aebdd0' : '#526178' },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      name: 'Teams',
      axisLabel: { color: $theme === 'dark' ? '#aebdd0' : '#526178' },
      splitLine: { lineStyle: { opacity: 0.12 } }
    },
    series: [
      {
        name: 'Teams',
        type: 'bar',
        barCategoryGap: '12%',
        data: Array.from({ length: 33 }, (_, i) => {
          const bin = distribution?.bins.find((b) => b.index === i);
          return {
            value: [((i + 0.5) * 100) / 33, bin?.count ?? 0],
            itemStyle: {
              color:
                (i + 0.5) / 33 >= Math.max(population?.team ?? 1 / 3, 1 / 3)
                  ? '#65c18c'
                  : '#4d6685',
              borderRadius: [2, 2, 0, 0]
            }
          };
        }),
        markLine: {
          symbol: 'none',
          label: { show: false },
          data: [
            {
              name: 'Equal teams: one win in three',
              xAxis: 100 / 3,
              lineStyle: { type: 'dashed', color: '#9aa8ba' },
              label: {
                show: true,
                formatter: 'Equal teams · 33.3%',
                position: 'insideEndTop',
                rotate: 0,
                color: $theme === 'dark' ? '#aebdd0' : '#526178',
                fontSize: 10
              }
            },
            ...(population
              ? [
                  {
                    name: 'Owner-latest average',
                    xAxis: population.team * 100,
                    lineStyle: { color: '#f2bf66', width: 2 }
                  }
                ]
              : [])
          ]
        }
      }
    ]
  });
  const inlineChart = $derived({
    ...chart,
    grid: { top: 22, right: 8, bottom: 32, left: 38 },
    xAxis: {
      ...chart.xAxis,
      interval: 20,
      name: 'Lower win estimate',
      nameGap: 22,
      nameTextStyle: { fontSize: 10 },
      axisLabel: { ...chart.xAxis.axisLabel, fontSize: 10 }
    },
    yAxis: {
      ...chart.yAxis,
      splitNumber: 3,
      nameTextStyle: { fontSize: 10 },
      axisLabel: { ...chart.yAxis.axisLabel, fontSize: 10 }
    }
  });
  const runnerChoices = $derived([
    { value: '', label: 'Any Uma' },
    ...Object.values(data.cards)
      .filter(
        (card, index, cards) => cards.findIndex((other) => other.chara === card.chara) === index
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((character) => [
        {
          value: 'chara:' + character.chara,
          label: character.name + ' · Any outfit',
          image: portrait(
            Number(
              Object.keys(data.cards).find(
                (id) => data.cards[Number(id)]?.chara === character.chara
              )
            )
          ),
          keywords: String(character.chara)
        },
        ...Object.entries(data.cards)
          .filter(([, card]) => card.chara === character.chara)
          .sort((a, b) => a[1].outfit.localeCompare(b[1].outfit))
          .map(([id, card]) => ({
            value: id,
            label: card.name + ' · ' + card.outfit,
            image: portrait(Number(id)),
            keywords: id
          }))
      ])
  ]);
  const styleChoices = $derived([
    { value: '', label: 'Any style' },
    ...styleOrder.map((id) => ({ value: String(id), label: styleNames[id]! }))
  ]);

  async function copyLink() {
    try {
      const url = new URL(location.href);
      url.searchParams.set('snapshot', data.snapshotId);
      url.searchParams.set('tab', 'archetypes');
      url.searchParams.set('team', selected);
      await navigator.clipboard.writeText(url.href);
      copied = true;
    } catch {
      detailError = 'Could not copy the team link.';
    }
  }

  $effect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('team')) selected = params.get('team')!;
  });
</script>

{#snippet runnerToggle(team: Performer, index: number)}
  {@const key = team.id + ':' + index}
  {@const name = data.cards[team.members[index]!.card]?.name ?? 'Uma'}
  <button
    class="runner-toggle"
    class:chosen={selectedRunners.has(key)}
    aria-label={(selectedRunners.has(key) ? 'Remove ' : 'Add ') +
      name +
      (selectedRunners.has(key) ? ' from custom team' : ' to custom team')}
    aria-pressed={selectedRunners.has(key)}
    disabled={pendingRunners.includes(key) ||
      (!selectedRunners.has(key) && teamDraft.length + pendingRunners.length >= 3)}
    onclick={() => {
      buildTeam = true;
      onrunner(team, index);
    }}
  >
    {#if pendingRunners.includes(key)}
      <Spinner
        size={14}
        label="Loading build…"
      />
    {:else}
      {#if selectedRunners.has(key)}
        <Icon
          name="close"
          size={16}
        />
      {:else}
        <span aria-hidden="true">+</span>
      {/if}
    {/if}
  </button>
{/snippet}
<div class="archetype-workspace">
  <div
    class="browse-tools"
    aria-label="Team browsing tools"
  >
    <section class="filter-panel">
      <div class="filter-heading">
        <button
          type="button"
          class="filter-toggle"
          aria-label="Lineup filters"
          aria-expanded={filtersOpen}
          aria-controls="cm-lineup-filters"
          onclick={() => (filtersOpen = !filtersOpen)}
        >
          <Icon
            name="tune"
            size={16}
          />
          <strong>Lineup filters</strong>
          {#if activeFilters}
            <span class="filter-count">{activeFilters} active</span>
          {/if}
          <span
            class="filter-chevron"
            class:open={filtersOpen}
          >
            <Icon
              name="chevron"
              size={14}
            />
          </span>
        </button>
        <span class="filter-note">Match runners in any order</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!query}
          onclick={() => (query = '')}
        >
          Reset
        </Button>
      </div>
      <div
        id="cm-lineup-filters"
        hidden={!filtersOpen}
      >
        <div
          class="filter-columns"
          aria-hidden="true"
        >
          <span></span>
          <div>
            <span>Runner / outfit</span>
            <span>Running style</span>
          </div>
        </div>
        <div class="filters">
          {#each [0, 1, 2] as index}
            {@const first = parsed.slots[index]?.anyOf?.[0] ?? parsed.slots[index] ?? {}}
            <div
              class="filter-slot"
              role="group"
              aria-label={'Runner ' + (index + 1) + ' filter'}
              class:active={hasRequirement(parsed.slots[index] ?? {})}
            >
              <span class="slot-number">Runner {index + 1}</span>
              <div class="slot-controls">
                <Combobox
                  id={'cm-filter-card-' + index}
                  label={'Runner ' + (index + 1) + ' Uma'}
                  hideLabel
                  placeholder="Any Uma"
                  prefixIcon="search"
                  emptyValue=""
                  value={matcherValue(first)}
                  options={runnerChoices}
                  onchange={(v) => filterSlot(index, 'card', v)}
                />
                <SelectField
                  id={'cm-filter-style-' + index}
                  label={'Teammate ' + (index + 1) + ' style'}
                  hideLabel
                  value={String(first.style ?? '')}
                  onchange={(v) => filterSlot(index, 'style', v)}
                  options={styleChoices}
                />
              </div>
            </div>
          {/each}
        </div>
        {#snippet matcherSummary(matcher: TeamMatcher)}
          {@const card = matcher.card
            ? data.cards[matcher.card]
            : Object.values(data.cards).find((card) => card.chara === matcher.chara)}
          <span
            class="applied-choice"
            title={matcherLabel(matcher)}
          >
            {#if card}
              <img
                src={portrait(
                  matcher.card ??
                    Number(
                      Object.keys(data.cards).find(
                        (id) => data.cards[Number(id)]?.chara === matcher.chara
                      )
                    )
                )}
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
                  aria-label={'Remove exclusion ' +
                    (slot.anyOf ?? [slot]).map(matcherLabel).join(' or ')}
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
                    aria-label={'Remove Runner ' +
                      (index + 1) +
                      ' alternative ' +
                      matcherLabel(alternative)}
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
                    {ruleOptions
                      .filter(hasRequirement)
                      .map(matcherLabel)
                      .join(' or ')}{#if ruleHasBase}
                      <strong>{' or '}</strong>
                    {/if}{matcherLabel(ruleMatcher)}
                  {:else}
                    <strong>Hide:</strong>
                    {matcherLabel(ruleMatcher)}
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
        {#if parsed.error}
          <p role="alert">{parsed.error}</p>
        {/if}
      </div>
    </section>
    <section class="field-panel">
      <ChartFrame
        plain
        compact
        maximize
        id="cm-team-distribution"
        title="Matching field"
        expandable
        bind:expanded={distributionExpanded}
        state={distributionError ? 'error' : distribution ? 'ready' : 'loading'}
      >
        {#snippet actions()}
          {#if distributionError}
            <Button
              size="sm"
              variant="secondary"
              onclick={() => attempt++}
            >
              Retry distribution
            </Button>
          {/if}
        {/snippet}
        {#if distribution}
          <div
            class="field-content"
            class:expanded={distributionExpanded}
          >
            <div
              class="field-graph"
              class:expanded={distributionExpanded}
              bind:clientHeight={fieldGraphHeight}
            >
              <LazyEChartsSurface
                option={distributionExpanded ? chart : inlineChart}
                label="Number of teams at each reliable win rate"
                height={fieldGraphHeight || 144}
              />
            </div>
            <dl class="field-stats">
              <div>
                <dt>{mode === 'unique' ? 'Player-best teams' : 'Matching teams'}</dt>
                <dd>{number(distribution.totalTeams)}</dd>
              </div>
              <div>
                <dt>Typical team</dt>
                <dd>{distribution.median === null ? '—' : pct(distribution.median)}</dd>
              </div>
              <div>
                <dt>Top 10% from</dt>
                <dd>{distribution.topDecile === null ? '—' : pct(distribution.topDecile)}</dd>
              </div>
            </dl>
          </div>
          {#if distributionExpanded && population}
            <p class="field-help">
              Gold line: this style lineup’s average ({pct(population.team)}).
            </p>
          {/if}
          <p class="field-help">Win rates use the low end of each team’s estimate.</p>
        {/if}
      </ChartFrame>
    </section>
  </div>
  <section
    class="team-browser"
    aria-label="Captured teams"
  >
    <div class="browser-controls">
      <header class="browser-heading">
        <div>
          <h2>Captured teams</h2>
          <p>
            {result ? number(total) + ' matching teams' : 'Finding teams…'}{activeFilters
              ? ' · ' + activeFilters + ' lineup filters'
              : ''}
          </p>
        </div>
      </header>
      <div class="browser-toolbar">
        <Checkbox
          id="cm-show-build-stats"
          label="Build stats"
          bind:checked={showStats}
        /><Checkbox
          id="cm-build-team"
          label="Build a team"
          bind:checked={buildTeam}
        /><SegmentedControl
          compact
          options={[
            { value: 'all', label: 'All teams' },
            { value: 'unique', label: 'Best per player' }
          ]}
          bind:value={mode}
          label="Team representation"
        /><SelectField
          id="cm-team-sort"
          label="Rank teams by"
          hideLabel
          bind:value={sort}
          options={[
            { value: 'lower', label: 'Reliable win rate' },
            { value: 'rate', label: 'Win rate' }
          ]}
        /><Button
          variant="secondary"
          size="sm"
          icon="race"
          onclick={onlobby}
        >
          Lobby {lobby.length}/3
        </Button>
      </div>
    </div>
    <p class="ranking-help">
      {sort === 'lower'
        ? 'Reliable ranking uses the lower end of the estimated win range.'
        : 'Ranked by simulated team win rate.'} Select a team to inspect its builds. Use + to choose individual
      Uma.
    </p>
    {#if buildTeam}
      <section
        class="custom-team"
        aria-label="Custom team selection"
      >
        <header>
          <div>
            <strong>Build a team · {teamDraft.length}/3</strong>
            <p>Choose individual Uma from any captured team.</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            disabled={!teamDraft.length || pendingRunners.length > 0}
            onclick={onclearteam}
          >
            Clear selection
          </Button>
        </header>
        <div class="custom-slots">
          {#each [0, 1, 2] as slot}
            {@const entry = teamDraft[slot]}{#if entry}
              <div>
                <Artwork
                  src={portrait(entry.build.card)}
                  alt=""
                  size="sm"
                />
                <span>
                  <strong>{data.cards[entry.build.card]?.name}</strong>
                  <small>
                    {data.cards[entry.build.card]?.outfit} · {styleNames[entry.build.racingStyle]}
                  </small>
                </span>
                <button
                  class="runner-toggle chosen"
                  aria-label={'Remove ' + data.cards[entry.build.card]?.name + ' from selection'}
                  onclick={() => onremoverunner(entry.key)}
                >
                  <Icon
                    name="close"
                    size={16}
                  />
                </button>
              </div>
            {:else}
              <div class="vacant">
                <span aria-hidden="true">+</span>
                <span>Runner {slot + 1}</span>
              </div>
            {/if}
          {/each}
        </div>
        <footer>
          <span>
            {teamError ||
              (lobby.length >= 3
                ? 'Lobby full · Remove a team to add this one.'
                : pendingRunners.length
                  ? 'Loading captured build…'
                  : 'Selected builds retain their stats, aptitudes and skills.')}
          </span>
          <Button
            size="sm"
            disabled={teamDraft.length !== 3 ||
              lobby.length + pendingTeams.length >= 3 ||
              pendingRunners.length > 0}
            onclick={onbuildteam}
          >
            Add custom team to lobby
          </Button>
        </footer>
      </section>
    {/if}
    {#if simError}
      <p role="alert">{simError}</p>
    {/if}
    {#if teamError && !buildTeam}
      <p role="alert">{teamError}</p>
    {/if}
    {#if !result && !error}
      <div class="teams-loading">
        <Spinner
          size={48}
          centered
          label="Loading captured teams…"
        />
      </div>
    {:else if result && !result.teams.length}
      <div class="empty">
        <Icon
          name="search"
          size={26}
        />
        <h3>No matching teams</h3>
        <p>Try another Uma or style, or clear the lineup filters.</p>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (query = '')}
        >
          Clear filters
        </Button>
      </div>
    {:else if result}
      <div
        class="team-grid"
        use:virtualScroll={{
          items: result.teams,
          key: (t) => t.id,
          estimate: 280,
          searchText: (t) => t.members.map((m) => data.cards[m.card]?.name ?? m.card).join(' '),
          onrange: (r) => (range = r),
          onend: more
        }}
      >
        {#each result.teams.slice(range.start, range.end) as team, index (team.id)}
          <article
            data-virtual-index={range.start + index}
            class="team-row"
            class:in-lobby={lobbyIds.has(team.id)}
            aria-label={'Team ' + (range.start + index + 1)}
          >
            <button
              class="team-open"
              aria-label={'View team ' + (range.start + index + 1) + ' details'}
              onclick={() => (selected = team.id)}
            ></button>
            <header class="team-heading">
              <div>
                <span class="team-number">#{number(range.start + index + 1)}</span>
                <span class="lineup">
                  {#each team.members as member, i}
                    {#if i}
                      <span class="slash">/</span>
                    {/if}
                    <span
                      style:color={colors[member.style]}
                      title={styleNames[member.style]}
                    >
                      {SHORT_STYLE[member.style]}
                    </span>
                  {/each}
                </span>
              </div>
              <div class="team-rate">
                <strong>{pct(team.wins / team.n)}</strong>
                <span>team wins</span>
              </div>
            </header>
            <div class="member-heading">
              <span>Team lineup</span>
              {#if showStats}
                <span>Build stats</span>
              {/if}
            </div>
            <div class="members">
              {#each team.members as member, i}
                {@const card = data.cards[member.card]}
                {@const share = team.wins ? team.memberWins[i]! / team.wins : 0}
                <div class="member-choice">
                  <button
                    class="member"
                    aria-label={'Inspect ' + card?.name + ' team'}
                    onclick={() => (selected = team.id)}
                  >
                    <RunnerLineupRow
                      runner={buildRunner(member as Build, data, i)}
                      outfit={card?.outfit ?? 'Unknown outfit'}
                      style={styleNames[member.style]}
                      color={colors[member.style]}
                      {showStats}
                    >
                      {#snippet metadata()}
                        <span
                          class="member-share"
                          title={number(team.memberWins[i] ?? 0) +
                            ' of ' +
                            number(team.wins) +
                            ' team wins'}
                        >
                          <strong>{pct(share)}</strong>
                          <small>of wins</small>
                        </span>
                      {/snippet}
                    </RunnerLineupRow>
                    <Icon
                      name="chevron"
                      size={13}
                    />
                  </button>
                  {@render runnerToggle(team, i)}
                </div>
              {/each}
            </div>
            <footer class="team-results">
              <dl>
                <div>
                  <dt
                    title="Uncertainty in the simulated win rate, calculated with a 95% confidence interval."
                  >
                    Estimated win range
                  </dt>
                  <dd>{pct(team.ci[0])}–{pct(team.ci[1])}</dd>
                </div>
                <div>
                  <dt>Simulated races</dt>
                  <dd>{number(team.n)}</dd>
                </div>
              </dl>
              <div class="team-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  onclick={(event) => {
                    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
                    selected = team.id;
                  }}
                >
                  Details
                </Button><Button
                  size="sm"
                  variant={lobbyIds.has(team.id) ? 'secondary' : 'primary'}
                  disabled={pendingTeams.includes(team.id) ||
                    (!lobbyIds.has(team.id) && lobby.length + pendingTeams.length >= 3)}
                  onclick={() => ontoggle(team)}
                >
                  {lobbyIds.has(team.id)
                    ? 'Remove'
                    : pendingTeams.includes(team.id)
                      ? 'Loading…'
                      : lobby.length + pendingTeams.length >= 3
                        ? 'Lobby full'
                        : 'Add to lobby'}
                </Button>
              </div>
            </footer>
          </article>
        {/each}
      </div>
      <p class="loaded-count">
        {number(result.teams.length)} of {number(total)} teams loaded{loading
          ? ' · Loading more teams…'
          : ''}
      </p>
    {/if}
    {#if error}
      <p role="alert">
        {error}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => attempt++}
        >
          Retry teams
        </Button>
      </p>
    {/if}
  </section>
</div>
<div class="team-details-dialog">
  <Dialog
    open={!!selected}
    title="Team details"
    maxWidth="1480px"
    maxHeight="94dvh"
    mobileMaxHeight="94dvh"
    contentPadding="10px"
    mobileContentPadding="8px"
    onclose={() => (selected = '')}
  >
    {#snippet headerActions()}
      <div class="detail-actions">
        {#if detail}
          <Button
            size="sm"
            variant="secondary"
            icon="race"
            loading={simBusy}
            onclick={() => simulate(detail!.team.members, true)}
          >
            Simulate team
          </Button><Button
            size="sm"
            disabled={pendingTeams.includes(detail.team.id) ||
              (!lobbyIds.has(detail.team.id) && lobby.length + pendingTeams.length >= 3)}
            onclick={() => ontoggle(detail!.team)}
          >
            {lobbyIds.has(detail.team.id)
              ? 'Remove from lobby'
              : pendingTeams.includes(detail.team.id)
                ? 'Loading…'
                : lobby.length + pendingTeams.length >= 3
                  ? 'Lobby full'
                  : 'Add to lobby'}
          </Button>
        {/if}<Button
          size="sm"
          variant="secondary"
          onclick={copyLink}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>
    {/snippet}
    {#if detailError}
      <p role="alert">{detailError}</p>
    {:else if !detail}
      <Spinner
        size={48}
        centered
        minHeight="clamp(320px, 60dvh, 620px)"
        label="Loading team builds…"
      />
    {:else}
      {#if teamError && !buildTeam}
        <p role="alert">{teamError}</p>
      {/if}
      <div class="detail-summary">
        <div class="detail-rate">
          <strong>{pct(detail.team.wins / detail.team.n)}</strong>
          <span>Team win rate</span>
        </div>
        <dl>
          <div>
            <dt title="Uncertainty in the win rate, calculated with a 95% confidence interval.">
              Estimated win range
            </dt>
            <dd>{pct(detail.team.ci[0])}–{pct(detail.team.ci[1])}</dd>
          </div>
          <div>
            <dt>Simulated races</dt>
            <dd>{number(detail.team.n)}</dd>
          </div>
        </dl>
        <div class="detail-choice">
          <Checkbox
            id="cm-detail-build-team"
            label="Build a team"
            bind:checked={buildTeam}
          />
        </div>
      </div>
      {#if buildTeam}
        <section
          class="detail-selection"
          aria-label="Selected runners"
        >
          <strong>Build a team · {teamDraft.length}/3</strong>
          <div class="selected-builds">
            {#each teamDraft as entry}
              <span>
                <Artwork
                  src={portrait(entry.build.card)}
                  alt=""
                  size="xs"
                />{data.cards[entry.build.card]?.name}
                <button
                  aria-label={'Remove ' + data.cards[entry.build.card]?.name + ' from selection'}
                  onclick={() => onremoverunner(entry.key)}
                >
                  <Icon
                    name="close"
                    size={14}
                  />
                </button>
              </span>
            {/each}
          </div>
          <span
            class="selection-status"
            role="status"
          >
            {teamError ||
              (pendingRunners.length
                ? 'Loading captured build…'
                : !teamDraft.length
                  ? 'Use + beside an Uma to select its build.'
                  : 'Choose builds from any captured team.')}
          </span>
          <Button
            size="sm"
            disabled={teamDraft.length !== 3 ||
              lobby.length + pendingTeams.length >= 3 ||
              pendingRunners.length > 0}
            onclick={() => {
              selected = '';
              onbuildteam();
            }}
          >
            Add custom team to lobby
          </Button>
        </section>
      {/if}
      <RunnerBuildGroup>
        {#each detail.team.members as member, index}
          <RunnerBuildDetails
            runner={buildRunner(member, data, index)}
            outfit={data.cards[member.card]?.outfit}
            color={colors[member.style]}
            framed
            skillNames={new Map(
              Object.entries(detail.skills).map(([id, name]) => [Number(id), name])
            )}
          >
            {#snippet headerActions()}
              <Button
                size="sm"
                variant="secondary"
                disabled={simBusy}
                onclick={() => simulate([member])}
              >
                Use in simulator
              </Button>{@render runnerToggle(detail!.team, index)}
            {/snippet}
            {#snippet metrics()}
              <dl class="runner-results">
                <div>
                  <dt>Individual win rate</dt>
                  <dd>{pct(detail!.team.memberWins[index]! / detail!.team.n)}</dd>
                </div>
                <div>
                  <dt>Share of team wins</dt>
                  <dd>
                    {pct(
                      detail!.team.wins ? detail!.team.memberWins[index]! / detail!.team.wins : 0
                    )}
                  </dd>
                </div>
              </dl>
            {/snippet}
            {#snippet training()}
              <RunnerTraining
                deck={member.deck}
                parents={member.parents}
                label={data.cards[member.card]?.name}
              />
            {/snippet}
          </RunnerBuildDetails>
        {/each}
      </RunnerBuildGroup>
    {/if}
  </Dialog>
</div>

<style>
  @import './cm-archetypes.css';
</style>
