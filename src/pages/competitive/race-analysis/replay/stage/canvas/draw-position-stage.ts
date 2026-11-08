import type { CourseScene, StageGeometry } from '../position-scene';
import type { MinimapScene } from '../minimap-scene';
import type { StageMarker } from '../stage-markers';
import type { Paint2D } from './canvas-paint';
import { drawCourse } from './draw-course';
import { drawMarkers, type MarkerFocus } from './draw-markers';
import { drawMinimap } from './draw-minimap';
import type { StageImages } from './stage-images';
import type { StagePalette } from './stage-palette';

/** Everything the race positions stage shows at one moment, in stage pixels. */
export interface PositionFrame {
  geometry: StageGeometry;
  course: CourseScene;
  markers: StageMarker[];
  minimap?: MinimapScene;
  /** Phone widths draw the hovered runner's name smaller. */
  compactMarkers: boolean;
}

export function drawPositionStage(
  context: Paint2D,
  frame: PositionFrame,
  focus: MarkerFocus,
  { palette, images }: { palette: StagePalette; images: StageImages }
) {
  drawCourse(context, frame.course, frame.geometry, palette);
  drawMarkers(context, frame.markers, focus, {
    palette,
    images,
    compact: frame.compactMarkers
  });
  if (frame.minimap) drawMinimap(context, frame.minimap, palette);
}
