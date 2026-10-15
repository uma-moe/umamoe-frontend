<script lang="ts">
  import { onMount } from 'svelte';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { describeCourse, trackName } from '@/lib/catalog/course-catalog';
  import {
    loadReplayCourses,
    courseSegments,
    type CourseData
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import { courseTerrain } from '@/pages/competitive/race-analysis/replay/replay-timeline';
  import SimulatorCoursePreview from './SimulatorCoursePreview.svelte';

  let {
    course,
    showOutline = true,
    showHeader = true,
    compact = false
  }: {
    course?: CourseCatalogEntry;
    showOutline?: boolean;
    showHeader?: boolean;
    compact?: boolean;
  } = $props();

  let data = $state.raw<CourseData>(),
    error = $state(''),
    inspected = $state('');

  const profile = $derived(course && data?.courses[course.course_id]);
  const sections = $derived(
    profile
      ? courseSegments(profile, true).map((segment) => {
          const corner = segment.label.toLowerCase().includes('corner')
            ? profile.corners.findIndex(
                (corner) =>
                  segment.start >= corner.start && segment.start < corner.start + corner.length
              ) + 1
            : 0;
          return {
            ...segment,
            label: segment.label === 'Corner' ? 'Corner ' + corner : segment.label,
            short: corner
              ? 'C' + corner
              : segment.label === 'Final straight'
                ? 'Finish str.'
                : segment.label === 'Straight'
                  ? 'Straight →'
                  : '—'
          };
        })
      : []
  );
  const bands = $derived(
    profile
      ? [
          {
            id: 'slopes',
            label: 'Slopes',
            segments: courseTerrain(profile).slopes.map((slope) => ({
              start: slope.start,
              end: slope.end,
              label: slope.slope
                ? (slope.slope > 0 ? '↗ +' : '↘ ') + (slope.slope / 10000).toFixed(1) + '%'
                : 'Flat',
              color: slope.slope > 0 ? '#bd7581' : slope.slope < 0 ? '#719bdd' : '#737d8a'
            }))
          },
          { id: 'sections', label: 'Sections', segments: sections },
          {
            id: 'phase',
            label: 'Race phase',
            segments: [
              {
                start: 0,
                end: profile.distance / 6,
                label: 'Early',
                color: 'var(--accent-secondary)'
              },
              {
                start: profile.distance / 6,
                end: (profile.distance * 2) / 3,
                label: 'Mid race',
                color: 'var(--accent-primary)'
              },
              {
                start: (profile.distance * 2) / 3,
                end: profile.distance,
                label: 'Late race',
                color: 'var(--accent-purple)'
              }
            ]
          },
          {
            id: 'race-sections',
            label: '24 sections',
            segments: Array.from({ length: 24 }, (_, index) => ({
              start: (profile.distance * index) / 24,
              end: (profile.distance * (index + 1)) / 24,
              label: 'Section ' + (index + 1),
              short: String(index + 1),
              color: '#737d8a'
            }))
          }
        ]
      : []
  );
  const selected = $derived(
    bands
      .flatMap((band) =>
        band.segments.map((segment, index) => ({
          ...segment,
          id: band.id + '-' + index,
          band: band.label
        }))
      )
      .find((segment) => segment.id === inspected)
  );

  $effect(() => {
    course?.course_id;
    inspected = '';
  });

  onMount(() => {
    let active = true;
    void loadReplayCourses()
      .then((value) => {
        if (active) data = value;
      })
      .catch((reason) => {
        if (active) error = (reason as Error).message;
      });
    return () => {
      active = false;
    };
  });

  const range = (start: number, end: number) =>
    Math.round(start).toLocaleString() + '–' + Math.round(end).toLocaleString() + ' m';
</script>

<section
  class="profile"
  class:compact
  class:without-outline={!showOutline}
  aria-label="Course profile"
>
  {#if showHeader}
    <header>
      <div class="course-heading">
        <h2>{course ? trackName(course.race_track_id) : 'Course profile'}</h2>
        <span>{course ? describeCourse(course) : 'Select a course to see its layout'}</span>
      </div>
      {#if compact}
        <span class="preview-label">Course overview</span>
      {/if}
    </header>
  {/if}
  <div class="profile-body">
    <div class="distance-profile">
      <div class="breakdown-heading">
        <h3>Course breakdown</h3>
        {#if profile}
          <div class="course-distances">
            <span title="The final third begins here; last spurt can begin from this distance.">
              Spurt from {Math.round((profile.distance * 2) / 3).toLocaleString()} m
            </span>
            <span>{profile.distance.toLocaleString()} m</span>
          </div>
        {/if}
      </div>
      {#if profile}
        <div
          class="timeline"
          role="region"
          aria-label="Course timeline"
        >
          <div class="bands">
            {#each bands as band}
              <div
                class="profile-row"
                data-band={band.id}
              >
                <span class="row-label">{band.label}</span>
                <div class="band">
                  {#each band.segments as segment, index}
                    {@const id = band.id + '-' + index}
                    <button
                      class="segment"
                      class:unspecified={segment.label === 'Unspecified'}
                      class:flat={segment.label === 'Flat'}
                      class:selected={inspected === id}
                      style:left={(segment.start / profile.distance) * 100 + '%'}
                      style:width={((segment.end - segment.start) / profile.distance) * 100 + '%'}
                      style:--segment-color={segment.color}
                      aria-label={band.label +
                        ': ' +
                        segment.label +
                        ', ' +
                        range(segment.start, segment.end)}
                      title={segment.label + ': ' + range(segment.start, segment.end)}
                      aria-pressed={inspected === id}
                      onclick={() => (inspected = id)}
                      onfocus={() => (inspected = id)}
                      onpointermove={() => (inspected = id)}
                    >
                      <span class="segment-name">
                        {segment.label}{#if segment.label === 'Straight'}
                          →
                        {/if}
                      </span>
                      {#if 'short' in segment}
                        <span
                          class="segment-short"
                          aria-hidden="true"
                        >
                          {segment.short}
                        </span>
                      {/if}
                      {#if band.id !== 'slopes' && band.id !== 'race-sections' && segment.start > 0}
                        <span
                          class="segment-distance"
                          aria-hidden="true"
                        >
                          {Math.round(segment.start).toLocaleString()} m
                        </span>
                      {/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
            <div class="axis">
              {#each [0, 1, 2, 3, 4] as tick}
                <span style:left={tick * 25 + '%'}>
                  {Math.round((profile.distance * tick) / 4).toLocaleString()} m
                </span>
              {/each}
            </div>
          </div>
        </div>
        <p
          class="section-detail"
          aria-live="polite"
        >
          {#if selected}
            <i style:background={selected.color}></i>
            <strong>{selected.label}</strong>
            <span>
              {range(selected.start, selected.end)} · {Math.round(
                selected.end - selected.start
              ).toLocaleString()} m
            </span>
          {:else}
            Hover a section to highlight it on the track.
          {/if}
        </p>
      {:else}
        <div
          class="profile-empty"
          role="status"
        >
          {error ||
            (data && course
              ? 'Course profile unavailable'
              : course
                ? 'Loading course profile…'
                : 'Choose a track and course above.')}
        </div>
      {/if}
    </div>
    {#if showOutline}
      <div class="outline">
        <SimulatorCoursePreview
          {course}
          interactive
          highlight={selected}
        />
      </div>
    {/if}
  </div>
</section>

<style>
  @import './simulator-course-profile.css';
</style>
