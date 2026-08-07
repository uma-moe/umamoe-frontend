import { Component, HostListener, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { TourAnchorMatMenuDirective } from 'ngx-ui-tour-md-menu';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { StatusService, OverallStatus, EndpointStatus } from '../../services/status.service';
import { LinkedAccount } from '../../models/auth.model';
@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatToolbarModule,
    MatIconModule,
    TourAnchorMatMenuDirective
  ],
  templateUrl: './navigation.component.html',
  styleUrl: './navigation.component.scss'
})
export class NavigationComponent {
  isChristmas$ = this.themeService.isChristmas$;
  isLightMode$ = this.themeService.isLightMode$;
  user$ = this.authService.user$;
  isLoggedIn$ = this.authService.isLoggedIn$;
  status$ = this.statusService.status$;
  endpoints$ = this.statusService.endpoints$;
  userMenuOpen = false;
  statusTooltipOpen = false;
  linkedAccounts: LinkedAccount[] = [];
  private linkedAccountImages = new Map<string, string>();
  accountsLoaded = false;

  constructor(
    private router: Router,
    private themeService: ThemeService,
    public authService: AuthService,
    private statusService: StatusService,
    private injector: Injector,
  ) {}

  toggleUserMenu(event: Event) {
    event.stopPropagation();
    this.userMenuOpen = !this.userMenuOpen;
    if (this.userMenuOpen && !this.accountsLoaded) {
      this.authService.getLinkedAccounts().subscribe({
        next: (accounts) => {
          this.linkedAccounts = accounts.filter(a => a.verification_status === 'verified');
          this.accountsLoaded = true;
          void this.resolveLinkedAccountImages(this.linkedAccounts);
        },
        error: () => { this.accountsLoaded = true; }
      });
    }
  }

  getUmaImage(account: LinkedAccount): string | null {
    return this.linkedAccountImages.get(account.account_id) ?? null;
  }

  @HostListener('document:click')
  closeUserMenu() {
    this.userMenuOpen = false;
    this.statusTooltipOpen = false;
  }

  toggleStatusTooltip(event: Event) {
    event.stopPropagation();
    this.statusTooltipOpen = !this.statusTooltipOpen;
    this.userMenuOpen = false;
    if (this.statusTooltipOpen) {
      this.statusService.refreshIfStale(30_000);
    }
  }

  getStatusLabel(status: OverallStatus): string {
    switch (status) {
      case 'operational': return 'All Systems Operational';
      case 'degraded': return 'Partial Outage';
      case 'down': return 'Major Outage';
      default: return 'Checking...';
    }
  }
  toggleColorMode() {
    this.themeService.toggleColorMode();
  }
  startGettingStartedTour(event: Event) {
    event.stopPropagation();
    void import('../../services/getting-started-tour.service')
      .then(({ GettingStartedTourService }) => {
        this.injector.get(GettingStartedTourService).startForCurrentPage();
      })
      .catch(() => undefined);
  }

  private async resolveLinkedAccountImages(accounts: LinkedAccount[]): Promise<void> {
    const { getCharacterById } = await import('../../data/character.data');
    for (const account of accounts) {
      if (!account.representative_uma_id) continue;
      const character = getCharacterById(account.representative_uma_id);
      if (character) {
        this.linkedAccountImages.set(account.account_id, `assets/images/character_stand/${character.image}`);
      }
    }
  }
  onLogoError(event: Event) {
    const target = event.target as HTMLImageElement;
    target.src = 'assets/logo.webp';
  }
}
