import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, NgZone, PLATFORM_ID } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { VersionUpdateSnackbarComponent } from '../components/version-update-snackbar/version-update-snackbar.component';

interface AppVersionManifest {
  version?: string;
  commit?: string;
  environment?: string;
  builtAt?: string;
}

@Injectable({ providedIn: 'root' })
export class AppVersionService {
  private readonly versionUrl = '/version.json';
  private readonly reloadVersionParam = '__uma_version';
  private readonly minimumCheckIntervalMs = 60000;
  private readonly currentVersion = this.readCurrentVersion();
  private lastCheckedAt = 0;
  private checking = false;
  private promptOpen = false;
  private initialized = false;

  constructor(
    private snackBar: MatSnackBar,
    private ngZone: NgZone,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  init(): void {
    if (this.initialized || !isPlatformBrowser(this.platformId)) {
      return;
    }

    this.initialized = true;
    this.removeReloadVersionParam();
    void this.checkForUpdate(true);

    this.ngZone.runOutsideAngular(() => {
      this.document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.window.addEventListener('focus', this.handleWindowFocus);
      this.window.addEventListener('online', this.handleWindowFocus);
    });
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      void this.checkForUpdate();
    }
  };

  private readonly handleWindowFocus = (): void => {
    void this.checkForUpdate();
  };

  private async checkForUpdate(force = false): Promise<void> {
    if (!this.currentVersion || this.checking) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastCheckedAt < this.minimumCheckIntervalMs) {
      return;
    }

    this.checking = true;
    this.lastCheckedAt = now;

    try {
      const deployedVersion = await this.fetchDeployedVersion();
      if (deployedVersion && deployedVersion !== this.currentVersion) {
        this.showReloadPrompt(deployedVersion);
      }
    } catch {
      // Version checks are best-effort; the app should keep running offline.
    } finally {
      this.checking = false;
    }
  }

  private async fetchDeployedVersion(): Promise<string | null> {
    const url = new URL(this.versionUrl, this.document.location.origin);
    url.searchParams.set('t', Date.now().toString());

    const response = await this.window.fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      return null;
    }

    const manifest = await response.json() as AppVersionManifest;
    return manifest.version?.trim() || null;
  }

  private showReloadPrompt(deployedVersion: string): void {
    if (this.promptOpen) {
      return;
    }

    this.ngZone.run(() => {
      this.promptOpen = true;
      const snackBarRef = this.snackBar.openFromComponent(VersionUpdateSnackbarComponent, {
        duration: 0,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['update-available-snackbar'],
        data: {
          currentVersion: this.currentVersion,
          deployedVersion,
        },
      });

      snackBarRef.onAction().subscribe(() => {
        this.forceReload(deployedVersion);
      });

      snackBarRef.afterDismissed().subscribe(() => {
        this.promptOpen = false;
      });
    });
  }

  private forceReload(deployedVersion: string): void {
    const url = new URL(this.window.location.href);
    url.searchParams.set(this.reloadVersionParam, deployedVersion);
    this.window.location.replace(url.href);
  }

  private removeReloadVersionParam(): void {
    const url = new URL(this.window.location.href);
    if (!url.searchParams.has(this.reloadVersionParam)) {
      return;
    }

    url.searchParams.delete(this.reloadVersionParam);
    const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
    this.window.history.replaceState(this.window.history.state, this.document.title, cleanUrl);
  }

  private readCurrentVersion(): string {
    const version = this.document
      .querySelector<HTMLMetaElement>('meta[name="app-build-version"]')
      ?.content
      ?.trim();

    return version || '';
  }

  private get window(): Window {
    return this.document.defaultView ?? window;
  }
}
