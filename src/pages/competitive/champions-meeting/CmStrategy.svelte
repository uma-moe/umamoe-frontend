<script lang="ts">
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import DataTable from '@/components/data/DataTable.svelte';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Button from '@/components/controls/Button.svelte';
  import type { Summary, Requirement } from '../hakuraku-types';
  import { pct, number, styleOrder, styleNames } from './cm-data';
  import { compositionQuery } from '../hakuraku-query';
  import { portrait } from '../analysis-view';
  import CmSaturationChart from './CmSaturationChart.svelte';
  import CmComposition from './CmComposition.svelte';

  let {
    data,
    colors,
    scope = 'all',
    onteams,
    onstyle
  }: {
    data: Summary;
    colors: Record<number, string>;
    scope?: string;
    onteams: (slots: Requirement[]) => void;
    onstyle?: (style: string) => void;
  } = $props();

  let saturation = $state('self'),
    minimum = $state('0.01'),
    repMin = $state('.01'),
    metric = $state('team');
  let repDescending = $state(true);

  function orderReps(key: string) {
    repDescending = metric === key ? !repDescending : key !== 'name';
    metric = key;
  }

  let showRates = $state(false),
    repRanges = $state<Record<number, VirtualRange>>({});

  const representativeStyles = $derived(scope === 'all' ? [1, 2, 3, 4, 5, 6] : [Number(scope)]);
  const scopedStyles = $derived(scope === 'all' ? styleOrder : [Number(scope)]);
  const breakdown = $derived(
    scopedStyles.map((id) => data.styles.find((s) => s.style === id)).filter((s) => !!s)
  );
  const fieldInsight = $derived(
    [...breakdown]
      .filter((row) => row.owners >= 30 && row.pop > 0)
      .sort((a, b) => b.winShare - b.pop - (a.winShare - a.pop))[0]
  );
  const barMax = $derived(Math.max(0.01, ...breakdown.flatMap((s) => [s.winShare, s.pop])));
  const rows = $derived(
    data.archetypes.filter(
      (r) =>
        (scope === 'all' || r.key.split('-').includes(scope)) &&
        r.owners >= Math.ceil(data.meta.populationOwners * Number(minimum))
    )
  );

  const colMax = (id: number) =>
    Math.max(
      1,
      data.rooms.average[id - 1] ?? 0,
      ...data.rooms.rows.map((r) => r.counts[id - 1] ?? 0)
    );
  const cellColor = (id: number, count: number) =>
    'color-mix(in srgb, ' +
    colors[id] +
    ' ' +
    (count ? 15 + (count / colMax(id)) * 60 : 0) +
    '%, transparent)';
</script>

<div class="style-filter">
  <span>Running style</span>
  <SegmentedControl
    compact
    label="Running style"
    value={scope}
    onchange={(value) => onstyle?.(value)}
    options={[
      { value: 'all', label: 'All styles' },
      ...styleOrder.map((id) => ({ value: String(id), label: styleNames[id]! }))
    ]}
  />
</div>
<div
  class="analysis-grid"
  class:focused={scope !== 'all'}
