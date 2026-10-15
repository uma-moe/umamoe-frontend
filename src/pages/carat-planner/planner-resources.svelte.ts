import type { PlannerDataBundle, PlannerGachaEvent } from '@/lib/carat-planner/carat-planner';
import { plannerResourceRepository } from './planner-resource-repository';

export class PlannerResources {
  // Resource loads replace the snapshot; individual entries are never edited.
  bundle = $state.raw<PlannerDataBundle>({
    core: {},
    income: { rules: [] },
    rewards: { rewards: [] }
  });
  loading = $state(false);
  gachasLoading = $state(false);
  error = $state('');
  ready = $state(false);
  version = $state(0);

  #gachaRequestKey = '';
  #resourceRequest = 0;
  #gachaRequest = 0;
  #destroyed = false;
  #refreshGachas = false;
  #targetEvents: () => readonly PlannerGachaEvent[];
  #targetKey: () => string;

  constructor(targetEvents: () => readonly PlannerGachaEvent[], targetKey: () => string) {
    this.#targetEvents = targetEvents;
    this.#targetKey = targetKey;
  }

  needsGachas(key: string): boolean {
    return key !== this.#gachaRequestKey;
  }

  async loadTargetGachas(key: string): Promise<void> {
    this.#gachaRequestKey = key;
    const request = ++this.#gachaRequest;
    this.error = '';
    this.gachasLoading = true;
    this.bundle = { ...this.bundle, gachas: [] };
    try {
      const gachas = await plannerResourceRepository.gachasFor(
        this.#targetEvents(),
        this.bundle.core,
        this.#refreshGachas
      );
      if (!this.#destroyed && request === this.#gachaRequest && key === this.#targetKey()) {
        this.#refreshGachas = false;
        this.bundle = { ...this.bundle, gachas };
      }
    } catch (reason) {
      if (!this.#destroyed && request === this.#gachaRequest && key === this.#targetKey())
        this.error = reason instanceof Error ? reason.message : 'Banner rates could not be loaded.';
    } finally {
      if (!this.#destroyed && request === this.#gachaRequest) this.gachasLoading = false;
    }
  }

  async load(refresh = false): Promise<void> {
    const request = ++this.#resourceRequest;
    this.#gachaRequest++;
    this.ready = false;
    this.loading = true;
    this.gachasLoading = false;
    this.error = '';
    try {
      const initial = await plannerResourceRepository.initial(refresh);
      if (this.#destroyed || request !== this.#resourceRequest) return;
      this.bundle = initial;
      this.#refreshGachas = refresh;
      this.version++;
      this.ready = true;
    } catch (reason) {
      if (!this.#destroyed && request === this.#resourceRequest)
        this.error =
          reason instanceof Error ? reason.message : 'Planner resources could not be loaded.';
    } finally {
      if (!this.#destroyed && request === this.#resourceRequest) this.loading = false;
    }
  }

  watchRewards(): () => void {
    return plannerResourceRepository.watchRewards((rewards) => {
      this.bundle = { ...this.bundle, rewards };
    });
  }

  destroy(): void {
    this.#destroyed = true;
  }
}
