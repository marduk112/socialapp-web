import { MatSnackBar } from '@angular/material/snack-bar';
import { Post } from '../../core/models/post.model';
import { BookmarkService } from '../../core/services/bookmark.service';
import { actionTarget, patchPost } from './post-state';

/**
 * Optimistic bookmark toggle shared by every page that renders post cards (create in a field initializer).
 * The bookmark target is the card's action target (the original inside a REPOST), like likes.
 * Requests are guarded per target id: a second click while one is in flight is ignored.
 */
export class PostBookmarks {
  private readonly pending = new Set<string>();

  constructor(
    private readonly service: BookmarkService,
    private readonly snackBar: MatSnackBar,
    /** applies a transformation to the page's post list */
    private readonly update: (fn: (posts: Post[]) => Post[]) => void,
    /** called after the server confirmed a change (the bookmarks page drops un-bookmarked cards here) */
    private readonly onConfirmed?: (targetId: string, bookmarked: boolean) => void,
  ) {}

  toggle(post: Post): void {
    const target = actionTarget(post);
    if (this.pending.has(target.id)) return;
    const previous = target.bookmarked ?? false;
    const next = !previous;
    this.pending.add(target.id);
    this.set(target.id, next);
    (next ? this.service.add(target.id) : this.service.remove(target.id)).subscribe({
      next: () => {
        this.pending.delete(target.id);
        this.onConfirmed?.(target.id, next);
      },
      error: () => {
        this.pending.delete(target.id);
        this.set(target.id, previous);
        this.snackBar.open(next ? 'Failed to save post' : 'Failed to remove bookmark', 'Dismiss', { duration: 3000 });
      },
    });
  }

  private set(id: string, bookmarked: boolean): void {
    this.update(posts => patchPost(posts, id, p => ({ ...p, bookmarked })));
  }
}
