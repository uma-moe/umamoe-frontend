<script lang="ts">
  import { router } from '@/routes/router';
  import ProfileWip from './ProfileWip.svelte';

  const accountId = $derived(router.route.params.accountId || '');
  const isTitles = $derived(router.route.pathname.endsWith('/titles'));
</script>

<svelte:head>
  <title>{isTitles ? 'Titles' : 'Achievements'} · Trainer {accountId} · uma.moe</title>
  <meta
    name="robots"
    content="noindex"
  />
</svelte:head>
<ProfileWip
  {accountId}
  current={isTitles ? 'titles' : 'achievements'}
  description={`${isTitles ? 'Titles' : 'Achievements'} display is currently under development.`}
/>
