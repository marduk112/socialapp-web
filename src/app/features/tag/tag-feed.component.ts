import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostService } from '../../core/services/post.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Post, ReactionType } from '../../core/models/post.model';
import { PostCardComponent, PostEditEvent, PostQuoteEvent } from '../../shared/components/post-card/post-card.component';
import { actionTarget, patchPost, removePost } from '../../shared/utils/post-state';
import { PostBookmarks } from '../../shared/utils/post-bookmarks';
import { BookmarkService } from '../../core/services/bookmark.service';
import { PostComments } from '../../shared/utils/post-comments';
import { CommentSectionComponent } from '../../shared/components/comment-section/comment-section.component';
import { ReactionEvent } from '../../shared/components/reaction-bar/reaction-bar.component';

/** Posts of one hashtag (keyset-paginated, no SSE). */
@Component({
  selector: 'app-tag-feed',
  standalone: true,
  imports: [MatButtonModule, MatSnackBarModule, MatProgressBarModule, MatProgressSpinnerModule, PostCardComponent, CommentSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tag-container">
      <h1 class="tag-title" data-testid="tag-title">#{{ tag() }}</h1>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @for (post of posts(); track post.id) {
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
          (toggleComments)="comments.toggle($event)" />

        <!-- a REPOST item's comments belong to the original -->
        @let targetId = actionTarget(post).id;
        @if (comments.expanded().has(targetId)) {
          <ui-comment-section
            [comments]="comments.get(targetId)"
            [loading]="comments.loading().has(targetId)"
            [currentUserId]="currentUser.user()?.id ?? null"
            (addComment)="comments.add(targetId, $event)"
            (editComment)="comments.edit($event)"
            (deleteComment)="comments.delete($event)"
            (reactToComment)="comments.react(targetId, $event)" />
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

      @if (loaded() && posts().length === 0) {
        <p class="empty-state" data-testid="tag-empty">No posts with #{{ tag() }} yet.</p>
      }
    </div>
  `,
  styles: [`
    .tag-container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .tag-title { margin: 0 0 16px; }
    .load-more { display: flex; justify-content: center; padding: 16px 0; }
    .load-more button { display: inline-flex; align-items: center; gap: 8px; }
    .empty-state { text-align: center; color: #999; padding: 40px 0; }
  `]
})
export class TagFeedComponent {
  private readonly postService = inject(PostService);
  protected readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tag = signal('');
  protected readonly posts = signal<Post[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly loaded = signal(false);
  /** Bumped on every tag change so late responses of a previous tag are ignored */
  private loadGeneration = 0;
  /** original ids with an in-flight repost/undo request (double clicks are ignored) */
  private readonly repostPending = new Set<string>();
  protected readonly actionTarget = actionTarget;
  protected readonly bookmarks = new PostBookmarks(inject(BookmarkService), this.snackBar, fn => this.posts.update(fn));
  protected readonly comments = new PostComments(this.postService, this.snackBar, (postId, delta) =>
    this.posts.update(posts => patchPost(posts, postId, p => ({ ...p, commentsCount: Math.max(0, p.commentsCount + delta) }))));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.load((params.get('tag') ?? '').toLowerCase());
    });
  }

  private load(tag: string): void {
    const generation = ++this.loadGeneration;
    this.tag.set(tag);
    this.posts.set([]);
    this.nextCursor.set(null);
    this.loaded.set(false);
    this.loadingMore.set(false);
    this.loading.set(true);
    this.postService.getHashtagPosts(tag).subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        this.posts.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        this.snackBar.open('Failed to load posts', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore() || this.loading()) return;
    const generation = this.loadGeneration;
    this.loadingMore.set(true);
    this.postService.getHashtagPosts(this.tag(), cursor).subscribe({
      next: page => {
        if (generation !== this.loadGeneration) return;
        // append without duplicates (a post may shift between pages)
        this.posts.update(posts => {
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

  protected onReact(post: Post, event: ReactionEvent): void {
    const target = actionTarget(post);
    const type = event.type as ReactionType;
    this.postService.react(target.id, type, event.add).subscribe({
      next: updated => this.posts.update(posts => patchPost(posts, target.id, p => ({
        ...p,
        likesCount: updated.likesCount,
        dislikesCount: updated.dislikesCount,
        userReaction: event.add ? type : null,
      }))),
      error: () => this.snackBar.open('Reaction failed', 'Dismiss', { duration: 2000 }),
    });
  }

  protected onEdit(event: PostEditEvent): void {
    this.postService.updatePost(event.postId, { content: event.content, imageUrl: event.imageUrl }).subscribe({
      next: updated => {
        this.posts.update(posts => patchPost(posts, updated.id, p => ({ ...p, ...updated, original: p.original })));
        this.snackBar.open('Post updated', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to update post', 'Dismiss', { duration: 3000 }),
    });
  }

  protected onDelete(postId: string): void {
    this.postService.deletePost(postId).subscribe({
      next: () => {
        this.posts.update(posts => removePost(posts, postId));
        this.snackBar.open('Post deleted', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to delete post', 'Dismiss', { duration: 3000 }),
    });
  }

  protected onRepost(originalId: string): void {
    if (this.repostPending.has(originalId)) return;
    this.repostPending.add(originalId);
    this.postService.repost(originalId).subscribe({
      next: item => {
        this.repostPending.delete(originalId);
        const count = item.original?.repostsCount;
        this.posts.update(posts => patchPost(posts, originalId, p => ({
          ...p, viewerReposted: true,
          repostsCount: count ?? (p.viewerReposted ? (p.repostsCount ?? 0) : (p.repostsCount ?? 0) + 1),
        })));
      },
      error: () => {
        this.repostPending.delete(originalId);
        this.snackBar.open('Failed to repost', 'Dismiss', { duration: 3000 });
      },
    });
  }

  protected onUndoRepost(originalId: string): void {
    if (this.repostPending.has(originalId)) return;
    this.repostPending.add(originalId);
    this.postService.undoRepost(originalId).subscribe({
      next: () => {
        this.repostPending.delete(originalId);
        this.posts.update(posts => patchPost(posts, originalId,
          p => ({ ...p, viewerReposted: false, repostsCount: Math.max(0, (p.repostsCount ?? 0) - 1) })));
      },
      error: () => {
        this.repostPending.delete(originalId);
        this.snackBar.open('Failed to undo repost', 'Dismiss', { duration: 3000 });
      },
    });
  }

  protected onQuote(event: PostQuoteEvent): void {
    this.postService.quote(event.postId, { comment: event.comment }).subscribe({
      next: item => {
        const count = item.original?.quotesCount;
        this.posts.update(posts => patchPost(posts, event.postId, p => ({ ...p, quotesCount: count ?? (p.quotesCount ?? 0) + 1 })));
        this.snackBar.open('Quote posted', 'Dismiss', { duration: 2000 });
        event.done(true);
      },
      error: () => {
        this.snackBar.open('Failed to quote post', 'Dismiss', { duration: 3000 });
        event.done(false);
      },
    });
  }
}
