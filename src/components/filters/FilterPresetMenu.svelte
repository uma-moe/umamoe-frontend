<script lang="ts">
  import Icon from '../Icon.svelte';

  export interface FilterPreset {
    id: string;
    name: string;
    activeCount: number;
    mode?: string;
  }

  interface Props {
    presets: FilterPreset[];
    draft?: string;
    message?: string;
    onsave?: (name: string) => void;
    onload?: (preset: FilterPreset) => void;
    ondelete?: (preset: FilterPreset) => void;
    onexport?: () => void;
    onimport?: () => void;
  }

  let {
    presets,
    draft = $bindable(''),
    message,
    onsave,
    onload,
    ondelete,
    onexport,
    onimport
  }: Props = $props();

  function save() {
    const name = draft.trim();
    if (name) onsave?.(name);
  }
</script>

<details class="presets">
  <summary>
    <Icon
      name="star"
      size={15}
    />
    <span>Presets</span>
    {#if presets.length}
      <small>{presets.length}</small>
    {/if}
  </summary>
  <div class="panel">
    <header>
      <strong>Filter presets</strong>
      <small>{presets.length}</small>
      <span class="utilities">
        {#if onexport}
          <button
            type="button"
            aria-label="Export presets"
            disabled={!presets.length}
            onclick={onexport}
          >
            <Icon
              name="download"
              size={14}
            />
          </button>
        {/if}
        {#if onimport}
          <button
            type="button"
            aria-label="Import presets"
            onclick={onimport}
          >
            <Icon
              name="upload"
              size={14}
            />
          </button>
        {/if}
      </span>
    </header>
    <div class="save-row">
      <label>
        <span class="sr-only">Preset name</span>
        <input
          bind:value={draft}
          maxlength="60"
          placeholder="Preset name"
          onkeydown={(event) => {
            if (event.key === 'Enter') save();
          }}
        />
      </label>
      <button
        type="button"
        aria-label="Save current filters"
        disabled={!draft.trim()}
        onclick={save}
      >
        <Icon
          name="add"
          size={16}
        />
      </button>
    </div>
    {#if message}
      <p>{message}</p>
    {/if}
    <div class="list">
      {#each presets as preset (preset.id)}
        <div>
          <button
            type="button"
            class="load"
            onclick={() => onload?.(preset)}
          >
            <span>{preset.name}</span>
            <span class="meta">
              <small>{preset.activeCount} filter{preset.activeCount === 1 ? '' : 's'}</small>
              {#if preset.mode}
                <i>{preset.mode}</i>
              {/if}
            </span>
          </button>
          {#if ondelete}
            <button
              type="button"
              class="delete"
              aria-label={`Delete ${preset.name}`}
              onclick={() => ondelete(preset)}
            >
              <Icon
                name="trash"
                size={14}
              />
            </button>
          {/if}
        </div>
      {:else}
        <span class="empty">
          <Icon
            name="star"
            size={15}
          />No presets yet
        </span>
      {/each}
    </div>
  </div>
</details>

<style>
  @import './filter-preset-menu.css';
</style>
