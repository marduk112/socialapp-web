import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PostMedia } from '../models/post.model';
import { ApiClient } from './api-client.service';

export const MEDIA_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_MAX_PER_POST = 4;

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly api = inject(ApiClient);

  /** Client-side pre-check; returns a friendly message or null when the file may be uploaded. */
  validate(file: File): string | null {
    if (!MEDIA_ALLOWED_TYPES.includes(file.type)) {
      return `"${file.name}" is not a supported image (use JPEG, PNG, GIF or WebP).`;
    }
    if (file.size === 0) return `"${file.name}" is empty.`;
    if (file.size > MEDIA_MAX_BYTES) return `"${file.name}" is larger than 5 MB.`;
    return null;
  }

  /** POST /media (multipart field `file`) -> 201 { id, url, width, height } */
  upload(file: File): Observable<PostMedia> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.api.post<PostMedia>('/media', form);
  }
}

/** Friendly text for a failed upload HTTP status. */
export function uploadErrorMessage(status: number): string {
  switch (status) {
    case 400: return 'Upload rejected (empty file or too many pending uploads).';
    case 413: return 'Image is too large (max 5 MB).';
    case 415: return 'Not a supported image (use JPEG, PNG, GIF or WebP).';
    case 429: return 'Too many uploads, try again later.';
    default: return 'Upload failed.';
  }
}
