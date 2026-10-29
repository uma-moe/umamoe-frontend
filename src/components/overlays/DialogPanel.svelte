<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '../Icon.svelte';
  import IconButton from '../controls/IconButton.svelte';
  import Artwork from '../game/Artwork.svelte';
  import type { IconName } from '../icon-types';

  interface Props {
    title: string;
    description?: string;
    titleId?: string;
    descriptionId?: string;
    icon?: IconName;
    image?: string;
    children: Snippet;
    headerIdentity?: Snippet<[string | undefined, string | undefined]>;
    headerActions?: Snippet;
    eyebrow?: Snippet;
    actions?: Snippet;
    onclose?: () => void;
  }

  let {
    title,
    description,
    titleId,
    descriptionId,
    icon,
    image,
    children,
    headerIdentity,
    headerActions,
    eyebrow,
    actions,
    onclose
  }: Props = $props();
</script>

<section class="dialog-panel">
  <header class:custom-identity={Boolean(headerIdentity)}>
    {#if headerIdentity}
      <div class="header-identity">
        {@render headerIdentity(titleId, descriptionId)}
      </div>
    {:else}
      {#if image}
        <span
          class="header-image"
          aria-hidden="true"
        >
          <Artwork
            src={image}
            alt=""
            size="md"
          />
        </span>
      {:else if icon}
        <span
          class="header-icon"
          aria-hidden="true"
        >
          <Icon
            name={icon}
            size={20}
          />
        </span>
      {/if}
      <div class="heading">
        {#if eyebrow}
          {@render eyebrow()}
        {/if}
        <h2 id={titleId}>{title}</h2>
        {#if description}
          <p id={descriptionId}>{description}</p>
        {/if}
      </div>
    {/if}
    {#if headerActions}
      <div class="header-actions">{@render headerActions()}</div>
    {/if}
    <IconButton
      icon="close"
      label="Close dialog"
      size="sm"
      onclick={onclose}
    />
  </header>
  <div class="content">{@render children()}</div>
  {#if actions}
    <footer>{@render actions()}</footer>
  {/if}
</section>

<style>
  /* Shared dialog chrome; feature content retains its own layout. */
  .dialog-panel {
    font-family: var(--font-sans);
    max-height: min(84dvh, 720px);
    display: flex;
    flex-direction: column;
    overflow: visible;
    border: 1px solid var(--dialog-border);
    border-radius: var(--radius-lg);
    background: var(--dialog-surface-bg);
    color: var(--text-primary);
    box-shadow: var(--dialog-shadow);
  }
  header {
    min-height: var(--dialog-header-min-height, 64px);
    display: flex;
    flex: 0 0 auto;
    align-items: var(--dialog-header-align, flex-start);
    justify-content: space-between;
    gap: 10px;
    padding: var(--dialog-header-padding, 12px 20px);
    border-bottom: 1px solid var(--dialog-soft-border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--dialog-header-bg);
  }
  .custom-identity {
    align-items: center;
    padding: 10px 12px;
  }
  .header-identity {
    min-width: 0;
    flex: 1;
    container-type: inline-size;
  }
  .header-icon {
    height: 36px;
    display: grid;
    flex: 0 0 20px;
    place-items: center;
    color: var(--accent-primary);
  }
  .header-image {
    flex: none;
    align-self: center;
  }
  .heading {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: var(--dialog-heading-direction, column);
    align-items: var(--dialog-heading-items, stretch);
    gap: 2px 10px;
    padding-block: var(--dialog-heading-padding, 6px);
  }
  /* No narrower than its controls: a long description is cut short instead of running under them. */
  .header-actions {
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
  }
  h2 {
    margin: 0;
    color: var(--dialog-title-color);
    font-size: var(--dialog-title-size, 16px);
    font-weight: 650;
    line-height: 1.5;
    flex: none;
    white-space: var(--dialog-title-wrap, normal);
  }
  p {
    margin: 0;
    color: var(--text-secondary);
    overflow: hidden;
    font-size: var(--dialog-description-size, var(--font-sm));
    white-space: var(--dialog-description-wrap, normal);
    text-overflow: ellipsis;
    line-height: 1.4;
  }
  .content {
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
    overscroll-behavior: contain;
    padding: var(--dialog-content-padding, 16px 20px);
    background: var(--dialog-surface-bg);
    font-family: var(--dialog-content-font, var(--font-sans));
  }
  .content:last-child {
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }
  footer {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--dialog-soft-border);
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background: var(--dialog-surface-bg);
  }
  footer :global(.ui-button) {
    min-height: var(--control-height);
    font-size: var(--font-sm);
  }
  @media (max-width: 767px) {
    header {
      min-height: var(--dialog-header-min-height, 60px);
      padding: var(--dialog-header-padding, 8px 12px);
    }
    .header-icon,
    .header-actions {
      min-height: var(--touch-target);
    }
    header :global(.icon-button) {
      width: var(--touch-target);
      height: var(--touch-target);
    }
    .content {
      padding: var(--dialog-mobile-content-padding, 12px);
    }
    footer {
      padding: var(--dialog-mobile-footer-padding, 12px);
    }
  }
  @media (max-width: 767px) {
    footer :global(.ui-button) {
      min-height: var(--touch-target);
    }
  }
</style>
