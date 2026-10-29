<script lang="ts">
  import Icon from '@/components/Icon.svelte';
  import ProfileShell from './ProfileShell.svelte';

  interface Props {
    accountId: string;
    current: 'cm' | 'achievements' | 'titles';
    description: string;
  }

  let { accountId, current, description }: Props = $props();
</script>

<ProfileShell
  {accountId}
  {current}
>
  {#snippet children(_context)}
    <main class="page-body">
      <div class="wip-body">
        <Icon
          name="tools"
          size={54}
        />
        <h3>Work in Progress</h3>
        <p>{description}</p>
      </div>
    </main>
  {/snippet}
</ProfileShell>

<style>
  .page-body {
    max-width: 1080px;
    padding: 1.5rem 2rem 2rem;
    margin-inline: auto;
  }
  .wip-body {
    min-height: 265px;
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 1rem;
    padding: 5rem 2rem;
    border: 1px solid rgb(255 152 0 / 0.12);
    border-radius: var(--radius-lg);
    background: rgb(255 152 0 / 0.03);
    color: rgb(255 152 0 / 0.45);
    text-align: center;
  }
  .wip-body h3 {
    margin: 0;
    color: rgb(255 183 77 / 0.7);
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .wip-body p {
    margin: 0;
    color: var(--text-disabled);
    font-size: 0.875rem;
  }
  @media (max-width: 600px) {
    .page-body {
      padding: 1rem 4px calc(1rem + var(--bottom-nav-height));
    }
    .wip-body {
      min-height: 230px;
      padding: 3rem 4px;
    }
  }
</style>
