import type { ScreenshotReader } from './screenshot-reader';
import { mergeReadings, type ScreenshotReading } from './screenshot-veteran';
import type { SkillNameIndex } from './skill-names';

export type ScreenshotState =
  | { status: 'waiting' }
  | { status: 'reading' }
  | { status: 'read'; reading: ScreenshotReading }
  | { status: 'failed'; error: string };

export interface QueuedScreenshot {
  id: number;
  file: File;
  /** An object URL for the thumbnail, revoked when the screenshot is removed. */
  url: string;
  state: ScreenshotState;
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'This screenshot couldn’t be read.';
}

/** The screenshots added for one runner, read one after another on a single reader and merged. */
export class ScreenshotQueue {
  screenshots = $state.raw<QueuedScreenshot[]>([]);

  readonly reading = $derived.by((): ScreenshotReading | undefined => {
    const readings = this.screenshots.flatMap((screenshot) =>
      screenshot.state.status === 'read' ? [screenshot.state.reading] : []
    );
    return readings.length ? mergeReadings(readings) : undefined;
  });

  readonly waiting = $derived(
    this.screenshots.some((screenshot) => screenshot.state.status === 'waiting')
  );

  /** The one being read and how far through the queue it is, while reading. */
  readonly progress = $derived.by(() => {
    const unfinished = this.screenshots.filter(
      ({ state }) => state.status === 'waiting' || state.status === 'reading'
    );
    if (!unfinished.length) return undefined;

    const done = this.screenshots.length - unfinished.length;
    return { current: done + 1, total: this.screenshots.length };
  });

  #reader: ScreenshotReader | undefined;
  #nextId = 0;
  /** Bumped when reading stops, so a loop from before stops too and its result is dropped. */
  #run = 0;
  #activeRun: number | undefined;

  add(files: File[]) {
    this.screenshots = [
      ...this.screenshots,
      ...files.map((file) => ({
        id: this.#nextId++,
        file,
        url: URL.createObjectURL(file),
        state: { status: 'waiting' } as const
      }))
    ];
  }

  remove(id: number) {
    const screenshot = this.screenshots.find((entry) => entry.id === id);
    if (!screenshot) return;

    URL.revokeObjectURL(screenshot.url);
    this.screenshots = this.screenshots.filter((entry) => entry.id !== id);
  }

  clear() {
    for (const screenshot of this.screenshots) URL.revokeObjectURL(screenshot.url);
    this.screenshots = [];
    this.#run++;
  }

  /** Reads every waiting screenshot in the order they were added. */
  async read(skillNames: SkillNameIndex) {
    const run = this.#run;
    if (this.#activeRun === run) return;

    this.#activeRun = run;
    try {
      for (;;) {
        const next = this.screenshots.find((entry) => entry.state.status === 'waiting');
        if (!next || run !== this.#run) return;

        this.#setState(next.id, { status: 'reading' });
        let state: ScreenshotState;
        try {
          this.#reader ??= new (await import('./screenshot-reader')).ScreenshotReader();
          state = { status: 'read', reading: await this.#reader.read(next.file, skillNames) };
        } catch (reason) {
          state = { status: 'failed', error: errorText(reason) };
        }

        // Stopped mid-read: the screenshot waits to be read again when reading resumes.
        this.#setState(next.id, run === this.#run ? state : { status: 'waiting' });
      }
    } finally {
      if (this.#activeRun === run) this.#activeRun = undefined;
    }
  }

  /** Stops reading and frees the reader; unfinished screenshots wait for the next `read`. */
  async stop() {
    this.#run++;
    this.screenshots = this.screenshots.map((entry) =>
      entry.state.status === 'reading' ? { ...entry, state: { status: 'waiting' } } : entry
    );

    const reader = this.#reader;
    this.#reader = undefined;
    await reader?.stop();
  }

  #setState(id: number, state: ScreenshotState) {
    this.screenshots = this.screenshots.map((entry) =>
      entry.id === id ? { ...entry, state } : entry
    );
  }
}
