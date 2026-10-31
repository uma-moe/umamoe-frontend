<script lang="ts">
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import { untrack, type Snippet } from 'svelte';
  import InspectPopover from '../overlays/InspectPopover.svelte';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  import { rowHeadingCount } from './row-headings';

  export interface TableColumn {
    key: string;
    label: string;
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
    /** How a phone shows a table too wide for it: rows stacked under their names, or columns that scroll. */
    phoneLayout?: 'stack' | 'scroll';
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
    phoneLayout = 'stack'
  }: Props = $props();

  const PHONE_QUERY = '(max-width: 767px)';
  // Stacked rows are no longer laid out as a table, so they state its roles outright.
  const STACKED_ROLES = {
    table: 'table',
    group: 'rowgroup',
    row: 'row',
    header: 'columnheader',
    cell: 'cell'
  } as const;

  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let container = $state<HTMLDivElement>();
  let tableElement = $state<HTMLTableElement>();
  let stacked = $state(false);

  const headingCount = $derived(phoneLayout === 'stack' ? rowHeadingCount(columns) : undefined);

  // The last of the heading columns, which takes the free width on a stacked row's first line.
  const nameColumn = $derived(headingCount === undefined ? -1 : headingCount - 1);

  const roles = $derived(stacked ? STACKED_ROLES : undefined);

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

  // A phone stacks the rows of a table that would otherwise hide columns to the side. The one-line width is
  // remembered when it overflows, so the columns return only once there is room for all of them.
  $effect(() => {
    const wrap = container;
    const table = tableElement;
    if (!wrap || !table || headingCount === undefined) {
      stacked = false;
      return;
    }

    const phone = matchMedia(PHONE_QUERY);
    let oneLineWidth = 0;

    const fitRows = () => {
      if (!phone.matches) {
        stacked = false;
        return;
      }

      if (stacked) {
        stacked = wrap.clientWidth < oneLineWidth;
        return;
      }

      const overflowing = wrap.scrollWidth > wrap.clientWidth + 1;
      if (overflowing) {
        oneLineWidth = wrap.scrollWidth;
        stacked = true;
      }
    };

    const resize = new ResizeObserver(fitRows);
    resize.observe(wrap);
    resize.observe(table);
    phone.addEventListener('change', fitRows);
    untrack(fitRows);
    return () => {
      resize.disconnect();
      phone.removeEventListener('change', fitRows);
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

<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable tables must be reachable with the keyboard.) -->
<div
  class="table-wrap"
  class:plain
  class:compact
  class:expandable={!!rowDetail}
  class:bounded={maxHeight || fill}
  class:fill
  class:stacked
  style:max-height={maxHeight ? maxHeight + 'px' : undefined}
  bind:this={container}
  role="region"
  aria-label={caption + ' scroll area'}
  tabindex={maxHeight || fill ? 0 : undefined}
>
  <table
    bind:this={tableElement}
    role={roles?.table}
    aria-rowcount={rows.length + 1 + (expandedIndex >= 0 ? 1 : 0)}
  >
    <caption class="sr-only">{caption}</caption>
    <thead role={roles?.group}>
      <tr role={roles?.row}>
        {#each columns as column}
          <th
            role={roles?.header}
            class:secondary={column.priority === 'secondary'}
            class:numeric={column.numeric}
            scope="col"
            aria-label={column.label}
            aria-sort={columnSort(column)}
          >
            {#if column.sortable === false}
              {column.label}
            {:else}
              <button
                class="sort"
                onclick={() => sort(column)}
              >
                {column.label}
                <span aria-hidden="true">
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
      role={roles?.group}
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
          role={roles?.row}
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
              role={roles?.cell}
              class:secondary={column.priority === 'secondary'}
              class:numeric={column.numeric}
              class:row-heading={columnIndex <= nameColumn}
              class:row-name={columnIndex === nameColumn}
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
            role={roles?.row}
            class="detail-row"
            data-virtual-index={virtualRange.start + index}
            aria-rowindex={virtualRange.start + index + 3}
          >
            <td
              role={roles?.cell}
              colspan={columns.length}
            >
              <div class="row-detail">{@render rowDetail(row)}</div>
            </td>
          </tr>
        {/if}
      {/each}
      {#if !rows.length}
        <tr role={roles?.row}>
          <td
            role={roles?.cell}
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
  .sort span {
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
   * Phones tighten the cells so more columns fit before a table stacks or scrolls; their scrollbars overlay the
   * content, so no room is kept for one.
   */
  @media (max-width: 767px) {
    th,
    td {
      padding: 8px;
    }
    .bounded {
      padding-inline-end: 0;
    }
  }
  /*
   * A stacked row puts the columns that name it on its first line and the other values on the line beneath; each
   * value but the name carries its column's label. The header becomes a row of sort buttons.
   */
  .stacked table,
  .stacked thead,
  .stacked tbody {
    display: block;
  }
  .stacked tr {
    display: flex;
    flex-wrap: wrap;
  }
  .stacked th,
  .stacked td {
    min-height: 0;
    padding: 0;
    border: 0;
    text-align: left;
  }
  /* A minimum width that a page sets for the one-line grid would keep stacked rows overflowing. */
  .table-wrap.stacked table {
    min-width: 0;
  }
  .stacked thead tr {
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface-2);
  }
  /* Each header chip takes its label's width; column widths that pages set for the one-line grid do not apply. */
  .stacked th {
    position: static;
    flex: 0 0 max-content;
    background: none;
  }
  /* A column that cannot be sorted is named on each of its values instead. */
  .stacked th:not([aria-sort]) {
    display: none;
  }
  .stacked .sort {
    min-height: 26px;
    gap: 4px;
    padding: 0 8px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface-1);
  }
  .stacked th[aria-sort='ascending'] .sort,
  .stacked th[aria-sort='descending'] .sort {
    border-color: var(--color-accent);
  }
  .stacked tbody tr {
    align-items: flex-start;
    gap: 3px 14px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--color-border);
  }
  .stacked tbody tr:last-child,
  .stacked tbody tr:has(+ :global(tr[aria-hidden='true']:last-child)) {
    border-bottom: 0;
  }
  /* Breaks the line between the row's heading and its values. */
  .stacked tbody tr:not(.detail-row)::after {
    content: '';
    order: 1;
    flex-basis: 100%;
  }
  .stacked .row-name {
    flex: 1 1 0;
    min-width: 0;
    white-space: normal;
  }
  .stacked td:not(.row-heading) {
    order: 2;
    min-width: 4.5rem;
  }
  .stacked td:not(.row-name)[data-label]:not([data-label=''])::before {
    content: attr(data-label);
    display: block;
    margin-bottom: 1px;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }
  /* Detail and empty-state cells span the row. */
  .stacked td:not([data-label]) {
    flex-basis: 100%;
  }
  .stacked tbody tr.detail-row {
    padding: 0;
  }
  .stacked td.empty {
    padding: var(--space-8);
    text-align: center;
  }
</style>
