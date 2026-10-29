<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { STYLE_NAMES, type StyleKey } from '../skill-explorer-data';
  import { STAT_INDICES, groupStatlines, roundStat, type StatlineGroup } from './statline-groups';
  import { RUNNING_STYLES, STAT_NAMES } from './statline-model';
  import type { TargetStatlines } from './statlines-data';

  interface Props {
    target: TargetStatlines;
    selectedStyle: StyleKey;
  }

  let { target, selectedStyle }: Props = $props();

  /** The game's stat icon files, in `STAT_NAMES` order. */
  const STAT_ICONS = ['speed', 'stamina', 'power', 'guts', 'wit'] as const;
  /** Each stat's column: its name and the game's icon for it. */
  const STAT_COLUMNS = STAT_INDICES.map((index) => ({
    index,
    name: STAT_NAMES[index],
    icon: `/assets/images/icon/stats/${STAT_ICONS[index]}.webp`
  }));

  const groups = $derived(groupStatlines(target));
  const activeGroup = $derived(
    groups.find(holdsSelected) ?? (groups.length === 1 ? groups[0] : undefined)
  );
  const heading = $derived(
    target.kind === 'winners' ? 'What winners brought' : 'Statline to aim for'
  );
  const note = $derived(
    target.kind === 'winners'
      ? 'Median of the runners who won their room, with the middle half of them, in tens.'
      : 'Forecast from CM10–19 winners for the current stat era, in tens; ± is the typical miss.'
  );

  function groupLabel(group: StatlineGroup): string {
    if (group.styles.length === RUNNING_STYLES.length) return 'All styles';
    return group.styles.map((style) => STYLE_NAMES[String(style) as StyleKey]).join(' · ');
  }

  function holdsSelected(group: StatlineGroup): boolean {
    return group.styles.some((style) => String(style) === selectedStyle);
  }
</script>

<div class="target-statline">
  <InspectPopover
    label={heading}
    align="end"
  >
    {#snippet trigger()}
      <span class="stat-strip">
        <span class="strip-label">
          {target.kind === 'winners' ? 'Winner stats' : 'Target stats'}
        </span>
        {#if activeGroup}
          {#each STAT_COLUMNS as column (column.index)}
            <span
              class="strip-stat"
              title={column.name}
            >
              <img
                src={column.icon}
                alt={column.name}
                decoding="async"
              />
              <span>{activeGroup.stats[column.index]}</span>
            </span>
          {/each}
        {:else}
          <span class="by-style">By running style</span>
        {/if}
        <Icon
          name="chevron"
          size={14}
        />
      </span>
    {/snippet}
    {#snippet children()}
      <section aria-labelledby="target-statline-title">
        <header>
          <h3 id="target-statline-title">{heading}</h3>
          <p>{note}</p>
        </header>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col"><span class="sr-only">Running styles</span></th>
                {#each STAT_COLUMNS as column (column.index)}
                  <th scope="col">
                    <span class="stat-head">
                      <img
                        src={column.icon}
                        alt=""
                        decoding="async"
                      />
                      <span class="sr-only">{column.name}</span>
                      {#if target.kind === 'forecast'}
                        <small>±{roundStat(target.margin[column.index])}</small>
                      {/if}
                    </span>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each groups as group (group.styles.join())}
                <tr
                  class:selected={holdsSelected(group)}
                  class:own={group.styles.length === 1 && groups.length > 1}
                >
                  <th scope="row">{groupLabel(group)}</th>
                  {#each STAT_COLUMNS as column (column.index)}
                    <td
                      class:apart={group.apart[column.index]}
                      title={group.apart[column.index]
                        ? `${column.name}: this style needs a different amount than the others`
                        : undefined}
                    >
                      <span class="value">{group.stats[column.index]}</span>
                      {#if group.low && group.high}
                        <small>{group.low[column.index]}–{group.high[column.index]}</small>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/snippet}
  </InspectPopover>
</div>

<style>
  @import './target-statline.css';
</style>
