import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreatePostRequest, UpdatePostRequest, SharePostRequest,
  Post, ReactionType,
  Comment, CreateCommentRequest, UpdateCommentRequest
} from '../models/post.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}`;

  // ── Posts ────────────────────────────────────────────────────────────────
  getFeed(page = 0, size = 20): Observable<Post[]> {
    return this.http.get<Post[]>(`${this.base}/feed`, { params: { page, size } });
  }

  createPost(request: CreatePostRequest): Observable<Post> {
    return this.http.post<Post>(`${this.base}/posts`, request);
  }

  getPost(id: string): Observable<Post> {
    return this.http.get<Post>(`${this.base}/posts/${id}`);
  }

  updatePost(id: string, request: UpdatePostRequest): Observable<Post> {
    return this.http.put<Post>(`${this.base}/posts/${id}`, request);
  }

  deletePost(id: string, requesterId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/posts/${id}`, {
      params: { requesterId }
    });
  }

  sharePost(id: string, request: SharePostRequest): Observable<Post> {
    return this.http.post<Post>(`${this.base}/posts/${id}/share`, request);
  }

  // ── Reactions ────────────────────────────────────────────────────────────
  react(postId: string, userId: string, type: ReactionType, add: boolean): Observable<Post> {
    const endpoint = type === 'LIKE' ? 'like' : 'dislike';
    if (add) {
      return this.http.post<Post>(`${this.base}/posts/${postId}/${endpoint}`, null, {
        params: { userId }
      });
    } else {
      return this.http.delete<Post>(`${this.base}/posts/${postId}/${endpoint}`, {
        params: { userId }
      });
    }
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  getComments(postId: string, page = 0, size = 50): Observable<Comment[]> {
    return this.http.get<Comment[]>(`${this.base}/posts/${postId}/comments`, {
      params: { page, size }
    });
  }

  addComment(postId: string, request: CreateCommentRequest): Observable<Comment> {
    return this.http.post<Comment>(`${this.base}/posts/${postId}/comments`, request);
  }

  updateComment(commentId: string, request: UpdateCommentRequest): Observable<Comment> {
    return this.http.put<Comment>(`${this.base}/comments/${commentId}`, request);
  }

  deleteComment(commentId: string, requesterId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/comments/${commentId}`, {
      params: { requesterId }
    });
  }
}
