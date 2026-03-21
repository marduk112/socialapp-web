import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserNode {
  userId: string;
  username: string;
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class SocialGraphService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/social`;

  follow(followerId: string, followeeId: string): Observable<void> {
    return this.http.post<void>(`${this.base}/follow`, { followerId, followeeId });
  }

  unfollow(followerId: string, followeeId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/follow`, {
      body: { followerId, followeeId }
    });
  }

  getFollowing(userId: string): Observable<UserNode[]> {
    return this.http.get<UserNode[]>(`${this.base}/${userId}/following`);
  }

  getFollowers(userId: string): Observable<UserNode[]> {
    return this.http.get<UserNode[]>(`${this.base}/${userId}/followers`);
  }

  isFollowing(followerId: string, followeeId: string): Observable<boolean> {
    return this.http.get<boolean>(`${this.base}/is-following`, {
      params: { followerId, followeeId }
    });
  }
}
