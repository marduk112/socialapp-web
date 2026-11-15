import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { PostService } from '../../core/services/post.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Post, ReactionType } from '../../core/models/post.model';
import { PostCardComponent, PostEditEvent, PostQuoteEvent } from '../../shared/components/post-card/post-card.component';
import { actionTarget, patchPost } from '../../shared/utils/post-state';
import { PostComments } from '../../shared/utils/post-comments';
import { CommentSectionComponent } from '../../shared/components/comment-section/comment-section.component';
import { ReactionEvent } from '../../shared/components/reaction-bar/reaction-bar.component';

/** A single post (GET /posts/{id}) with its comment section opened by default. */
@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [MatSnackBarModule, MatProgressBarModule, PostCardComponent, CommentSectionComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="post-container" data-testid="post-detail">
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
          (toggleComments)="comments.toggle($event)" />

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

      @if (notFound()) {
        <p class="not-found" data-testid="post-not-found">Post not found.</p>
      }
    </div>
  `,
  styles: [`
    .post-container { max-width: 640px; margin: 0 auto; padding: 16px; }
    .not-found { text-align: center; color: #999; padding: 40px 0; }
  `]
})
export class PostDetailComponent {
  private readonly postService = inject(PostService);
  protected readonly currentUser = inject(CurrentUserService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Zero or one item (arrays so the shared patchPost / removePost helpers apply) */
  protected readonly posts = signal<Post[]>([]);
  protected readonly loading = signal(false);
  protected readonly notFound = signal(false);
  /** Bumped on every id change so late responses of a previous post are ignored */
  private loadGeneration = 0;
  private readonly repostPending = new Set<string>();
  protected readonly actionTarget = actionTarget;
  protected readonly comments = new PostComments(this.postService, this.snackBar, (postId, delta) =>
    this.posts.update(posts => patchPost(posts, postId, p => ({ ...p, commentsCount: Math.max(0, p.commentsCount + delta) }))));

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.load(params.get('id') ?? '');
    });
  }

  private load(id: string): void {
    const generation = ++this.loadGeneration;
    this.posts.set([]);
    this.notFound.set(false);
    this.loading.set(true);
    this.postService.getPost(id).subscribe({
      next: post => {
        if (generation !== this.loadGeneration) return;
        this.posts.set([post]);
        this.loading.set(false);
        const target = actionTarget(post).id;
        if (!this.comments.expanded().has(target)) this.comments.toggle(target);
      },
      error: err => {
        if (generation !== this.loadGeneration) return;
        this.loading.set(false);
        if (err?.status === 404) {
          this.notFound.set(true);
        } else {
          this.snackBar.open('Failed to load post', 'Dismiss', { duration: 3000 });
        }
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
        this.snackBar.open('Post deleted', 'Dismiss', { duration: 2000 });
        this.router.navigate(['/feed']);
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
