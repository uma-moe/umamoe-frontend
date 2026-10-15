<script lang="ts">
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import { introCopy, type PageTourId } from './page-tours';

  interface Props {
    intro: PageTourId;
    onclose: () => void;
    onstart: () => void;
  }

  let { intro, onclose, onstart }: Props = $props();
</script>

<div class="tour-introduction">
  <Dialog
    title={introCopy[intro].title}
    icon="compass"
    open
    maxWidth="390px"
    mobileInset="32px"
    {onclose}
  >
    {#snippet eyebrow()}
      <span class="eyebrow">Optional guided tour</span>
    {/snippet}
    <p class="intro-copy">{introCopy[intro].content}</p>
    {#snippet actions()}
      <div class="intro-actions">
        <Button
          variant="ghost"
          onclick={onclose}
        >
          Skip
        </Button>
        <span>Available later from the ? button.</span>
        <Button onclick={onstart}>
          <span class="start-label">
            Start
            <span class="next">
              <Icon
                name="chevron"
                size={18}
              />
            </span>
          </span>
        </Button>
      </div>
    {/snippet}
  </Dialog>
</div>

<style>
  .eyebrow {
    color: var(--text-muted);
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.2;
    text-transform: uppercase;
  }
  .intro-copy {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.94rem;
    line-height: 1.55;
  }
  .intro-actions {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .intro-actions > span {
    color: var(--text-muted);
    font-size: 0.78rem;
    line-height: 1.35;
    text-align: center;
  }
  .start-label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .next {
    transform: rotate(-90deg);
  }
  .tour-introduction :global(.dialog-panel) {
    gap: 16px;
    padding: 18px;
    font-family: var(--font-sans);
    border-color: var(--border-primary);
    border-radius: var(--radius-md);
    background: var(--surface-overlay);
    box-shadow: var(--shadow-dropdown);
  }
  .tour-introduction :global(.dialog-panel > header) {
    min-height: 0;
    gap: 12px;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .tour-introduction :global(.dialog-panel .heading) {
    gap: 3px;
  }
  .tour-introduction :global(.dialog-panel .header-icon) {
    flex-basis: 34px;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: rgb(var(--accent-primary-rgb) / 0.1);
  }
  .tour-introduction :global(.dialog-panel h2) {
    font-size: 1.08rem;
    line-height: 1.25;
    font-weight: 700;
  }
  .tour-introduction :global(.dialog-panel .content) {
    flex: 0 1 auto;
    padding: 0;
    background: transparent;
  }
  .tour-introduction :global(.dialog-panel footer) {
    min-height: 0;
    padding: 14px 0 0;
    border-color: var(--border-primary);
    border-radius: 0;
    background: transparent;
  }
  .tour-introduction :global(.dialog-panel footer .ui-button) {
    font-size: 14px;
    border-radius: var(--radius-sm);
  }
  .tour-introduction :global(.dialog-panel footer .ui-button--ghost) {
    color: var(--text-primary);
  }
  @media (max-width: 520px) {
    .tour-introduction :global(.dialog-panel) {
      padding: 16px;
    }
    .intro-actions {
      grid-template-columns: 1fr auto;
    }
    .intro-actions > span {
      grid-column: 1/-1;
      grid-row: 1;
      text-align: left;
    }
    .intro-actions :global(.ui-button:first-child) {
      justify-self: start;
    }
    .intro-actions :global(.ui-button:last-child) {
      justify-self: end;
    }
  }
</style>
