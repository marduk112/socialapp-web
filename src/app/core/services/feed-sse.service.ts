import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { FeedScope, Post, PostCreatedSseEvent } from '../models/post.model';
import { environment } from '../../../environments/environment';
import { CurrentUserService } from './current-user.service';

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
  private readonly currentUser = inject(CurrentUserService);
  private eventSource: EventSource | null = null;

  /** Accumulates posts received from SSE — prepend so newest is first */
  private readonly _livePosts = signal<Post[]>([]);
  readonly livePosts = this._livePosts.asReadonly();

  private readonly _connected = signal(false);
  readonly connected = this._connected.asReadonly();

  /** Scope of the currently open (or last requested) stream */
  private scope: FeedScope = 'all';

  /**
   * Opens the stream for the given scope. No-op if already connected
   * (use reconnect() to switch scope).
   */
  connect(scope: FeedScope = 'all'): void {
    if (this.eventSource) return; // already connected

    const token = this.currentUser.token();
    if (!token) return; // stream requires auth

    // EventSource cannot send headers, so the token goes in the query string
    this.scope = scope;
    this.eventSource = new EventSource(
      `${environment.apiUrl}/feed/stream?access_token=${encodeURIComponent(token)}&scope=${scope}`
    );

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
          media: data.media ?? [],
          originalPostId: data.originalPostId ?? null,
          originalAuthorUsername: data.originalAuthorUsername ?? null,
          originalContent: data.originalContent ?? null,
          type: data.type ?? 'POST',
          originalAuthorId: data.originalAuthorId ?? null,
          original: this.toOriginal(data.original),
          repostsCount: 0,
          quotesCount: 0,
          viewerReposted: false,
          hashtags: data.hashtags ?? [],
          mentions: data.mentions ?? [],
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

  /** Normalises the nested original of an SSE payload into a full Post (one level, no further nesting). */
  private toOriginal(o: PostCreatedSseEvent['original']): Post | null {
    const id = o?.id ?? o?.postId;
    if (!o || !id) return null;
    return {
      id,
      authorId: o.authorId ?? '',
      authorUsername: o.authorUsername ?? '',
      authorAvatarUrl: o.authorAvatarUrl,
      content: o.content ?? '',
      imageUrl: o.imageUrl,
      media: o.media ?? [],
      type: o.type ?? 'POST',
      hashtags: o.hashtags ?? [],
      mentions: o.mentions ?? [],
      likesCount: o.likesCount ?? 0,
      dislikesCount: o.dislikesCount ?? 0,
      commentsCount: o.commentsCount ?? 0,
      repostsCount: o.repostsCount ?? 0,
      quotesCount: o.quotesCount ?? 0,
      viewerReposted: false,
      userReaction: null,
      original: null,
      createdAt: o.createdAt ?? new Date().toISOString(),
    };
  }

  /** Closes the current stream, drops live posts of the old scope and opens a new stream. */
  reconnect(scope: FeedScope): void {
    this.disconnect();
    this.clearLivePosts();
    this.connect(scope);
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this._connected.set(false);
  }

  /** Drops live items matching the predicate (e.g. the user's own repost after "Undo repost"). */
  removeLivePosts(matches: (post: Post) => boolean): void {
    this._livePosts.update(posts => posts.filter(p => !matches(p)));
  }

  /** Applies a transformation to the live items (e.g. a bookmark toggle on a post that only arrived via SSE). */
  updateLivePosts(fn: (posts: Post[]) => Post[]): void {
    this._livePosts.update(fn);
  }

  clearLivePosts(): void {
    this._livePosts.set([]);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
