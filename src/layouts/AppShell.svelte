<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { searchParams } from 'sv-router';
  import { tourAudience } from '@/components/tours/tour-state';
  import {
    availableFindSources,
    findRequested,
    findSources,
    isFindShortcut
  } from '@/lib/find-loaded';
  import { router, pendingRoute } from '@/routes/router';
  import { navigationForPath, routeDefinitionForPath } from '@/routes/route-manifest';
  import { theme, toggleTheme } from '@/stores/theme';
  import { authUser, authReady, logout } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import Menu, { type MenuItem } from '@/components/navigation/Menu.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import LogoMark from '@/components/LogoMark.svelte';
  import NavigationTree from '@/components/navigation/NavigationTree.svelte';
  import MoeFooter from './MoeFooter.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import ServiceNotices from './ServiceNotices.svelte';
  import StickyFooterAd from './ads/StickyFooterAd.svelte';
  import { syncFusePage } from '@/services/ads/fuse-ads';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  let menuOpen = $state(false);
  let loadedAvatar = $state('');

  let utilityBar: HTMLElement;
  let mobileMenu: HTMLElement;

  let menuTop = $state(60);
  let PageTour = $state<typeof import('@/components/tours/PageTour.svelte').default>();
  let tourRequest = $state(0);
  let tourLoadError = $state(false);

  let tourLoading: Promise<void> | undefined;

  // The find bar stays out of the base shell until it is first asked for, from the footer or by Ctrl+F.
  let FindLoadedResults = $state<typeof import('./FindLoadedResults.svelte').default>();
  let findLoading: Promise<void> | undefined;

  function loadTour(): Promise<void> {
    if (PageTour) return Promise.resolve();
    return (tourLoading ??= import('@/components/tours/PageTour.svelte')
      .then((module) => {
        PageTour = module.default;
        tourLoadError = false;
      })
      .catch(() => {
        tourLoadError = true;
      })
      .finally(() => {
        tourLoading = undefined;
      }));
  }

  function loadFindBar(): Promise<void> {
    return (findLoading ??= import('./FindLoadedResults.svelte')
      .then((module) => {
        FindLoadedResults = module.default;
      })
      .catch((error: unknown) => {
        console.warn('Find could not be loaded. Asking for it again will retry.', error);
      })
      .finally(() => {
        findLoading = undefined;
      }));
  }

  // Once loaded, the find bar handles its own shortcuts; until then this asks for it in the same cases it would open.
  function requestFindFromShortcut(event: KeyboardEvent): void {
    if (FindLoadedResults || event.defaultPrevented || event.isComposing) return;
    if (!isFindShortcut(event) || document.querySelector('dialog[open]')) return;
    if (!availableFindSources($findSources).length) return;

    event.preventDefault();
    findRequested.update((value) => value + 1);
  }

  const currentRoute = $derived(routeDefinitionForPath(router.route.pathname));
  const navigation = $derived(
    navigationForPath(router.route.pathname, searchParams.toURLSearchParams().toString())
  );

  const profiles = $derived($workspaces.filter((workspace) => workspace.kind === 'account'));
  const ownProfile = $derived(
    profiles.find((profile) => profile.id === $activeWorkspace.id) ?? profiles[0]
  );

  const accountName = $derived($authUser?.display_name.trim() || 'Account');
  const accountInitials = $derived(
    accountName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join('')
      .toLocaleUpperCase()
  );

  const accountItems: MenuItem[] = $derived([
    ownProfile
      ? {
          id: 'profile',
          label: 'My profile',
          icon: 'user',
          href: `/profile/${ownProfile.accountId}`
        }
      : { id: 'link', label: 'Link game account', icon: 'connect', href: '/settings' },
    ...profiles
      .filter((profile) => profile !== ownProfile)
      .map((profile) => ({
        id: profile.id,
        label: `Profile: ${profile.label}`,
        icon: 'user' as const,
        href: `/profile/${profile.accountId}`
      })),
    { id: 'settings', label: 'Settings', icon: 'tune', href: '/settings' },
    { id: 'logout', label: 'Sign out', icon: 'arrow-right', separator: true }
  ]);

  function closeNavigation(): void {
    if (mobileMenu?.matches(':popover-open')) mobileMenu.hidePopover();
  }

  function startGuidedTour(): void {
    tourRequest++;
    void loadTour();
  }

  onMount(() => {
    if (tourAudience() === 'new') void loadTour();
  });

  // Analytics loads after the first paint to keep it out of the base shell; the page-view effect below sends the
  // current page once it has.
  let analytics = $state.raw<typeof import('@/services/analytics/analytics')>();

  onMount(() => {
    let stop: (() => void) | undefined;
    let destroyed = false;
    void import('@/services/analytics/analytics').then((module) => {
      if (destroyed) return;
      stop = module.startAnalytics();
      analytics = module;
    });

    return () => {
      destroyed = true;
      stop?.();
    };
  });

  onMount(syncFusePage);

  onMount(() => {
    if (!('modelContext' in document) && !('modelContext' in navigator)) return;
    const controller = new AbortController();
    void import('@/services/agent-tools')
      .then(({ registerAgentTools }) => registerAgentTools(controller.signal))
      .catch((error) => {
        if (!controller.signal.aborted)
          console.warn('Browser agent tools could not be registered.', error);
      });

    return () => controller.abort();
  });

  $effect(() => {
    analytics?.trackPageView(router.route.pathname);
  });

  $effect(() => {
    if ($findRequested && !FindLoadedResults) void loadFindBar();
  });
