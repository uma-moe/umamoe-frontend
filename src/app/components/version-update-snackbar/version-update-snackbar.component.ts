import { Component, Inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { AppVersionService } from '../../services/app-version.service';

export interface VersionUpdateSnackbarData {
  currentVersion: string;
  deployedVersion: string;
  updateType?: 'application' | 'rewards';
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
    private appVersionService: AppVersionService,
    @Inject(MAT_SNACK_BAR_DATA) readonly data: VersionUpdateSnackbarData,
  ) {}

  get currentVersion(): string {
    return this.appVersionService.formatVersion(this.data.currentVersion);
  }

  get deployedVersion(): string {
    return this.appVersionService.formatVersion(this.data.deployedVersion);
  }

  get isRewardUpdate(): boolean {
    return this.data.updateType === 'rewards';
  }

  reload(): void {
    this.snackBarRef.dismissWithAction();
  }
}
