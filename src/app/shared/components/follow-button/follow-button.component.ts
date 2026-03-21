import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'ui-follow-button',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button mat-raised-button
            [color]="isFollowing() ? '' : 'primary'"
            [disabled]="loading()"
            (click)="followToggle.emit(!isFollowing())">
      @if (loading()) {
        <mat-spinner diameter="18" />
      } @else {
        {{ isFollowing() ? 'Unfollow' : 'Follow' }}
      }
    </button>
  `,
  styles: [`
    button { min-width: 90px; }
    mat-spinner { display: inline-block; }
  `]
})
export class FollowButtonComponent {
  isFollowing = input<boolean>(false);
  loading = input<boolean>(false);
  followToggle = output<boolean>();
}
