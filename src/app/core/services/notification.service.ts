import { Injectable, NgZone, OnDestroy, effect, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Notification, NotificationPage } from '../models/notification.model';
import { environment } from '../../../environments/environment';
import { ApiClient } from './api-client.service';
import { CurrentUserService } from './current-user.service';

/**
 * Notifications: HTTP API plus a live part (native EventSource, token in the query string).
 * The stream is opened while a session exists and closed on logout / destroy. `unread` is fetched on connect
 * (also after every reconnect, to cover missed events) and incremented by live events.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly ngZone = inject(NgZone);
  private readonly currentUser = inject(CurrentUserService);

  private eventSource: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  /** Bumped on every (dis)connect and live event; guards late unread-count responses */
  private sessionGeneration = 0;
  private liveEvents = 0;

  private readonly _unread = signal(0);
  readonly unread = this._unread.asReadonly();

  /** Live notifications of this session, newest first */
  private readonly _latest = signal<Notification[]>([]);
  readonly latest = this._latest.asReadonly();

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  constructor() {
    // connect when a session exists, disconnect (and forget everything) on logout / user switch
    effect(() => {
      const token = this.currentUser.token();
      this.disconnect();
      this._latest.set([]);
      this._unread.set(0);
      if (token) {
        this.connect(token);
      }
    });
  }

  // ── HTTP ────────────────────────────────────────────────────────────────
  list(cursor?: string | null, size = 20): Observable<NotificationPage> {
    const params: { [param: string]: string | number } = { size };
    if (cursor) params['cursor'] = cursor;
    return this.api.get<NotificationPage>('/notifications', params);
  }

  unreadCount(): Observable<{ count: number }> {
    return this.api.get<{ count: number }>('/notifications/unread-count');
  }

  /** Omit / empty ids = mark all as read. Local state is updated separately via readLocally(). */
  markRead(ids?: string[]): Observable<void> {
    return this.api.post<void>('/notifications/read', ids && ids.length ? { ids } : {});
  }

  /**
   * Mirrors a mark-read in the shared signals. `ids` = marked ids (null = all); `decrement` = how many of them
   * were unread (ignored for "all").
   */
  readLocally(ids: string[] | null, decrement: number): void {
    const set = ids ? new Set(ids) : null;
    this._latest.update(list => list.map(n => (!set || set.has(n.id)) && !n.read ? { ...n, read: true } : n));
    this._unread.update(c => set ? Math.max(0, c - decrement) : 0);
  }

  refreshUnread(): void {
    const generation = this.sessionGeneration;
    const eventsBefore = this.liveEvents;
    this.unreadCount().subscribe({
      next: ({ count }) => {
        if (generation !== this.sessionGeneration) return;
        // events that arrived while the request was in flight may or may not be part of `count`
        this._unread.update(cur => this.liveEvents !== eventsBefore ? Math.max(cur, count) : count);
      },
      error: () => { /* keep the current value */ },
    });
  }

  // ── SSE ─────────────────────────────────────────────────────────────────
  private connect(token: string): void {
    if (this.eventSource) return;
    const generation = ++this.sessionGeneration;
    // EventSource cannot send headers, so the token goes in the query string
    const source = new EventSource(
      `${environment.apiUrl}/notifications/stream?access_token=${encodeURIComponent(token)}`);
    this.eventSource = source;

    source.addEventListener('connected', () => {
      this.ngZone.run(() => {
        this._connected.set(true);
        this.retryDelay = 1000;
        this.refreshUnread();
      });
    });

    source.addEventListener('notification', (event: MessageEvent) => {
      try {
        const n: Notification = JSON.parse(event.data);
        this.ngZone.run(() => {
          if (generation !== this.sessionGeneration) return;
          this.liveEvents++;
          if (this._latest().some(x => x.id === n.id)) return; // duplicate delivery
          this._latest.update(list => [n, ...list].slice(0, 50));
          if (!n.read) this._unread.update(c => c + 1);
        });
      } catch (e) {
        console.error('[SSE] Failed to parse notification event', e);
      }
    });

    source.onerror = () => {
      this.ngZone.run(() => {
        this._connected.set(false);
        // EventSource retries by itself while CONNECTING; once CLOSED (e.g. HTTP error) retry with backoff
        if (source.readyState === EventSource.CLOSED && this.eventSource === source) {
          source.close();
          this.eventSource = null;
          this.scheduleRetry(generation);
        }
      });
    };
  }

  private scheduleRetry(generation: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const token = this.currentUser.token();
      if (token && generation === this.sessionGeneration && !this.eventSource) {
        this.ngZone.run(() => this.connect(token));
      }
    }, delay);
  }

  private disconnect(): void {
    this.sessionGeneration++;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryDelay = 1000;
    this.eventSource?.close();
    this.eventSource = null;
    this._connected.set(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
