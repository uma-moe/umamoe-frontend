<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { authRepository } from '@/services/auth/auth-repository';
  import { getAuthToken } from '@/services/auth/auth-token';
  import {
    activeWorkspace,
    selectWorkspace,
    setAccountWorkspaces,
    workspaces
  } from '@/lib/workspaces/workspace-state';
  import {
    draftScope,
    importVeteranFiles,
    loadVeteranDrafts,
    syncVeteranDrafts,
    veteranDrafts,
    veteranImportBusy,
    veteranLibraryNotice
  } from './veteran-library';
  import Button from '@/components/controls/Button.svelte';
  import FileDrop from '@/components/controls/FileDrop.svelte';
  import Icon from '@/components/Icon.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectFieldSlim from '@/components/controls/SelectFieldSlim.svelte';

  interface Props {
    children?: Snippet<[Snippet, () => void]>;
    compact?: boolean;
    showAccountSwitch?: boolean;
    empty?: boolean;
    preferredAccountId?: string;
    onaccountchange?: (accountId: string) => void;
    onimport?: () => void;
    onnavigate?: () => void;
  }

  let {
    children,
    compact = false,
    showAccountSwitch = true,
    empty = false,
    preferredAccountId = '',
    onaccountchange,
    onimport,
    onnavigate
  }: Props = $props();

  const id = $props.id();

  const accountId = $derived($authUser ? ($activeWorkspace.accountId ?? '') : '');
  const scope = $derived(draftScope(accountId, $authUser?.id));
  const pending = $derived($veteranDrafts[scope]?.length ?? 0);
  const localCount = $derived($veteranDrafts.local?.length ?? 0);
  const accounts = $derived($workspaces.filter((workspace) => workspace.kind === 'account'));

  let transferAccountId = $state('');

  const destination = $derived(
    accounts.find((account) => account.accountId === (accountId || transferAccountId)) ??
      accounts[0]
  );

  let dragging = $state(0),
    storageError = $state(''),
    accountsError = $state(''),
    accountsBusy = $state(false);

  let fileInput = $state<HTMLInputElement>();

  function chooseFile() {
    fileInput?.click();
  }

  let live = true;

  onMount(() => () => {
    live = false;
  });

  async function loadAccounts() {
    const token = getAuthToken(),
      user = $authUser;

    if (!user) return;
    accountsBusy = true;
    accountsError = '';
    try {
      const accounts = await authRepository.linkedAccounts();
      if (!live || token !== getAuthToken() || user.id !== $authUser?.id) return;
      setAccountWorkspaces(
        accounts
          .filter((account) => account.verification_status === 'verified')
          .map((account) => ({
            accountId: account.account_id,
            label: account.trainer_name || account.account_id
          }))
      );

      if (preferredAccountId)
        selectWorkspace(
          accounts.some(
            (account) =>
              account.account_id === preferredAccountId &&
              account.verification_status === 'verified'
          )
            ? `account:${preferredAccountId}`
            : 'local'
        );
    } catch {
      if (live)
        accountsError =
          'Linked accounts could not be loaded. Your device collection is still available.';
    } finally {
      if (live) accountsBusy = false;
    }
  }

  async function loadDrafts(current: string) {
    try {
      await Promise.all([...new Set(['local', current])].map(loadVeteranDrafts));
      if (live) storageError = '';
    } catch {
      if (live)
        storageError =
          'Device storage could not be opened. Check your browser storage settings, then retry.';
    }
  }

  $effect(() => {
    preferredAccountId;
    if ($authReady && $authUser)
      untrack(() => {
        void loadAccounts();
      });
  });

  $effect(() => {
    void loadDrafts(scope);
  });

  function choose(value: string) {
    selectWorkspace(value);
    onaccountchange?.(value === 'local' ? '' : value.slice(8));
  }

  async function receive(files: FileList | File[]) {
    dragging = 0;
    if (!$authReady || accountsBusy || $veteranImportBusy) return;
    try {
      await importVeteranFiles(files, accountId);
    } catch {
      /* The shared notice retains the error and retry action. */
    }

    onimport?.();
  }

  async function sync(includeLocal = false, target = accountId) {
    if (!target) return;
    try {
      await syncVeteranDrafts(target, includeLocal);
      if (live && $authUser && includeLocal) choose(`account:${target}`);
    } catch {
      /* The recovery copy remains available. */
    }

    onimport?.();
  }

  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes('Files');
