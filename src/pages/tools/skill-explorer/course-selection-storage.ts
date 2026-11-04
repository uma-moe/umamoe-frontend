const STORAGE_KEY = 'uma.skill-explorer.course';

export interface SavedCourseSelection {
  courseId: string;
  meetingNumber: string;
}

function isSelection(value: unknown): value is SavedCourseSelection {
  if (value === null || typeof value !== 'object') return false;

  const { courseId, meetingNumber } = value as Record<string, unknown>;
  return typeof courseId === 'string' && typeof meetingNumber === 'string';
}

export function restoreCourseSelection(): SavedCourseSelection | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return isSelection(saved) ? saved : undefined;
  } catch {
    return undefined;
  }
}

export function saveCourseSelection(selection: SavedCourseSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {}
}
