import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RichTextComponent } from '../rich-text/rich-text.component';
import { CharCounterComponent } from '../char-counter/char-counter.component';
import { PostMention } from '../../utils/rich-text';
import { isValidPostText } from '../../utils/post-limit';
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
  type?: 'POST' | 'REPOST' | 'QUOTE';
  repostsCount?: number;
  quotesCount?: number;
  viewerReposted?: boolean;
  original?: PostCardData | null;
  createdAt: string;
  updatedAt?: string;
  userReaction?: ReactionType | null;
  hashtags?: string[];
  mentions?: PostMention[];
}

export interface PostEditEvent {
  postId: string;
  content: string;
  imageUrl?: string;
}

export interface PostQuoteEvent {
  postId: string;
  comment: string;
  /** The handler MUST call this when the request settles: true closes + clears the composer, false keeps the text for a retry. */
  done: (success: boolean) => void;
}

@Component({
  selector: 'ui-post-card',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink, MatCardModule, MatDividerModule,
    MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule,
    MatFormFieldModule, MatInputModule, ReactionBarComponent, RichTextComponent, CharCounterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-card class="post-card">
      @if (!isBrokenRepost()) {
      @let t = target();
      <!-- Repost banner: the card below is the FULL original -->
      @if (isRepost()) {
        <div class="shared-badge" data-testid="repost-banner">
          <mat-icon>repeat</mat-icon>
          <span>{{ post().authorUsername }} reposted</span>
        </div>
      }

      <mat-card-header>
        @if (t.authorAvatarUrl) {
          <img mat-card-avatar [src]="t.authorAvatarUrl" [alt]="t.authorUsername"
               (error)="onAvatarError($event)"
               class="author-link" (click)="goToAuthor()" />
        }
        <mat-card-title class="author-link" (click)="goToAuthor()">{{ t.authorUsername }}</mat-card-title>
        <mat-card-subtitle>
          {{ t.createdAt | date:'medium' }}
          @if (t.updatedAt && t.updatedAt !== t.createdAt) {
            <span class="edited-label">(edited)</span>
          }
        </mat-card-subtitle>

        <!-- Owner menu -->
        @if (isOwner()) {
          <button mat-icon-button [matMenuTriggerFor]="postMenu" class="post-menu-btn" data-testid="post-menu">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #postMenu="matMenu">
            <button mat-menu-item (click)="startEdit()">
              <mat-icon>edit</mat-icon> Edit
            </button>
            <button mat-menu-item (click)="delete.emit(t.id)" class="delete-item">
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
          <ui-char-counter data-testid="edit-counter" [text]="editContent" />
          <div class="edit-actions">
            <button mat-button (click)="cancelEdit()">Cancel</button>
            <button mat-flat-button color="primary"
                    [disabled]="!isValidPostText(editContent)"
                    (click)="saveEdit()">Save</button>
          </div>
        } @else {
          @if (t.content) {
            <p class="post-content"><ui-rich-text [text]="t.content" [mentions]="t.mentions" [hashtags]="t.hashtags ?? []" /></p>
          }
          @if (t.type === 'QUOTE') {
            @if (t.original; as o) {
              <div class="quote-embed" data-testid="quote-embed">
                <div class="quote-author">
                  @if (o.authorAvatarUrl) {
                    <img class="quote-avatar" [src]="o.authorAvatarUrl" [alt]="o.authorUsername"
                         (error)="onAvatarError($event)" />
                  }
                  <a class="quote-author-name" [routerLink]="['/users', o.authorId]">{{ o.authorUsername }}</a>
                </div>
                <p class="quote-text"><ui-rich-text [text]="o.content" [mentions]="o.mentions" [hashtags]="null" /></p>
              </div>
            } @else {
              <div class="quote-embed quote-unavailable" data-testid="quote-unavailable">Original post unavailable</div>
            }
          }
          @if (t.imageUrl) {
            <img class="post-image" [src]="t.imageUrl" alt="Post image" />
          }
        }
      </mat-card-content>

      <mat-divider />

      <mat-card-actions>
        <ui-reaction-bar
          [likesCount]="t.likesCount"
          [dislikesCount]="t.dislikesCount"
          [userReaction]="t.userReaction ?? null"
          (react)="react.emit($event)" />

        <button mat-icon-button matTooltip="Comment" data-testid="post-comment-toggle"
                (click)="toggleComments.emit(t.id)">
          <mat-icon>comment</mat-icon>
        </button>
        <span class="count" data-testid="comment-count">{{ t.commentsCount }}</span>

        <button mat-icon-button [matMenuTriggerFor]="repostMenu" data-testid="repost-btn"
                [class.reposted]="t.viewerReposted"
                [matTooltip]="repostTooltip()">
          <mat-icon>repeat</mat-icon>
        </button>
        <span class="count" data-testid="repost-count">{{ t.repostsCount ?? 0 }}</span>
        @if ((t.quotesCount ?? 0) > 0) {
          <mat-icon class="quote-count-icon">format_quote</mat-icon>
          <span class="count" data-testid="quote-count">{{ t.quotesCount }}</span>
        }
        <mat-menu #repostMenu="matMenu">
          @if (t.viewerReposted) {
            <button mat-menu-item data-testid="undo-repost-action" (click)="undoRepost.emit(t.id)">
              <mat-icon>undo</mat-icon> Undo repost
            </button>
          } @else {
            <button mat-menu-item data-testid="repost-action" (click)="repost.emit(t.id)">
              <mat-icon>repeat</mat-icon> Repost
            </button>
          }
          <button mat-menu-item data-testid="quote-action" (click)="startQuote()">
            <mat-icon>format_quote</mat-icon> Quote
          </button>
        </mat-menu>
      </mat-card-actions>

      <!-- Inline quote composer -->
      @if (showQuoteForm()) {
        <div class="quote-form">
          <mat-form-field appearance="outline" class="quote-field">
            <mat-label>Add your comment</mat-label>
            <input matInput data-testid="quote-input" [(ngModel)]="quoteComment" />
          </mat-form-field>
          <ui-char-counter data-testid="quote-counter" [text]="quoteComment" />
          <div class="quote-actions">
            <button mat-button (click)="showQuoteForm.set(false)">Cancel</button>
            <button mat-flat-button color="primary" data-testid="quote-submit"
                    [disabled]="quoting() || !isValidPostText(quoteComment)" (click)="confirmQuote()">Quote</button>
          </div>
        </div>
      }
      }
    </mat-card>
  `,
  styles: [`
    .post-card { margin-bottom: 16px; }
    .author-link { cursor: pointer; }
    .author-link:hover { text-decoration: underline; }
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
    .edit-field, .quote-field { width: 100%; }
    .edit-actions, .quote-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 8px; }
    .quote-form { padding: 0 16px 8px; }
    .quote-embed {
      margin: 8px 0 0; padding: 10px 14px;
      border: 1px solid #e3e3e3; border-radius: 8px; background: #fafafa;
    }
    .quote-author { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .quote-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }
    .quote-author-name { font-weight: 600; font-size: 13px; color: #555; text-decoration: none; }
    .quote-author-name:hover { text-decoration: underline; }
    .quote-text { margin: 0; font-size: 14px; color: #444; white-space: pre-wrap; }
    .quote-unavailable { color: #888; font-style: italic; font-size: 14px; }
    .reposted { color: #3f51b5; }
    .quote-count-icon { font-size: 18px; width: 18px; height: 18px; color: #666; }
    .delete-item { color: #d32f2f; }
    mat-card-actions { display: flex; align-items: center; gap: 4px; }
    .count { font-size: 13px; color: #666; }
  `]
})
export class PostCardComponent {
  private readonly router = inject(Router);

  post = input.required<PostCardData>();
  currentUserId = input<string | null>(null);
  react = output<ReactionEvent>();
  edit = output<PostEditEvent>();
  delete = output<string>();
  /** all of these carry / act on the ORIGINAL post id for a REPOST item */
  repost = output<string>();
  undoRepost = output<string>();
  quote = output<PostQuoteEvent>();
  toggleComments = output<string>();

  /** The post the card shows and acts on: the original inside a REPOST, otherwise the item itself. */
  protected readonly isRepost = computed(() => this.post().type === 'REPOST');
  protected readonly isBrokenRepost = computed(() => this.isRepost() && !this.post().original);
  protected readonly target = computed<PostCardData>(() =>
    this.isRepost() && this.post().original ? this.post().original! : this.post());
  protected readonly repostTooltip = computed(() => {
    const t = this.target();
    const quotes = t.quotesCount ?? 0;
    return `Repost (${t.repostsCount ?? 0} reposts, ${quotes} quotes)`;
  });

  editing = signal(false);
  editContent = '';
  showQuoteForm = signal(false);
  quoteComment = '';
  /** quote request in flight: the composer stays open and submit is disabled */
  quoting = signal(false);

  protected readonly isValidPostText = isValidPostText;

  goToAuthor(): void {
    this.router.navigate(['/users', this.target().authorId]);
  }

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  isOwner() {
    const userId = this.currentUserId();
    return userId != null && userId === this.target().authorId;
  }

  startEdit(): void {
    this.editContent = this.target().content;
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    if (!isValidPostText(this.editContent)) return;
    this.edit.emit({
      postId: this.target().id,
      content: this.editContent.trim(),
      imageUrl: this.target().imageUrl,
    });
    this.editing.set(false);
  }

  startQuote(): void {
    this.quoteComment = '';
    this.quoting.set(false);
    this.showQuoteForm.set(true);
  }

  confirmQuote(): void {
    if (this.quoting() || !isValidPostText(this.quoteComment)) return;
    this.quoting.set(true);
    this.quote.emit({
      postId: this.target().id,
      comment: this.quoteComment.trim(),
      done: success => {
        this.quoting.set(false);
        if (success) {
          this.showQuoteForm.set(false);
          this.quoteComment = '';
        }
      },
    });
  }
}
