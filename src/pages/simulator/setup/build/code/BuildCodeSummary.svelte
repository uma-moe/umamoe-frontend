<script lang="ts">
  import { describeCourse, trackName } from '@/lib/game-data/racing/courses';
  import type { BuildCodeReview } from './build-code-review.svelte';

  let { review }: { review: BuildCodeReview } = $props();

  const headline = $derived.by(() => {
    if (review.page) return 'This whole tab';

    const count = review.runners.length;
    return count === 1 ? '1 runner' : count + ' runners';
  });
</script>

<strong>{headline}</strong>
<span>
  {review.course
    ? trackName(review.course.race_track_id) + ' ' + describeCourse(review.course)
    : 'Course unchanged'}
</span>
