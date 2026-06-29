import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, map } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

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

  // Set to true to enable the Christmas theme (e.g. during December)
  private readonly CHRISTMAS_THEME_ENABLED = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.initTheme();
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
    } catch (error) {
      console.warn('Failed to save color mode:', error);
    }
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
    } catch (error) {
      console.warn('Failed to read color mode:', error);
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
    // Hard override: if Christmas theme is disabled, force it off
    if (!this.CHRISTMAS_THEME_ENABLED) {
      this.setChristmasTheme(false);
      return;
    }
    // Check environment flag first
    const envChristmas = (environment as any).christmasTheme;
    
    // Check local storage preference
    const stored = localStorage.getItem('christmas-theme');
    
    let shouldEnable = false;
    if (stored !== null) {
      shouldEnable = stored === 'true';
    } else {
      // Default to environment setting if no user preference
      shouldEnable = !!envChristmas;
    }
    this.setChristmasTheme(shouldEnable);
  }
  toggleChristmasTheme() {
    this.setChristmasTheme(!this.isChristmasSubject.value);
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
