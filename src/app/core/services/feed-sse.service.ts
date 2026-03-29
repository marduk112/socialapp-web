import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { Post, PostCreatedSseEvent } from '../models/post.model';
import { environment } from '../../../environments/environment';

/**
 * Connects to the backend SSE stream and exposes new posts via a Signal.
 * Uses native EventSource API — no RxJS needed.
 *
 * Usage:
 *   const newPosts = feedSseService.newPostsSignal;  // Signal<Post[]>
 */
@Injectable({ providedIn: 'root' })
export class FeedSseService implements OnDestroy {
  private readonly ngZone = inject(NgZone);
  private eventSource: EventSource | null = null;

  /** Accumulates posts received from SSE — prepend so newest is first */
  private readonly _livePosts = signal<Post[]>([]);
  readonly livePosts = this._livePosts.asReadonly();

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  connect(): void {
    if (this.eventSource) return; // already connected

    this.eventSource = new EventSource(`${environment.apiUrl}/feed/stream`);

    this.eventSource.addEventListener('connected', () => {
      this.ngZone.run(() => {
        this._connected.set(true);
        console.log('[SSE] Connected to feed stream');
      });
    });

    this.eventSource.addEventListener('new-post', (event: MessageEvent) => {
      try {
        const data: PostCreatedSseEvent = JSON.parse(event.data);
        const newPost: Post = {
          id: data.postId,
          authorId: data.authorId,
          authorUsername: data.authorUsername,
          authorAvatarUrl: data.authorAvatarUrl,
          content: data.content,
          imageUrl: data.imageUrl,
          likesCount: 0,
          dislikesCount: 0,
          commentsCount: 0,
          createdAt: new Date().toISOString(),
          userReaction: null,
        };
        this.ngZone.run(() => this._livePosts.update(posts => [newPost, ...posts]));
      } catch (e) {
        console.error('[SSE] Failed to parse new-post event', e);
      }
    });

    this.eventSource.onerror = () => {
      this.ngZone.run(() => {
        this._connected.set(false);
        console.warn('[SSE] Connection error — will auto-reconnect');
      });
    };
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this._connected.set(false);
  }

  clearLivePosts(): void {
    this._livePosts.set([]);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
