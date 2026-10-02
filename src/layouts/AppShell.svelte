<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount, tick } from 'svelte';
  import { searchParams } from 'sv-router';
  import { tourAudience } from '@/components/tours/tour-state';
  import { router, pendingRoute } from '@/routes/router';
  import { navigationForPath, routeDefinitionForPath } from '@/routes/route-manifest';
  import { theme, toggleTheme } from '@/stores/theme';
  import { authUser, authReady, logout } from '@/services/auth/auth-state';
  import { activeWorkspace, workspaces } from '@/lib/workspaces/workspace-state';
  import Menu, { type MenuItem } from '@/components/Menu.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import IconButton from '@/components/IconButton.svelte';
  import LogoMark from '@/components/LogoMark.svelte';
  import NavigationTree from '@/components/NavigationTree.svelte';
  import MoeFooter from './MoeFooter.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import ServiceNotices from './ServiceNotices.svelte';
  import FindLoadedResults from './FindLoadedResults.svelte';
  import StickyFooterAd from './StickyFooterAd.svelte';
  import { startAnalytics, trackPageView } from '@/services/analytics';
  import { syncFusePage } from '@/services/ads/fuse-ads';

  interface Props { children: Snippet; }
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
  function loadTour(): Promise<void> {
    if (PageTour) return Promise.resolve();
    return tourLoading ??= import('@/components/tours/PageTour.svelte').then(module => { PageTour = module.default; tourLoadError = false; }).catch(() => { tourLoadError = true; }).finally(() => { tourLoading = undefined; });
  }
  const currentRoute = $derived(routeDefinitionForPath(router.route.pathname));
  const navigation = $derived(navigationForPath(router.route.pathname, searchParams.toURLSearchParams().toString()));
  const profiles = $derived($workspaces.filter(workspace => workspace.kind === 'account'));
  const ownProfile = $derived(profiles.find(profile => profile.id === $activeWorkspace.id) ?? profiles[0]);
  const accountName = $derived($authUser?.display_name.trim() || 'Account');
  const accountInitials = $derived(accountName.split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase());
  const accountItems: MenuItem[] = $derived([
    ownProfile
      ? { id: 'profile', label: 'My profile', icon: 'user', href: `/profile/${ownProfile.accountId}` }
      : { id: 'link', label: 'Link game account', icon: 'connect', href: '/settings' },
    ...profiles.filter(profile => profile !== ownProfile).map(profile => ({ id: profile.id, label: `Profile: ${profile.label}`, icon: 'user' as const, href: `/profile/${profile.accountId}` })),
    { id: 'settings', label: 'Settings', icon: 'tune', href: '/settings' },
    { id: 'logout', label: 'Sign out', icon: 'arrow-right', separator: true }
  ]);

  function closeNavigation(): void { if (mobileMenu?.matches(':popover-open')) mobileMenu.hidePopover(); }

  function startGuidedTour(): void {
    tourRequest++;
    void loadTour();
  }
  onMount(() => { if (tourAudience() === 'new') void loadTour(); });
  onMount(startAnalytics);
  onMount(syncFusePage);
  $effect(() => { trackPageView(router.route.pathname); });
  $effect(() => {
    const path = router.route.pathname;
    if ($pendingRoute) return;
    let active = true;
    void tick().then(() => import('@/services/seo')).then(module => { if (active) module.applyRouteMetadata(path); }).catch(() => {});
    return () => { active = false; };
  });
</script>

<svelte:window onresize={closeNavigation} onscroll={() => { if (menuOpen) menuTop = utilityBar.getBoundingClientRect().bottom; }}/>

