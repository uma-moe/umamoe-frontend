<script lang="ts">

  import Icon from './Icon.svelte';
  import Dialog from './Dialog.svelte';
  import Artwork from './Artwork.svelte';
  import SelectField, { type SelectOption } from './SelectField.svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Spinner from './Spinner.svelte';
  import { matchesSupportSearch } from '@/lib/supports/support-card';
  import type { SupportCardPickerOption } from './picker-types';
  import { virtualScroll, type VirtualRange } from '@/lib/virtual-scroll';
  interface Props { id?: string; label?: string; options: SupportCardPickerOption[]; selectedOption?: SupportCardPickerOption; value?: string; maxVisible?: number; compact?: boolean; loading?: boolean; error?: string; cached?: boolean; onclear?: () => void; onopen?: () => void; onretry?: () => void; onselect?: (id: string) => void; }
  let { id = 'support-card-picker', label = 'Select support card', options, selectedOption, value = $bindable(''), maxVisible = 8, compact = false, loading = false, error = '', cached = false, onclear, onopen, onretry, onselect }: Props = $props();
  let query = $state('');
  let type = $state('All');
  let rarity = $state('All');
  let virtualRange = $state<VirtualRange>({ start: 0, end: 0 });
  let open = $state(false);
  const types: SelectOption[] = ['All','Speed','Stamina','Power','Guts','Wit','Friend'].map(value => ({ value, label:value === 'All' ? 'All types' : value === 'Wit' ? 'Wisdom' : value, ...(value === 'Friend' ? { icon:'user' as const } : value === 'All' ? {} : { image:`/assets/images/icon/stats/${value.toLowerCase()}.webp` }) }));
  const rarities = ['All','R','SR','SSR'].map(value => ({ value, label:value === 'All' ? 'All rarities' : value, ...(value === 'All' ? {} : { image:`/game-assets/support-rarity/${value.toLowerCase()}.png` }) }));
  const filtered = $derived(options.filter((option) => {
    return matchesSupportSearch(option.searchText ?? `${option.id} ${option.title} ${option.character ?? ''}`, query) && (type === 'All' || option.type === type) && (rarity === 'All' || option.rarity === rarity);
  }));
  const selected = $derived(options.find((option) => option.id === value) ?? (selectedOption?.id === value ? selectedOption : undefined));
  function select(id: string) { value = id; onselect?.(id); if (compact) open = false; }
  function show() { query = ''; type = 'All'; rarity = 'All'; open = true; onopen?.(); }
</script>

