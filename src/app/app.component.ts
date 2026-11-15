import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { CurrentUserService } from './core/services/current-user.service';
import { NotificationService } from './core/services/notification.service';
import { Notification } from './core/models/notification.model';
import { NotificationItemComponent } from './shared/components/notification-item/notification-item.component';
import { mergeNotifications, notificationLink } from './shared/utils/notification-utils';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, MatDividerModule, NotificationItemComponent],
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
        <button mat-icon-button #bellTrigger="matMenuTrigger" [matMenuTriggerFor]="notifMenu"
                (menuOpened)="onBellOpened()" aria-label="Notifications" data-testid="notif-bell">
          <mat-icon>notifications</mat-icon>
          @if (notifications.unread() > 0) {
            <span class="bell-badge" data-testid="notif-badge">{{ badgeText() }}</span>
          }
        </button>
        <mat-menu #notifMenu="matMenu" class="notif-menu">
          <div class="notif-panel" data-testid="notif-menu" (click)="$event.stopPropagation()">
            @for (n of menuItems(); track n.id) {
              <ui-notification-item [notification]="n" (open)="onOpenNotification($event)" />
            } @empty {
              <p class="notif-empty">No notifications yet.</p>
            }
          </div>
          <mat-divider />
          <button mat-menu-item data-testid="notif-mark-all" [disabled]="notifications.unread() === 0"
                  (click)="markAllRead()">
            <mat-icon>done_all</mat-icon> Mark all as read
          </button>
          <a mat-menu-item routerLink="/notifications" data-testid="notif-see-all">
            <mat-icon>list</mat-icon> See all
          </a>
        </mat-menu>
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
    .bell-badge { position: absolute; top: 4px; right: 2px; min-width: 18px; height: 18px; padding: 0 4px;
                  box-sizing: border-box; border-radius: 9px; background: #f44336; color: #fff; font-size: 11px;
                  font-weight: 600; line-height: 18px; text-align: center; pointer-events: none; }
    .notif-panel { width: 360px; max-width: 90vw; max-height: 420px; overflow-y: auto; }
    .notif-empty { text-align: center; color: #999; padding: 16px; margin: 0; }
    .active-link { border-bottom: 2px solid white; }
  `]
})
export class AppComponent {
  protected readonly currentUser = inject(CurrentUserService);
  private readonly router = inject(Router);
  protected readonly notifications = inject(NotificationService);

  private readonly bellTrigger = viewChild<MatMenuTrigger>('bellTrigger');
  /** Last page fetched when the menu was opened (live items from the service are merged on top) */
  private readonly fetched = signal<Notification[]>([]);
  protected readonly menuItems = computed(() =>
    mergeNotifications(this.notifications.latest(), this.fetched()).slice(0, 10));
  protected readonly badgeText = computed(() => {
    const n = this.notifications.unread();
    return n > 99 ? '99+' : String(n);
  });

  protected onBellOpened(): void {
    this.notifications.list(undefined, 10).subscribe({
      next: page => this.fetched.set(page.items),
      error: () => { /* live items stay visible */ },
    });
  }

  protected markAllRead(): void {
    this.notifications.markRead().subscribe({
      next: () => {
        this.fetched.update(list => list.map(n => n.read ? n : { ...n, read: true }));
        this.notifications.readLocally(null, 0);
      },
      error: () => { /* counter stays */ },
    });
  }

  protected onOpenNotification(n: Notification): void {
    if (!n.read) {
      this.fetched.update(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
      this.notifications.readLocally([n.id], 1);
      this.notifications.markRead([n.id]).subscribe({ error: () => { /* stays unread server-side */ } });
    }
    this.bellTrigger()?.closeMenu();
    this.router.navigate(notificationLink(n));
  }

  protected signOut(): void {
    this.fetched.set([]);
    this.currentUser.clearUser();
    this.router.navigate(['/login']);
  }
}
