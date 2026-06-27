import { Injectable } from '@angular/core';

export const LINEAGE_PLANNER_VETERAN_PICKER_SCOPE = 'lineage-planner';

export type VeteranPickerTabId = 'veterans' | 'bookmarks' | 'saved' | 'manual';
export type VeteranPickerSortKey = 'total' | 'blue' | 'pink' | 'green' | 'name' | 'affinity';
export type VeteranPickerSparkColor = 'blue' | 'pink' | 'green';
export type VeteranPickerFactorColor = 'blue' | 'pink' | 'green' | 'white';
export type VeteranPickerSparkScope = 'any' | 'own' | 'p1' | 'p2';

export interface VeteranPickerFactorFilterState {
  factorId: string;
  name: string;
  color: VeteranPickerFactorColor;
  scope: VeteranPickerSparkScope;
  minLevel: number;
}

export interface VeteranPickerSessionState {
  tab: VeteranPickerTabId;
  selectedAccountId: string | null;
  sortKey: VeteranPickerSortKey;
  sortKeyExplicit: boolean;
  searchQuery: string;
  sparkFilters: VeteranPickerSparkColor[];
  factorFilters: VeteranPickerFactorFilterState[];
}

@Injectable({ providedIn: 'root' })
export class VeteranPickerSessionStateService {
  private readonly states = new Map<string, VeteranPickerSessionState>();

  get(scope: string | null | undefined): VeteranPickerSessionState | null {
    if (!scope) return null;
    const state = this.states.get(scope);
    return state ? this.clone(state) : null;
  }

  set(scope: string | null | undefined, state: VeteranPickerSessionState): void {
    if (!scope) return;
    this.states.set(scope, this.clone(state));
  }

  clear(scope: string | null | undefined): void {
    if (!scope) return;
    this.states.delete(scope);
  }

  private clone(state: VeteranPickerSessionState): VeteranPickerSessionState {
    return {
      ...state,
      sparkFilters: [...state.sparkFilters],
      factorFilters: state.factorFilters.map(filter => ({ ...filter })),
    };
  }
}
