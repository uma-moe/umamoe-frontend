import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AppVersionService } from '../../services/app-version.service';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterModule, MatIconModule, MatTooltipModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  readonly currentYear = new Date().getFullYear();
  readonly discordUrl = 'https://discord.uma.moe/';
  readonly kofiUrl = 'https://ko-fi.com/umamoe';
  readonly statusUrl = 'https://status.uma.moe/';
  copied = false;
  private copyResetTimer: number | null = null;

  constructor(
    private appVersionService: AppVersionService,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  get buildVersion(): string {
    return this.appVersionService.getCurrentVersion();
  }

  get buildVersionLabel(): string {
    return this.appVersionService.formatVersion(this.buildVersion);
  }

  get buildTooltip(): string {
    return this.copied ? 'Copied build version' : `Copy build version: ${this.buildVersion}`;
  }

  async copyBuildVersion(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) {
      return;
    }

    try {
      await clipboard.writeText(this.buildVersion);
      this.copied = true;
    } catch {
      return;
    }

    if (this.copyResetTimer !== null) {
      this.document.defaultView?.clearTimeout(this.copyResetTimer);
    }

    this.copyResetTimer = this.document.defaultView?.setTimeout(() => {
      this.copied = false;
      this.copyResetTimer = null;
    }, 1600) ?? null;
  }

}
