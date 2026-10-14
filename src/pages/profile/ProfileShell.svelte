<script lang="ts">
  import { onMount, untrack, type Snippet } from 'svelte';
  import { watchFactorCatalog } from '@/lib/catalog/factor-catalog';
  import {
    characterImagePath,
    loadCharacterCatalog,
    type CharacterCatalogEntry
  } from '@/lib/catalog/character-catalog';
  import { authRepository } from '@/services/auth/auth-repository';
  import { authReady, authUser } from '@/services/auth/auth-state';
  import { getAuthToken } from '@/services/auth/auth-token';
  import { HttpError } from '@/services/http/http-client';
  import { copyText } from '@/lib/clipboard';
  import ToastRegion, { type Toast } from '@/components/feedback/ToastRegion.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import Icon from '@/components/Icon.svelte';
  import Tabs from '@/components/navigation/Tabs.svelte';
  import Card from '@/components/cards/Card.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { formatProfileNumber as format } from '@/lib/profile/profile-display';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SourcePage from '@/layouts/SourcePage.svelte';
  import {
    profileRepository,
    type ProfileResponse,
    type ProfileVisibility
  } from './profile-repository';

  onMount(watchFactorCatalog);

  interface ProfileShellContext {
    profile: ProfileResponse;
    isOwner: boolean;
    visibility: ProfileVisibility;
    savingVisibility: boolean;
    visibilityReady: boolean;
    characters: Map<number, CharacterCatalogEntry>;
    sectionVisible: (section: string) => boolean;
    toggleSection: (section: string) => void;
  }

  interface Props {
    accountId: string;
    current: 'overview' | 'veterans' | 'cm' | 'achievements' | 'titles';
    children: Snippet<[ProfileShellContext]>;
  }

  let { accountId, current, children }: Props = $props();

  let toasts = $state<Toast[]>([]);

  async function copyTrainerId(): Promise<void> {
    const id = accountId;
    const copied = await copyText(id);
    toasts = [
      ...toasts,
      {
        id: crypto.randomUUID(),
        title: copied ? `Trainer ID copied: ${id}` : 'Failed to copy Trainer ID',
        tone: copied ? ('success' as const) : ('danger' as const)
      }
    ].slice(-3);
  }

  let profile = $state.raw<ProfileResponse>();
  let characters = $state<Map<number, CharacterCatalogEntry>>(new Map());
  let loading = $state(true);
  let error = $state('');
  let hidden = $state(false);
  let isOwner = $state(false);
  let visibility = $state<ProfileVisibility>({ profile_hidden: false, hidden_sections: [] });
  let savingVisibility = $state(false);
  let visibilityReady = $state(false);
  let visibilityError = $state('');

  interface ProfileSession {
    accountId: string;
    userId?: string;
    token?: string;
    confirmed: ProfileVisibility;
    revision: number;
  }

  let session: ProfileSession | undefined;

  function isCurrent(request: ProfileSession): boolean {
    return (
      session === request && accountId === request.accountId && getAuthToken() === request.token
    );
  }

  const tabs = $derived([
    { id: 'overview', label: 'Overview', icon: 'user' as const, href: `/profile/${accountId}` },
    {
      id: 'cm',
      label: 'Champions Meeting',
      icon: 'trophy' as const,
      href: `/profile/${accountId}/cm`,
      badge: 'Soon'
    },
    {
      id: 'achievements',
      label: 'Achievements',
      icon: 'trophy' as const,
      href: `/profile/${accountId}/achievements`,
      badge: 'Soon'
    },
    {
      id: 'titles',
      label: 'Titles',
      icon: 'star' as const,
      href: `/profile/${accountId}/titles`,
      badge: 'Soon'
    }
  ]);

  function teamClass(value: number | null): string {
    return value == null ? '-' : value === 7 ? 'Open' : `Class ${value}`;
  }

  function image(id: number): string | undefined {
    return id ? characterImagePath(id) : undefined;
  }

  function sectionVisible(section: string): boolean {
    return isOwner || !visibility.hidden_sections.includes(section);
  }

  async function loadProfile(request: ProfileSession): Promise<void> {
    if (!/^\d+$/.test(request.accountId)) {
      error = 'Enter a valid trainer ID.';
      loading = false;
      return;
    }
    try {
      const [nextProfile, nextCharacters] = await Promise.all([
        profileRepository.load(request.accountId, true, true),
        loadCharacterCatalog()
      ]);
      if (!isCurrent(request)) return;
      profile = nextProfile;
      characters = nextCharacters;
    } catch (reason) {
      if (!isCurrent(request)) return;
      if (reason instanceof HttpError && reason.status === 403) hidden = true;
      else if (reason instanceof HttpError && reason.status === 404)
        error = `Trainer not found. ${reason.message}`;
      else error = `Failed to load profile.${reason instanceof Error ? ' ' + reason.message : ''}`;
    } finally {
      if (isCurrent(request)) loading = false;
    }
  }

  async function loadOwnership(request: ProfileSession): Promise<void> {
    if (!request.userId) return;
    const accounts = await authRepository.linkedAccounts().catch(() => []);
    if (!isCurrent(request)) return;
    isOwner = accounts.some((item) => item.account_id === request.accountId);
    if (isOwner) await loadVisibility(request);
  }

  async function loadVisibility(request = session): Promise<void> {
    if (!request || !isCurrent(request)) return;
    visibilityReady = false;
    visibilityError = '';
    try {
      const result = await profileRepository.visibility(request.accountId);
      if (!isCurrent(request)) return;
      visibility = result;
      request.confirmed = result;
      visibilityReady = true;
    } catch (reason) {
      if (!isCurrent(request)) return;
      if (reason instanceof HttpError && reason.status === 404) visibilityReady = true;
      else visibilityError = 'Visibility settings could not be loaded. Retry before changing them.';
    }
  }

  async function persistVisibility(next: ProfileVisibility): Promise<void> {
    const request = session;
    if (!request || !isCurrent(request) || !isOwner || !visibilityReady) return;
    const revision = ++request.revision;
    savingVisibility = true;
    visibilityError = '';
    visibility = next;
    try {
      const saved = await profileRepository.updateVisibility(request.accountId, next);
      request.confirmed = saved;
      if (isCurrent(request) && revision === request.revision) visibility = saved;
    } catch {
      if (isCurrent(request) && revision === request.revision) {
        visibility = request.confirmed;
        visibilityError =
          'Visibility changes could not be saved. Your last saved settings have been restored.';
      }
    } finally {
      if (isCurrent(request) && revision === request.revision) savingVisibility = false;
    }
  }

  function toggleSection(section: string): void {
    const hiddenSections = visibility.hidden_sections.includes(section)
      ? visibility.hidden_sections.filter((item) => item !== section)
      : [...visibility.hidden_sections, section];
    void persistVisibility({ ...visibility, hidden_sections: hiddenSections });
  }

  $effect(() => {
    const id = accountId,
      user = $authUser,
      ready = $authReady;
    untrack(() => {
      session = undefined;
      loading = true;
      error = '';
      hidden = false;
      profile = undefined;
      isOwner = false;
      visibility = { profile_hidden: false, hidden_sections: [] };
      visibilityReady = false;
      savingVisibility = false;
      visibilityError = '';
      if (!ready) return;
      const request: ProfileSession = {
        accountId: id,
        userId: user?.id,
        token: getAuthToken(),
        confirmed: visibility,
        revision: 0
      };
      session = request;
      void loadProfile(request);
      void loadOwnership(request);
    });
    return () => {
      session = undefined;
    };
  });
