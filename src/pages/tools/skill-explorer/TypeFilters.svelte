<script
  lang="ts"
  generics="Type extends string"
>
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { toggleType } from './skill-explorer-view';

  interface Props {
    label: string;
    all: readonly Type[];
    names: Record<Type, string>;
    selected: ReadonlySet<Type>;
  }

  let { label, all, names, selected = $bindable() }: Props = $props();
  const id = $props.id();
</script>

<fieldset aria-label={label}>
  <legend>
    <span class="group-heading">
      <span>{label}</span>
      <span class="actions">
        <Button
          variant="secondary"
          size="sm"
          disabled={selected.size === all.length}
          onclick={() => (selected = new Set(all))}
        >
          Select all
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={selected.size === 0}
          onclick={() => (selected = new Set())}
        >
          Clear
        </Button>
      </span>
    </span>
  </legend>
  <div
    class="options"
    role="group"
    aria-label={label + ' selection'}
  >
    {#each all as type (type)}
      <Checkbox
        variant="field"
        id={id + '-' + type}
        label={names[type]}
        checked={selected.has(type)}
        onchange={() => (selected = toggleType(selected, type))}
      />
    {/each}
  </div>
</fieldset>

<style>
  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  legend {
    width: 100%;
    padding: 0;
    font-size: 0.8rem;
    font-weight: 650;
  }
  .group-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.3rem;
  }
  .actions {
    display: flex;
    gap: 0.25rem;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.4rem 0.5rem;
  }
  @media (max-width: 767px) {
    .options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
