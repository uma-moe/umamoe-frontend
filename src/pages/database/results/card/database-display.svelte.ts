import type { SparkOrder } from '@/lib/inheritance/inheritance-factors';
import {
  DATABASE_HIDDEN_SPARKS_KEY,
  DATABASE_SPARK_ORDER_KEY,
  readHiddenSparkFactorIds,
  sparkOrderValue
} from '../../database-preferences';

/** Result-card display preferences, plus the card toggles shared by every result. */
export class DatabaseDisplay {
  defaultFocus = $state<'all' | 'main' | 'left' | 'right'>('all');
  splitSparks = $state(false);
  sparkPortraits = $state(false);
  sparkOrder = $state<SparkOrder>('main');
  hiddenSparksOpen = $state(false);
  hiddenSparkFactorIds = $state<number[]>([]);

  sparkPerRun = $state(false);
  showOccurrences = $state(false);
  showP2Sparks = $state(false);
  collapsedWhiteSections = $state<number[]>([]);

  restore(): void {
    try {
      this.sparkOrder = sparkOrderValue(localStorage.getItem(DATABASE_SPARK_ORDER_KEY));
    } catch {
      this.sparkOrder = 'main';
    }
    this.hiddenSparkFactorIds = readHiddenSparkFactorIds(localStorage);
  }

  saveHiddenSparks = (factorIds: number[]): void => {
    localStorage.setItem(DATABASE_HIDDEN_SPARKS_KEY, JSON.stringify(factorIds));
    this.hiddenSparkFactorIds = factorIds;
  };

  changeSparkOrder = (value: string): void => {
    this.sparkOrder = sparkOrderValue(value);
    try {
      localStorage.setItem(DATABASE_SPARK_ORDER_KEY, this.sparkOrder);
    } catch {
      /* Keep the selection for this session when storage is unavailable. */
    }
  };
}
