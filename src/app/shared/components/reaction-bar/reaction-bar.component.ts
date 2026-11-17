import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export type ReactionType = 'LIKE' | 'DISLIKE';
export interface ReactionEvent {
  type: ReactionType;
  add: boolean;
}

@Component({
  selector: 'ui-reaction-bar',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="reaction-bar">
      <button mat-icon-button data-testid="like-btn"
              [class.active-like]="userReaction() === 'LIKE'"
              matTooltip="Like"
              (click)="onReact('LIKE')">
        <mat-icon>thumb_up</mat-icon>
      </button>
      <span class="count" data-testid="like-count">{{ likesCount() }}</span>

      <button mat-icon-button data-testid="dislike-btn"
              [class.active-dislike]="userReaction() === 'DISLIKE'"
              matTooltip="Dislike"
              (click)="onReact('DISLIKE')">
        <mat-icon>thumb_down</mat-icon>
      </button>
      <span class="count" data-testid="dislike-count">{{ dislikesCount() }}</span>
    </div>
  `,
  styles: [`
    .reaction-bar { display: flex; align-items: center; gap: 4px; }
    .count { font-size: 13px; color: #666; min-width: 20px; }
    .active-like  { color: #1976d2; }
    .active-dislike { color: #d32f2f; }
  `]
})
export class ReactionBarComponent {
  likesCount    = input<number>(0);
  dislikesCount = input<number>(0);
  userReaction  = input<ReactionType | null>(null);
  react = output<ReactionEvent>();

  onReact(type: ReactionType): void {
    const isActive = this.userReaction() === type;
    this.react.emit({ type, add: !isActive });
  }
}