</script>

<svelte:window
  onkeydown={requestFindFromShortcut}
  onresize={closeNavigation}
  onscroll={() => {
    if (menuOpen) menuTop = utilityBar.getBoundingClientRect().bottom;
  }}
/>

<div
  class="app-viewport"
  data-app-shell
>
  <div class="app-shell">
    <header
      bind:this={utilityBar}
      class="utility-bar"
      data-shell-utility
    >
      <div class="mobile-heading">
        <button
          class="menu-toggle"
          type="button"
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          popovertarget="app-mobile-navigation"
          onclick={() => (menuTop = utilityBar.getBoundingClientRect().bottom)}
        >
          <Icon
            name={menuOpen ? 'close' : 'menu'}
            size={22}
          />
        </button>
        <a
          class="mobile-brand"
          href="/"
          aria-label="uma.moe home"
        >
          <LogoMark size={31} />
          <strong>uma.moe</strong>
        </a>
      </div>
      <div class="route-context">
        <strong>{currentRoute?.title ?? 'uma.moe'}</strong>
        <span>uma.moe</span>
      </div>
      <nav
        class="header-navigation"
        aria-label="Quick navigation"
      >
        <a
          class="account-action veterans-action"
          href="/veterans"
          data-preload="hover"
          aria-current={router.route.pathname.startsWith('/veterans') ? 'page' : undefined}
        >
          <Icon
            name="veterans"
            size={18}
          />
          <span>Veterans</span>
        </a>
      </nav>
      <div class="utility-actions">
        <button
          class="account-action"
          type="button"
          aria-label="Start guided tour"
          onclick={startGuidedTour}
        >
          <Icon
            name="help"
            size={18}
          />
        </button>
        <IconButton
          icon={$theme === 'dark' ? 'sun' : 'moon'}
          label="Toggle theme"
          onclick={toggleTheme}
        />
        {#if $authUser}
          <div class="signed-in-account">
            <Menu
              label={`Account menu for ${accountName}`}
              menuLabel="Your account"
              items={accountItems}
              onselect={(id) => {
                if (id === 'logout') logout();
              }}
            >
              {#snippet trigger()}
                <span class="account-trigger">
                  <span
                    class="account-avatar"
                    aria-hidden="true"
                  >
                    {accountInitials}{#if $authUser.avatar_url}
                      <img
                        src={$authUser.avatar_url}
                        alt=""
                        class:ready={loadedAvatar === $authUser.avatar_url}
                        loading="eager"
                        decoding="async"
                        onload={(event) =>
                          (loadedAvatar = event.currentTarget.getAttribute('src') ?? '')}
                        onerror={() => (loadedAvatar = '')}
                      />
                    {/if}
                  </span>
                  <span class="account-name">{accountName}</span>
                  <Icon
                    name="chevron"
                    size={12}
                  />
                </span>
              {/snippet}
              {#snippet header()}
                <div class="account-identity">
                  <small>Signed in as</small>
                  <strong>{accountName}</strong>
                  {#if ownProfile}
                    <span>{ownProfile.label}</span>
                  {/if}
                </div>
              {/snippet}
            </Menu>
          </div>
        {:else if !$authReady}
          <span class="account-action">
            <Spinner
              size={18}
              label="Checking sign-in"
            />
          </span>
        {:else}
          <a
            class="account-action"
            href="/login"
            aria-label="Sign in"
          >
            <Icon
              name="user"
              size={18}
            />
          </a>
        {/if}
      </div>
    </header>

    <aside
      class="side-rail"
      data-shell-rail
    >
      <a
        class="rail-brand"
        href="/"
        aria-label="uma.moe home"
      >
        <LogoMark size={38} />
        <span>
          <strong>uma.moe</strong>
          <small>Global companion</small>
        </span>
      </a>
      <div class="rail-scroll">
        <NavigationTree
          items={navigation.main}
          label="Main navigation"
        />
      </div>
    </aside>

    <div class="route-content">
      <div
        class="route-view"
        aria-busy={$pendingRoute !== null}
      >
        {@render children()}
      </div>
      <MoeFooter />
    </div>
  </div>
</div>

<div
  bind:this={mobileMenu}
  id="app-mobile-navigation"
  class="mobile-navigation"
  popover="auto"
  style:--menu-top={`${menuTop}px`}
  ontoggle={(event) => (menuOpen = event.newState === 'open')}
>
  {#if menuOpen}
    <NavigationTree
      items={navigation.main}
      label="Mobile navigation"
      variant="sheet"
      onnavigate={closeNavigation}
    />
  {/if}
</div>

{#if PageTour}
  <PageTour startRequest={tourRequest} />
{/if}
<ServiceNotices />
{#if FindLoadedResults}
  <FindLoadedResults />
{/if}
<StickyFooterAd />
{#if tourLoadError}
  <Dialog
    open
    title="Tour unavailable"
    onclose={() => (tourLoadError = false)}
  >
    <p>
      The guided tour could not be loaded. Reload this page, then use the help button to try again.
    </p>
    <Button
      size="sm"
      variant="secondary"
      onclick={() => location.reload()}
    >
      Reload page
    </Button>
  </Dialog>
{/if}

<style>
  @import './app-shell.css';
</style>
