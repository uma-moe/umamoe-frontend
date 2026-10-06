<script module lang="ts">
  import type { OptimizePurchaseInput } from './optimize-request';

  /** The simulator accepts at most 256 purchase groups per search. */
  export const MAX_PURCHASES = 256;

  /** One purchase as the editor holds it; every leaf is a string so TextField can bind. */
  export interface PurchaseRow {
    /** Stable key, so removing a row cannot shuffle values into another row. */
    id: string;
    name: string;
    cost: string;
    /** Comma-separated skill ids. */
    skills: string;
  }

  let sequence = 0;

  /** A blank row with a stable id; the owner keeps the array and may prefill it. */
  export function createPurchase(overrides: Partial<Omit<PurchaseRow, 'id'>> = {}): PurchaseRow {
    sequence += 1;
    return { id: `purchase-${sequence}`, name: '', cost: '0', skills: '', ...overrides };
  }

  /** Parses the comma-separated skill field; junk, negatives and repeats are dropped. */
  export function parseSkillIds(field: string): Array<number> {
    const ids: Array<number> = [];
    for (const part of field.split(/[\s,;]+/)) {
      if (part === '') continue;
      const id = Number(part);
      if (!Number.isSafeInteger(id) || id <= 0 || ids.includes(id)) continue;
      ids.push(id);
    }
    return ids;
  }

  /**
   * Rows as the optimize request wants them. Prerequisites (`requires`,
   * `excludes`, `replaces`) are index-based and stay out of this editor, so
   * they are never written.
   */
  export function toOptimizePurchases(rows: Array<PurchaseRow>): Array<OptimizePurchaseInput> {
    return rows.map((row, index) => ({
      // The upstream wants a unique name per package, so a blank one gets a stable label.
      name: row.name.trim() === '' ? 'Purchase ' + (index + 1) : row.name.trim(),
      cost: Number.parseInt(row.cost, 10) || 0,
      skills: parseSkillIds(row.skills)
    }));
  }

  /**
   * Every reason the optimizer would reject this list, in the user's language.
   * The upstream answers 422 for a package with no skills and for duplicate
   * names, so the page refuses to send a request it already knows will fail.
   */
  export function purchaseProblems(rows: Array<PurchaseRow>): Array<string> {
    if (rows.length === 0) return ['Add at least one purchase before running the search.'];

    const labels = rows.map((row, index) => {
      const name = row.name.trim();
      return name === '' ? 'Purchase ' + (index + 1) : name;
    });

    const problems: Array<string> = [];
    rows.forEach((row, index) => {
      const label = labels[index] ?? 'Purchase ' + (index + 1);
      if (parseSkillIds(row.skills).length === 0) {
        problems.push(label + ' needs at least one skill id.');
      }
    });

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const label of labels) {
      const key = label.toLowerCase();
      if (seen.has(key)) duplicates.add(label);
      seen.add(key);
    }
    if (duplicates.size > 0) {
      problems.push('Purchase names must be unique (' + [...duplicates].join(', ') + ').');
    }

    return problems;
  }
</script>

<script lang="ts">
  import Button from '@/components/Button.svelte';
  import TextField from '@/components/TextField.svelte';

  interface Props {
    purchases?: Array<PurchaseRow>;
    disabled?: boolean;
    /** Rows allowed; the Add button turns off at this length. */
    max?: number;
  }

  let { purchases = $bindable<Array<PurchaseRow>>([]), disabled = false, max = MAX_PURCHASES }: Props =
    $props();

  // The editor can appear more than once; keep input ids apart.
  const uid = $props.id();

  const canAdd = $derived(purchases.length < max);

  /** Names the row for its remove button and its group label. */
  function rowLabel(row: PurchaseRow, index: number): string {
    const name = row.name.trim();
    return name === '' ? `purchase ${index + 1}` : name;
  }

  function skillHelp(row: PurchaseRow): string {
    const count = parseSkillIds(row.skills).length;
    return count === 0 ? 'No skill ids yet' : `${count} skill ${count === 1 ? 'id' : 'ids'}`;
  }

  function add(): void {
    if (!canAdd) return;
    purchases.push(createPurchase());
  }

  function remove(index: number): void {
    purchases.splice(index, 1);
  }
</script>

<div class="purchases">
  <p class="hint">
    Each purchase is a candidate build: a name, an SP cost and the skill ids it buys.
    Prerequisite, exclusion and replacement links between purchases are not editable here.
  </p>

  {#if purchases.length === 0}
    <p class="hint empty">No purchases yet. Add at least one before running the search.</p>
  {/if}

  {#each purchases as row, index (row.id)}
    <div class="row" role="group" aria-label={rowLabel(row, index)}>
      <TextField
        id="{uid}-{row.id}-name"
        label="Name"
        placeholder="e.g. Speed build"
        bind:value={row.name}
        disabled={disabled}
        help="Shown on the ranked result."
      />
      <TextField
        id="{uid}-{row.id}-cost"
        type="number"
        min={0}
        label="Cost"
        bind:value={row.cost}
        disabled={disabled}
      />
      <TextField
        id="{uid}-{row.id}-skills"
        label="Skill ids"
        placeholder="200012, 200013"
        bind:value={row.skills}
        disabled={disabled}
        error={parseSkillIds(row.skills).length === 0 ? 'Needs at least one skill id.' : undefined}
        help={skillHelp(row)}
      />
      <div class="row-actions">
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          ariaLabel={`Remove ${rowLabel(row, index)}`}
          disabled={disabled}
          onclick={() => remove(index)}
        />
      </div>
    </div>
  {/each}

  <div class="footer">
    <Button
      variant="secondary"
      size="sm"
      icon="add"
      disabled={disabled || !canAdd}
      onclick={add}
    >
      Add purchase
    </Button>
    <span class="hint">{purchases.length} of {max}</span>
  </div>
</div>

<style>
  .purchases { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.7fr) minmax(0, 1.6fr) auto;
    gap: var(--space-3);
    align-items: start;
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--factor-field-bg);
  }
  /* Lines the remove button up with the inputs, below their labels. */
  .row-actions { padding-top: 24px; }
  .footer { display: flex; align-items: center; gap: var(--space-3); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
  .empty { font-style: italic; }
  @media (max-width: 760px) {
    .row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    .row-actions { grid-column: 1 / -1; padding-top: 0; }
  }
</style>
