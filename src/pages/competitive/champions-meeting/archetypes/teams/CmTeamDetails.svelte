<script lang="ts">
  import type { Snippet } from 'svelte';
  import { simulatorUmaFromCm } from '@/pages/simulator/simulator-uma';
  import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
  import type { Build, Performer, Snapshot, Summary, TeamDetail } from '../../../hakuraku-types';
  import { cmGet, snapshotPath, pct, number, buildRunner } from '../../cm-data';
  import { portrait } from '../../../analysis-view';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import RunnerBuildDetails from '../../../runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '../../../runners/RunnerBuildGroup.svelte';
  import RunnerTraining from '../../../runners/RunnerTraining.svelte';

  interface Props {
    data: Summary;
    snapshot?: Snapshot;
    colors: Record<number, string>;
    selected: string;
    buildTeam: boolean;
    simError?: string;
    lobby: Performer[];
    lobbyIds: Set<string>;
    pendingTeams: string[];
    pendingRunners: string[];
    teamDraft: { key: string; build: Build }[];
    teamError: string;
    runnerToggle: Snippet<[Performer, number]>;
    ontoggle: (team: Performer) => void;
    onbuildteam: () => void;
    onremoverunner: (key: string) => void;
  }

  let {
    data,
    snapshot,
    colors,
    selected = $bindable(),
    buildTeam = $bindable(),
    simError = $bindable(''),
    lobby,
    lobbyIds,
    pendingTeams,
    pendingRunners,
    teamDraft,
    teamError,
    runnerToggle,
    ontoggle,
    onbuildteam,
    onremoverunner
  }: Props = $props();

  let simBusy = $state(false),
    detail = $state<TeamDetail>(),
    detailError = $state(''),
    copied = $state(false);

  async function simulate(builds: Build[], replace = false) {
    simBusy = true;
    simError = '';
    try {
      await openSimulatorField(
        builds.map((build) => simulatorUmaFromCm(build, data, replace ? 1 : 0)),
        {
          replace,
          raceInstanceId: snapshot?.raceInstanceId,
          startTimeType: snapshot?.startTimeType
        }
      );
      selected = '';
    } catch (error) {
      simError = (error as Error).message;
    } finally {
      simBusy = false;
    }
  }

  async function copyLink() {
    try {
      const url = new URL(location.href);
      url.searchParams.set('snapshot', data.snapshotId);
      url.searchParams.set('tab', 'archetypes');
      url.searchParams.set('team', selected);
      await navigator.clipboard.writeText(url.href);
      copied = true;
    } catch {
      detailError = 'Could not copy the team link.';
    }
  }

  $effect(() => {
    const id = data.snapshotId,
      team = selected;
    detail = undefined;
    detailError = '';
    copied = false;
    if (!team) return;
    const controller = new AbortController();
    cmGet<TeamDetail>(snapshotPath(id, 'teams/' + encodeURIComponent(team)), controller.signal, id)
      .then((v) => {
        if (!controller.signal.aborted) {
          detail = v;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) detailError = e.message;
      });
    return () => controller.abort();
  });
</script>

