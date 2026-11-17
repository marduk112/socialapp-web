import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FollowSuggestion, SocialGraphService } from '../../../core/services/social-graph.service';
import { FollowButtonComponent } from '../follow-button/follow-button.component';

/** "Who to follow": friends of friends (Neo4j), topped up with popular users. Hidden while empty. */
@Component({
  selector: 'ui-who-to-follow',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatIconModule, FollowButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (suggestions().length > 0) {
      <mat-card class="wtf-card" data-testid="who-to-follow">
        <mat-card-header>
          <mat-card-title>Who to follow</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @for (s of suggestions(); track s.userId) {
            <div class="wtf-row" data-testid="suggestion">
              @if (s.avatarUrl) {
                <img class="wtf-avatar" [src]="s.avatarUrl" [alt]="s.username" (error)="onAvatarError($event)" />
              } @else {
                <mat-icon class="wtf-avatar-fallback">account_circle</mat-icon>
              }
              <div class="wtf-text">
                <a class="wtf-name" [routerLink]="['/users', s.userId]">{{ s.username }}</a>
                <span class="wtf-reason">{{ reason(s) }}</span>
              </div>
              <ui-follow-button
                [isFollowing]="followed().has(s.userId)"
                [loading]="pending().has(s.userId)"
                (followToggle)="onToggle(s, $event)" />
            </div>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: [`
    .wtf-card { margin-bottom: 16px; }
    .wtf-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
    .wtf-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
    .wtf-avatar-fallback { width: 40px; height: 40px; font-size: 40px; color: #9e9e9e; }
    .wtf-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .wtf-name { font-weight: 500; color: inherit; text-decoration: none; overflow: hidden; text-overflow: ellipsis; }
    .wtf-name:hover { text-decoration: underline; }
    .wtf-reason { font-size: 12px; color: #777; }
  `]
})
export class WhoToFollowComponent implements OnInit {
  private readonly socialGraph = inject(SocialGraphService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly suggestions = signal<FollowSuggestion[]>([]);
  protected readonly followed = signal<ReadonlySet<string>>(new Set());
  protected readonly pending = signal<ReadonlySet<string>>(new Set());

  ngOnInit(): void {
    // Best effort: the card simply stays hidden when the request fails.
    this.socialGraph.getSuggestions().subscribe({
      next: list => this.suggestions.set(list),
      error: () => this.suggestions.set([]),
    });
  }

  protected reason(s: FollowSuggestion): string {
    if (s.mutualFollowers <= 0) return 'Popular on SocialApp';
    return s.mutualFollowers === 1
      ? 'Followed by 1 person you follow'
      : `Followed by ${s.mutualFollowers} people you follow`;
  }

  protected onToggle(s: FollowSuggestion, shouldFollow: boolean): void {
    if (this.pending().has(s.userId)) return;
    this.setIn(this.pending, s.userId, true);
    const call = shouldFollow ? this.socialGraph.follow(s.userId) : this.socialGraph.unfollow(s.userId);
    call.subscribe({
      next: () => {
        this.setIn(this.followed, s.userId, shouldFollow);
        this.setIn(this.pending, s.userId, false);
      },
      error: () => {
        this.setIn(this.pending, s.userId, false);
        this.snackBar.open(shouldFollow ? 'Failed to follow user' : 'Failed to unfollow user', 'Dismiss', { duration: 3000 });
      },
    });
  }

  protected onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  private setIn(target: { update(fn: (v: ReadonlySet<string>) => ReadonlySet<string>): void }, id: string, on: boolean): void {
    target.update(set => {
      const next = new Set(set);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }
}
