import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PostMedia } from '../../../core/models/post.model';

interface LightboxData { url: string; alt: string; }

/** Simple lightbox: full-size image, closed by Escape / backdrop click (Material dialog defaults). */
@Component({
  selector: 'ui-media-lightbox',
  standalone: true,
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lightbox" data-testid="media-lightbox">
      <img [src]="data.url" [alt]="data.alt" data-testid="media-lightbox-img" />
    </div>
  `,
  styles: [`
    .lightbox { display: flex; justify-content: center; align-items: center; padding: 8px; }
    img { max-width: 100%; max-height: 80vh; object-fit: contain; }
  `]
})
export class MediaLightboxComponent {
  protected readonly data = inject<LightboxData>(MAT_DIALOG_DATA);
}

/** Responsive image grid of a post: 1 = full width, 2 = side by side, 3-4 = 2x2. */
@Component({
  selector: 'ui-post-media',
  standalone: true,
  imports: [MatDialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (items().length) {
      <div class="grid" data-testid="post-media" [class.compact]="compact()"
           [class.single]="items().length === 1" [attr.data-count]="items().length">
        @for (m of items(); track m.id) {
          <button type="button" class="cell" (click)="open(m)" [attr.aria-label]="alt()">
            <img data-testid="post-media-img" [src]="m.url" [alt]="alt()"
                 [attr.width]="m.width ?? null" [attr.height]="m.height ?? null"
                 loading="lazy" decoding="async" (error)="hide($event)" />
          </button>
        }
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 8px; border-radius: 8px; overflow: hidden; }
    .grid.single { grid-template-columns: 1fr; }
    .cell { padding: 0; border: 0; background: #eee; cursor: zoom-in; display: block; overflow: hidden; height: 200px; }
    .cell img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .single .cell { height: auto; max-height: 400px; }
    .single .cell img { height: auto; max-height: 400px; }
    .compact .cell { height: 100px; }
    .compact.single .cell, .compact.single .cell img { max-height: 180px; }
    .compact.single .cell { height: auto; }
  `]
})
export class PostMediaComponent {
  private readonly dialog = inject(MatDialog);

  media = input<PostMedia[] | null | undefined>([]);
  authorUsername = input<string>('');
  /** quieter / smaller variant for quote embeds */
  compact = input(false);

  protected readonly items = computed(() => (this.media() ?? []).slice(0, 4));
  protected readonly alt = computed(() => `Image attached to ${this.authorUsername()}'s post`);

  protected open(m: PostMedia): void {
    this.dialog.open(MediaLightboxComponent, { data: { url: m.url, alt: this.alt() } satisfies LightboxData, maxWidth: '92vw' });
  }

  protected hide(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }
}