<div class="app-viewport" data-app-shell>
  <div class="app-shell">
    <header bind:this={utilityBar} class="utility-bar" data-shell-utility>
      <div class="mobile-heading">
        <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded={menuOpen} popovertarget="app-mobile-navigation" onclick={() => menuTop = utilityBar.getBoundingClientRect().bottom}><Icon name={menuOpen ? 'close' : 'menu'} size={22}/></button>
        <a class="mobile-brand" href="/" aria-label="uma.moe home"><LogoMark size={31}/><strong>uma.moe</strong></a>
      </div>
      <div class="route-context"><strong>{currentRoute?.title ?? 'uma.moe'}</strong><span>uma.moe</span></div>
      <nav class="header-navigation" aria-label="Quick navigation"><a class="account-action veterans-action" href="/veterans" data-preload="hover" aria-current={router.route.pathname.startsWith('/veterans') ? 'page' : undefined}><Icon name="veterans" size={18}/><span>Veterans</span></a></nav>
      <div class="utility-actions">
        <button class="account-action" type="button" aria-label="Start guided tour" onclick={startGuidedTour}><Icon name="help" size={18}/></button>
        <IconButton icon={$theme === 'dark' ? 'sun' : 'moon'} label="Toggle theme" onclick={toggleTheme}/>
        {#if $authUser}
          <div class="signed-in-account">
            <Menu label={`Account menu for ${accountName}`} menuLabel="Your account" items={accountItems} onselect={id => { if (id === 'logout') logout(); }}>
              {#snippet trigger()}
                <span class="account-trigger">
                  <span class="account-avatar" aria-hidden="true">{accountInitials}{#if $authUser.avatar_url}<img src={$authUser.avatar_url} alt="" class:ready={loadedAvatar === $authUser.avatar_url} loading="eager" decoding="async" onload={event => loadedAvatar = event.currentTarget.getAttribute('src') ?? ''} onerror={() => loadedAvatar = ''}/>{/if}</span>
                  <span class="account-name">{accountName}</span>
                  <Icon name="chevron" size={12}/>
                </span>
              {/snippet}
              {#snippet header()}<div class="account-identity"><small>Signed in as</small><strong>{accountName}</strong>{#if ownProfile}<span>{ownProfile.label}</span>{/if}</div>{/snippet}
            </Menu>
          </div>
        {:else if !$authReady}<span class="account-action"><Spinner size={18} label="Checking sign-in"/></span>
        {:else}<a class="account-action" href="/login" aria-label="Sign in"><Icon name="user" size={18}/></a>{/if}
      </div>
    </header>

    <aside class="side-rail" data-shell-rail>
      <a class="rail-brand" href="/" aria-label="uma.moe home"><LogoMark size={38}/><span><strong>uma.moe</strong><small>Global companion</small></span></a>
      <div class="rail-scroll">
        <NavigationTree items={navigation.main} label="Main navigation"/>
      </div>
    </aside>

    <div class="route-content">
      <div class="route-view" aria-busy={$pendingRoute !== null}>
        {@render children()}
      </div>
      <MoeFooter/>
    </div>
  </div>

</div>

<div bind:this={mobileMenu} id="app-mobile-navigation" class="mobile-navigation" popover="auto" style:--menu-top={`${menuTop}px`} ontoggle={event => menuOpen = event.newState === 'open'}>
  {#if menuOpen}<NavigationTree items={navigation.main} label="Mobile navigation" variant="sheet" onnavigate={closeNavigation}/>{/if}
</div>

{#if PageTour}<PageTour startRequest={tourRequest}/>{/if}
<ServiceNotices/>
<FindLoadedResults/>
<StickyFooterAd/>
{#if tourLoadError}<Dialog open title="Tour unavailable" onclose={() => tourLoadError = false}><p>The guided tour could not be loaded. Reload this page, then use the help button to try again.</p><Button size="sm" variant="secondary" onclick={() => location.reload()}>Reload page</Button></Dialog>{/if}

<style>
  @media (max-width:767px) { .account-action { min-width:var(--touch-target); min-height:var(--touch-target); } }
  .app-viewport { width: 100%; min-width: 320px; flex: 1; display: flex; flex-direction: column; background: var(--color-canvas); container: app-viewport / inline-size; }
  .app-shell { flex: 1; display: grid; grid-template-rows: auto 1fr; background: var(--color-canvas); }
  .utility-bar { position: sticky; z-index: var(--z-header); top: 0; min-height: var(--utility-height); display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding: 6px 4px; border-bottom: 1px solid var(--border-primary); background: var(--navbar-bg); }
  .mobile-heading { display:flex; align-items:center; min-width:0; gap:4px; }
  .menu-toggle { display:grid; place-items:center; flex:0 0 44px; width:44px; height:44px; padding:0; border:0; border-radius:var(--radius-md); background:transparent; color:var(--text-secondary); cursor:pointer; }
  .menu-toggle:hover, .menu-toggle[aria-expanded='true'] { background:var(--surface-2); color:var(--accent-primary); }
  .mobile-brand { min-width: 0; display: flex; align-items: center; gap: 5px; color: var(--color-text); text-decoration: none; }
  .mobile-brand strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background: var(--gradient-brand); background-clip: text; color: transparent; font-size:20px; }
  .mobile-brand :global(svg) { flex:0 0 31px; }
  .route-context { display: none; min-width: 0; flex-direction: column; line-height: 1.15; }
  .route-context strong { overflow: hidden; font-size: var(--font-sm); text-overflow: ellipsis; white-space: nowrap; }
  .route-context span { color: var(--color-text-subtle); font-size: 9px; }
  .utility-actions { min-width: 0; flex-shrink:0; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
  .header-navigation { flex-shrink:0; margin-left:auto; }
  .account-action { width: 38px; height: 38px; display: grid; flex: 0 0 auto; place-items: center; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: transparent; color: var(--color-text-muted); cursor: pointer; }
  .account-action:hover { background: var(--surface-2); color: var(--color-text); }
  .signed-in-account :global(.trigger) { height:38px; padding:0 8px 0 5px; border-radius:var(--radius-md); border-color:var(--border-primary); background:var(--surface-1); }
  .signed-in-account :global(.trigger:hover),.signed-in-account :global(.trigger[aria-expanded='true']) { border-color:var(--accent-primary); background:var(--surface-3); }
  .account-trigger { display:flex; align-items:center; gap:8px; color:var(--text-secondary); }
  .account-trigger :global(svg) { flex:none; }
  .account-name { display:none; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-primary); }
  .account-avatar { position:relative; display:grid; flex:0 0 28px; place-items:center; width:28px; height:28px; border-radius:50%; background:rgb(var(--accent-primary-rgb)/.15); color:var(--accent-primary); font-size:11px; font-weight:700; }
  .account-avatar img { position:absolute; inset:0; width:100%; height:100%; border-radius:inherit; object-fit:cover; visibility:hidden; }.account-avatar img.ready { visibility:visible; }
  .account-identity { display:grid; gap:3px; max-width:240px; overflow-wrap:anywhere; }
  .account-identity strong { font-size:var(--font-sm); }.account-identity small,.account-identity>span { color:var(--text-secondary); font-size:11px; }
  .veterans-action { width:auto; display:flex; align-items:center; gap:8px; padding:0 12px; font-size:var(--font-sm); font-weight:600; text-decoration:none; }
  .side-rail { display: none; }
  .route-content { min-width: 0; display: flex; flex-direction: column; }
  .route-view { position: relative; min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; }
  .route-view :global(> *) { flex: 1 1 auto; }
  .mobile-navigation { position:fixed; inset:var(--menu-top) 0 auto; width:100%; max-height:calc(100dvh - var(--menu-top) - 8px); margin:0; padding:6px 8px max(8px,env(safe-area-inset-bottom)); overflow:auto; overscroll-behavior:contain; border:0; border-bottom:1px solid var(--border-primary); background:var(--bg-secondary); color:var(--text-primary); box-shadow:var(--shadow-md); }
  @media(max-width:359px) { .utility-bar { gap:2px; } .utility-actions { gap:0; } .mobile-heading { gap:2px; } .mobile-brand { display:none; } }
  @media(max-width:767px) { .utility-bar { background:var(--bg-secondary); } .mobile-brand strong { display:none; } }

  @container app-viewport (min-width: 768px) {
    .account-name { display:block; }
    .app-shell { grid-template-columns: var(--rail-compact) minmax(0, 1fr); grid-template-rows: var(--utility-height) minmax(0, 1fr); }
    .utility-bar { grid-column: 2; grid-row: 1; padding-inline: var(--page-gutter-compact); }
    .mobile-heading { display: none; }
    .route-context { display: flex; }
    .utility-actions { gap: var(--space-2); }
    .side-rail { position: sticky; z-index: var(--z-rail); top: 0; height: 100%; max-height: 100dvh; min-height: 0; grid-column: 1; grid-row: 1 / -1; display: flex; flex-direction: column; padding: 0 0 10px; border-right: 1px solid var(--border-primary); background: var(--bg-secondary); }
    .rail-brand { height: var(--utility-height); display: grid; flex: 0 0 auto; place-items: center; border-bottom: 1px solid var(--border-primary); color: var(--color-text); text-decoration: none; }
    .rail-brand > span { display: none; }
    .rail-scroll { min-height: 0; flex: 1; display: grid; align-content: start; gap: 5px; padding:8px 7px 0; }
    .route-content { grid-column: 2; grid-row: 2; }
  }

  @container app-viewport (min-width: 1800px) {
    .app-shell { grid-template-columns: var(--rail-expanded) minmax(0, 1fr); }
    .utility-bar { padding-inline: var(--page-gutter-expanded); }
    .rail-brand { display: flex; justify-content: flex-start; gap: 10px; padding:0 calc(var(--space-3) + var(--space-2)); }
    .rail-brand > span { display: flex; flex-direction: column; line-height: 1.1; }
    .rail-brand strong { font-size:20px; }
    .rail-brand small { color: var(--color-text-subtle); font-size:10px; text-transform: uppercase; }
    .rail-scroll { overflow-y: auto; padding:var(--space-3) var(--space-3) 0; scrollbar-width: thin; }
  }
</style>
