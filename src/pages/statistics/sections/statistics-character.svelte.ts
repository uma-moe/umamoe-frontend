import {
  statisticsRepository,
  type CharacterStatistics,
  type StatisticsDataset
} from '../statistics-repository';

export class StatisticsCharacterAnalysis {
  id = $state('');
  stats = $state.raw<CharacterStatistics>();
  loading = $state(false);
  error = $state('');

  #request = 0;

  async select(dataset: StatisticsDataset | undefined, id: string): Promise<void> {
    if (!dataset) return;
    const request = ++this.#request;
    const selectedDataset = dataset;
    this.id = id;
    this.loading = true;
    this.error = '';
    this.stats = undefined;
    try {
      const result = await statisticsRepository.character(selectedDataset, id);
      if (request === this.#request) this.stats = result;
    } catch (reason) {
      if (request === this.#request)
        this.error =
          reason instanceof Error ? reason.message : 'Character statistics could not be loaded.';
    } finally {
      if (request === this.#request) this.loading = false;
    }
  }

  reset(): void {
    this.#request += 1;
    this.id = '';
    this.stats = undefined;
    this.error = '';
    this.loading = false;
  }
}
