<script lang="ts">
  import { authUser } from '@/services/auth/auth-state';
  import Button from '@/components/controls/Button.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import type { ParentPickerSources } from '../parent-picker-sources.svelte';

  interface Props {
    id: string;
    sources: ParentPickerSources;
  }

  let { id, sources }: Props = $props();

  function inputPartnerId(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.replace(/\D/g, '').slice(0, 12);
    sources.partnerId = input.value;
  }
</script>

<section
  class="partner-lookup"
  aria-label="Look up practice partner"
>
  <h3>
    <Icon
      name="search"
      size={16}
    />Look up practice partner
  </h3>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void sources.lookup();
    }}
  >
    <div class="partner-input">
      <TextField
        id={`${id}-partner`}
        label="Practice or trainer ID"
        hideLabel
        prefixIcon="tag"
        placeholder="Practice ID (9 digits) or Trainer ID (12 digits)"
        inputmode="numeric"
        maxlength={12}
        bind:value={sources.partnerId}
        oninput={inputPartnerId}
      />{#if sources.partnerId}
        <IconButton
          icon="close"
          label="Clear partner ID"
          onclick={() => sources.clearPartnerId()}
        />
      {/if}
    </div>
    <Button
      type="submit"
      icon="search"
      disabled={!/^(?:\d{9}|\d{12})$/.test(sources.partnerId) || !!sources.partnerPhase}
    >
      Fetch
    </Button>
  </form>
  <div class="partner-hints">
    <span>
      <strong>Practice ID:</strong>
      9-digit code from the in-game share button · expires after 24h
    </span>
    <span>
      <strong>Trainer ID:</strong>
      permanent 12-digit account ID · can be anyone's
    </span>
  </div>
  {#if !$authUser}
    <p class="signin-notice">
      <Icon
        name="info"
        size={16}
      />
      <span>Sign in to keep fetched partners saved to your account across devices.</span>
    </p>
  {/if}
</section>

<style>
  @import './parent-picker-partner-lookup.css';
</style>
