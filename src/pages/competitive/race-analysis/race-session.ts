import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { trackDetailName } from '@/lib/race/replay/race-display';
import { portrait } from '@/pages/competitive/analysis-view';
import type { CourseData } from './replay/replay-course';

export function raceChoices(captures: ParsedRaceCapture[]) {
  return captures.map((capture, index) => {
    const winner = capture.runners.find((r) => r.result?.finishOrder === 1);
    return {
      value: String(index),
      label: `${index + 1}. ${capture.fileName}`,
      image: portrait(winner?.cardId),
      description: [
        capture.raceDistance ? `${capture.raceDistance} m` : undefined,
        winner ? 'Winner: ' + winner.name : undefined
      ]
        .filter(Boolean)
        .join(', ')
    };
  });
}

export function groupLabel(capture: ParsedRaceCapture, courses: CourseData | undefined) {
  const course = courses?.courses[capture.courseId ?? ''];
  return [
    course ? courses?.names[course.raceTrackId] : 'Unknown course',
    `${capture.raceDistance ?? '?'} m`,
    trackDetailName('condition', capture.track.condition),
    trackDetailName('weather', capture.track.weather),
    trackDetailName('season', capture.track.season)
  ].join(', ');
}

export function downloadDetailedReplay(capture: ParsedRaceCapture) {
  const url = URL.createObjectURL(
    new Blob(
      [
        JSON.stringify({
          capture: capture.original,
          resimulation: capture.detailed,
          courseId: capture.courseId
        })
      ],
      { type: 'application/json' }
    )
  );

  const link = document.createElement('a');
  link.href = url;
  link.download = 'detailed-' + capture.fileName.replace(/\.gz$/, '');
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
