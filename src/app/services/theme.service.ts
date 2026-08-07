import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export type ColorMode = 'dark' | 'light';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly COLOR_MODE_STORAGE_KEY = 'uma-color-mode';
  private isChristmasSubject = new BehaviorSubject<boolean>(false);
  private colorModeSubject = new BehaviorSubject<ColorMode>('dark');

  isChristmas$ = this.isChristmasSubject.asObservable();
  colorMode$ = this.colorModeSubject.asObservable();
  isLightMode$ = this.colorModeSubject.asObservable().pipe(
    map(mode => mode === 'light')
  );

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.initTheme();
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('umamoe:christmas-theme', (event: Event) => {
        const enabled = (event as CustomEvent<boolean>).detail;
        this.setChristmasTheme(Boolean(enabled));
      });
    }
  }

  private initTheme() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.initColorMode();
    this.initChristmasTheme();
  }

  toggleColorMode() {
    this.setColorMode(this.colorModeSubject.value === 'light' ? 'dark' : 'light');
  }

  setColorMode(mode: ColorMode) {
    this.colorModeSubject.next(mode);

    if (!isPlatformBrowser(this.platformId)) return;

    this.applyColorMode(mode);

    try {
      localStorage.setItem(this.COLOR_MODE_STORAGE_KEY, mode);
    } catch {}
  }

  private initColorMode() {
    const storedMode = this.readStoredColorMode();
    this.colorModeSubject.next(storedMode);
    this.applyColorMode(storedMode);
  }

  private readStoredColorMode(): ColorMode {
    try {
      const stored = localStorage.getItem(this.COLOR_MODE_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'dark';
    } catch {
      return 'dark';
    }
  }

  private applyColorMode(mode: ColorMode) {
    const light = mode === 'light';
    document.documentElement.classList.toggle('light-theme', light);
    document.documentElement.classList.toggle('dark-theme', !light);
    document.body.classList.toggle('light-theme', light);
    document.body.classList.toggle('dark-theme', !light);
    document.documentElement.style.colorScheme = mode;
    document.body.style.colorScheme = mode;
  }

  private initChristmasTheme() {
    this.setChristmasTheme(false);
  }
  setChristmasTheme(enable: boolean) {
    this.isChristmasSubject.next(enable);
    
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('christmas-theme', String(enable));
      
      if (enable) {
        document.body.classList.add('christmas-theme');
      } else {
        document.body.classList.remove('christmas-theme');
      }
    }
  }
}
