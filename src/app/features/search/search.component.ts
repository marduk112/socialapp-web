import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PostService } from '../../core/services/post.service';
import { SearchService, UserSearchResult } from '../../core/services/search.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Post, ReactionType } from '../../core/models/post.model';
import { PostCardComponent, PostEditEvent, PostQuoteEvent } from '../../shared/components/post-card/post-card.component';
import { actionTarget, patchPost, removePost } from '../../shared/utils/post-state';
import { PostBookmarks } from '../../shared/utils/post-bookmarks';
import { BookmarkService } from '../../core/services/bookmark.service';
import { PostComments } from '../../shared/utils/post-comments';
import { CommentSectionComponent } from '../../shared/components/comment-section/comment-section.component';
import { ReactionEvent } from '../../shared/components/reaction-bar/reaction-bar.component';

type SearchTab = 'posts' | 'people';

/** `/search?q=`: full-text post search (keyset-paginated, no SSE) and people search by username. */
@Component({
  selector: 'app-search',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule, MatSnackBarModule, MatProgressBarModule, MatProgressSpinnerModule,
    PostCardComponent, CommentSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search-container" data-testid="search-page">
      @if (query() === '') {
        <p class="empty-state" data-testid="search-blank">Type something in the search box to find posts and people.</p>
      } @else {
        <h1 class="search-title" data-testid="search-title">Results for “{{ query() }}”</h1>

        <div class="search-tabs" role="tablist" aria-label="Search results">
          <button type="button" role="tab" class="search-tab" data-testid="search-tab-posts"
                  [class.active]="tab() === 'posts'" [attr.aria-selected]="tab() === 'posts'"
                  (click)="tab.set('posts')">Posts</button>
          <button type="button" role="tab" class="search-tab" data-testid="search-tab-people"
                  [class.active]="tab() === 'people'" [attr.aria-selected]="tab() === 'people'"
                  (click)="tab.set('people')">People</button>
        </div>

        @if (tab() === 'posts') {
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
            <p class="empty-state" data-testid="search-posts-empty">No posts match “{{ query() }}”.</p>
          }
        } @else {
          @if (peopleLoading()) {
            <mat-progress-bar mode="indeterminate" />
          }

          @for (u of people(); track u.id) {
            <a class="person" data-testid="person" [routerLink]="['/users', u.id]">
              @if (u.avatarUrl) {
                <img class="person-avatar" [src]="u.avatarUrl" [alt]="u.username" (error)="onAvatarError($event)" />
              } @else {
                <mat-icon class="person-avatar-fallback">account_circle</mat-icon>
              }
              <span class="person-text">
                <span class="person-name">{{ u.username }}</span>
                @if (u.bio) {
                  <span class="person-bio">{{ u.bio }}</span>
                }
              </span>
            </a>
          }

          @if (peopleLoaded() && people().length === 0) {
            <p class="empty-state" data-testid="search-people-empty">No people match “{{ query() }}”.</p>
          }
        }
      }
    </div>
  `,
  styles: [`
    .search-container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .search-title { margin: 0 0 16px; font-size: 22px; overflow-wrap: anywhere; }
    .search-tabs { display: flex; border-bottom: 1px solid #ddd; margin-bottom: 12px; }
    .search-tab { flex: 1; padding: 10px 0; background: none; border: 0; border-bottom: 2px solid transparent; font: inherit; font-weight: 500; color: #666; cursor: pointer; }
    .search-tab.active { color: #3f51b5; border-bottom-color: #3f51b5; }
    .load-more { display: flex; justify-content: center; padding: 16px 0; }
    .load-more button { display: inline-flex; align-items: center; gap: 8px; }
    .empty-state { text-align: center; color: #999; padding: 40px 0; overflow-wrap: anywhere; }
    .person { display: flex; align-items: center; gap: 12px; padding: 10px 4px; color: inherit; text-decoration: none; border-bottom: 1px solid #eee; }
    .person:hover .person-name { text-decoration: underline; }
    .person-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
    .person-avatar-fallback { width: 44px; height: 44px; font-size: 44px; color: #9e9e9e; }
    .person-text { display: flex; flex-direction: column; min-width: 0; }
    .person-name { font-weight: 500; }
    .person-bio { font-size: 13px; color: #777; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `]
})
export class SearchComponent {
  private readonly postService = inject(PostService);
  private readonly searchService = inject(SearchService);
  protected readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly query = signal('');
  protected readonly tab = signal<SearchTab>('posts');

  protected readonly posts = signal<Post[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadingMore = signal(false);
  protected readonly loaded = signal(false);
  protected readonly people = signal<UserSearchResult[]>([]);
  protected readonly peopleLoading = signal(false);
  protected readonly peopleLoaded = signal(false);
  /** Bumped on every query change so late responses of a previous query are ignored */
  private loadGeneration = 0;
  /** original ids with an in-flight repost/undo request (double clicks are ignored) */
  private readonly repostPending = new Set<string>();
  protected readonly actionTarget = actionTarget;
  protected readonly bookmarks = new PostBookmarks(inject(BookmarkService), this.snackBar, fn => this.posts.update(fn));
  protected readonly comments = new PostComments(this.postService, this.snackBar, (postId, delta) =>
    this.posts.update(posts => patchPost(posts, postId, p => ({ ...p, commentsCount: Math.max(0, p.commentsCount + delta) }))));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.load((params.get('q') ?? '').trim());
    });
  }

  private load(q: string): void {
    const generation = ++this.loadGeneration;
    this.query.set(q);
    this.posts.set([]);
    this.nextCursor.set(null);
    this.loaded.set(false);
    this.loadingMore.set(false);
    this.people.set([]);
    this.peopleLoaded.set(false);
    if (q === '') {
      this.loading.set(false);
      this.peopleLoading.set(false);
      return;
    }
    this.loading.set(true);
    this.peopleLoading.set(true);
    this.searchService.searchPosts(q).subscribe({
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
        this.snackBar.open('Search failed', 'Dismiss', { duration: 3000 });
      }
    });
    this.searchService.searchUsers(q).subscribe({
      next: list => {
        if (generation !== this.loadGeneration) return;
        this.people.set(list);
        this.peopleLoading.set(false);
        this.peopleLoaded.set(true);
      },
      error: () => {
        if (generation !== this.loadGeneration) return;
        this.peopleLoading.set(false);
      }
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore() || this.loading()) return;
    const generation = this.loadGeneration;
    this.loadingMore.set(true);
    this.searchService.searchPosts(this.query(), cursor).subscribe({
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

  protected onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
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
    this.postService.quote(event.postId, { comment: event.comment, mediaIds: event.mediaIds }).subscribe({
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
