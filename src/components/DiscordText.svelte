<script lang="ts">
  let { text }: { text: string } = $props();
  // Split captures the invite code, leaving all other user content as escaped text.
  const parts = $derived(text.split(/(?:https?:\/\/)?discord[\s.．]*gg[\s/／]*([a-zA-Z0-9]+)/gi));
</script>

{#each parts as part, index}
  {#if index % 2}
    <a
      class="discord-link"
      href={`https://discord.gg/${part}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      discord.gg/{part}
    </a>
  {:else}
    {part}
  {/if}
{/each}

<style>
  .discord-link {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 1px 6px;
    margin: 0 2px;
    overflow: hidden;
    border: 1px solid rgb(88 101 242/0.3);
    border-radius: var(--radius-xs);
    background: rgb(88 101 242/0.15);
    color: #5865f2;
    text-decoration: none;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: text-bottom;
    font-weight: 500;
    line-height: 1.15;
  }
  .discord-link:hover {
    background: rgb(88 101 242/0.25);
    color: var(--text-primary);
    border-color: rgb(88 101 242/0.6);
  }
  @media (max-width: 768px) {
    .discord-link {
      min-height: var(--touch-target);
      padding-inline: 5px;
      margin-inline: 1px;
    }
  }
</style>
