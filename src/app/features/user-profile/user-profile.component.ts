import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { UserService } from '../../core/services/user.service';
import { SocialGraphService } from '../../core/services/social-graph.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { User } from '../../core/models/user.model';

import { UserCardComponent, UserCardData } from '../../shared/components/user-card/user-card.component';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, MatSnackBarModule, MatProgressSpinnerModule, UserCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="profile-wrapper">
      @if (loading()) {
        <mat-spinner diameter="48" />
      } @else if (cardData()) {
        <ui-user-card
          [user]="cardData()!"
          [followLoading]="followLoading()"
          [isOwnProfile]="isOwnProfile()"
          (followToggle)="onFollowToggle($event)" />
      } @else {
        <p>User not found.</p>
      }
    </div>
  `,
  styles: [`
    .profile-wrapper { padding: 24px; display: flex; justify-content: center; }
  `]
})
export class UserProfileComponent implements OnInit {
  profileId = input.required<string>();

  private readonly userService = inject(UserService);
  private readonly socialGraphService = inject(SocialGraphService);
  private readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly _user = signal<User | null>(null);
  private readonly _isFollowing = signal(false);
  private readonly _followersCount = signal(0);
  private readonly _followingCount = signal(0);
  protected readonly loading = signal(false);
  protected readonly followLoading = signal(false);

  protected readonly isOwnProfile = computed(() =>
    this.currentUser.user()?.id === this.profileId()
  );

  protected readonly cardData = computed<UserCardData | null>(() => {
    const user = this._user();
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      isFollowing: this._isFollowing(),
      followersCount: this._followersCount(),
      followingCount: this._followingCount(),
    };
  });

  ngOnInit(): void {
    this.loadProfile();
  }

  private loadProfile(): void {
    this.loading.set(true);

    this.userService.getUser(this.profileId()).subscribe({
      next: user => {
        this._user.set(user);
        this.loading.set(false);
        this.loadCounts();
        const viewerId = this.currentUser.user()?.id;
        if (viewerId && viewerId !== this.profileId()) {
          this.checkFollowing(viewerId);
        }
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load profile', 'Dismiss', { duration: 3000 });
      }
    });
  }

  /** Counts come from the social graph (Neo4j); a failure just leaves them at 0. */
  private loadCounts(): void {
    this.socialGraphService.getFollowers(this.profileId()).subscribe({
      next: list => this._followersCount.set(list.length),
      error: () => {}
    });
    this.socialGraphService.getFollowing(this.profileId()).subscribe({
      next: list => this._followingCount.set(list.length),
      error: () => {}
    });
  }

  private checkFollowing(viewerId: string): void {
    this.socialGraphService.isFollowing(this.profileId()).subscribe({
      next: result => this._isFollowing.set(result),
      error: () => {}
    });
  }

  protected onFollowToggle(shouldFollow: boolean): void {
    const viewerId = this.currentUser.user()?.id;
    if (!viewerId) {
      this.snackBar.open('Sign in to follow users', 'Dismiss', { duration: 3000 });
      return;
    }

    this.followLoading.set(true);

    const action$ = shouldFollow
      ? this.socialGraphService.follow(this.profileId())
      : this.socialGraphService.unfollow(this.profileId());

    action$.subscribe({
      next: () => {
        if (shouldFollow !== this._isFollowing()) {
          this._followersCount.update(n => Math.max(0, n + (shouldFollow ? 1 : -1)));
        }
        this._isFollowing.set(shouldFollow);
        this.followLoading.set(false);
        this.snackBar.open(shouldFollow ? 'Following!' : 'Unfollowed', undefined, { duration: 2000 });
      },
      error: () => {
        this.followLoading.set(false);
        this.snackBar.open('Action failed', 'Dismiss', { duration: 3000 });
      }
    });
  }
}
