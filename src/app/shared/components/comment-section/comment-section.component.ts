import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface CommentData {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AddCommentEvent {
  postId: string;
  content: string;
}

export interface EditCommentEvent {
  commentId: string;
  content: string;
}

export interface DeleteCommentEvent {
  commentId: string;
  postId: string;
}

@Component({
  selector: 'ui-comment-section',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatMenuModule, MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="comment-section">
      @if (loading()) {
        <div class="loading">
          <mat-spinner diameter="24" />
        </div>
      }

      @for (comment of comments(); track comment.id) {
        <div class="comment">
          <div class="comment-header">
            <strong>{{ comment.authorUsername }}</strong>
            <span class="comment-time">{{ comment.createdAt | date:'short' }}
              @if (comment.updatedAt && comment.updatedAt !== comment.createdAt) {
                <span class="edited">(edited)</span>
              }
            </span>
            @if (comment.authorId === currentUserId()) {
              <button mat-icon-button [matMenuTriggerFor]="commentMenu" class="comment-menu-btn">
                <mat-icon>more_vert</mat-icon>
              </button>
              <mat-menu #commentMenu="matMenu">
                <button mat-menu-item (click)="startEditComment(comment)">
                  <mat-icon>edit</mat-icon> Edit
                </button>
                <button mat-menu-item (click)="deleteComment.emit({ commentId: comment.id, postId: comment.postId })">
                  <mat-icon>delete</mat-icon> Delete
                </button>
              </mat-menu>
            }
          </div>
          @if (editingCommentId() === comment.id) {
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
            <p class="comment-content">{{ comment.content }}</p>
          }
        </div>
      }

      @if (!loading() && comments().length === 0) {
        <p class="no-comments">No comments yet.</p>
      }

      <!-- New comment form -->
      @if (currentUserId()) {
        <div class="new-comment">
          <mat-form-field appearance="outline" class="comment-field">
            <mat-label>Write a comment...</mat-label>
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
    .comment:last-of-type { border-bottom: none; }
    .comment-header { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .comment-time { color: #999; font-size: 12px; }
    .edited { font-style: italic; }
    .comment-menu-btn { margin-left: auto; transform: scale(0.8); }
    .comment-content { margin: 4px 0 0; font-size: 14px; white-space: pre-wrap; }
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

  newCommentContent = '';
  editCommentContent = '';
  editingCommentId = signal<string | null>(null);

  submitComment(): void {
    const content = this.newCommentContent.trim();
    if (!content) return;
    this.addComment.emit({ postId: '', content });
    this.newCommentContent = '';
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
