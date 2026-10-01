<script lang="ts">
  import { untrack } from 'svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Icon from '@/components/Icon.svelte';
  import { factorImage, factorMetadata } from '@/lib/catalog/factor-catalog';
  import WhiteFactorTypePicker from './WhiteFactorTypePicker.svelte';

  interface Props { open?: boolean; selectedFactorIds: number[]; onsave: (factorIds: number[]) => void; }
  let { open = $bindable(true), selectedFactorIds, onsave }: Props = $props();
  let draftIds = $state(untrack(() => [...selectedFactorIds]));

  function addFactors(ids: number[]): void { draftIds = [...new Set([...draftIds, ...ids])].sort((left, right) => left - right); }
  function removeFactor(id: number): void { draftIds = draftIds.filter((entry) => entry !== id); }
  function save(): void { onsave(draftIds); open = false; }
</script>

<div class="hidden-sparks-dialog">
  <Dialog mobileFill id="hidden-sparks" bind:open title="Hide Sparks" icon="eye-off" description="Choose white factors that should be hidden from every inheritance result." maxWidth="760px" maxHeight="90dvh" mobileInset="8vw" contentPadding="16px 18px" mobileContentPadding="16px 11px">
    {#snippet headerActions()}<span class="hidden-count">{draftIds.length} hidden</span>{/snippet}
    <div class="hidden-sparks-content">
      <WhiteFactorTypePicker id="hidden-sparks-browser" mode="hide" selectedFactorIds={draftIds} onadd={addFactors} onremove={removeFactor}/>
      <section class="selection-section" aria-label="Hidden sparks">
        <div class="selection-heading">
          <span><strong>Hidden sparks</strong><small>Remove a spark here to show it again.</small></span>
          {#if draftIds.length}<button type="button" class="clear-button" onclick={() => draftIds = []}>Clear all</button>{/if}
        </div>
        {#if draftIds.length}
          <div class="hidden-list">
            {#each draftIds as factorId (factorId)}
              {@const name = factorMetadata(factorId)?.text ?? `Factor ${factorId}`}
              {@const icon = factorImage(factorId)}
              <button type="button" class="hidden-chip" aria-label={`Show ${name}`} title={`Show ${name}`} onclick={() => removeFactor(factorId)}>
                {#if icon}<img src={icon} alt=""/>{/if}<span>{name}</span><Icon name="close" size={13}/>
              </button>
            {/each}
          </div>
        {:else}<div class="empty-selection"><Icon name="eye" size={16}/><span>No sparks are hidden.</span></div>{/if}
      </section>
    </div>
    {#snippet actions()}<Button variant="ghost" onclick={() => open = false}>Cancel</Button><Button icon="check" onclick={save}>Save {draftIds.length} hidden</Button>{/snippet}
  </Dialog>
</div>

<style>
  .hidden-sparks-dialog{display:contents}
  .hidden-sparks-dialog :global(.dialog-panel > header .header-icon){width:34px;height:34px;flex-basis:34px;border-radius:9px;background:rgb(255 183 77/.12);color:#ffb74d}
  .hidden-sparks-dialog :global(.dialog-panel h2){font-size:.9rem;font-weight:720;color:var(--text-primary)}
  .hidden-sparks-dialog :global(.dialog-panel .heading p){font-size:.65rem}
  .hidden-sparks-dialog :global(.dialog-panel > .content){max-height:min(68vh,650px)}
  .hidden-sparks-dialog :global(.dialog-panel > footer .ui-button){font-size:.78rem}
  .hidden-count{padding:3px 7px;border-radius:999px;background:rgb(255 183 77/.12);color:#ffb74d;font-size:.62rem;font-weight:700;white-space:nowrap}
  .hidden-sparks-content{display:flex;flex-direction:column;gap:13px;min-width:0}
  .selection-section{display:flex;flex-direction:column;gap:3px;padding-top:11px;border-top:1px solid var(--dialog-soft-border)}
  .selection-heading{display:flex;align-items:center;gap:10px}.selection-heading>span{min-width:0;display:flex;flex-direction:column}.selection-heading strong{color:var(--text-secondary);font-size:.72rem;line-height:1.2}.selection-heading small{color:var(--text-muted);font-size:.62rem;line-height:1.15}
  .clear-button{margin-left:auto;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font:inherit;font-size:.62rem;white-space:nowrap}.clear-button:hover{color:#ffb74d;background:rgb(255 183 77/.08)}
  .hidden-list{display:flex;align-items:center;flex-wrap:wrap;gap:5px}.hidden-chip{min-width:0;max-width:100%;display:inline-flex;align-items:center;gap:5px;padding:3px 5px 3px 3px;border:1px solid var(--dialog-border);border-radius:7px;background:var(--dialog-muted-bg);color:var(--text-secondary);cursor:pointer;font:inherit;font-size:.64rem}.hidden-chip img{width:22px;height:22px;object-fit:contain}.hidden-chip span{min-width:0;overflow-wrap:anywhere}.hidden-chip :global(svg){flex:none;color:var(--text-muted)}.hidden-chip:hover{border-color:rgb(255 183 77/.36);background:rgb(255 183 77/.06)}
  .empty-selection{min-height:40px;display:flex;align-items:center;justify-content:center;gap:6px;color:var(--text-muted);font-size:.66rem}
  @media(max-width:560px){.hidden-sparks-dialog :global(.dialog-panel .heading p){display:none}}
  @media (max-width:767px) {.hidden-sparks-dialog :global(.dialog-panel > .content){max-height:none}.hidden-chip,.clear-button{min-height:var(--touch-target);min-width:var(--touch-target)}}
</style>
