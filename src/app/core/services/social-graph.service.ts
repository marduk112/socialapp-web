import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from './api-client.service';

export interface UserNode {
  userId: string;
  username: string;
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class SocialGraphService {
  private readonly api = inject(ApiClient);

  follow(followerId: string, followeeId: string): Observable<void> {
    return this.api.post<void>('/social/follow', { followerId, followeeId });
  }

  unfollow(followerId: string, followeeId: string): Observable<void> {
    return this.api.delete<void>('/social/follow', { body: { followerId, followeeId } });
  }

  getFollowing(userId: string): Observable<UserNode[]> {
    return this.api.get<UserNode[]>(`/social/${userId}/following`);
  }

  getFollowers(userId: string): Observable<UserNode[]> {
    return this.api.get<UserNode[]>(`/social/${userId}/followers`);
  }

  isFollowing(followerId: string, followeeId: string): Observable<boolean> {
    return this.api.get<boolean>('/social/is-following', { followerId, followeeId });
  }
}
