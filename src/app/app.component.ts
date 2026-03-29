import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { CurrentUserService } from './core/services/current-user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar color="primary">
      <mat-icon>hub</mat-icon>
      <span style="margin-left:8px">SocialApp</span>
      <span style="flex:1"></span>
      <a mat-button routerLink="/feed" routerLinkActive="active-link">
        <mat-icon>dynamic_feed</mat-icon> Feed
      </a>
      @if (currentUser.user(); as user) {
        <button mat-button [matMenuTriggerFor]="userMenu">
          <mat-icon>person</mat-icon> {{ user.username }}
        </button>
        <mat-menu #userMenu="matMenu">
          <a mat-menu-item [routerLink]="['/users', user.id]">
            <mat-icon>account_circle</mat-icon> My Profile
          </a>
          <a mat-menu-item routerLink="/settings">
            <mat-icon>settings</mat-icon> Settings
          </a>
          <mat-divider />
          <button mat-menu-item (click)="signOut()">
            <mat-icon>logout</mat-icon> Sign out
          </button>
        </mat-menu>
      } @else {
        <a mat-button routerLink="/login" routerLinkActive="active-link">
          <mat-icon>login</mat-icon> Sign in
        </a>
        <a mat-button routerLink="/create-profile" routerLinkActive="active-link">
          <mat-icon>person_add</mat-icon> Create Profile
        </a>
      }
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styles: [`
    main { padding: 16px; }
    .active-link { border-bottom: 2px solid white; }
  `]
})
export class AppComponent {
  protected readonly currentUser = inject(CurrentUserService);
  private readonly router = inject(Router);

  protected signOut(): void {
    this.currentUser.clearUser();
    this.router.navigate(['/login']);
  }
}
