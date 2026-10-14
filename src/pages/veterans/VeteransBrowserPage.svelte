<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { getAuthToken } from '@/services/auth/auth-token';
  import { activeWorkspace } from '@/lib/workspaces/workspace-state';
  import { router } from '@/routes/router';
  import {
    loadCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import { mergeVeterans } from '@/lib/veterans/veteran-profile';
  import { deviceParent } from '@/lib/veterans/parent-picker';
  import { draftScope, veteranDrafts, veteranLibraryRevision } from './veteran-library';
  import {
    profileRepository,
    type ProfileResponse,
    type TrainerProfile
  } from '@/pages/profile/profile-repository';
  import VeteranCollection from './VeteranCollection.svelte';
  import ProfileVeteransRoster from '@/pages/profile/veterans/ProfileVeteransRoster.svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';

  let trainerId = $state(''),
    browseError = $state('');
  let characters = $state<Map<number, CharacterCatalogEntry>>(new Map()),
    catalogError = $state('');
  let remote = $state.raw<ProfileResponse>(),
    loading = $state(false),
    error = $state('');

  const accountId = $derived($authUser ? ($activeWorkspace.accountId ?? '') : '');
  const scope = $derived(draftScope(accountId, $authUser?.id));
  const veterans = $derived(
    mergeVeterans(
      remote?.veterans ?? [],
      ($veteranDrafts[scope] ?? []).map((record) => deviceParent(record, accountId))
    )
  );
  const trainer = $derived<TrainerProfile>(
    remote?.trainer ?? {
      account_id: accountId,
      name: accountId ? $activeWorkspace.label : 'This device',
      follower_num: null,
      own_follow_num: null,
      best_team_class: null,
      team_class: null,
      team_evaluation_point: null,
      rank_score: null,
      comment: null
    }
  );

  let generation = 0,
    live = true;

  onMount(() => {
    void loadCharacters();
    return () => {
      live = false;
      generation++;
    };
  });

  async function loadCharacters() {
    try {
      const result = await loadCharacterCatalog();
      if (live) {
        characters = result;
        catalogError = '';
      }
    } catch {
      if (live) catalogError = 'Character names and artwork could not be loaded.';
    }
  }

  async function loadCollection(id: string) {
    const current = ++generation,
      token = getAuthToken();
    remote = undefined;
    error = '';
    loading = !!id;
    if (!id) return;
    try {
      const result = await profileRepository.load(id, true);
      if (live && current === generation && token === getAuthToken()) remote = result;
    } catch (reason) {
      if (live && current === generation)
        error = reason instanceof Error ? reason.message : 'Collection could not be loaded.';
    } finally {
      if (live && current === generation) loading = false;
    }
  }

  $effect(() => {
    const id = accountId;
    $authUser;
    $veteranLibraryRevision;
    if ($authReady)
      untrack(() => {
        void loadCollection(id);
      });
  });

  function browse(event: SubmitEvent) {
    event.preventDefault();
    const id = trainerId.trim();
    if (!/^\d+$/.test(id)) {
      browseError = 'Enter a valid trainer ID.';
      return;
    }
    browseError = '';
    void router.navigate('/veterans/:accountId', { params: { accountId: id } });
  }
</script>

<AppPage
  routeId="veterans"
  title="Veterans"
  width="wide"
  description="Upload your collection and use it in every legacy picker."
>
  {#snippet actions()}
    <form
      class="trainer-lookup"
      aria-label="Find a trainer’s collection"
      onsubmit={browse}
    >
      <span>Find a trainer’s collection</span>
      <div>
        <TextField
          id="veterans-trainer-id"
          label="Trainer ID"
          hideLabel
          placeholder="Trainer ID"
          inputmode="numeric"
          bind:value={trainerId}
        /><Button
          type="submit"
          variant="secondary"
          icon="search"
        >
          Browse
        </Button>
      </div>
      {#if browseError}
        <p
          class="error"
          role="alert"
        >
          {browseError}
        </p>
      {/if}
    </form>
  {/snippet}
  <VeteranCollection empty={!loading && !veterans.length}>
    {#if catalogError}
      <Banner
        title={catalogError}
        tone="warning"
      >
        <Button
          variant="secondary"
          onclick={loadCharacters}
        >
          Retry resources
        </Button>
      </Banner>
    {/if}
    {#if error}
      <Banner
        title="Account collection could not be loaded"
        tone="danger"
      >
        <p>{error}</p>
        <Button
          variant="secondary"
          onclick={() => loadCollection(accountId)}
        >
          Retry collection
        </Button>
      </Banner>
    {/if}
    {#if loading}
      <div
        class="loading"
        role="status"
      >
        <Spinner />Loading collection…
      </div>
    {:else if veterans.length}
      <ProfileVeteransRoster
        accountId={accountId || 'local'}
        profile={{ trainer, veterans }}
        {characters}
        isOwner={true}
        imports={false}
      />
    {/if}
  </VeteranCollection>
</AppPage>

<style>
  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 48px;
  }
  .trainer-lookup {
    display: grid;
    gap: 5px;
    width: 300px;
    max-width: 100%;
    font-size: 12px;
  }
  .trainer-lookup > span {
    font-weight: 600;
    color: var(--text-muted);
  }
  .trainer-lookup > div {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .trainer-lookup :global(.field) {
    flex: 1;
    min-width: 0;
  }
  .error {
    margin: 0;
    color: var(--color-danger);
  }
  @media (max-width: 767px) {
    .trainer-lookup {
      width: calc(100vw - 24px);
      font-size: 11px;
    }
    .trainer-lookup :global(input) {
      font-size: 12px;
    }
  }
</style>
