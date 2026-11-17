import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client.service';
import { FeedPage } from '../models/post.model';

/** Public profile data only (no e-mail). */
export interface UserSearchResult {
  id: string;
  username: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly api = inject(ApiClient);

  /** Full-text search over post text, newest first (keyset-paginated like the feed). */
  searchPosts(q: string, cursor?: string | null, size = 20): Observable<FeedPage> {
    const params: { [param: string]: string | number } = { q, size };
    if (cursor) params['cursor'] = cursor;
    return this.api.get<FeedPage>('/search/posts', params);
  }

  /** People by username (case-insensitive substring), exact match first, then prefix. */
  searchUsers(q: string, limit = 10): Observable<UserSearchResult[]> {
    return this.api.get<UserSearchResult[]>('/search/users', { q, limit });
  }
}
