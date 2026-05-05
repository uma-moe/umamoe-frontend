import { Injectable } from '@angular/core';
import { InheritanceRecord } from '../models/inheritance.model';
import { VeteranMember } from '../models/profile.model';

export interface PlannerTransferData {
  record: InheritanceRecord;
  targetCharaId?: number | null;
  veteran?: VeteranMember | null;
}

@Injectable({ providedIn: 'root' })
export class PlannerTransferService {
  private static readonly KEY = 'planner_transfer';

  set(data: PlannerTransferData): void {
    try {
      localStorage.setItem(PlannerTransferService.KEY, JSON.stringify(data));
    } catch {}
  }

  take(): PlannerTransferData | null {
    try {
      const raw = localStorage.getItem(PlannerTransferService.KEY);
      localStorage.removeItem(PlannerTransferService.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
