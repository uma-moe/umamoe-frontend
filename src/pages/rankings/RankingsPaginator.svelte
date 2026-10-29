<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import type { PagedResult } from '@/pages/clubs/community-types';
  import { pageSizeOptions } from './rankings-options';

  interface Props {
    page: number;
    pageSize: string;
    result: PagedResult<unknown> | undefined;
    onpage: (page: number) => void;
    onpagesizechange: () => void;
  }

  let { page, pageSize = $bindable(), result, onpage, onpagesizechange }: Props = $props();
</script>

<div class="mat-paginator">
  <span>Items per page:</span>
  <SelectField
    id="ranking-page-size"
    label="Items per page"
    hideLabel
    options={pageSizeOptions}
    bind:value={pageSize}
    onchange={onpagesizechange}
  />
  <strong>
    {result?.total
      ? `${(page - 1) * Number(pageSize) + 1}–${Math.min(page * Number(pageSize), result.total)} of ${result.total}`
      : '0 of 0'}
  </strong>
  <button
    type="button"
    aria-label="Previous page"
    disabled={page <= 1}
    onclick={() => onpage(page - 1)}
  >
    <Icon
      name="chevron"
      size={17}
    />
  </button>
  <button
    class="next"
    type="button"
    aria-label="Next page"
    disabled={page >= (result?.totalPages ?? 1)}
    onclick={() => onpage(page + 1)}
  >
    <Icon
      name="chevron"
      size={17}
    />
  </button>
</div>

<style>
  .mat-paginator {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 13px;
    padding: 8px 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    font-size: var(--font-sm);
  }
  .mat-paginator :global(.field) {
    width: 84px;
  }
  .mat-paginator strong {
    min-width: 82px;
    font-weight: 500;
    text-align: center;
  }
  .mat-paginator > button {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .mat-paginator > button:first-of-type :global(svg) {
    transform: rotate(90deg);
  }
  .mat-paginator > button.next :global(svg) {
    transform: rotate(-90deg);
  }
  .mat-paginator > button:disabled {
    opacity: 0.28;
  }
  @media (max-width: 768px) {
    .mat-paginator {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px 44px;
      gap: 4px;
      padding: 8px 12px;
    }
    .mat-paginator > span {
      grid-column: 1;
      text-align: right;
    }
    .mat-paginator :global(.field) {
      grid-column: 2/4;
      justify-self: end;
    }
    .mat-paginator strong {
      grid-column: 1;
      text-align: right;
      padding-right: 16px;
    }
    .mat-paginator > button {
      width: var(--touch-target);
      height: var(--touch-target);
    }
  }
</style>
