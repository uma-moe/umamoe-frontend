<script lang="ts">
  import TextField from '@/components/TextField.svelte';
  import { rememberApiKey, simulatorSession } from '../simulator-session.svelte';

  // The key is the one setting worth surviving a reload, and this panel is the
  // only place it can change, so the effect belongs here rather than in the shell.
  $effect(() => {
    rememberApiKey();
  });
</script>

<TextField
  id="sim-api-key"
  type="password"
  label="uma.moe API key"
  help="Simulator access is granted per key during the beta. Stored in this browser only."
  autocomplete="off"
  bind:value={simulatorSession.apiKey}
/>
