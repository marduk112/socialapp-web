import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Notification } from '../../../core/models/notification.model';
import { notificationText, timeAgo } from '../../utils/notification-utils';

/** One notification row (avatar, sentence, snippet, relative time); unread rows are visually distinct. */
@Component({
  selector: 'ui-notification-item',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="notif" data-testid="notif-item"
            [class.unread]="!notification().read" [attr.data-unread]="!notification().read"
            (click)="open.emit(notification())">
      @if (notification().actorAvatarUrl) {
        <img class="avatar" [src]="notification().actorAvatarUrl" [alt]="notification().actorUsername" />
      } @else {
        <span class="avatar placeholder"><mat-icon>person</mat-icon></span>
      }
      <span class="body">
        <span class="sentence"><strong>{{ notification().actorUsername }}</strong> {{ text() }}</span>
        @if (notification().snippet) {
          <span class="snippet">{{ notification().snippet }}</span>
        }
        <span class="time">{{ time() }}</span>
      </span>
      @if (!notification().read) {
        <span class="dot" aria-label="Unread"></span>
      }
    </button>
  `,
  styles: [`
    :host { display: block; }
    .notif { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 10px 14px; border: 0;
             background: transparent; font: inherit; text-align: left; cursor: pointer; color: inherit; }
    .notif:hover { background: rgba(0, 0, 0, 0.05); }
    .notif.unread { background: #e8eaf6; font-weight: 500; border-left: 3px solid #3f51b5; padding-left: 11px; }
    .avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none; }
    .avatar.placeholder { display: inline-flex; align-items: center; justify-content: center; background: #ddd; color: #777; }
    .body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .snippet { color: #666; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .time { color: #999; font-size: 12px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #3f51b5; flex: none; margin-top: 6px; }
  `]
})
export class NotificationItemComponent {
  notification = input.required<Notification>();
  open = output<Notification>();
  protected readonly text = computed(() => notificationText(this.notification()));
  protected readonly time = computed(() => timeAgo(this.notification().createdAt));
}
