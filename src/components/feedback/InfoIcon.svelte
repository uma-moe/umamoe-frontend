<script lang="ts">
  import Icon from '../Icon.svelte';
</script>

<!-- The visible part of an info trigger, as race analysis draws it. The surrounding button or popover trigger owns the interaction and its accessible name. -->
<span
  class="info-icon"
  aria-hidden="true"
>
  <Icon
    name="info"
    size={15}
  />
</span>

<style>
  .info-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
  }
  .info-icon:hover {
    color: var(--color-text);
  }
</style>
