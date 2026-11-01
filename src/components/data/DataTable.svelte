<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import { untrack, type Snippet } from 'svelte';
  import InspectPopover from '../overlays/InspectPopover.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { rowHeadingCount } from './row-headings';

  export interface TableColumn {
    key: string;
    label: string;
    /** A shorter heading a phone shows, so a narrow table keeps its columns; `label` stays the accessible name. */
    short?: string;
    numeric?: boolean;
    priority?: 'primary' | 'secondary';
    sortable?: boolean;
    sortValue?: (row: Record<string, string | number>) => string | number;
  }

  interface Props {
    caption: string;
    plain?: boolean;
    columns: TableColumn[];
    rows: Record<string, string | number>[];
    emptyMessage?: string;
    cell?: Snippet<[Record<string, string | number>, TableColumn]>;
    columnHeader?: Snippet<[TableColumn]>;
    columnHelp?: Record<string, string>;
    sortKey?: string;
    sortDirection?: 'ascending' | 'descending';
    maxHeight?: number;
    fill?: boolean;
    compact?: boolean;
    onrowclick?: (row: Record<string, string | number>) => void;
    expandedRow?: string | number;
    rowKey?: string;
    rowDetail?: Snippet<[Record<string, string | number>]>;
    onvisiblerows?: (rows: Record<string, string | number>[]) => void;
    /**
     * How many leading columns stay in view on a phone while a table too wide for it scrolls sideways. Defaults to
     * the columns that name a row; 0 pins none.
     */
    pinnedColumns?: number;
  }

  let {
    caption,
    plain = false,
    columns,
    rows,
    emptyMessage = 'No results',
    cell,
    columnHeader,
    columnHelp,
    sortKey = $bindable(''),
    sortDirection = $bindable('ascending'),
    maxHeight,
    fill = false,
    compact = false,
    onrowclick,
    expandedRow,
    rowKey = 'id',
    rowDetail,
    onvisiblerows,
    pinnedColumns
  }: Props = $props();

  const PHONE_QUERY = '(max-width: 767px)';
  // Pinned columns that took more of the width would leave too little room to read the values scrolling beside them.
  const MAX_PINNED_SHARE = 0.45;

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let container = $state<HTMLDivElement>();
  let tableElement = $state<HTMLTableElement>();
  // Left offsets of the pinned columns; empty while the table fits or the screen is wider than a phone.
  let pinnedOffsets = $state<number[]>([]);
  let scrolledAside = $state(false);
  let moreAside = $state(false);

  const pinnedCount = $derived(pinnedColumns ?? rowHeadingCount(columns) ?? 0);

  const ordered = $derived.by(() => {
    const column = columns.find((c) => c.key === sortKey);
    if (!column) return rows;
    const value = (row: Record<string, string | number>) =>
      column.sortValue?.(row) ?? row[column.key] ?? '';

    return [...rows].sort((a, b) => {
      const av = value(a),
        bv = value(b);

      const an = typeof av === 'number' ? av : Number(String(av).replace(/[,%#\s]/g, '')),
        bn = typeof bv === 'number' ? bv : Number(String(bv).replace(/[,%#\s]/g, ''));

      // Unloaded numeric values stay below measured values in either direction.
      if (column.numeric) {
        if (!Number.isFinite(an)) return Number.isFinite(bn) ? 1 : 0;
        if (!Number.isFinite(bn)) return -1;
      }

      const result =
        (column.numeric || typeof av === 'number') && Number.isFinite(an) && Number.isFinite(bn)
          ? an - bn
          : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });

      return sortDirection === 'ascending' ? result : -result;
    });
  });

  const expandedIndex = $derived(
    rowDetail && expandedRow !== undefined
      ? ordered.findIndex((row) => row[rowKey] === expandedRow)
      : -1
  );

  $effect(() => {
    const visible = ordered.slice(virtualRange.start, virtualRange.end);
    untrack(() => onvisiblerows?.(visible));
  });

  // A phone keeps a wide table on one line per row and scrolls it sideways under the columns that name each row,
  // such as a finish position and runner. Pinning only changes where cells paint, so measuring cannot loop.
  $effect(() => {
    const wrap = container;
    const table = tableElement;
    if (!wrap || !table) return;

    const phone = matchMedia(PHONE_QUERY);

    const pinColumns = () => {
      const overflowing = wrap.scrollWidth > wrap.clientWidth + 1;
      const headerCells = table.tHead?.rows[0]?.cells;
      if (!phone.matches || !overflowing || pinnedCount === 0 || !headerCells) {
        if (pinnedOffsets.length) pinnedOffsets = [];
        return;
      }

      // Summed widths rather than positions, which a pinned cell's own sticky shift would skew.
      const offsets: number[] = [];
      let left = 0;
      for (const cell of [...headerCells].slice(0, pinnedCount)) {
        offsets.push(left);
        left += cell.offsetWidth;
      }

      const pinned = left <= wrap.clientWidth * MAX_PINNED_SHARE ? offsets : [];
      if (pinned.join() !== pinnedOffsets.join()) pinnedOffsets = pinned;
    };

    const showScrollEdges = () => {
      scrolledAside = wrap.scrollLeft > 0;
      moreAside = wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 1;
    };

    const measure = () => {
      pinColumns();
      showScrollEdges();
    };

    const resize = new ResizeObserver(measure);
    resize.observe(wrap);
    resize.observe(table);
    phone.addEventListener('change', measure);
    wrap.addEventListener('scroll', showScrollEdges, { passive: true });
    untrack(measure);
    return () => {
      resize.disconnect();
      phone.removeEventListener('change', measure);
      wrap.removeEventListener('scroll', showScrollEdges);
    };
  });

  function clickRow(event: MouseEvent, row: Record<string, string | number>) {
    if (
      (event.target instanceof Element &&
        event.target.closest('button,a,input,select,textarea,summary,[role="button"]')) ||
      window.getSelection()?.isCollapsed === false
    )
      return;
    onrowclick?.(row);
  }

  function sort(column: TableColumn) {
    if (sortKey === column.key) {
      sortDirection = sortDirection === 'ascending' ? 'descending' : 'ascending';
    } else {
      sortDirection = column.numeric ? 'descending' : 'ascending';
    }

    sortKey = column.key;
    if (maxHeight || fill) container?.scrollTo({ top: 0 });
  }

  function columnSort(column: TableColumn): 'ascending' | 'descending' | 'none' | undefined {
    if (column.sortable === false) return undefined;
    return sortKey === column.key ? sortDirection : 'none';
  }

  function sortIndicator(column: TableColumn): string {
    if (sortKey !== column.key) return '↕';
    return sortDirection === 'ascending' ? '↑' : '↓';
  }
</script>

{#snippet heading(column: TableColumn)}
  {#if column.short}
    <span class="label-full">{column.label}</span>
    <span class="label-short">{column.short}</span>
  {:else}
    {column.label}
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables must be reachable with the keyboard.) -->
<div
  class="table-wrap"
  class:plain
  class:compact
  class:expandable={!!rowDetail}
  class:bounded={maxHeight || fill}
  class:fill
  class:scrolled-aside={scrolledAside}
  class:more-aside={moreAside}
  style:max-height={maxHeight ? maxHeight + 'px' : undefined}
  bind:this={container}
  role="region"
  aria-label={caption + ' scroll area'}
  tabindex={maxHeight || fill ? 0 : undefined}
>
  <table
    bind:this={tableElement}
    aria-rowcount={rows.length + 1 + (expandedIndex >= 0 ? 1 : 0)}
  >
    <caption class="sr-only">{caption}</caption>
    <thead>
      <tr>
        {#each columns as column, columnIndex}
          <th
            class:secondary={column.priority === 'secondary'}
            class:numeric={column.numeric}
            class:pinned={columnIndex < pinnedOffsets.length}
            class:pinned-edge={columnIndex === pinnedOffsets.length - 1}
            style:left={columnIndex < pinnedOffsets.length
              ? pinnedOffsets[columnIndex] + 'px'
              : undefined}
            scope="col"
            aria-label={column.label}
            aria-sort={columnSort(column)}
          >
            {#if column.sortable === false}
              {@render heading(column)}
            {:else}
              <button
                class="sort"
                aria-label={column.short ? column.label : undefined}
                onclick={() => sort(column)}
              >
                {@render heading(column)}
                <span
                  class="sort-arrow"
                  aria-hidden="true"
                >
                  {sortIndicator(column)}
                </span>
              </button>
            {/if}
            {#if columnHelp?.[column.label]}
              <span class="column-help">
                <InspectPopover
                  label={'About ' + column.label}
                  openOnHover
                  align={column.numeric ? 'end' : 'start'}
                >
                  {#snippet trigger()}
                    <InfoIcon />
                  {/snippet}
                  <p>{columnHelp[column.label]}</p>
                </InspectPopover>
              </span>
            {/if}
            {@render columnHeader?.(column)}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody
      use:virtualScroll={{
        items: ordered,
        key: (row) => row[rowKey] ?? row,
        searchText: (row) => columns.map((column) => row[column.key]).join(' '),
        estimate: compact ? 34 : 48,
        root: maxHeight || fill ? 'closest' : null,
        onrange: (range) => (virtualRange = range)
      }}
    >
      {#each ordered.slice(virtualRange.start, virtualRange.end) as row, index (virtualRange.start + index)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions (The cell action button supplies the same keyboard interaction while preserving table semantics.) -->
        <tr
          class:interactive={!!onrowclick}
          onclick={onrowclick ? (event) => clickRow(event, row) : undefined}
          data-virtual-index={virtualRange.start + index}
          aria-rowindex={virtualRange.start +
            index +
            2 +
            (expandedIndex >= 0 && expandedIndex < virtualRange.start + index ? 1 : 0)}
        >
          {#each columns as column, columnIndex}
            <td
              class:secondary={column.priority === 'secondary'}
              class:numeric={column.numeric}
              class:pinned={columnIndex < pinnedOffsets.length}
              class:pinned-edge={columnIndex === pinnedOffsets.length - 1}
              style:left={columnIndex < pinnedOffsets.length
                ? pinnedOffsets[columnIndex] + 'px'
                : undefined}
              data-label={column.label}
            >
              {#if cell}
                {@render cell(row, column)}
              {:else}
                {row[column.key]}
              {/if}
            </td>
          {/each}
        </tr>
        {#if rowDetail && expandedIndex === virtualRange.start + index}
          <tr
            class="detail-row"
            data-virtual-index={virtualRange.start + index}
            aria-rowindex={virtualRange.start + index + 3}
          >
            <td colspan={columns.length}>
              <div class="row-detail">{@render rowDetail(row)}</div>
            </td>
          </tr>
        {/if}
      {/each}
      {#if !rows.length}
        <tr>
          <td
            colspan={columns.length}
            class="empty"
          >
            {emptyMessage}
          </td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .expandable {
    container-type: inline-size;
  }
  .column-help {
    display: inline-flex;
    vertical-align: middle;
    margin-left: 3px;
    --inspect-popover-width: 310px;
    text-transform: none;
    letter-spacing: 0;
    color: var(--text-secondary);
  }
  .column-help :global(.trigger) {
    display: grid;
    place-items: center;
    min-width: 20px;
    min-height: 24px;
  }
  .column-help p {
    margin: 0;
    font-size: 11px;
    font-weight: 400;
    line-height: 1.6;
    white-space: normal;
  }
  .table-wrap {
    /* Holds absolutely placed cell content, such as visually hidden labels, so columns scrolled out of view cannot widen the page. */
    position: relative;
    max-width: 100%;
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .bounded {
    overflow: auto;
    scrollbar-gutter: stable;
    overscroll-behavior: contain;
    padding-inline-end: 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-secondary) transparent;
  }
  .fill {
    flex: 1;
    min-height: 0;
  }
  .bounded::-webkit-scrollbar {
    width: 7px;
    height: 7px;
  }
  .bounded::-webkit-scrollbar-thumb {
    background: var(--border-secondary);
    border-radius: 5px;
    min-height: 28px;
  }
  .compact th,
  .compact td {
    padding: 4px 8px;
    line-height: 1.3;
  }
  .compact .sort {
    min-height: 26px;
  }
  .detail-row > td {
    padding: 0;
    white-space: normal;
  }
  .row-detail {
    position: sticky;
    left: 0;
    width: 100cqw;
    max-width: 100%;
  }
  .plain {
    border: 0;
    border-radius: 0;
  }
  .plain table {
    background: transparent;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    background: var(--color-surface-1);
    font-size: var(--font-sm);
  }
  th,
  td {
    min-height: 44px;
    padding: 10px var(--space-3);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    white-space: nowrap;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--color-surface-2);
    color: var(--color-text-muted);
    font-size: var(--font-xs);
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }
  .sort {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-transform: inherit;
    letter-spacing: inherit;
    cursor: pointer;
  }
  .label-short {
    display: none;
  }
  .sort-arrow {
    opacity: 0.5;
  }
  th[aria-sort='ascending'],
  th[aria-sort='descending'] {
    color: var(--color-accent);
  }
  .sort:hover {
    color: var(--color-text);
  }
  .sort:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 4px;
  }
  tbody tr:last-child td,
  tbody tr:has(+ :global(tr[aria-hidden='true']:last-child)) td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--color-surface-2) 60%, transparent);
  }
  tr.interactive {
    cursor: pointer;
  }
  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td.empty {
    padding: var(--space-8);
    color: var(--color-text-muted);
    text-align: center;
  }
  @media (max-width: 520px) {
    .secondary {
      display: none;
    }
  }
  /*
   * Phones tighten the cells so more columns fit before a table scrolls; their scrollbars overlay the content, so no
   * room is kept for one.
   */
  @media (max-width: 767px) {
    th,
    td {
      padding: 6px 8px;
    }
    th {
      letter-spacing: 0;
      text-transform: none;
    }
    /* Only the sorted column shows its arrow, so narrow columns are not widened by their headers. */
    th[aria-sort='none'] .sort-arrow {
      display: none;
    }
    .label-full {
      display: none;
    }
    .label-short {
      display: inline;
    }
    .bounded {
      padding-inline-end: 0;
    }
  }
  /*
   * The columns that name a row stay put while the rest scroll beneath them. They need a solid background for that;
   * a page whose card is not the default surface sets --table-pinned-bg.
   */
  .pinned {
    position: sticky;
    z-index: 1;
    background: var(--table-pinned-bg, var(--color-surface-1));
  }
  th.pinned {
    z-index: 3;
    background: var(--color-surface-2);
  }
  .scrolled-aside .pinned-edge {
    box-shadow: 8px 0 8px -8px rgb(0 0 0 / 0.55);
  }
  /* A fade at the right edge says there are more columns to scroll to; an open row's detail stays clear of it. */
  .more-aside {
    --edge-fade: 28px;
    mask-image: linear-gradient(to left, transparent, #000 var(--edge-fade));
  }
  .more-aside .row-detail {
    padding-inline-end: var(--edge-fade);
  }
</style>
