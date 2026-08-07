import { Injectable } from '@angular/core';
@Injectable({
  providedIn: 'root'
})
export class DomainMigrationService {
  private readonly STORAGE_KEY = 'domain_migration_popup_shown';
  constructor() {}
  shouldShowPopup(): boolean {
    const hasShown = localStorage.getItem(this.STORAGE_KEY);
    return hasShown !== 'true';
  }
  markPopupAsShown(): void {
    localStorage.setItem(this.STORAGE_KEY, 'true');
  }
  // Optional: Reset for testing purposes
  resetPopup(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