</script>

<section
  class="veteran-collection"
  class:compact
  aria-label="Veteran collection"
  ondragenter={(event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      dragging++;
    }
  }}
  ondragover={(event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = $veteranImportBusy ? 'none' : 'copy';
    }
  }}
  ondragleave={(event) => {
    if (hasFiles(event)) dragging = Math.max(0, dragging - 1);
  }}
  ondrop={(event) => {
    if (hasFiles(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer?.files.length) void receive(event.dataTransfer.files);
    }
    dragging = 0;
  }}
>
  <div
    class="collection-controls"
    class:empty-upload={empty && !compact}
    class:blank={compact &&
      (!$authUser || (!showAccountSwitch && accounts.length && !localCount)) &&
      !(accountId && pending) &&
      !storageError &&
      !accountsError &&
      !$veteranLibraryNotice}
  >
    <div class="collection-heading">
      <div>
        <Icon
          name="veterans"
          size={18}
        />
        <strong>{accountId ? $activeWorkspace.label : 'On this device'}</strong>
        <span>{accountId ? `Trainer ${accountId}` : 'No sign-in needed'}</span>
      </div>
      {#if !empty || compact}
        <Button
          href="https://werseter.github.io/umadump/"
          target="_blank"
          size="sm"
          icon="download"
        >
          Get umadump
        </Button>
      {/if}
    </div>
    {#if showAccountSwitch && $authUser && $workspaces.length > 1}
      <SegmentedControl
        label="Linked account"
        options={$workspaces.map((workspace) => ({
          value: workspace.id,
          label: workspace.kind === 'local' ? 'This device' : workspace.label
        }))}
        value={$activeWorkspace.id}
        onchange={choose}
      />
    {/if}
    {#if !compact}
      {@render dropZone()}
    {:else}
      <input
        bind:this={fileInput}
        hidden
        type="file"
        accept=".json"
        multiple
        aria-label="Upload veteran JSON"
        disabled={!$authReady || accountsBusy || $veteranImportBusy || !!storageError}
        onchange={(event) => {
          if (event.currentTarget.files) void receive(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
    {/if}
    {#if empty && !compact}
      {@render exportHelp()}
    {/if}
    {#if !compact || ($authUser && !accounts.length)}
      <div class="collection-notice">
        {#if !$authUser}
          {@render signInNotice()}
        {:else if $workspaces.length === 1}
          <span>Import now, then link and verify a trainer account to share your veterans.</span>
          <Button
            href="/settings"
            variant="secondary"
            size="sm"
            icon="connect"
            onclick={onnavigate}
          >
            Open Settings
          </Button>
        {:else if accountId}
          <span>
            Each upload syncs this account to the selected files: adds new veterans, updates
            matches, and removes missing ones.
          </span>
        {:else}
          <span>
            Each upload replaces this device collection. Select an account above to sync it.
          </span>
        {/if}
      </div>
    {/if}
    {#if $authUser && localCount && $workspaces.length > 1}
      <section
        class="device-transfer"
        aria-label="Sync device veterans to your account"
      >
        <Icon
          name="connect"
          size={22}
        />
        <div>
          <strong>{localCount} veteran{localCount === 1 ? '' : 's'} on this device</strong>
          <p>Replaces the account collection. Your device copy is kept.</p>
        </div>
        {#if !accountId && accounts.length > 1}
          <div class="transfer-target">
            <SelectFieldSlim
              id={`${id}-transfer`}
              label="Destination account"
              hideLabel
              options={accounts.map((account) => ({
                value: account.accountId!,
                label: account.label
              }))}
              value={destination?.accountId ?? ''}
              onchange={(value) => (transferAccountId = value)}
            />
          </div>
        {/if}
        <Button
          size="sm"
          icon="upload"
          disabled={!destination || accountsBusy || $veteranImportBusy || !!storageError}
          onclick={() => sync(true, destination?.accountId)}
        >
          {$veteranImportBusy
            ? 'Syncing…'
            : !accountId && accounts.length > 1
              ? 'Sync veterans'
              : `Sync to ${destination?.label ?? 'account'}`}
        </Button>
      </section>
    {/if}
    {#if storageError || accountsError}
      <div
        class="feedback error"
        role="alert"
      >
        <span>{storageError || accountsError}</span>
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (storageError ? loadDrafts(scope) : loadAccounts())}
        >
          Retry
        </Button>
      </div>
    {/if}
    {#if $veteranLibraryNotice}
      <div
        class="feedback"
        class:error={$veteranLibraryNotice.tone === 'danger'}
        role={$veteranLibraryNotice.tone === 'danger' ? 'alert' : 'status'}
      >
        <Icon
          name={$veteranLibraryNotice.tone === 'danger' ? 'warning' : 'check'}
          size={16}
        />
        <span>{$veteranLibraryNotice.message}</span>
        <button
          class="dismiss"
          aria-label="Dismiss import notification"
          onclick={() => veteranLibraryNotice.set(null)}
        >
          <Icon
            name="close"
            size={16}
          />
        </button>
      </div>
    {/if}
    {#if accountId && pending}
      <div
        class="feedback"
        role="status"
      >
        <span>{pending} veterans saved on this device, waiting for account upload.</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={$veteranImportBusy}
          onclick={() => sync()}
        >
          Retry upload
        </Button>
      </div>
    {/if}
  </div>
  {#if children}
    {@render children(dropZone, chooseFile)}
  {/if}
  {#if compact && !$authUser}
    <div class="signin-footer">{@render signInNotice()}</div>
  {/if}
  {#if dragging > 0}
    <div
      class="drop-overlay"
      aria-live="polite"
    >
      <Icon
        name="upload"
        size={32}
      />
      <strong>{$veteranImportBusy ? 'An upload is in progress' : 'Drop here to upload'}</strong>
      <span>{accountId ? `Sync to ${$activeWorkspace.label}` : 'Save on this device'}</span>
    </div>
  {/if}
</section>

{#snippet dropZone()}
  <div
    class="collection-drop"
    class:empty-upload={compact && empty}
    class:picker-upload={compact && empty}
  >
    {#if compact && empty}
      <div class="collection-heading">
        <div>
          <Icon
            name="veterans"
            size={18}
          />
          <strong>{accountId ? $activeWorkspace.label : 'On this device'}</strong>
          <span>{accountId ? `Trainer ${accountId}` : 'No sign-in needed'}</span>
        </div>
      </div>
    {/if}
    <FileDrop
      id={`${id}-veteran-import`}
      label={$veteranImportBusy
        ? 'Saving veterans…'
        : empty
          ? 'Upload veterans'
          : 'Drop here to upload'}
      description={empty ? 'Drop your JSON files here or click to browse.' : undefined}
      actionLabel={empty && !$veteranImportBusy ? 'Browse files' : undefined}
      multiple
      disabled={!$authReady || accountsBusy || $veteranImportBusy || !!storageError}
      onfiles={receive}
    />
    {#if compact && empty}
      {@render exportHelp()}
    {/if}
  </div>
{/snippet}
{#snippet exportHelp()}
  <div class="export-help">
    <div>
      <strong>Need a veteran export?</strong>
      <p>Get your collection with umadump.</p>
    </div>
    <Button
      href="https://werseter.github.io/umadump/"
      target="_blank"
      size="sm"
      icon="download"
    >
      Get umadump
    </Button>
  </div>
{/snippet}
{#snippet signInNotice()}
  <span>Each upload replaces this device collection. Sign in to sync it to your account.</span>
  <Button
    href="/login?returnTo=/veterans"
    variant="secondary"
    size="sm"
    icon="user"
    onclick={onnavigate}
  >
    Sign in
  </Button>
{/snippet}

<style>
  @import './veteran-collection.css';
</style>
