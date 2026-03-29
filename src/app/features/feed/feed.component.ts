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
import { PostService } from '../../core/services/post.service';
import { FeedSseService } from '../../core/services/feed-sse.service';
import { CurrentUserService } from '../../core/services/current-user.service';
import { Post, Comment, ReactionType } from '../../core/models/post.model';

import { PostCardComponent, PostEditEvent, PostShareEvent } from '../../shared/components/post-card/post-card.component';
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
    PostCardComponent,
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
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-flat-button color="primary"
                    [disabled]="!newPostContent.trim() || submitting()"
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
          (share)="onShare($event)"
          (toggleComments)="onToggleComments($event)" />

        <!-- Comment section (shown when toggled) -->
        @if (expandedComments().has(post.id)) {
          <ui-comment-section
            [comments]="getComments(post.id)"
            [loading]="commentsLoading().has(post.id)"
            [currentUserId]="currentUser.user()?.id ?? null"
            (addComment)="onAddComment(post.id, $event)"
            (editComment)="onEditComment($event)"
            (deleteComment)="onDeleteComment($event)"
            (reactToComment)="onCommentReact(post.id, $event)" />
        }
      }

      @if (!loading() && allPosts().length === 0) {
        <p class="empty-state">No posts yet. Be the first to post!</p>
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
  protected readonly submitting = signal(false);
  protected newPostContent = '';

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
    this.feedSseService.connect();
  }

  ngOnDestroy(): void {
    this.feedSseService.disconnect();
  }

  // ── Feed actions ──────────────────────────────────────────────────────────
  private loadFeed(): void {
    this.loading.set(true);
    this.postService.getFeed().subscribe({
      next: posts => {
        this._posts.set(posts);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('Failed to load feed', 'Dismiss', { duration: 3000 });
      }
    });
  }

  protected submitPost(): void {
    const content = this.newPostContent.trim();
    const userId = this.currentUser.user()?.id;
    if (!content || !userId) return;

    this.submitting.set(true);
    const authorUsername = this.currentUser.user()!.username;
    this.postService.createPost({ authorId: userId, authorUsername, content }).subscribe({
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
      requesterId: userId,
      content: event.content,
      imageUrl: event.imageUrl,
    }).subscribe({
      next: updated => {
        this._posts.update(posts => posts.map(p => p.id === updated.id ? updated : p));
        this.snackBar.open('Post updated', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to update post', 'Dismiss', { duration: 3000 }),
    });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  protected onDelete(postId: string): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) return;

    this.postService.deletePost(postId, userId).subscribe({
      next: () => {
        this._posts.update(posts => posts.filter(p => p.id !== postId));
        this.snackBar.open('Post deleted', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to delete post', 'Dismiss', { duration: 3000 }),
    });
  }

  // ── Share ─────────────────────────────────────────────────────────────────
  protected onShare(event: PostShareEvent): void {
    const user = this.currentUser.user();
    if (!user) {
      this.snackBar.open('Create a profile to share posts', 'Dismiss', { duration: 2000 });
      return;
    }

    this.postService.sharePost(event.postId, {
      authorId: user.id,
      authorUsername: user.username,
      comment: event.comment || undefined,
    }).subscribe({
      next: shared => {
        this._posts.update(posts => [shared, ...posts]);
        this.snackBar.open('Post shared!', 'Dismiss', { duration: 2000 });
      },
      error: () => this.snackBar.open('Failed to share post', 'Dismiss', { duration: 3000 }),
    });
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  protected onReact(post: Post, event: ReactionEvent): void {
    const userId = this.currentUser.user()?.id;
    if (!userId) {
      this.snackBar.open('Create a profile to react to posts', 'Dismiss', { duration: 2000 });
      return;
    }

    // Optimistic update
    this._posts.update(posts =>
      posts.map(p => {
        if (p.id !== post.id) return p;
        return this.applyOptimisticReaction(p, event.type as ReactionType, event.add);
      })
    );

    this.postService.react(post.id, userId, event.type as ReactionType, event.add).subscribe({
      next: updated => {
        this._posts.update(posts =>
          posts.map(p => p.id === updated.id ? { ...updated, userReaction: event.add ? event.type as ReactionType : null } : p)
        );
      },
      error: () => {
        // Rollback
        this._posts.update(posts =>
          posts.map(p => p.id === post.id ? post : p)
        );
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
      authorId: user.id,
      authorUsername: user.username,
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
            posts.map(p => p.id === postId ? { ...p, commentsCount: p.commentsCount + 1 } : p)
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

    this.postService.reactToComment(event.commentId, userId, event.type as ReactionType, event.add).subscribe({
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
      requesterId: userId,
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

    this.postService.deleteComment(event.commentId, userId).subscribe({
      next: () => {
        this._comments.update(map => {
          const next = new Map(map);
          for (const [postId, comments] of next) {
            next.set(postId, comments.filter(c => c.id !== event.commentId));
          }
          return next;
        });
        this._posts.update(posts =>
          posts.map(p => p.id === event.postId ? { ...p, commentsCount: Math.max(0, p.commentsCount - 1) } : p)
        );
      },
      error: () => this.snackBar.open('Failed to delete comment', 'Dismiss', { duration: 3000 }),
    });
  }
}