{#snippet browser()}
  <div class="tools">
    <div class="search"><Icon name="search" size={18}/><input type="text" role="searchbox" aria-label="Search support cards" bind:value={query} placeholder="Search by character or card name..."/>{#if query}<button type="button" aria-label="Clear support search" onclick={() => query = ''}><Icon name="close" size={16}/></button>{/if}</div>
    {#if loading}<div class="resource-status" role="status"><Spinner size={16}/><span>{cached ? 'Using cached resources; refreshing...' : 'Still fetching resources...'}</span></div>{/if}
    {#if error}<Banner tone="danger" title={cached ? 'Resource refresh failed' : 'Resource fetch failed'}><p class="resource-error">{error}</p>{#if onretry}<Button variant="secondary" onclick={onretry}>Retry support data</Button>{/if}</Banner>{/if}
    <div class="quick-filters"><SelectField id={`${id}-type`} label="Type" hideLabel options={types} bind:value={type}/><SelectField id={`${id}-rarity`} label="Rarity" hideLabel options={rarities} bind:value={rarity}/></div>
  </div>
  <div class="cards" role="radiogroup" aria-label={label} use:virtualScroll={{ items: filtered, key: option => option.id, root: 'closest', estimate: 140, onrange: range => virtualRange = range }}>
    {#each filtered.slice(virtualRange.start, virtualRange.end) as option, index (option.id)}
      <button data-virtual-index={virtualRange.start + index} type="button" role="radio" aria-checked={value === option.id} class:selected={value === option.id} disabled={option.disabled} onclick={() => select(option.id)}>
        <Artwork src={option.image} fallbackSrc="/assets/images/placeholder-card.webp" alt="" kind="card"/>
        <span class="card-copy">
          <strong class="card-name">{option.character || option.title}</strong>
          {#if option.character && option.character.trim().toLowerCase() !== option.title.trim().toLowerCase()}<span class="card-title" title={option.title}>{option.title.replace(/^\[|\]$/g, '')}</span>{/if}
          <span class="meta"><img src={`/game-assets/support-rarity/${option.rarity.toLowerCase()}.png`} alt={option.rarity} title={option.rarity} width="22" height="22"/>{#if option.type === 'Friend'}<span role="img" aria-label="Friend support" title="Friend support"><Icon name="user" size={18}/></span>{:else}<img src={`/assets/images/icon/stats/${option.type.toLowerCase()}.webp`} alt={`${option.type === 'Wit' ? 'Wisdom' : option.type} support`} title={`${option.type === 'Wit' ? 'Wisdom' : option.type} support`} width="18" height="18"/>{/if}{#if value === option.id}<span class="selection-check" aria-label="Selected"><Icon name="check" size={14}/></span>{/if}</span>
        </span>
      </button>
    {:else}{#if !loading && !error}<p class="empty">No support cards match these filters.</p>{/if}{/each}
  </div>
{/snippet}

<section class="support-picker" class:compact class:has-selection={Boolean(selected)} aria-label={label}>
  {#if compact}
    <button class="compact-trigger" class:selected={Boolean(selected)} type="button" aria-label={selected ? `Change support card ${selected.title}` : label} onclick={show}>
      <span class="compact-visual">{#if selected?.image}<img src={selected.image} alt=""/>{:else}<Icon name="search" size={22}/>{/if}</span>
      {#if !selected}<span class="compact-copy"><strong>Select card</strong><small>Borrow support</small></span>{/if}
    </button>
    {#if selected}<div class="card-actions"><Button variant="secondary" size="sm" ariaLabel="Change support card" onclick={show}>Change</Button>{#if onclear}<Button variant="secondary" icon="trash" ariaLabel="Clear support" size="sm" onclick={onclear}/>{/if}</div>{/if}
    <Dialog mobileFill id={`${id}-dialog`} title="Select Support Card" icon="cards" bind:open maxWidth="900px" mobileMaxHeight="calc(100dvh - 32px)" contentPadding="12px" mobileContentPadding="8px">
      {#if open}<div class="dialog-browser">{@render browser()}</div>{/if}
    </Dialog>
  {:else}
    {@render browser()}
  {/if}
</section>

<style>
  .support-picker { min-width: 0; display: grid; gap: 8px; }
  .support-picker.compact { position:relative; width:128px; height:128px; min-width:128px; align-self:center; }
  .compact-trigger { position:absolute; inset:0; width:100%; height:100%; min-height:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:6px; padding:8px; border:1px solid rgb(var(--accent-primary-rgb)/.34); border-radius:var(--radius-lg); background:var(--factor-field-bg); color:var(--text-primary); cursor:pointer; font:inherit; text-align:center; transition:border-color var(--duration-fast),background-color var(--duration-fast),box-shadow var(--duration-fast); }.compact-trigger:hover{border-color:rgb(var(--accent-primary-rgb)/.62);background:rgb(var(--accent-primary-rgb)/.08)}.compact-trigger:focus-visible{outline:0;box-shadow:var(--focus-ring)}.compact-trigger.selected{border-color:rgb(var(--accent-primary-rgb)/.6)}
  .compact-visual{width:44px;height:44px;display:grid;place-items:center;overflow:hidden;border:1px solid rgb(var(--accent-primary-rgb)/.48);border-radius:50%;color:var(--accent-primary)}.compact-visual img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover}.compact-copy{min-width:0;width:100%;display:grid;gap:1px;line-height:1.1}.compact-copy strong,.compact-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-copy strong{font-size:10px;font-weight:700}.compact-copy small{color:var(--text-muted);font-size:8px}
  .support-picker.compact.has-selection { width:96px; height:auto; min-width:96px; display:flex; flex-direction:column; gap:6px; } .has-selection .compact-trigger { position:relative; inset:auto; width:100%; height:auto; aspect-ratio:1; align-self:stretch; flex:none; } .card-actions{display:flex;align-items:center;gap:4px}.card-actions :global(.ui-button){flex:1;padding-inline:4px}.card-actions :global(.ui-button[aria-label="Clear support"]){flex:none;width:36px;padding:0} .compact-trigger.selected { padding:6px; }
  .selected .compact-visual { width:100%; height:100%; border:0; border-radius:6px; }
  .selected .compact-visual img { border-radius:0; object-fit:contain; }
  .dialog-browser { min-width:0; display:grid; gap:12px; container:support-cards / inline-size; }
  .tools { min-width:0; display:grid; gap:10px; }
  .resource-status { display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid rgb(var(--accent-primary-rgb)/.2); border-radius:var(--radius-md); background:rgb(var(--accent-primary-rgb)/.08); color:var(--text-secondary); font-size:12px; font-weight:600; }.resource-error { overflow-wrap:anywhere; }
  .search { min-width:0; min-height:42px; display:flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--border-subtle); border-radius:10px; background:var(--factor-field-bg); color:var(--text-disabled); }
  .search:focus-within { border-color:rgb(var(--accent-primary-rgb)/.4); box-shadow:var(--focus-ring); }
  .search input { min-width:0; width:100%; padding:4px 0; border:0; outline:0; background:transparent; color:var(--dialog-input-text); font:14px Arial,sans-serif; }
  .search input::placeholder { color:var(--dialog-placeholder); opacity:1; }
  .search button { flex:none; width:28px; height:28px; display:grid; place-items:center; padding:0; border:0; border-radius:50%; background:transparent; color:var(--dialog-icon-muted); cursor:pointer; }
  .quick-filters { --control-height:36px; min-width:0; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .quick-filters :global(.field) { min-width:0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr)); gap:8px; }
  .cards button { min-width:0; display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--border-subtle); border-radius:var(--radius-md); background:var(--factor-field-bg); color:var(--text-primary); cursor:pointer; text-align:left; font:inherit; }
  .cards button:hover:not(:disabled) { background:var(--surface-2); border-color:rgb(var(--accent-primary-rgb)/.3); }
  .cards button.selected { background:rgb(var(--accent-primary-rgb)/.08); border-color:rgb(var(--accent-primary-rgb)/.4); }
  .cards button:focus-visible { outline:2px solid var(--accent-primary); outline-offset:2px; }
  .cards button:disabled { opacity:.42; cursor:not-allowed; }
  .cards :global(.art) { width:64px; height:64px; border:0; border-radius:6px; }
  .card-copy { min-width:0; flex:1; display:flex; align-self:stretch; flex-direction:column; gap:3px; }
  .card-name { color:var(--text-primary); font-size:13px; font-weight:650; line-height:1.3; overflow-wrap:anywhere; }
  .card-title { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; line-clamp:2; overflow:hidden; color:var(--text-secondary); font-size:11px; line-height:1.35; }
  .meta { display:flex; align-items:center; gap:6px; margin-top:auto; padding-top:3px; color:var(--accent-primary); }.meta img { display:block; object-fit:contain; }.meta span { display:flex; }.selection-check { margin-left:auto; }
  .empty { grid-column: 1 / -1; margin: 0; padding: 20px 8px; color: var(--color-text-muted); text-align: center; }

  @container support-cards (max-width:540px) { .cards { gap:6px; }.cards button{padding:8px}.card-name{font-size:12px} }
  @media(max-width:600px){.compact-trigger{width:100%}.quick-filters{gap:6px}}
  @media (max-width:600px) {.quick-filters{--control-height:var(--touch-target)}.search{min-height:var(--touch-target);padding-block:0;padding-right:0}.search button{width:var(--touch-target);height:var(--touch-target)}}
</style>
