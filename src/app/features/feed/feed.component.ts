import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostBookmarks } from '../../shared/utils/post-bookmarks';
import { BookmarkService } from '../../core/services/bookmark.service';
import { PostService } from '../../core/services/post.service';
import { FeedSseService } from '../../core/services/feed-sse.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Post, Comment, FeedScope, ReactionType } from '../../core/models/post.model';

import { CharCounterComponent } from '../../shared/components/char-counter/char-counter.component';
import { isValidPostText } from '../../shared/utils/post-limit';
import { actionTarget, patchPost, prependUnique, removePost } from '../../shared/utils/post-state';
import { PostCardComponent, PostEditEvent, PostQuoteEvent } from '../../shared/components/post-card/post-card.component';
import { ReactionEvent } from '../../shared/components/reaction-bar/reaction-bar.component';
import { CommentSectionComponent, AddCommentEvent, EditCommentEvent, DeleteCommentEvent, CommentReactionEvent } from '../../shared/components/comment-section/comment-section.component';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    PostCardComponent,
    CharCounterComponent,
    CommentSectionComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feed-container">

      <!-- No profile banner -->
      @if (!currentUser.user()) {
        <mat-card class="no-profile-card">
          <mat-card-content>
            <p>You don't have a profile yet.</p>
            <a mat-flat-button color="primary" routerLink="/create-profile">Create Profile</a>
          </mat-card-content>
        </mat-card>
      }

      <!-- Compose card -->
      @if (currentUser.user()) {
        <mat-card class="compose-card">
          <mat-card-content>
            <mat-form-field appearance="outline" class="compose-field">
              <mat-label>What's on your mind, {{ currentUser.user()!.username }}?</mat-label>
              <textarea matInput [(ngModel)]="newPostContent" rows="3"
                        [disabled]="submitting()" (keydown.ctrl.enter)="submitPost()"></textarea>
            </mat-form-field>
            <ui-char-counter data-testid="compose-counter" [text]="newPostContent" />
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-flat-button color="primary"
                    [disabled]="!isValidPostText(newPostContent) || submitting()"
                    (click)="submitPost()">
              <mat-icon>send</mat-icon> Post
            </button>
          </mat-card-actions>
        </mat-card>
      }

      <!-- SSE status bar -->
      @if (feedSseService.connected()) {
        <div class="live-indicator">
          <mat-icon class="pulse">fiber_manual_record</mat-icon>
          Live updates active
        </div>
      }

      <!-- Scope tabs -->
      <div class="feed-tabs" role="tablist" aria-label="Feed scope">
        <button type="button" role="tab" class="feed-tab" data-testid="feed-tab-for-you"
                [class.active]="scope() === 'all'"
                [attr.aria-selected]="scope() === 'all'"
                (click)="setScope('all')">For you</button>
        <button type="button" role="tab" class="feed-tab" data-testid="feed-tab-following"
                [class.active]="scope() === 'following'"
                [attr.aria-selected]="scope() === 'following'"
                (click)="setScope('following')">Following</button>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <!-- Post list -->
      @for (post of allPosts(); track post.id) {
        <ui-post-card
          [post]="post"
          [currentUserId]="currentUser.user()?.id ?? null"
          (react)="onReact(post, $event)"
          (edit)="onEdit($event)"
          (delete)="onDelete($event)"
          (repost)="onRepost($event)"
          (undoRepost)="onUndoRepost($event)"
          (quote)="onQuote($event)"
          (bookmark)="bookmarks.toggle(post)"
          (toggleComments)="onToggleComments($event)" />

        <!-- Comment section (shown when toggled); a REPOST item's comments belong to the original -->
        @let targetId = actionTarget(post).id;
        @if (expandedComments().has(targetId)) {
          <ui-comment-section
            [comments]="getComments(targetId)"
            [loading]="commentsLoading().has(targetId)"
            [currentUserId]="currentUser.user()?.id ?? null"
            (addComment)="onAddComment(targetId, $event)"
            (editComment)="onEditComment($event)"
            (deleteComment)="onDeleteComment($event)"
            (reactToComment)="onCommentReact(targetId, $event)" />
        }
      }

      @if (nextCursor() !== null) {
        <div class="load-more">
          <button mat-stroked-button type="button" data-testid="load-more"
                  [disabled]="loadingMore()" (click)="loadMore()">
            @if (loadingMore()) {
              <mat-spinner diameter="18" />
            }
            Load more
          </button>
        </div>
      }

      @if (!loading() && allPosts().length === 0) {
        @if (scope() === 'following') {
          <p class="empty-state" data-testid="following-empty">Nothing here yet — follow people to see their posts.</p>
        } @else {
          <p class="empty-state">No posts yet. Be the first to post!</p>
        }
      }
    </div>
  `,
  styles: [`
    .feed-container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .no-profile-card { margin-bottom: 16px; }
    .no-profile-card p { margin: 0 0 12px; color: #555; }
    .compose-card { margin-bottom: 16px; }
    .compose-field { width: 100%; }
    .live-indicator { display: flex; align-items: center; gap: 6px; color: #4caf50; font-size: 13px; margin-bottom: 8px; }
    .pulse { animation: pulse 1.5s infinite; font-size: 12px; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
    .feed-tabs { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 12px; }
    .feed-tab { flex: 1; padding: 10px 0; background: none; border: 0; border-bottom: 2px solid transparent; font: inherit; font-weight: 500; color: #666; cursor: pointer; }
    .feed-tab.active { color: #3f51b5; border-bottom-color: #3f51b5; }
    .load-more { display: flex; justify-content: center; padding: 16px 0; }
    .load-more button { display: inline-flex; align-items: center; gap: 8px; }
    .empty-state { text-align: center; color: #999; padding: 40px 0; }
  `]
})
export class FeedComponent implements OnInit, OnDestroy {
  private readonly postService = inject(PostService);
  protected readonly feedSseService = inject(FeedSseService);
  protected readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);

  // ── State ─────────────────────────────────────────────────────────────────
  private readonly _posts = signal<Post[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly scope = signal<FeedScope>('all');
  protected readonly nextCursor = signal<string | null>(null);
  /** Bumped on every scope switch so late responses of a previous scope are ignored */
  private loadGeneration = 0;
  protected readonly submitting = signal(false);
  protected newPostContent = '';
  protected readonly isValidPostText = isValidPostText;
  protected readonly actionTarget = actionTarget;
  /** the toggle patches both the persisted list and the live SSE items (allPosts merge stays untouched) */
  protected readonly bookmarks = new PostBookmarks(inject(BookmarkService), this.snackBar, fn => {
    this._posts.update(fn);
    this.feedSseService.updateLivePosts(fn);
  });
  /** original ids with an in-flight repost/undo request (double clicks are ignored) */
  private readonly repostPending = new Set<string>();

  // Comments state
  protected readonly expandedComments = signal<Set<string>>(new Set());
  protected readonly commentsLoading = signal<Set<string>>(new Set());
  private readonly _comments = signal<Map<string, Comment[]>>(new Map());

  protected readonly allPosts = computed(() => {
    const live = this.feedSseService.livePosts();
    const persisted = this._posts();
    const persistedIds = new Set(persisted.map(p => p.id));
    // Live posts appear at top; posts already in persisted are deduplicated
    return [...live.filter(p => !persistedIds.has(p.id)), ...persisted];
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadFeed();
    this.feedSseService.connect(this.scope());
  }

  ngOnDestroy(): void {
    this.feedSseService.disconnect();
  }

  // ── Feed actions ──────────────────────────────────────────────────────────
  private loadFeed(): void {
    const generation = ++this.loadGeneration;
    // A pending "load more" response is dropped once the generation changes, so its flag must not stay set.
    this.loadingMore.set(false);
    this.loading.set(true);
    this.postService.getFeed(this.scope()).subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        this._posts.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        this.snackBar.open('Failed to load feed', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected setScope(scope: FeedScope): void {
    if (scope === this.scope()) return;
    this.scope.set(scope);
    this._posts.set([]);
    this.nextCursor.set(null);
    this.loadingMore.set(false);
    this.feedSseService.reconnect(scope);
    this.loadFeed();
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore() || this.loading()) return;
    const generation = this.loadGeneration;
    this.loadingMore.set(true);
    this.postService.getFeed(this.scope(), cursor).subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        // append without duplicates (a post may shift between pages)
        this._posts.update(posts => {
          const ids = new Set(posts.map(p => p.id));
          return [...posts, ...page.items.filter(p => !ids.has(p.id))];
        });
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loadingMore.set(false);
        this.snackBar.open('Failed to load more posts', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected submitPost(): void {
    const content = this.newPostContent.trim();
    if (!isValidPostText(content) || !this.currentUser.user()) return;

    this.submitting.set(true);
    this.postService.createPost({ content }).subscribe({
      next: post => {
        this._posts.update(posts => [post, ...posts]);
        this.newPostContent = '';
        this.submitting.set(false);
      },
      error: () => {
        this.submitting.set(false);
        this.snackBar.open('Failed to create post', 'Dismiss', { duration: 3000 });
      }
    });
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  protected onEdit(event: PostEditEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this.postService.updatePost(event.postId, {
      content: event.content,
      imageUrl: event.imageUrl,
    }).subscribe({
      next: updated => {
        this._posts.update(posts => patchPost(posts, updated.id, p => ({ ...p, ...updated, original: p.original })));
        this.snackBar.open('Post updated', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to update post', 'Dismiss', { duration: 3000 }),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  protected onDelete(postId: string): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this.postService.deletePost(postId).subscribe({
      next: () => {
        this._posts.update(posts => removePost(posts, postId));
        this.snackBar.open('Post deleted', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to delete post', 'Dismiss', { duration: 3000 }),
    });
  }

  // ── Repost / Quote ────────────────────────────────────────────────────────
  protected onRepost(originalId: string): void {
    if (!this.currentUser.user()) {
      this.snackBar.open('Create a profile to repost', 'Dismiss', { duration: 2000 });
      return;
    }
    if (this.repostPending.has(originalId)) return;
    this.repostPending.add(originalId);
    this.postService.repost(originalId).subscribe({
      next: item => {
        this.repostPending.delete(originalId);
        const count = item.original?.repostsCount;
        this._posts.update(posts => prependUnique(
          patchPost(posts, originalId, p => ({
            ...p, viewerReposted: true,
            repostsCount: count ?? (p.viewerReposted ? (p.repostsCount ?? 0) : (p.repostsCount ?? 0) + 1),
          })), item));
      },
      error: () => {
        this.repostPending.delete(originalId);
        this.snackBar.open('Failed to repost', 'Dismiss', { duration: 3000 });
      },
    });
  }

  protected onUndoRepost(originalId: string): void {
    if (this.repostPending.has(originalId)) return;
    const me = this.currentUser.user()?.id;
    this.repostPending.add(originalId);
    this.postService.undoRepost(originalId).subscribe({
      next: () => {
        this.repostPending.delete(originalId);
        // The SSE stream also delivers one's own repost; without this it would stay in the live list until reload.
        this.feedSseService.removeLivePosts(p =>
          p.type === 'REPOST' && p.original?.id === originalId && p.authorId === me);
        this._posts.update(posts => patchPost(
          posts.filter(p => !(p.type === 'REPOST' && p.original?.id === originalId && p.authorId === me)),
          originalId,
          p => ({ ...p, viewerReposted: false, repostsCount: Math.max(0, (p.repostsCount ?? 0) - 1) })));
      },
      error: () => {
        this.repostPending.delete(originalId);
        this.snackBar.open('Failed to undo repost', 'Dismiss', { duration: 3000 });
      },
    });
  }

  protected onQuote(event: PostQuoteEvent): void {
    if (!this.currentUser.user()) {
      this.snackBar.open('Create a profile to quote posts', 'Dismiss', { duration: 2000 });
      event.done(false);
      return;
    }
    this.postService.quote(event.postId, { comment: event.comment }).subscribe({
      next: item => {
        const count = item.original?.quotesCount;
        this._posts.update(posts => prependUnique(
          patchPost(posts, event.postId, p => ({ ...p, quotesCount: count ?? (p.quotesCount ?? 0) + 1 })), item));
        this.snackBar.open('Quote posted', 'Dismiss', { duration: 2000 });
        event.done(true);
      },
      error: () => {
        this.snackBar.open('Failed to quote post', 'Dismiss', { duration: 3000 });
        event.done(false);
      },
    });
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  protected onReact(post: Post, event: ReactionEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) {
      this.snackBar.open('Create a profile to react to posts', 'Dismiss', { duration: 2000 });
      return;
    }

    // Optimistic update on the target (the original inside a REPOST) everywhere it is shown
    const target = actionTarget(post);
    const type = event.type as ReactionType;
    this._posts.update(posts => patchPost(posts, target.id, p => this.applyOptimisticReaction(p, type, event.add)));

    this.postService.react(target.id, type, event.add).subscribe({
      next: updated => {
        this._posts.update(posts => patchPost(posts, target.id, p => ({
          ...p,
          likesCount: updated.likesCount,
          dislikesCount: updated.dislikesCount,
          userReaction: event.add ? type : null,
        })));
      },
      error: () => {
        // Rollback
        this._posts.update(posts => patchPost(posts, target.id, p => ({
          ...p,
          likesCount: target.likesCount,
          dislikesCount: target.dislikesCount,
          userReaction: target.userReaction ?? null,
        })));
        this.snackBar.open('Reaction failed', 'Dismiss', { duration: 2000 });
      }
    });
  }

  private applyOptimisticReaction(post: Post, type: ReactionType, add: boolean): Post {
    let { likesCount, dislikesCount, userReaction } = post;
    const opposite: ReactionType = type === 'LIKE' ? 'DISLIKE' : 'LIKE';

    if (add) {
      if (userReaction === opposite) {
        if (opposite === 'LIKE') likesCount = Math.max(0, likesCount - 1);
        else dislikesCount = Math.max(0, dislikesCount - 1);
      }
      if (type === 'LIKE') likesCount++;
      else dislikesCount++;
      userReaction = type;
    } else {
      if (type === 'LIKE') likesCount = Math.max(0, likesCount - 1);
      else dislikesCount = Math.max(0, dislikesCount - 1);
      userReaction = null;
    }

    return { ...post, likesCount, dislikesCount, userReaction };
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  protected onToggleComments(postId: string): void {
    this.expandedComments.update(set => {
      const next = new Set(set);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
        this.loadComments(postId);
      }
      return next;
    });
  }

  private loadComments(postId: string): void {
    this.commentsLoading.update(set => new Set(set).add(postId));
    this.postService.getComments(postId).subscribe({
      next: comments => {
        this._comments.update(map => {
          const next = new Map(map);
          next.set(postId, comments);
          return next;
        });
        this.commentsLoading.update(set => {
          const next = new Set(set);
          next.delete(postId);
          return next;
        });
      },
      error: () => {
        this.commentsLoading.update(set => {
          const next = new Set(set);
          next.delete(postId);
          return next;
        });
        this.snackBar.open('Failed to load comments', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected getComments(postId: string): Comment[] {
    return this._comments().get(postId) ?? [];
  }

  protected onAddComment(postId: string, event: AddCommentEvent): void {
    const user = this.currentUser.user();
    if (!user) return;

    this.postService.addComment(postId, {
      content: event.content,
      parentCommentId: event.parentCommentId,
    }).subscribe({
      next: comment => {
        this._comments.update(map => {
          const next = new Map(map);
          const existing = next.get(postId) ?? [];
          next.set(postId, [...existing, comment]);
          return next;
        });
        if (!event.parentCommentId) {
          this._posts.update(posts =>
            patchPost(posts, postId, p => ({ ...p, commentsCount: p.commentsCount + 1 }))
          );
        }
      },
      error: () => this.snackBar.open('Failed to add comment', 'Dismiss', { duration: 3000 }),
    });
  }

  protected onCommentReact(postId: string, event: CommentReactionEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this._comments.update(map => {
      const next = new Map(map);
      const comments = next.get(postId);
      if (!comments) return next;
      next.set(postId, comments.map(c =>
        c.id === event.commentId ? this.applyOptimisticCommentReaction(c, event) : c
      ));
      return next;
    });

    this.postService.reactToComment(event.commentId, event.type as ReactionType, event.add).subscribe({
      next: updated => {
        this._comments.update(map => {
          const next = new Map(map);
          const comments = next.get(postId);
          if (!comments) return next;
          next.set(postId, comments.map(c =>
            c.id === updated.id
              ? { ...updated, userReaction: event.add ? event.type as ReactionType : null }
              : c
          ));
          return next;
        });
      },
      error: () => {
        this.loadComments(postId);
        this.snackBar.open('Reaction failed', 'Dismiss', { duration: 2000 });
      },
    });
  }

  private applyOptimisticCommentReaction(comment: Comment, event: CommentReactionEvent): Comment {
    let { likesCount, dislikesCount, userReaction } = comment;
    const opposite: ReactionType = event.type === 'LIKE' ? 'DISLIKE' : 'LIKE';
    if (event.add) {
      if (userReaction === opposite) {
        if (opposite === 'LIKE') likesCount = Math.max(0, likesCount - 1);
        else dislikesCount = Math.max(0, dislikesCount - 1);
      }
      if (event.type === 'LIKE') likesCount++;
      else dislikesCount++;
      userReaction = event.type as ReactionType;
    } else {
      if (event.type === 'LIKE') likesCount = Math.max(0, likesCount - 1);
      else dislikesCount = Math.max(0, dislikesCount - 1);
      userReaction = null;
    }
    return { ...comment, likesCount, dislikesCount, userReaction };
  }

  protected onEditComment(event: EditCommentEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this.postService.updateComment(event.commentId, {
      content: event.content,
    }).subscribe({
      next: updated => {
        this._comments.update(map => {
          const next = new Map(map);
          for (const [postId, comments] of next) {
            next.set(postId, comments.map(c => c.id === updated.id ? updated : c));
          }
          return next;
        });
      },
      error: () => this.snackBar.open('Failed to update comment', 'Dismiss', { duration: 3000 }),
    });
  }

  protected onDeleteComment(event: DeleteCommentEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this.postService.deleteComment(event.commentId).subscribe({
      next: () => {
        this._comments.update(map => {
          const next = new Map(map);
          for (const [postId, comments] of next) {
            next.set(postId, comments.filter(c => c.id !== event.commentId));
          }
          return next;
        });
        this._posts.update(posts =>
          patchPost(posts, event.postId, p => ({ ...p, commentsCount: Math.max(0, p.commentsCount - 1) }))
        );
      },
      error: () => this.snackBar.open('Failed to delete comment', 'Dismiss', { duration: 3000 }),
    });
  }
}