<div class="team-details-dialog">
  <Dialog
    open={!!selected}
    title="Team details"
    maxWidth="1480px"
    maxHeight="94dvh"
    mobileMaxHeight="94dvh"
    contentPadding="10px"
    mobileContentPadding="8px"
    onclose={() => (selected = '')}
  >
    {#snippet headerActions()}
      <div class="detail-actions">
        {#if detail}
          <Button
            size="sm"
            variant="secondary"
            icon="race"
            loading={simBusy}
            onclick={() => simulate(detail!.team.members, true)}
          >
            Simulate team
          </Button><Button
            size="sm"
            disabled={pendingTeams.includes(detail.team.id) ||
              (!lobbyIds.has(detail.team.id) && lobby.length + pendingTeams.length >= 3)}
            onclick={() => ontoggle(detail!.team)}
          >
            {lobbyIds.has(detail.team.id)
              ? 'Remove from lobby'
              : pendingTeams.includes(detail.team.id)
                ? 'Loading…'
                : lobby.length + pendingTeams.length >= 3
                  ? 'Lobby full'
                  : 'Add to lobby'}
          </Button>
        {/if}<Button
          size="sm"
          variant="secondary"
          onclick={copyLink}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </Button>
      </div>
    {/snippet}
    {#if detailError}
      <p role="alert">{detailError}</p>
    {:else if !detail}
      <Spinner
        size={48}
        centered
        minHeight="clamp(320px, 60dvh, 620px)"
        label="Loading team builds…"
      />
    {:else}
      {#if teamError && !buildTeam}
        <p role="alert">{teamError}</p>
      {/if}
      <div class="detail-summary">
        <div class="detail-rate">
          <strong>{pct(detail.team.wins / detail.team.n)}</strong>
          <span>Team win rate</span>
        </div>
        <dl>
          <div>
            <dt title="Uncertainty in the win rate, calculated with a 95% confidence interval.">
              Estimated win range
            </dt>
            <dd>{pct(detail.team.ci[0])}–{pct(detail.team.ci[1])}</dd>
          </div>
          <div>
            <dt>Simulated races</dt>
            <dd>{number(detail.team.n)}</dd>
          </div>
        </dl>
        <div class="detail-choice">
          <Checkbox
            id="cm-detail-build-team"
            label="Build a team"
            bind:checked={buildTeam}
          />
        </div>
      </div>
      {#if buildTeam}
        <section
          class="detail-selection"
          aria-label="Selected runners"
        >
          <strong>Build a team · {teamDraft.length}/3</strong>
          <div class="selected-builds">
            {#each teamDraft as entry}
              <span>
                <Artwork
                  src={portrait(entry.build.card)}
                  alt=""
                  size="xs"
                />{data.cards[entry.build.card]?.name}
                <button
                  aria-label={'Remove ' + data.cards[entry.build.card]?.name + ' from selection'}
                  onclick={() => onremoverunner(entry.key)}
                >
                  <Icon
                    name="close"
                    size={14}
                  />
                </button>
              </span>
            {/each}
          </div>
          <span
            class="selection-status"
            role="status"
          >
            {teamError ||
              (pendingRunners.length
                ? 'Loading captured build…'
                : !teamDraft.length
                  ? 'Use + beside an Uma to select its build.'
                  : 'Choose builds from any captured team.')}
          </span>
          <Button
            size="sm"
            disabled={teamDraft.length !== 3 ||
              lobby.length + pendingTeams.length >= 3 ||
              pendingRunners.length > 0}
            onclick={() => {
              selected = '';
              onbuildteam();
            }}
          >
            Add custom team to lobby
          </Button>
        </section>
      {/if}
      <RunnerBuildGroup>
        {#each detail.team.members as member, index}
          <RunnerBuildDetails
            runner={buildRunner(member, data, index)}
            outfit={data.cards[member.card]?.outfit}
            color={colors[member.style]}
            framed
            skillNames={new Map(
              Object.entries(detail.skills).map(([id, name]) => [Number(id), name])
            )}
          >
            {#snippet headerActions()}
              <Button
                size="sm"
                variant="secondary"
                disabled={simBusy}
                onclick={() => simulate([member])}
              >
                Use in simulator
              </Button>{@render runnerToggle(detail!.team, index)}
            {/snippet}
            {#snippet metrics()}
              <dl class="runner-results">
                <div>
                  <dt>Individual win rate</dt>
                  <dd>{pct(detail!.team.memberWins[index]! / detail!.team.n)}</dd>
                </div>
                <div>
                  <dt>Share of team wins</dt>
                  <dd>
                    {pct(
                      detail!.team.wins ? detail!.team.memberWins[index]! / detail!.team.wins : 0
                    )}
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
  @import './cm-team-details.css';
</style>
