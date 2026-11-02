import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreCourseSelection, saveCourseSelection } from './course-selection-storage';

const KEY = 'uma.skill-explorer.course';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('the course the explorer last showed', () => {
  it('opens on the same course and meeting after a reload', () => {
    saveCourseSelection({ courseId: '10808', meetingNumber: '21' });

    expect(restoreCourseSelection()).toEqual({ courseId: '10808', meetingNumber: '21' });
  });

  it('opens on every course when nothing was picked yet', () => {
    expect(restoreCourseSelection()).toBeUndefined();
  });

  it('ignores a stored value that is not a pick', () => {
    storage.setItem(KEY, JSON.stringify({ courseId: 10808, meetingNumber: null }));

    expect(restoreCourseSelection()).toBeUndefined();
  });

  it('opens on every course when storage cannot be read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled');
      }
    });

    expect(restoreCourseSelection()).toBeUndefined();
  });
});
