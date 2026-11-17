import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client.service';

export interface TrendingHashtag {
  /** normalised: lower-case, no '#' */
  tag: string;
  posts: number;
  authors: number;
}

@Injectable({ providedIn: 'root' })
export class TrendsService {
  private readonly api = inject(ApiClient);

  /** Hashtags used in the last `hours` hours, most used first. */
  getTrendingHashtags(hours = 24, limit = 10): Observable<TrendingHashtag[]> {
    return this.api.get<TrendingHashtag[]>('/trends/hashtags', { hours, limit });
  }
}
