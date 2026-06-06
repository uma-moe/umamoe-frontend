import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export interface VersionUpdateSnackbarData {
  currentVersion: string;
  deployedVersion: string;
}

@Component({
  selector: 'app-version-update-snackbar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './version-update-snackbar.component.html',
  styleUrls: ['./version-update-snackbar.component.scss'],
})
export class VersionUpdateSnackbarComponent {
  constructor(
    private snackBarRef: MatSnackBarRef<VersionUpdateSnackbarComponent>,
    @Inject(MAT_SNACK_BAR_DATA) readonly data: VersionUpdateSnackbarData,
  ) {}

  get currentVersion(): string {
    return this.formatVersion(this.data.currentVersion);
  }

  get deployedVersion(): string {
    return this.formatVersion(this.data.deployedVersion);
  }

  reload(): void {
    this.snackBarRef.dismissWithAction();
  }

  dismiss(): void {
    this.snackBarRef.dismiss();
  }

  private formatVersion(version: string): string {
    const trimmedVersion = version.trim();
    if (!trimmedVersion) {
      return 'unknown';
    }

    const buildVersion = trimmedVersion.match(/^(beta|prod)-build\.(\d+)\.(\d+)$/i);
    if (buildVersion) {
      const [, environment, runNumber, attempt] = buildVersion;
      return `${environment} build #${runNumber}.${attempt}`;
    }

    const githubBuild = trimmedVersion.match(/^([a-f0-9]{40})-(\d+)-(\d+)-(.+)$/i);
    if (githubBuild) {
      const [, commit, runId, attempt, environment] = githubBuild;
      return `${commit.slice(0, 7)} · #${runId}.${attempt} · ${environment}`;
    }

    return trimmedVersion;
  }
}
