import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NotificationService } from '../../core/services/notification.service';
import { Notification } from '../../core/models/notification.model';
import { NotificationItemComponent } from '../../shared/components/notification-item/notification-item.component';
import { mergeNotifications, notificationLink } from '../../shared/utils/notification-utils';

/** Full notification list (keyset-paginated) with live items prepended. */
@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [MatButtonModule, MatSnackBarModule, MatProgressBarModule, MatProgressSpinnerModule, NotificationItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notif-container" data-testid="notifications-page">
      <div class="header">
        <h1>Notifications</h1>
        <button mat-stroked-button type="button" data-testid="notif-mark-all"
                [disabled]="markingAll() || !hasUnread()" (click)="markAll()">
          Mark all as read
        </button>
      </div>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @for (n of items(); track n.id) {
        <ui-notification-item [notification]="n" (open)="onOpen($event)" />
      }

      @if (nextCursor() !== null) {
        <div class="load-more">
          <button mat-stroked-button type="button" data-testid="notif-load-more"
                  [disabled]="loadingMore()" (click)="loadMore()">
            @if (loadingMore()) {
              <mat-spinner diameter="18" />
            }
            Load more
          </button>
        </div>
      }

      @if (loaded() && items().length === 0) {
        <p class="empty-state" data-testid="notifications-empty">No notifications yet.</p>
      }
    </div>
  `,
  styles: [`
    .notif-container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .header h1 { margin: 0; }
    .load-more { display: flex; justify-content: center; padding: 16px 0; }
    .load-more button { display: inline-flex; align-items: center; gap: 8px; }
    .empty-state { text-align: center; color: #999; padding: 40px 0; }
  `]
})
export class NotificationsComponent implements OnInit {
  private readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  private readonly persisted = signal<Notification[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly loaded = signal(false);
  protected readonly markingAll = signal(false);
  /** Guards late responses (a reload bumps it); a stale response must not leave loading flags set */
  private loadGeneration = 0;

  /** Live items (from the service) on top; ids already loaded over HTTP are deduped */
  protected readonly items = computed(() => mergeNotifications(this.service.latest(), this.persisted()));
  protected readonly hasUnread = computed(() => this.items().some(n => !n.read));

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    const generation = ++this.loadGeneration;
    this.loadingMore.set(false);
    this.loading.set(true);
    this.service.list().subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        this.persisted.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        this.snackBar.open('Failed to load notifications', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore() || this.loading()) return;
    const generation = this.loadGeneration;
    this.loadingMore.set(true);
    this.service.list(cursor).subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        this.persisted.update(list => {
          const ids = new Set(list.map(n => n.id));
          return [...list, ...page.items.filter(n => !ids.has(n.id))];
        });
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loadingMore.set(false);
        this.snackBar.open('Failed to load more notifications', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected markAll(): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);
    this.service.markRead().subscribe({
      next: () => {
        this.persisted.update(list => list.map(n => n.read ? n : { ...n, read: true }));
        this.service.readLocally(null, 0);
        this.markingAll.set(false);
      },
      error: () => {
        this.markingAll.set(false);
        this.snackBar.open('Failed to mark notifications as read', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected onOpen(n: Notification): void {
    if (!n.read) {
      // optimistic; a failed request only leaves the item unread on the server
      this.persisted.update(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
      this.service.readLocally([n.id], 1);
      this.service.markRead([n.id]).subscribe({ error: () => { /* stays unread server-side */ } });
    }
    this.router.navigate(notificationLink(n));
  }
}
