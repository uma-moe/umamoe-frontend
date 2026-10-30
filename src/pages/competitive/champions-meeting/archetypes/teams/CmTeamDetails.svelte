<script lang="ts">
  import type { Summary, TeamDetail } from '../../../hakuraku-types';
  import { pct, number, buildRunner, loadTeamDetail } from '../../cm-data';
  import Button from '@/components/controls/Button.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import RunnerBuildDetails from '../../../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../../../runners/RunnerBuildGroup.svelte';
  import RunnerTraining from '../../../runners/RunnerTraining.svelte';
  import type { CmLobby } from '../lobby/cm-lobby.svelte';
  import { runnerKey } from '../lobby/lobby-slots';
  import LobbyToggle from './LobbyToggle.svelte';

  interface Props {
    data: Summary;
    colors: Record<number, string>;
    selected: string;
    lobby: CmLobby;
  }

  let { data, colors, selected = $bindable(), lobby }: Props = $props();

  let detail = $state<TeamDetail>(),
    detailError = $state(''),
    copyError = $state(''),
    copied = $state(false);

  let controller: AbortController | undefined;

  const skillNames = $derived(
    new Map(Object.entries(detail?.skills ?? {}).map(([id, name]) => [Number(id), name]))
  );

  const teamInLobby = $derived(detail ? lobby.hasTeam(detail.team.id) : false);

  async function copyLink() {
    copyError = '';
    copied = false;

    try {
      const url = new URL(location.href);
      url.searchParams.set('snapshot', data.snapshotId);
      url.searchParams.set('tab', 'archetypes');
      url.searchParams.set('team', selected);
      await navigator.clipboard.writeText(url.href);
      copied = true;
    } catch {
      copyError = 'Could not copy the team link. Check clipboard permissions and try again.';
    }
  }

  async function loadDetail(snapshotId: string, teamId: string) {
    controller?.abort();
    detail = undefined;
    detailError = '';
    copyError = '';
    copied = false;

    if (!teamId) return;

    const request = new AbortController();
    controller = request;

    try {
      const value = await loadTeamDetail(snapshotId, teamId, request.signal);

      if (!request.signal.aborted) detail = value;
    } catch (reason) {
      if (!request.signal.aborted) {
        detailError =
          reason instanceof Error ? reason.message : 'The team builds could not be loaded.';
      }
    }
  }

  $effect(() => {
    void loadDetail(data.snapshotId, selected);

    return () => controller?.abort();
  });
</script>

{#snippet teamOverview(team: TeamDetail['team'])}
  <section
    class="detail-overview"
    aria-label="Captured team overview"
  >
    <dl class="detail-summary">
      <div>
        <dt>Team win rate</dt>
        <dd>{pct(team.wins / team.n)}</dd>
      </div>
      <div>
        <dt title="Uncertainty in the win rate, calculated with a 95% confidence interval.">
          95% win range
        </dt>
        <dd>{pct(team.ci[0])}–{pct(team.ci[1])}</dd>
      </div>
      <div>
        <dt>Simulated races</dt>
        <dd>{number(team.n)}</dd>
      </div>
    </dl>
  </section>
{/snippet}

<div class="team-details-dialog">
  <Dialog
    open={!!selected}
    title="Team details"
    maxWidth="1480px"
    maxHeight="94dvh"
    mobileMaxHeight="94dvh"
    contentPadding="16px"
    mobileContentPadding="12px"
    onclose={() => (selected = '')}
  >
    {#snippet headerActions()}
      {#if detail}
        <div class="header-overview">
          {@render teamOverview(detail.team)}
        </div>
      {/if}
      <div class="detail-actions">
        {#if detail}
          {@const team = detail.team}
          <Button
            size="sm"
            variant={teamInLobby ? 'secondary' : 'primary'}
            icon={teamInLobby ? 'check' : 'add'}
            loading={lobby.pending.includes(team.id)}
            ariaPressed={teamInLobby}
            ariaLabel={teamInLobby ? 'Remove team from lobby' : 'Add team to lobby'}
            onclick={() => void lobby.toggleTeam(team.id)}
          >
            <span class="action-label">
              {teamInLobby ? 'Remove team from lobby' : 'Add team to lobby'}
            </span>
          </Button>
        {/if}
        <Button
          size="sm"
          variant="secondary"
          icon={copied ? 'check' : 'copy'}
          ariaLabel={copied ? 'Link copied' : 'Copy link'}
          onclick={copyLink}
        >
          <span class="action-label">{copied ? 'Link copied' : 'Copy link'}</span>
        </Button>
      </div>
    {/snippet}
    {#if detailError}
      <div role="alert">
        <EmptyState
          icon="warning"
          title="Team builds unavailable"
          description={detailError}
        >
          {#snippet actions()}
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              onclick={() => void loadDetail(data.snapshotId, selected)}
            >
              Retry loading team
            </Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else if !detail}
      <Spinner
        size={48}
        centered
        minHeight="clamp(320px, 60dvh, 620px)"
        label="Loading team builds…"
      />
    {:else}
      {@const team = detail.team}
      <!-- The header holds the overview where it fits; narrower dialogs show it above the builds instead. -->
      <div class="content-overview">
        {@render teamOverview(team)}
      </div>
      {#if copyError || lobby.error}
        <div
          class="detail-error"
          role="alert"
        >
          <Banner
            title={copyError ? 'Link not copied' : 'Lobby not updated'}
            tone="warning"
          >
            <p>{copyError || lobby.error}</p>
          </Banner>
        </div>
      {/if}
      <RunnerBuildGroup>
        {#each team.members as member, index}
          {@const memberWins = team.memberWins[index]}
          <RunnerBuildDetails
            runner={buildRunner(member, data, index)}
            outfit={data.cards[member.card]?.outfit}
            color={colors[member.style]}
            framed
            inlineMetrics
            {skillNames}
          >
            {#snippet headerActions()}
              <LobbyToggle
                name={data.cards[member.card]?.name ?? 'this Uma'}
                added={lobby.hasRunner(team.id, index)}
                loading={lobby.pending.includes(runnerKey(team.id, index))}
                ontoggle={() => void lobby.toggleRunner(team.id, index)}
              />
            {/snippet}
            {#snippet metrics()}
              <dl class="runner-results">
                <div title="Individual win rate">
                  <dt>win rate</dt>
                  <dd>
                    {#if memberWins === undefined}
                      —
                    {:else}
                      {pct(memberWins / team.n)}
                    {/if}
                  </dd>
                </div>
                <div title="Share of team wins">
                  <dt>of wins</dt>
                  <dd>
                    {#if memberWins === undefined}
                      —
                    {:else}
                      {pct(team.wins > 0 ? memberWins / team.wins : 0)}
                    {/if}
                  </dd>
                </div>
              </dl>
            {/snippet}
            {#snippet training()}
              <RunnerTraining
                deck={member.deck}
                parents={member.parents}
                label={data.cards[member.card]?.name}
              />
            {/snippet}
          </RunnerBuildDetails>
        {/each}
      </RunnerBuildGroup>
    {/if}
  </Dialog>
</div>

<style>
  @import '../archetype-text.css';
  @import '../../../runners/runner-results.css';
  @import './cm-team-details.css';
</style>
