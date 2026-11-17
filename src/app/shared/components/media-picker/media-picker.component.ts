import { ChangeDetectionStrategy, Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MEDIA_ALLOWED_TYPES, MEDIA_MAX_PER_POST, MediaService, uploadErrorMessage } from '../../../core/services/media.service';

interface PickedItem {
  key: number;
  name: string;
  preview: string;
  state: 'uploading' | 'ready' | 'failed';
  mediaId?: string;
  error?: string;
}

/**
 * Image attachments of a composer: uploads each file immediately and previews it. The owner reads
 * `readyIds()` / `blocked()` (via a template ref or viewChild) and calls `clear()` after a successful submit.
 */
@Component({
  selector: 'ui-media-picker',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="picker">
      <input #fileInput type="file" hidden multiple data-testid="media-input"
             [attr.accept]="accept" (change)="onFiles(fileInput)" />
      <button type="button" mat-stroked-button data-testid="media-add-btn"
              [disabled]="items().length >= max" (click)="fileInput.click()">
        <mat-icon>image</mat-icon> Add image
      </button>
      @if (error()) {
        <span class="error" role="alert" data-testid="media-error">{{ error() }}</span>
      }
    </div>
    @if (items().length) {
      <div class="previews">
        @for (it of items(); track it.key) {
          <div class="item" data-testid="media-preview" [attr.data-state]="it.state" [title]="it.error ?? it.name">
            <img [src]="it.preview" [alt]="it.name" (error)="hide($event)" />
            @if (it.state === 'uploading') {
              <mat-spinner class="overlay" diameter="24" />
            } @else if (it.state === 'failed') {
              <span class="overlay failed" data-testid="media-failed">{{ it.error }}</span>
            }
            <button type="button" mat-mini-fab class="remove" aria-label="Remove image"
                    data-testid="media-remove" (click)="remove(it.key)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .picker { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .error { color: #d32f2f; font-size: 13px; }
    .previews { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .item { position: relative; width: 96px; height: 96px; border-radius: 6px; overflow: hidden; background: #eee; }
    .item img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .item[data-state="uploading"] img { opacity: .5; }
    .item[data-state="failed"] img { opacity: .3; }
    .overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
    .failed { color: #d32f2f; font-size: 11px; text-align: center; width: 88px; font-weight: 600; }
    .remove { position: absolute; top: 2px; right: 2px; width: 24px; height: 24px; line-height: 24px; --mat-fab-small-container-shape: 50%; }
    .remove mat-icon { font-size: 16px; width: 16px; height: 16px; }
  `]
})
export class MediaPickerComponent implements OnDestroy {
  private readonly media = inject(MediaService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly accept = MEDIA_ALLOWED_TYPES.join(',');
  protected readonly max = MEDIA_MAX_PER_POST;

  protected readonly items = signal<PickedItem[]>([]);
  protected readonly error = signal<string | null>(null);
  private readonly subs = new Map<number, Subscription>();
  private nextKey = 0;

  /** Media ids of the successfully uploaded items, in order. */
  readonly readyIds = computed(() =>
    this.items().filter(i => i.state === 'ready' && i.mediaId).map(i => i.mediaId!));
  /** True while an upload is in flight or a failed item has not been removed: the owner must disable submit. */
  readonly blocked = computed(() => this.items().some(i => i.state !== 'ready'));

  protected onFiles(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow picking the same file again
    let message: string | null = null;
    for (const file of files) {
      if (this.items().length >= this.max) {
        message = `You can attach up to ${this.max} images.`;
        break;
      }
      const invalid = this.media.validate(file);
      if (invalid) {
        message = invalid;
        continue;
      }
      this.start(file);
    }
    this.error.set(message);
  }

  private start(file: File): void {
    const key = this.nextKey++;
    this.items.update(list => [...list, {
      key, name: file.name, preview: URL.createObjectURL(file), state: 'uploading',
    }]);
    const sub = this.media.upload(file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: m => this.patch(key, { state: 'ready', mediaId: m.id }),
      error: (e: HttpErrorResponse) => this.patch(key, { state: 'failed', error: uploadErrorMessage(e.status) }),
    });
    this.subs.set(key, sub);
  }

  private patch(key: number, change: Partial<PickedItem>): void {
    this.subs.delete(key);
    this.items.update(list => list.map(i => i.key === key ? { ...i, ...change } : i));
  }

  protected remove(key: number): void {
    this.subs.get(key)?.unsubscribe();
    this.subs.delete(key);
    const item = this.items().find(i => i.key === key);
    if (item) URL.revokeObjectURL(item.preview);
    this.items.update(list => list.filter(i => i.key !== key));
    this.error.set(null);
  }

  /** Drops every item (call after the post was created). */
  clear(): void {
    this.subs.forEach(s => s.unsubscribe());
    this.subs.clear();
    this.items().forEach(i => URL.revokeObjectURL(i.preview));
    this.items.set([]);
    this.error.set(null);
  }

  protected hide(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  ngOnDestroy(): void {
    this.items().forEach(i => URL.revokeObjectURL(i.preview));
  }
}
