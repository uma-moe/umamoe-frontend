import { Injectable, NgZone } from '@angular/core';

/**
 * Shares one IntersectionObserver across inheritance result rows.
 *
 * A database page can keep dozens of entries alive in infinite-scroll mode.
 * Giving every entry its own native observer adds avoidable browser bookkeeping
 * and retains a callback/observer pair per row. This registry keeps that cost
 * constant while still allowing each row to unregister independently.
 */
@Injectable({ providedIn: 'root' })
export class SharedVisibilityObserverService {
  private observer: IntersectionObserver | null = null;
  private readonly callbacks = new Map<Element, () => void>();

  constructor(private readonly ngZone: NgZone) {}

  observeOnce(element: Element, callback: () => void): () => void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      callback();
      return () => undefined;
    }

    this.callbacks.set(element, callback);
    this.getObserver().observe(element);

    return () => {
      this.callbacks.delete(element);
      this.observer?.unobserve(element);
      this.releaseObserverWhenIdle();
    };
  }

  private getObserver(): IntersectionObserver {
    if (this.observer) return this.observer;

    this.ngZone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callback = this.callbacks.get(entry.target);
          if (!callback) continue;

          this.callbacks.delete(entry.target);
          this.observer?.unobserve(entry.target);
          callback();
        }
        this.releaseObserverWhenIdle();
      }, { threshold: [0, 0.25] });
    });

    return this.observer!;
  }

  private releaseObserverWhenIdle(): void {
    if (this.callbacks.size || !this.observer) return;
    this.observer.disconnect();
    this.observer = null;
  }
}
