import { cmGet, snapshotPath } from '../cm-data';
import type { SkillDetail } from '../cm-exploration';
import { validateSkillDetail } from './cm-skill-analysis';

/** One cache and request lifetime for the list, inspector and comparison. */
export class CmSkillDetails {
  // Bucket arrays are immutable responses; deep proxies make timing calculations expensive.
  values = $state.raw<Record<number, SkillDetail>>({});
  errors = $state<Record<number, string>>({});
  private controller = new AbortController();
  private pending = new Map<number, Promise<void>>();
  private snapshotId = '';
  private distance = 0;
  private queue: number[] = [];
  private prefetching = 0;

  reset(snapshotId: string, distance: number) {
    this.controller.abort();
    this.controller = new AbortController();
    this.pending.clear();
    this.queue = [];
    this.prefetching = 0;
    this.values = {};
    this.errors = {};
    this.snapshotId = snapshotId;
    this.distance = distance;
  }

  load(id: number): Promise<void> {
    if (this.values[id]) return Promise.resolve();
    const existing = this.pending.get(id);
    if (existing) return existing;

    const snapshotId = this.snapshotId;
    const distance = this.distance;
    const signal = this.controller.signal;
    delete this.errors[id];

    const request = cmGet<SkillDetail>(
      snapshotPath(snapshotId, 'skills/details/' + id),
      signal,
      snapshotId
    )
      .then((detail) => {
        if (signal.aborted) return;
        if (
          detail.skillId !== id ||
          detail.bucketCount !== 100 ||
          detail.courseDistance !== distance
        ) {
          throw new Error('The activation data does not match this skill or course.');
        }

        validateSkillDetail(detail);
        this.values = { ...this.values, [id]: detail };
      })
      .catch((reason: unknown) => {
        if (!signal.aborted)
          this.errors[id] =
            reason instanceof Error ? reason.message : 'Could not load skill details.';
      })
      .finally(() => {
        if (!signal.aborted) this.pending.delete(id);
      });

    this.pending.set(id, request);
    return request;
  }

  /** Replace offscreen queued work; opening a skill still loads it immediately. */
  prefetch(ids: number[]) {
    this.queue = ids.filter((id) => !this.values[id] && !this.errors[id] && !this.pending.has(id));
    this.prefetchNext();
  }

  private prefetchNext() {
    const signal = this.controller.signal;
    // Fill a browser's usual six connection slots instead of serializing visible rows in pairs.
    while (!signal.aborted && this.prefetching < 6 && this.queue.length) {
      const id = this.queue.shift();
      if (id === undefined) return;

      this.prefetching++;
      void this.load(id).finally(() => {
        if (signal.aborted) return;

        this.prefetching--;
        this.prefetchNext();
      });
    }
  }

  destroy() {
    this.controller.abort();
    this.queue = [];
  }
}
