import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CurrentUserService } from './core/services/current-user.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule],
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
        <a mat-button [routerLink]="['/users', user.id]" routerLinkActive="active-link">
          <mat-icon>person</mat-icon> {{ user.username }}
        </a>
        <button mat-icon-button (click)="currentUser.clearUser()" title="Sign out">
          <mat-icon>logout</mat-icon>
        </button>
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
}
