import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ReactionBarComponent, ReactionEvent, ReactionType } from '../reaction-bar/reaction-bar.component';

export interface PostCardData {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  originalPostId?: string | null;
  originalAuthorUsername?: string | null;
  originalContent?: string | null;
  createdAt: string;
  updatedAt?: string;
  userReaction?: ReactionType | null;
}

export interface PostEditEvent {
  postId: string;
  content: string;
  imageUrl?: string;
}

export interface PostShareEvent {
  postId: string;
  comment: string;
}

@Component({
  selector: 'ui-post-card',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatDividerModule,
    MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, ReactionBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="post-card">
      <!-- Shared post badge -->
      @if (post().originalPostId) {
        <div class="shared-badge">
          <mat-icon>repeat</mat-icon>
          <span>{{ post().authorUsername }} shared a post from {{ post().originalAuthorUsername }}</span>
        </div>
      }

      <mat-card-header>
        @if (post().authorAvatarUrl) {
          <img mat-card-avatar [src]="post().authorAvatarUrl" [alt]="post().authorUsername" />
        }
        <mat-card-title>{{ post().authorUsername }}</mat-card-title>
        <mat-card-subtitle>
          {{ post().createdAt | date:'medium' }}
          @if (post().updatedAt && post().updatedAt !== post().createdAt) {
            <span class="edited-label">(edited)</span>
          }
        </mat-card-subtitle>

        <!-- Owner menu -->
        @if (isOwner()) {
          <button mat-icon-button [matMenuTriggerFor]="postMenu" class="post-menu-btn">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #postMenu="matMenu">
            <button mat-menu-item (click)="startEdit()">
              <mat-icon>edit</mat-icon> Edit
            </button>
            <button mat-menu-item (click)="delete.emit(post().id)" class="delete-item">
              <mat-icon>delete</mat-icon> Delete
            </button>
          </mat-menu>
        }
      </mat-card-header>

      <mat-card-content>
        @if (editing()) {
          <mat-form-field appearance="outline" class="edit-field">
            <mat-label>Edit post</mat-label>
            <textarea matInput [(ngModel)]="editContent" rows="3"></textarea>
          </mat-form-field>
          <div class="edit-actions">
            <button mat-button (click)="cancelEdit()">Cancel</button>
            <button mat-flat-button color="primary"
                    [disabled]="!editContent.trim()"
                    (click)="saveEdit()">Save</button>
          </div>
        } @else {
          @if (post().content) {
            <p class="post-content">{{ post().content }}</p>
          }
          @if (post().originalContent) {
            <blockquote class="original-content">
              <span class="original-author">{{ post().originalAuthorUsername }}</span>
              <p>{{ post().originalContent }}</p>
            </blockquote>
          }
          @if (post().imageUrl) {
            <img class="post-image" [src]="post().imageUrl" alt="Post image" />
          }
        }
      </mat-card-content>

      <mat-divider />

      <mat-card-actions>
        <ui-reaction-bar
          [likesCount]="post().likesCount"
          [dislikesCount]="post().dislikesCount"
          [userReaction]="post().userReaction ?? null"
          (react)="react.emit($event)" />

        <button mat-icon-button matTooltip="Comment"
                (click)="toggleComments.emit(post().id)">
          <mat-icon>comment</mat-icon>
        </button>
        <span class="count">{{ post().commentsCount }}</span>

        <button mat-icon-button matTooltip="Share"
                (click)="onShareClick()">
          <mat-icon>repeat</mat-icon>
        </button>
      </mat-card-actions>

      <!-- Inline share form -->
      @if (showShareForm()) {
        <div class="share-form">
          <mat-form-field appearance="outline" class="share-field">
            <mat-label>Add a comment (optional)</mat-label>
            <input matInput [(ngModel)]="shareComment" />
          </mat-form-field>
          <div class="share-actions">
            <button mat-button (click)="showShareForm.set(false)">Cancel</button>
            <button mat-flat-button color="primary" (click)="confirmShare()">Share</button>
          </div>
        </div>
      }
    </mat-card>
  `,
  styles: [`
    .post-card { margin-bottom: 16px; }
    .post-content { white-space: pre-wrap; font-size: 15px; line-height: 1.5; }
    .post-image { width: 100%; border-radius: 4px; margin-top: 8px; max-height: 400px; object-fit: cover; }
    .shared-badge {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 16px; color: #666; font-size: 13px;
      border-bottom: 1px solid #eee;
    }
    .shared-badge mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .edited-label { font-style: italic; color: #999; }
    .post-menu-btn { margin-left: auto; }
    .edit-field, .share-field { width: 100%; }
    .edit-actions, .share-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
    .share-form { padding: 0 16px 8px; }
    .original-content {
      margin: 8px 0 0;
      padding: 10px 14px;
      border-left: 3px solid #ddd;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .original-content .original-author { font-weight: 600; font-size: 13px; color: #555; display: block; margin-bottom: 4px; }
    .original-content p { margin: 0; font-size: 14px; color: #333; white-space: pre-wrap; }
    .delete-item { color: #d32f2f; }
    mat-card-actions { display: flex; align-items: center; gap: 4px; }
    .count { font-size: 13px; color: #666; }
  `]
})
export class PostCardComponent {
  post = input.required<PostCardData>();
  currentUserId = input<string | null>(null);
  react = output<ReactionEvent>();
  edit = output<PostEditEvent>();
  delete = output<string>();
  share = output<PostShareEvent>();
  toggleComments = output<string>();

  editing = signal(false);
  editContent = '';
  showShareForm = signal(false);
  shareComment = '';

  isOwner() {
    const userId = this.currentUserId();
    return userId != null && userId === this.post().authorId;
  }

  startEdit(): void {
    this.editContent = this.post().content;
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    if (!this.editContent.trim()) return;
    this.edit.emit({
      postId: this.post().id,
      content: this.editContent.trim(),
      imageUrl: this.post().imageUrl,
    });
    this.editing.set(false);
  }

  onShareClick(): void {
    this.shareComment = '';
    this.showShareForm.update(v => !v);
  }

  confirmShare(): void {
    this.share.emit({
      postId: this.post().id,
      comment: this.shareComment.trim(),
    });
    this.showShareForm.set(false);
    this.shareComment = '';
  }
}
