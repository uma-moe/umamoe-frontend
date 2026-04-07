import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MilestoneService {
  private readonly STORAGE_KEY = 'milestone_1m_popup_shown';
  private readonly EXPIRY_DATE = new Date('2026-04-14T23:59:59Z');

  shouldShowPopup(): boolean {
    if (new Date() > this.EXPIRY_DATE) {
      return false;
    }
    return !localStorage.getItem(this.STORAGE_KEY);
  }

  markPopupAsShown(): void {
    localStorage.setItem(this.STORAGE_KEY, 'true');
  }
}
