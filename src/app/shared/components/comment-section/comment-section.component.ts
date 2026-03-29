import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ReactionBarComponent, ReactionEvent, ReactionType } from '../reaction-bar/reaction-bar.component';

export interface CommentData {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  likesCount: number;
  dislikesCount: number;
  userReaction?: ReactionType | null;
  parentCommentId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AddCommentEvent {
  content: string;
  parentCommentId?: string | null;
}

export interface EditCommentEvent {
  commentId: string;
  content: string;
}

export interface DeleteCommentEvent {
  commentId: string;
  postId: string;
}

export interface CommentReactionEvent {
  commentId: string;
  type: ReactionType;
  add: boolean;
}

interface CommentThread extends CommentData {
  replies: CommentData[];
}

@Component({
  selector: 'ui-comment-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatMenuModule, MatProgressSpinnerModule,
    ReactionBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comment-section">
      @if (loading()) {
        <div class="loading"><mat-spinner diameter="24" /></div>
      }

      @for (thread of threadedComments(); track thread.id) {
        <div class="comment">
          <div class="comment-header">
            @if (thread.authorAvatarUrl) {
              <img class="comment-avatar" [src]="thread.authorAvatarUrl" [alt]="thread.authorUsername"
                   (error)="onAvatarError($event)" />
            }
            <strong>{{ thread.authorUsername }}</strong>
            <span class="comment-time">{{ thread.createdAt | date:'short' }}
              @if (thread.updatedAt && thread.updatedAt !== thread.createdAt) {
                <span class="edited">(edited)</span>
              }
            </span>
            @if (thread.authorId === currentUserId()) {
              <button mat-icon-button [matMenuTriggerFor]="topMenu" class="comment-menu-btn">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #topMenu="matMenu">
                <button mat-menu-item (click)="startEditComment(thread)">
                  <mat-icon>edit</mat-icon> Edit
                </button>
                <button mat-menu-item (click)="deleteComment.emit({ commentId: thread.id, postId: thread.postId })">
                  <mat-icon>delete</mat-icon> Delete
                </button>
              </mat-menu>
            }
          </div>
          @if (editingCommentId() === thread.id) {
            <div class="comment-edit">
              <mat-form-field appearance="outline" class="edit-field">
                <textarea matInput [(ngModel)]="editCommentContent" rows="2"></textarea>
              </mat-form-field>
              <div class="edit-actions">
                <button mat-button (click)="cancelEditComment()">Cancel</button>
                <button mat-flat-button color="primary"
                        [disabled]="!editCommentContent.trim()"
                        (click)="saveEditComment()">Save</button>
              </div>
            </div>
          } @else {
            <p class="comment-content">{{ thread.content }}</p>
          }
          <div class="comment-actions">
            <ui-reaction-bar
              [likesCount]="thread.likesCount"
              [dislikesCount]="thread.dislikesCount"
              [userReaction]="thread.userReaction ?? null"
              (react)="onReactToComment(thread.id, $event)" />
            @if (currentUserId()) {
              <button mat-button class="reply-btn" (click)="startReply(thread.id, thread.id)">
                <mat-icon>reply</mat-icon> Reply
              </button>
            }
          </div>
        </div>

        @for (reply of thread.replies; track reply.id) {
          <div class="comment comment-reply">
            <div class="comment-header">
              @if (reply.authorAvatarUrl) {
                <img class="comment-avatar" [src]="reply.authorAvatarUrl" [alt]="reply.authorUsername"
                     (error)="onAvatarError($event)" />
              }
              <strong>{{ reply.authorUsername }}</strong>
              <span class="comment-time">{{ reply.createdAt | date:'short' }}
                @if (reply.updatedAt && reply.updatedAt !== reply.createdAt) {
                  <span class="edited">(edited)</span>
                }
              </span>
              @if (reply.authorId === currentUserId()) {
                <button mat-icon-button [matMenuTriggerFor]="replyMenu" class="comment-menu-btn">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #replyMenu="matMenu">
                  <button mat-menu-item (click)="startEditComment(reply)">
                    <mat-icon>edit</mat-icon> Edit
                  </button>
                  <button mat-menu-item (click)="deleteComment.emit({ commentId: reply.id, postId: reply.postId })">
                    <mat-icon>delete</mat-icon> Delete
                  </button>
                </mat-menu>
              }
            </div>
            @if (editingCommentId() === reply.id) {
              <div class="comment-edit">
                <mat-form-field appearance="outline" class="edit-field">
                  <textarea matInput [(ngModel)]="editCommentContent" rows="2"></textarea>
                </mat-form-field>
                <div class="edit-actions">
                  <button mat-button (click)="cancelEditComment()">Cancel</button>
                  <button mat-flat-button color="primary"
                          [disabled]="!editCommentContent.trim()"
                          (click)="saveEditComment()">Save</button>
                </div>
              </div>
            } @else {
              <p class="comment-content">{{ reply.content }}</p>
            }
            <div class="comment-actions">
              <ui-reaction-bar
                [likesCount]="reply.likesCount"
                [dislikesCount]="reply.dislikesCount"
                [userReaction]="reply.userReaction ?? null"
                (react)="onReactToComment(reply.id, $event)" />
              @if (currentUserId()) {
                <button mat-button class="reply-btn" (click)="startReply(reply.id, thread.id)">
                  <mat-icon>reply</mat-icon> Reply
                </button>
              }
            </div>
          </div>
        }

        @if (replyingToThreadId() === thread.id) {
          <div class="reply-form">
            <mat-form-field appearance="outline" class="reply-field">
              <mat-label>Write a reply…</mat-label>
              <input matInput [(ngModel)]="replyContent" (keydown.enter)="submitReply()" />
            </mat-form-field>
            <div class="reply-actions">
              <button mat-button (click)="cancelReply()">Cancel</button>
              <button mat-icon-button color="primary"
                      [disabled]="!replyContent.trim()"
                      (click)="submitReply()">
                <mat-icon>send</mat-icon>
              </button>
            </div>
          </div>
        }
      }

      @if (!loading() && comments().length === 0) {
        <p class="no-comments">No comments yet.</p>
      }

      @if (currentUserId()) {
        <div class="new-comment">
          <mat-form-field appearance="outline" class="comment-field">
            <mat-label>Write a comment…</mat-label>
            <input matInput [(ngModel)]="newCommentContent"
                   (keydown.enter)="submitComment()" />
          </mat-form-field>
          <button mat-icon-button color="primary"
                  [disabled]="!newCommentContent.trim()"
                  (click)="submitComment()">
            <mat-icon>send</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .comment-section { padding: 8px 16px 0; }
    .loading { display: flex; justify-content: center; padding: 12px; }
    .comment { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .comment-reply {
      margin-left: 24px;
      padding-left: 12px;
      border-left: 2px solid #e0e0e0;
      border-bottom: none;
    }
    .comment-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .comment-header { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .comment-time { color: #999; font-size: 12px; }
    .edited { font-style: italic; }
    .comment-menu-btn { margin-left: auto; transform: scale(0.8); }
    .comment-content { margin: 4px 0 0; font-size: 14px; white-space: pre-wrap; }
    .comment-actions { display: flex; align-items: center; margin-top: 2px; }
    .reply-btn { font-size: 12px; min-width: unset; padding: 0 8px; color: #666; }
    .reply-form {
      margin-left: 24px;
      padding: 4px 0 4px 12px;
      border-left: 2px solid #e0e0e0;
    }
    .reply-field { width: 100%; }
    .reply-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: -8px; }
    .no-comments { text-align: center; color: #999; font-size: 13px; padding: 8px 0; }
    .new-comment { display: flex; align-items: center; gap: 8px; padding-top: 8px; }
    .comment-field { flex: 1; }
    .edit-field { width: 100%; }
    .comment-edit { margin-top: 4px; }
    .edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
  `]
})
export class CommentSectionComponent {
  comments = input<CommentData[]>([]);
  loading = input(false);
  currentUserId = input<string | null>(null);

  addComment = output<AddCommentEvent>();
  editComment = output<EditCommentEvent>();
  deleteComment = output<DeleteCommentEvent>();
  reactToComment = output<CommentReactionEvent>();

  newCommentContent = '';
  replyContent = '';
  editCommentContent = '';
  editingCommentId = signal<string | null>(null);
  replyingToCommentId = signal<string | null>(null);
  replyingToThreadId = signal<string | null>(null);

  protected readonly threadedComments = computed<CommentThread[]>(() => {
    const all = this.comments();
    const byId = new Map(all.map(c => [c.id, c]));
    const topLevel: CommentData[] = [];
    const replyGroups = new Map<string, CommentData[]>();

    for (const c of all) {
      if (!c.parentCommentId) {
        topLevel.push(c);
      } else {
        let rootId = c.parentCommentId;
        let current = byId.get(rootId);
        while (current?.parentCommentId) {
          rootId = current.parentCommentId;
          current = byId.get(rootId);
        }
        const arr = replyGroups.get(rootId) ?? [];
        arr.push(c);
        replyGroups.set(rootId, arr);
      }
    }

    return topLevel.map(c => ({
      ...c,
      replies: (replyGroups.get(c.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    }));
  });

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  submitComment(): void {
    const content = this.newCommentContent.trim();
    if (!content) return;
    this.addComment.emit({ content, parentCommentId: null });
    this.newCommentContent = '';
  }

  startReply(commentId: string, threadId: string): void {
    this.replyingToCommentId.set(commentId);
    this.replyingToThreadId.set(threadId);
    this.replyContent = '';
  }

  cancelReply(): void {
    this.replyingToCommentId.set(null);
    this.replyingToThreadId.set(null);
  }

  submitReply(): void {
    const content = this.replyContent.trim();
    const parentCommentId = this.replyingToCommentId();
    if (!content || !parentCommentId) return;
    this.addComment.emit({ content, parentCommentId });
    this.replyContent = '';
    this.replyingToCommentId.set(null);
    this.replyingToThreadId.set(null);
  }

  onReactToComment(commentId: string, event: ReactionEvent): void {
    this.reactToComment.emit({ commentId, type: event.type, add: event.add });
  }

  startEditComment(comment: CommentData): void {
    this.editingCommentId.set(comment.id);
    this.editCommentContent = comment.content;
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
  }

  saveEditComment(): void {
    const id = this.editingCommentId();
    if (!id || !this.editCommentContent.trim()) return;
    this.editComment.emit({ commentId: id, content: this.editCommentContent.trim() });
    this.editingCommentId.set(null);
  }
}
