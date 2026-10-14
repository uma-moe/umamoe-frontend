<script lang="ts">
  import { onMount } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import {
    cmGet,
    loadCmSummary,
    pct,
    number,
    styleNames,
    type Manifest
  } from './champions-meeting/cm-data';
  import type { Summary, Snapshot } from './hakuraku-types';
  import { portrait } from './analysis-view';

  let snapshot = $state<Snapshot>(),
    data = $state<Summary>(),
    error = $state('');

  let controller: AbortController | undefined;

  const sample = $derived([...(data?.pairs ?? [])].sort((a, b) => b.pop - a.pop).slice(0, 5));
  const cmHref = $derived(
    '/competitive/cm-data' +
      (snapshot ? '?snapshot=' + encodeURIComponent(snapshot.snapshotId) : '')
  );

  async function loadPreview() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    error = '';
    data = undefined;
    try {
      const manifest = await cmGet<Manifest>('/manifest', request.signal);
      const current = manifest.snapshots[0];
      if (!current) throw new Error('No Champions Meeting dataset is available yet.');
      const summary = await loadCmSummary(current.snapshotId, request.signal);
      if (!request.signal.aborted) {
        snapshot = current;
        data = summary;
      }
    } catch (e) {
      if (!request.signal.aborted)
        error = e instanceof Error ? e.message : 'The dataset could not be loaded.';
    }
  }

  onMount(() => {
    void loadPreview();
    return () => controller?.abort();
  });
</script>

<svelte:head>
  <title>Competitive · uma.moe</title>
  <meta
    name="description"
    content="Race replays, Champions Meeting results, and captured team builds in uma.moe."
  />
</svelte:head>
<AppPage
  routeId="competitive"
  title="Competitive"
  description="Review your races. Explore CM results. Find your next team."
  width="wide"
>
  <nav
    class="tools"
    aria-label="Competitive tools"
  >
    <a
      class="tool"
      href="/competitive/race-analysis"
    >
      <span class="tool-icon">
        <Icon
          name="race"
          size={23}
        />
      </span>
      <div>
        <h2>Race Analysis</h2>
        <p>Upload captures to replay races and compare runners, builds, and skill timings.</p>
        <small>
          <Icon
            name="info"
            size={11}
          /> Resimulation sends captures to the simulator
        </small>
      </div>
      <Icon
        name="arrow-right"
        size={18}
      />
    </a>
    <a
      class="tool"
      href="/competitive/cm-data"
    >
      <span class="tool-icon gold">
        <Icon
          name="trophy"
          size={23}
        />
      </span>
      <div>
        <h2>CM Data</h2>
        <p>Compare running styles, Umas, and skills across published Champions Meeting datasets.</p>
        <small>Strategies · Results · Captured builds</small>
      </div>
      <Icon
        name="arrow-right"
        size={18}
      />
    </a>
    <a
      class="tool"
      href="/competitive/cm-data?tab=lobby"
    >
      <span class="tool-icon green">
        <Icon
          name="users"
          size={23}
        />
      </span>
      <div>
        <h2>Lobby Builder</h2>
        <p>Choose three captured teams, adjust builds, and arrange a nine-runner room.</p>
        <small>Teams · Build edits · Gate assignments</small>
      </div>
      <Icon
        name="arrow-right"
        size={18}
      />
    </a>
  </nav>

  <section
    class="meeting"
    aria-labelledby="current-meeting-title"
    aria-busy={!data && !error}
  >
    <div class="meeting-summary">
      <span class="eyebrow">
        <Icon
          name="trophy"
          size={15}
        /> Current Champions Meeting
      </span>
      <h2 id="current-meeting-title">{snapshot?.cmId.toUpperCase() ?? 'Champions Meeting'}</h2>
      <p class="course">{snapshot?.meta.course ?? 'The latest published dataset'}</p>
      {#if snapshot}
        <p class="conditions">{snapshot.meta.conditions}</p>
      {/if}
      {#if data}
        <dl class="dataset-facts">
          <div>
            <dt>Simulated races</dt>
            <dd>{number(data.meta.populationRaces)}</dd>
          </div>
          <div>
            <dt>Evaluated teams</dt>
            <dd>{number(data.meta.evaluatedTeams)}</dd>
          </div>
          <div>
            <dt>Players</dt>
            <dd>{number(data.meta.evaluatedOwners)}</dd>
          </div>
        </dl>
      {/if}
      <div class="meeting-actions">
        <Button
          href={cmHref + (snapshot ? '&' : '?') + 'tab=archetypes'}
          size="sm"
        >
          Browse captured teams
        </Button>
        <a href="/competitive/cm-data">All datasets →</a>
      </div>
    </div>
    <div class="field-preview">
      {#if data}
        <div class="field-title">
          <h3>Most used Umas</h3>
          <a href={cmHref + (snapshot ? '&' : '?') + 'tab=character'}>See all Umas →</a>
        </div>
        <p class="field-key">
          Runner wins: this Uma finishes first. Team wins: any teammate finishes first.
        </p>
        <table>
          <caption class="sr-only">
            Five most used Umas in {snapshot?.cmId.toUpperCase()}, with field share and win rates
          </caption>
          <thead>
            <tr>
              <th scope="col">Uma / running style</th>
              <th
                scope="col"
                class="numeric"
              >
                Field share
              </th>
              <th
                scope="col"
                class="numeric"
              >
                Runner wins
              </th>
              <th
                scope="col"
                class="numeric"
              >
                Team wins
              </th>
            </tr>
          </thead>
          <tbody>
            {#each sample as row}
              <tr>
                <td>
                  <div class="runner">
                    <Artwork
                      src={portrait(row.card)}
                      alt=""
                      size="xs"
                    />
                    <div>
                      <strong>{row.name}</strong>
                      <small>{row.outfit} · {styleNames[row.style]}</small>
                    </div>
                  </div>
                </td>
                <td class="numeric">{pct(row.pop)}</td>
                <td class="numeric">{pct(row.individual)}</td>
                <td class="numeric team-rate">{pct(row.team)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if error}
        <div
          class="preview-state"
          role="alert"
        >
          <Icon
            name="warning"
            size={24}
          />
          <strong>CM preview unavailable</strong>
          <p>{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onclick={() => void loadPreview()}
          >
            Retry
          </Button>
        </div>
      {:else}
        <Spinner
          size={40}
          centered
          label="Loading the latest CM results…"
        />
      {/if}
    </div>
  </section>

  <nav
    class="resources"
    aria-label="Competitive reference"
  >
    <a href="/research">
      <Icon
        name="book"
        size={21}
      />
      <div>
        <h3>Research</h3>
        <p>Race mechanics, experiments, and analysis by Aya.</p>
      </div>
      <Icon
        name="arrow-right"
        size={16}
      />
    </a>
    <a href="/tools/master-data">
      <Icon
        name="database"
        size={21}
      />
      <div>
        <h3>Master Data</h3>
        <p>Search game tables and follow their field references.</p>
      </div>
      <Icon
        name="arrow-right"
        size={16}
      />
    </a>
  </nav>
</AppPage>

<style>
  @import './competitive-page.css';
</style>