>
  <div class="top-panels">
    <section class="style-overview">
      <ChartFrame
        plain
        surface
        id="cm-style"
        title={scope === 'all'
          ? 'Style Breakdown'
          : styleNames[Number(scope)] + ' · style overview'}
        description="Win share and simulated field share."
      >
        {#snippet titleActions()}
          {#if scope === 'all'}
            <Button
              variant="ghost"
              size="sm"
              onclick={() => (showRates = !showRates)}
            >
              {showRates ? 'Hide rates & players' : 'Show rates & players'}
            </Button>
          {/if}
        {/snippet}
        <div class="breakdown-key">
          <span>Running style</span>
          <span>
            <i></i>
            Field
            <i class="win-key"></i>
            Wins
          </span>
          <span>Win share</span>
        </div>
        <div class="breakdown">
          {#each breakdown as row}
            <div class="style-row">
              <h4>
                <i style:background={colors[row.style]}></i>
                {#if onstyle}
                  <button
                    class="style-link"
                    onclick={() => onstyle?.(String(row.style))}
                  >
                    {styleNames[row.style]} ↗
                  </button>
                {:else}
                  {styleNames[row.style]}
                {/if}
              </h4>
              <div class="share-tracks">
                <div class="track">
                  <i
                    style:width={(row.pop / barMax) * 100 + '%'}
                    class="muted"
                  ></i>
                </div>
                <div class="track">
                  <i
                    style:width={(row.winShare / barMax) * 100 + '%'}
                    style:background={colors[row.style]}
                  ></i>
                </div>
              </div>
              <div class="share-readout">
                <strong>{pct(row.winShare)}</strong>
                <small>{pct(row.pop)} field</small>
              </div>
              {#if showRates || scope !== 'all'}
                <dl class="style-facts">
                  <div>
                    <dt>Individual win rate</dt>
                    <dd>{pct(row.individual)}</dd>
                  </div>
                  <div>
                    <dt>Associated team win rate</dt>
                    <dd>{pct(row.team)}</dd>
                  </div>
                  <div>
                    <dt>Distinct players</dt>
                    <dd>{number(row.owners)}</dd>
                  </div>
                  <div>
                    <dt>Average per room</dt>
                    <dd>{(data.rooms.average[row.style - 1] ?? 0).toFixed(2)} / 9</dd>
                  </div>
                </dl>
              {/if}
              {#if scope !== 'all'}
                <p class="scope-interval">
                  95% intervals: individual {pct(row.individualCI[0], 2)}–{pct(
                    row.individualCI[1],
                    2
                  )} · team {pct(row.teamCI[0], 2)}–{pct(row.teamCI[1], 2)}
                </p>
              {/if}
            </div>
          {/each}
        </div>
        {#if scope === 'all' && fieldInsight && fieldInsight.winShare > fieldInsight.pop}
          <p class="field-insight">
            <i style:background={colors[fieldInsight.style]}></i>
            <span>
              <strong>{styleNames[fieldInsight.style]}</strong>
              entries account for
              <strong>{pct(fieldInsight.winShare)}</strong>
              of wins from
              <strong>{pct(fieldInsight.pop)}</strong>
              of the field.
              <small>
                +{((fieldInsight.winShare - fieldInsight.pop) * 100).toFixed(1)} percentage points ·
                {number(fieldInsight.owners)} players
              </small>
            </span>
          </p>
        {/if}
        {#if scope === '6'}
          <p class="role-note">
            Debuffers are grouped by Hakuraku’s build classification. Their individual win rate does
            not measure their effect on teammates.
          </p>
        {/if}
      </ChartFrame>
    </section>
    <section class="saturation">
      <ChartFrame
        plain
        surface
        id="cm-saturation"
        title="Effects of style saturation"
        description="Per-Uma win rate by style count in a room. Buckets need at least 1% of races."
        expandable
      >
        {#snippet titleActions()}
          <SegmentedControl
            compact
            options={[
              { value: 'self', label: 'Same style' },
              { value: 'field', label: 'Other styles' }
            ]}
            bind:value={saturation}
            label="Saturation view"
          />
        {/snippet}
        {#if saturation === 'self'}
          <CmSaturationChart
            series={scopedStyles.map((id) => ({
              name: styleNames[id]!,
              color: colors[id]!,
              buckets: data.saturation[id] ?? []
            }))}
            totalRaces={data.meta.populationRaces}
            label="Per-Uma win rate versus number of the same style"
          />
        {:else}
          <div class="cross">
            {#each scopedStyles as subject}
              <div>
                <h4 style:color={colors[subject]}>{styleNames[subject]} win%</h4>
                <CmSaturationChart
                  series={styleOrder.map((id) => ({
                    name: styleNames[id]!,
                    color: colors[id]!,
                    buckets: data.fieldSaturation[subject]?.[id] ?? []
                  }))}
                  totalRaces={data.meta.populationRaces}
                  label={styleNames[subject] + ' win rate versus styles in the field'}
                  small
                />
              </div>
            {/each}
          </div>
        {/if}
      </ChartFrame>
    </section>
  </div>
  <div class="composition-panels">
    <section class="rooms">
      <ChartFrame
        plain
        surface
        id="cm-rooms"
        title="Room Composition"
        description={'All simulated rooms · Rooms with pace promotion: ' +
          pct(data.rooms.noDisplayedFront)}
      >
        <div
          class="room-average-grid"
          aria-label="Average room composition"
        >
          {#each styleOrder as id}
            <div style:--style-color={colors[id]}>
              <small>{styleNames[id]!.split(' ')[0]}</small>
              <strong>{(data.rooms.average[id - 1] ?? 0).toFixed(1)}</strong>
            </div>
          {/each}
          <span>
            Average
            <br />
            per room
          </span>
        </div>
        <DataTable
          plain
          compact
          caption="Room compositions"
          fill
          sortKey="frequency"
          sortDirection="descending"
          columns={[
            ...styleOrder.map((id) => ({
              key: String(id),
              label: styleNames[id]!.split(' ')[0]!,
              numeric: true
            })),
            { key: 'frequency', label: 'Frequency', numeric: true }
          ]}
          rows={data.rooms.rows.map((room) =>
            Object.assign(
              { frequency: room.frequency },
              Object.fromEntries(styleOrder.map((id) => [String(id), room.counts[id - 1] ?? 0]))
            )
          )}
        >
          {#snippet cell(row, column)}
            {#if column.key === 'frequency'}
              {pct(Number(row.frequency))}
            {:else}
              <span
                class="room-count"
                style:background={cellColor(Number(column.key), Number(row[column.key]))}
              >
                {row[column.key] || '—'}
              </span>
            {/if}
          {/snippet}
        </DataTable>
      </ChartFrame>
    </section>
    <section class="representatives">
      <ChartFrame
        plain
        surface
        id="cm-representatives"
        title="Style Representatives"
        description="Team% counts wins by any teammate; Uma% counts this runner’s own wins. Select an Uma to inspect its captured builds."
      >
        {#snippet titleActions()}
          <SegmentedControl
            compact
            options={[
              { value: 'team', label: 'Team' },
              { value: 'individual', label: 'Personal' },
              { value: 'pop', label: 'Most used' }
            ]}
            bind:value={metric}
            label="Representative metric"
          />
        {/snippet}
        <div class="rep-filter">
          <span>Minimum style share</span>
          <SegmentedControl
            compact
            label="Minimum style share"
            bind:value={repMin}
            options={[
              { value: '.005', label: '≥0.5%' },
              { value: '.01', label: '≥1%' },
              { value: '.02', label: '≥2%' },
              { value: '0', label: 'All' }
            ]}
          />
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (The bounded list is keyboard scrollable.) -->
        <div
          class="reps"
          role="region"
          aria-label="Running style representatives"
          tabindex="0"
        >
          {#each representativeStyles as id}
            {@const pairs = data.pairs
              .filter((p) => p.style === id && p.stylePop >= Number(repMin))
              .sort(
                (a, b) =>
                  (metric === 'name'
                    ? a.name.localeCompare(b.name)
                    : metric === 'players'
                      ? a.owners - b.owners
                      : metric === 'pop'
                        ? a.stylePop - b.stylePop
                        : metric === 'team'
                          ? a.team - b.team
                          : a.individual - b.individual) * (repDescending ? -1 : 1)
              )}
            {#if pairs.length}
              <section>
                <h4 style:color={colors[id]}>{styleNames[id]}</h4>
                <div class="rep-columns">
                  {#each [{ key: 'name', label: 'Uma' }, { key: 'team', label: 'Team%' }, { key: 'individual', label: 'Uma%' }, { key: 'players', label: 'Players' }] as column}
                    <button
                      class="rep-sort"
                      onclick={() => orderReps(column.key)}
                    >
                      {column.label}
                      {metric === column.key ? (repDescending ? '↓' : '↑') : '↕'}
                    </button>
                  {/each}
                </div>
                <div class="rep-scroll">
                  <div
                    use:virtualScroll={{
                      items: pairs,
                      key: (p) => p.key,
                      root: 'closest',
                      estimate: 36,
                      searchText: (p) => p.name + ' ' + p.outfit,
                      onrange: (r) => (repRanges[id] = r)
                    }}
                  >
                    {#each pairs.slice(repRanges[id]?.start ?? 0, repRanges[id]?.end ?? 0) as pair, index (pair.key)}
                      <button
                        data-virtual-index={(repRanges[id]?.start ?? 0) + index}
                        title={pair.outfit + ' · ' + pct(pair.stylePop) + ' style share'}
                        onclick={() =>
                          onteams([{ card: pair.card, chara: pair.chara, style: id }, {}, {}])}
                      >
                        <Artwork
                          src={portrait(pair.card)}
                          alt=""
                          size="xs"
                        />
                        <span>{pair.name}</span>
                        <strong>{pct(pair.team)}</strong>
                        <strong>{pct(pair.individual)}</strong>
                        <small>{number(pair.owners)}</small>
                      </button>
                    {/each}
                  </div>
                </div>
              </section>
            {/if}
          {/each}
        </div>
        <p class="room-average">
          Each list scrolls independently · Player counts can overlap between Umas.
        </p>
      </ChartFrame>
    </section>
  </div>
  <div class="full">
    <ChartFrame
      plain
      surface
      compact
      id="cm-compositions"
      title="Team compositions"
    >
      {#snippet actions()}
        <div class="composition-filter">
          <span>Minimum player share</span>
          <SelectField
            hideLabel
            id="cm-composition-min"
            label="Minimum player share"
            bind:value={minimum}
            options={[
              { value: '.005', label: '≥0.5%' },
              { value: '0.01', label: '≥1%' },
              { value: '.02', label: '≥2%' },
              { value: '.05', label: '≥5%' },
              { value: '0', label: 'All' }
            ]}
          />
        </div>
      {/snippet}
      <CmComposition
        {rows}
        {colors}
        onselect={(row) => onteams(compositionQuery(row.key))}
      />
    </ChartFrame>
  </div>
</div>

<style>
  @import './cm-strategy.css';
</style>
