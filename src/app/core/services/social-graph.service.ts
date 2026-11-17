import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client.service';

export interface UserNode {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export interface FollowSuggestion extends UserNode {
  /** Followees of the viewer who follow this user; 0 = popularity-based suggestion. */
  mutualFollowers: number;
}

@Injectable({ providedIn: 'root' })
export class SocialGraphService {
  private readonly api = inject(ApiClient);

  follow(followeeId: string): Observable<void> {
    return this.api.post<void>('/social/follow', { followeeId });
  }

  unfollow(followeeId: string): Observable<void> {
    return this.api.delete<void>('/social/follow', { body: { followeeId } });
  }

  getFollowing(userId: string): Observable<UserNode[]> {
    return this.api.get<UserNode[]>(`/social/${userId}/following`);
  }

  getFollowers(userId: string): Observable<UserNode[]> {
    return this.api.get<UserNode[]>(`/social/${userId}/followers`);
  }

  isFollowing(followeeId: string): Observable<boolean> {
    return this.api.get<boolean>('/social/is-following', { followeeId });
  }

  getSuggestions(limit = 5): Observable<FollowSuggestion[]> {
    return this.api.get<FollowSuggestion[]>('/social/suggestions', { limit });
  }
}
