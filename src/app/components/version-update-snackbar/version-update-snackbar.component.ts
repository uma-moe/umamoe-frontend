import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBarRef } from '@angular/material/snack-bar';

@Component({
  selector: 'app-version-update-snackbar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './version-update-snackbar.component.html',
  styleUrls: ['./version-update-snackbar.component.scss'],
})
export class VersionUpdateSnackbarComponent {
  constructor(private snackBarRef: MatSnackBarRef<VersionUpdateSnackbarComponent>) {}

  reload(): void {
    this.snackBarRef.dismissWithAction();
  }

  dismiss(): void {
    this.snackBarRef.dismiss();
  }
}
