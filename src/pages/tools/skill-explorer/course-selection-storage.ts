/** The course the explorer last showed and the meeting that picked it, kept in this browser. */
const STORAGE_KEY = 'uma.skill-explorer.course';

export interface SavedCourseSelection {
  courseId: string;
  /** Empty when the course was picked on its own. */
  meetingNumber: string;
}

function isSelection(value: unknown): value is SavedCourseSelection {
  if (value === null || typeof value !== 'object') return false;

  const { courseId, meetingNumber } = value as Record<string, unknown>;
  return typeof courseId === 'string' && typeof meetingNumber === 'string';
}

/** Nothing kept, or nothing we can read, means every course. */
export function restoreCourseSelection(): SavedCourseSelection | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return isSelection(saved) ? saved : undefined;
  } catch {
    // Storage can be disabled or hold something else; start on every course then.
    return undefined;
  }
}

/** Call it from an effect, so every change is kept. */
export function saveCourseSelection(selection: SavedCourseSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Storage can be full or disabled; the pick still holds for this visit.
  }
}
