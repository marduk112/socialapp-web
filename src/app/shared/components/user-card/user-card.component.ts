import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FollowButtonComponent } from '../follow-button/follow-button.component';

export interface UserCardData {
  id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
  followersCount?: number;
  followingCount?: number;
  isFollowing?: boolean;
}

@Component({
  selector: 'ui-user-card',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule, FollowButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="user-card">
      <mat-card-header>
        @if (user().avatarUrl) {
          <img mat-card-avatar [src]="user().avatarUrl" [alt]="user().username + ' avatar'" />
        }
        <mat-card-title>{{ user().username }}</mat-card-title>
        @if (user().bio) {
          <mat-card-subtitle>{{ user().bio }}</mat-card-subtitle>
        }
      </mat-card-header>

      <mat-card-content>
        <div class="stats">
          <span><strong>{{ user().followersCount ?? 0 }}</strong> followers</span>
          <span><strong>{{ user().followingCount ?? 0 }}</strong> following</span>
        </div>
      </mat-card-content>

      @if (!isOwnProfile()) {
        <mat-card-actions align="end">
          <ui-follow-button
            [isFollowing]="user().isFollowing ?? false"
            [loading]="followLoading()"
            (followToggle)="followToggle.emit($event)" />
        </mat-card-actions>
      }
    </mat-card>
  `,
  styles: [`
    .user-card { max-width: 360px; }
    .stats { display: flex; gap: 16px; padding: 8px 0; font-size: 14px; }
  `]
})
export class UserCardComponent {
  user = input.required<UserCardData>();
  followLoading = input<boolean>(false);
  isOwnProfile = input<boolean>(false);
  followToggle = output<boolean>();
}