</script>

<SourcePage
  routeId={current === 'veterans' ? 'veterans' : 'profile'}
  title={profile?.trainer.name || `Trainer ${accountId}`}
  width="wide"
>
  <div
    class="profile-page"
    class:browser-page={current === 'veterans'}
  >
    {#if loading}
      <div class="state">
        <Spinner size={40} />
        <span>Loading profile…</span>
      </div>
    {:else if error}
      <div class="state error">
        <Icon
          name="warning"
          size={48}
        />
        <span>{error}</span>
        <a href="/">Back to Home</a>
      </div>
    {:else if hidden}
      <div class="hidden-profile">
        <Icon
          name="eye-off"
          size={40}
        />
        <h2>This profile is hidden</h2>
        <p>The owner of this profile has chosen to keep it private.</p>
        <a href="/">Back to Home</a>
      </div>
    {:else if profile}
      {#if current === 'veterans'}
        <header class="browser-heading">
          <div>
            <span class="eyebrow">Trainer collection</span>
            <h1>Veterans</h1>
            <h2>{profile.trainer.name || accountId}</h2>
          </div>
          <div>
            <Button
              href="/veterans"
              variant="secondary"
              icon="search"
              size="sm"
            >
              Browse trainers
            </Button><Button
              href={'/profile/' + accountId}
              variant="secondary"
              icon="user"
              size="sm"
            >
              Trainer profile
            </Button>
          </div>
        </header>
        {@render children({
          profile,
          isOwner,
          visibility,
          savingVisibility,
          visibilityReady,
          characters,
          sectionVisible,
          toggleSection
        })}
      {:else}
        <div class="profile-layout">
          <Card>
            <div class="trainer-summary">
              <header class="profile-header">
                <div class="identity">
                  <Artwork
                    src={profile.inheritance
                      ? image(profile.inheritance.main_parent_id)
                      : undefined}
                    alt="Trainer's shared character"
                    size="lg"
                    shape="circle"
                  />
                  <div class="identity-copy">
                    <h1>{profile.trainer.name || 'Unknown Trainer'}</h1>
                    <div class="trainer-id">
                      <span>Trainer ID</span>
                      <span class="id-number">
                        {profile.trainer.account_id.replace(/(\d{3})(?=\d)/g, '$1 ')}
                      </span>
                      <IconButton
                        icon="copy"
                        size="sm"
                        label={`Copy trainer ID ${profile.trainer.account_id}`}
                        title="Copy trainer ID"
                        onclick={() => void copyTrainerId()}
                      />
                    </div>
                    {#if profile.trainer.comment}
                      <p class="comment">{profile.trainer.comment}</p>
                    {/if}
                    <div class="trainer-meta">
                      {#if profile.circle && sectionVisible('circle')}
                        <a
                          class="trainer-club"
                          href={'/circles/' + profile.circle.circle_id}
                        >
                          <Icon
                            name="community"
                            size={16}
                          />
                          <strong>{profile.circle.name}</strong>
                          <Icon
                            name="external"
                            size={12}
                          />
                        </a>
                      {/if}
                      <div class="social">
                        {#if profile.trainer.follower_num != null}
                          <span>
                            <b>{format(profile.trainer.follower_num)}</b>
                            followers
                          </span>
                        {/if}{#if profile.trainer.own_follow_num != null}
                          <span>
                            <b>{format(profile.trainer.own_follow_num)}</b>
                            following
                          </span>
                        {/if}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="trainer-overview">
                  <dl class="trainer-facts">
                    {#if profile.trainer.team_evaluation_point != null}
                      <div>
                        <dt>Team evaluation</dt>
                        <dd>{format(profile.trainer.team_evaluation_point)}</dd>
                      </div>
                    {/if}
                    {#if profile.trainer.team_class != null}
                      <div>
                        <dt>Stadium class</dt>
                        <dd>{teamClass(profile.trainer.team_class)}</dd>
                      </div>
                    {/if}
                    {#if profile.trainer.best_team_class != null}
                      <div>
                        <dt>Best stadium class</dt>
                        <dd>{teamClass(profile.trainer.best_team_class)}</dd>
                      </div>
                    {/if}
                    {#if profile.trainer.rank_score != null}
                      <div>
                        <dt title="Progress toward Archive level">Archive points</dt>
                        <dd>{format(profile.trainer.rank_score)}</dd>
                      </div>
                    {/if}
                  </dl>
                  {#if isOwner}
                    <div class="owner-controls">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={visibility.profile_hidden ? 'eye-off' : 'eye'}
                        disabled={!visibilityReady}
                        ariaPressed={visibility.profile_hidden}
                        onclick={() =>
                          persistVisibility({
                            ...visibility,
                            profile_hidden: !visibility.profile_hidden
                          })}
                      >
                        {visibility.profile_hidden ? 'Entire Profile Hidden' : 'Profile Visible'}
                      </Button>{#if savingVisibility}
                        <Spinner size={14} />
                      {/if}
                    </div>
                  {/if}
                </div>
              </header>
              {#if visibilityError}
                <div class="visibility-error">
                  <Banner
                    tone="danger"
                    title="Profile visibility"
                  >
                    <p>{visibilityError}</p>
                    {#if !visibilityReady}
                      <Button
                        variant="secondary"
                        onclick={() => void loadVisibility()}
                      >
                        Retry visibility
                      </Button>
                    {/if}
                  </Banner>
                </div>
              {/if}
            </div>
          </Card>
          <div class="profile-main">
            <div
              class="profile-tabs"
              data-profile-tabs
            >
              <Tabs
                items={tabs}
                value={current}
                label="Trainer profile sections"
              />
            </div>
            {@render children({
              profile,
              isOwner,
              visibility,
              savingVisibility,
              visibilityReady,
              characters,
              sectionVisible,
              toggleSection
            })}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</SourcePage>
<ToastRegion
  {toasts}
  ondismiss={(id) => (toasts = toasts.filter((toast) => toast.id !== id))}
/>

<style>
  @import './profile-shell.css';
</style>
