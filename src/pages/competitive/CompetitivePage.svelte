<script lang="ts">
  import { onMount } from 'svelte';
  import FeatureLink from '@/components/cards/FeatureLink.svelte';
  import Button from '@/components/controls/Button.svelte';
  import StatisticsStrip, { type StatisticsItem } from '@/components/data/StatisticsStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import LandingPage from '@/layouts/LandingPage.svelte';
  import { cmGet, number, type Manifest } from './champions-meeting/cm-data';
  import type { Snapshot } from './hakuraku-types';

  const sections = [
    {
      href: '/competitive/race-analysis',
      icon: 'race' as const,
      accent: 'primary',
      title: 'Race Analysis',
      description: 'Replay and compare races'
    },
    {
      href: '/competitive/cm-data',
      icon: 'trophy' as const,
      accent: 'warning',
      title: 'CM Data',
      description: 'Umas and skills per CM'
    },
    {
      href: '/simulator/race',
      icon: 'gauge' as const,
      accent: 'pink',
      title: 'Race Simulator',
      description: 'Race any team or build'
    },
    {
      href: '/research',
      icon: 'book' as const,
      accent: 'purple',
      title: 'Research',
      description: 'Race mechanics by Aya'
    }
  ];

  let snapshot = $state<Snapshot>();
  let error = $state('');

  let controller: AbortController | undefined;

  const meetingFacts = $derived<StatisticsItem[]>([
    {
      icon: 'trophy',
      label: snapshot ? courseName(snapshot) : 'Current Champions Meeting',
      value: snapshot?.cmId.toUpperCase() ?? '…',
      href: snapshot
        ? '/competitive/cm-data?snapshot=' + encodeURIComponent(snapshot.snapshotId)
        : undefined
    },
    {
      icon: 'race',
      label: 'Simulated races',
      value: snapshot ? number(snapshot.meta.populationRaces) : '…'
    },
    {
      icon: 'users',
      label: 'Evaluated teams',
      value: snapshot ? number(snapshot.meta.evaluatedTeams) : '…'
    },
    {
      icon: 'user',
      label: 'Players',
      value: snapshot ? number(snapshot.meta.populationOwners) : '…'
    }
  ]);

  /** Published course names repeat the meeting ID, which the strip already shows. */
  function courseName(meeting: Snapshot): string {
    const parts = meeting.meta.course.split(/\s+[-–·]\s+/);
    const repeatsId = parts[0]?.toLowerCase() === meeting.cmId.toLowerCase();

    return (repeatsId ? parts.slice(1) : parts).join(' · ');
  }

  async function loadCurrentMeeting() {
    controller?.abort();

    const request = new AbortController();
    controller = request;
    error = '';

    try {
      const manifest = await cmGet<Manifest>('/manifest', request.signal);
      const current = manifest.snapshots[0];

      if (!current) {
        throw new Error('No Champions Meeting dataset is available yet.');
      }

      if (!request.signal.aborted) {
        snapshot = current;
      }
    } catch (reason) {
      if (!request.signal.aborted) {
        error = reason instanceof Error ? reason.message : 'The dataset could not be loaded.';
      }
    }
  }

  onMount(() => {
    void loadCurrentMeeting();

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
{#snippet unavailable()}
  <span
    class="meeting-error"
    role="alert"
  >
    <Icon
      name="warning"
      size={16}
    />
    Current Champions Meeting figures are unavailable. {error}
  </span>
  <Button
    variant="secondary"
    size="sm"
    icon="refresh"
    onclick={() => void loadCurrentMeeting()}
  >
    Retry
  </Button>
{/snippet}
<LandingPage
  routeId="competitive"
  title="Competitive"
  description="Review your races, explore CM results and find your next team."
>
  {#snippet statistics()}
    <StatisticsStrip
      label="Current Champions Meeting"
      items={meetingFacts}
      busy={!snapshot && !error}
      status={error ? unavailable : undefined}
    />
  {/snippet}
  {#each sections as section}
    <FeatureLink {...section} />
  {/each}
</LandingPage>

<style>
  .meeting-error {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .meeting-error :global(svg) {
    flex: none;
    color: var(--accent-warning);
  }
</style>
