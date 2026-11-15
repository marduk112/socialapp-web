import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { FeedPage } from '../models/post.model';
import { ApiClient } from './api-client.service';

/** Private bookmarks of the current user. add/remove are idempotent (204). */
@Injectable({ providedIn: 'root' })
export class BookmarkService {
  private readonly api = inject(ApiClient);

  add(postId: string): Observable<void> {
    return this.api.put<void>(`/posts/${postId}/bookmark`, null);
  }

  remove(postId: string): Observable<void> {
    return this.api.delete<void>(`/posts/${postId}/bookmark`);
  }

  /** Newest bookmarked first; keyset-paginated (nextCursor === null = last page) */
  list(cursor?: string | null, size = 20): Observable<FeedPage> {
    const params: { [param: string]: string | number } = { size };
    if (cursor) params['cursor'] = cursor;
    return this.api.get<FeedPage>('/bookmarks', params);
  }
}
