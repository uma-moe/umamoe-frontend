<script lang="ts">
  import IconButton from '@/components/controls/IconButton.svelte';

  let {
    following,
    zoomOutDisabled,
    zoomInDisabled,
    onfollow,
    onfullcourse,
    onzoom
  }: {
    following: boolean;
    zoomOutDisabled: boolean;
    zoomInDisabled: boolean;
    onfollow: () => void;
    onfullcourse: () => void;
    onzoom: (factor: number) => void;
  } = $props();
</script>

<!-- Clips leave the camera controls out of the picture. -->
<div
  class="map-camera"
  role="toolbar"
  aria-label="Course camera"
  aria-orientation="vertical"
  data-clip-exclude
>
  <IconButton
    size="sm"
    icon="compass"
    label="Follow the race"
    title={following ? 'Following the race; select to show the full course' : 'Follow the race'}
    selected={following}
    onclick={following ? onfullcourse : onfollow}
  />
  <IconButton
    size="sm"
    icon="add"
    label="Zoom course in"
    disabled={zoomInDisabled}
    onclick={() => onzoom(1.3)}
  />
  <IconButton
    size="sm"
    icon="minus"
    label="Zoom course out"
    disabled={zoomOutDisabled}
    onclick={() => onzoom(1 / 1.3)}
  />
</div>

<style>
  .map-camera {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 4;
    display: grid;
    gap: 4px;
  }
  .map-camera :global(.icon-button),
  .map-camera :global(.icon-button.icon-button--sm) {
    width: 32px;
    height: 32px;
    border-color: var(--factor-field-border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    color: var(--text-primary);
  }
  .map-camera :global(.icon-button:hover:not(:disabled)) {
    background: var(--surface-2);
  }
  /* The map shows through the library's soft accent, so the pressed fill is mixed onto the surface. */
  .map-camera :global(.icon-button.selected) {
    background: color-mix(in srgb, var(--color-accent) 20%, var(--surface-1));
    color: var(--color-accent);
  }
</style>
