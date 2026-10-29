<script lang="ts">
  import IconButton from '@/components/controls/IconButton.svelte';

  interface Props {
    name: string;
    added: boolean;
    loading: boolean;
    ontoggle: () => void;
  }

  let { name, added, loading, ontoggle }: Props = $props();
</script>

<!-- Team cards are stretched buttons, so the toggle sits above that hit area. -->
<span class="lobby-toggle">
  <IconButton
    icon={added ? 'check' : 'add'}
    label={(added ? 'Remove ' : 'Add ') + name + (added ? ' from the lobby' : ' to the lobby')}
    title={added ? 'In the lobby' : 'Add to the lobby'}
    size="sm"
    selected={added}
    {loading}
    onclick={ontoggle}
  />
</span>

<style>
  .lobby-toggle {
    position: relative;
    z-index: 2;
    display: inline-flex;
    flex: none;
  }
</style>
