import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PostService } from '../../core/services/post.service';
import { Comment, ReactionType } from '../../core/models/post.model';
import {
  AddCommentEvent, CommentReactionEvent, DeleteCommentEvent, EditCommentEvent,
} from '../components/comment-section/comment-section.component';

/**
 * Comment sections state for a list of post cards (same behaviour as FeedComponent). Keyed by the ORIGINAL post id
 * (`actionTarget(post).id`). Create it in a field initializer (it holds injected services); `onCountDelta` adjusts
 * `commentsCount` of every loaded item showing that post.
 */
export class PostComments {
  readonly expanded = signal<Set<string>>(new Set());
  readonly loading = signal<Set<string>>(new Set());
  private readonly comments = signal<Map<string, Comment[]>>(new Map());

  constructor(
    private readonly postService: PostService,
    private readonly snackBar: MatSnackBar,
    private readonly onCountDelta: (postId: string, delta: number) => void,
  ) {}

  get(postId: string): Comment[] {
    return this.comments().get(postId) ?? [];
  }

  toggle(postId: string): void {
    this.expanded.update(set => {
      const next = new Set(set);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
        this.load(postId);
      }
      return next;
    });
  }

  add(postId: string, event: AddCommentEvent): void {
    this.postService.addComment(postId, {
      content: event.content,
      parentCommentId: event.parentCommentId,
    }).subscribe({
      next: comment => {
        this.comments.update(map => new Map(map).set(postId, [...(map.get(postId) ?? []), comment]));
        if (!event.parentCommentId) this.onCountDelta(postId, 1);
      },
      error: () => this.snackBar.open('Failed to add comment', 'Dismiss', { duration: 3000 }),
    });
  }

  react(postId: string, event: CommentReactionEvent): void {
    this.comments.update(map => this.mapComments(map, postId, c => this.applyOptimistic(c, event)));
    this.postService.reactToComment(event.commentId, event.type as ReactionType, event.add).subscribe({
      next: updated => this.comments.update(map => this.mapComments(map, postId, c =>
        c.id === updated.id ? { ...updated, userReaction: event.add ? event.type as ReactionType : null } : c)),
      error: () => {
        this.load(postId);
        this.snackBar.open('Reaction failed', 'Dismiss', { duration: 2000 });
      },
    });
  }

  edit(event: EditCommentEvent): void {
    this.postService.updateComment(event.commentId, { content: event.content }).subscribe({
      next: updated => this.comments.update(map => {
        const next = new Map(map);
        for (const [id, list] of next) next.set(id, list.map(c => c.id === updated.id ? updated : c));
        return next;
      }),
      error: () => this.snackBar.open('Failed to update comment', 'Dismiss', { duration: 3000 }),
    });
  }

  delete(event: DeleteCommentEvent): void {
    this.postService.deleteComment(event.commentId).subscribe({
      next: () => {
        this.comments.update(map => {
          const next = new Map(map);
          for (const [id, list] of next) next.set(id, list.filter(c => c.id !== event.commentId));
          return next;
        });
        this.onCountDelta(event.postId, -1);
      },
      error: () => this.snackBar.open('Failed to delete comment', 'Dismiss', { duration: 3000 }),
    });
  }

  private load(postId: string): void {
    this.loading.update(set => new Set(set).add(postId));
    const clear = () => this.loading.update(set => { const next = new Set(set); next.delete(postId); return next; });
    this.postService.getComments(postId).subscribe({
      next: list => {
        this.comments.update(map => new Map(map).set(postId, list));
        clear();
      },
      error: () => {
        clear();
        this.snackBar.open('Failed to load comments', 'Dismiss', { duration: 3000 });
      },
    });
  }

  private mapComments(map: Map<string, Comment[]>, postId: string, fn: (c: Comment) => Comment): Map<string, Comment[]> {
    const list = map.get(postId);
    if (!list) return map;
    return new Map(map).set(postId, list.map(c => fn(c)));
  }

  private applyOptimistic(comment: Comment, event: CommentReactionEvent): Comment {
    if (comment.id !== event.commentId) return comment;
    let { likesCount, dislikesCount, userReaction } = comment;
    const opposite: ReactionType = event.type === 'LIKE' ? 'DISLIKE' : 'LIKE';
    if (event.add) {
      if (userReaction === opposite) {
        if (opposite === 'LIKE') likesCount = Math.max(0, likesCount - 1);
        else dislikesCount = Math.max(0, dislikesCount - 1);
      }
      if (event.type === 'LIKE') likesCount++; else dislikesCount++;
      userReaction = event.type as ReactionType;
    } else {
      if (event.type === 'LIKE') likesCount = Math.max(0, likesCount - 1);
      else dislikesCount = Math.max(0, dislikesCount - 1);
      userReaction = null;
    }
    return { ...comment, likesCount, dislikesCount, userReaction };
  }
}
