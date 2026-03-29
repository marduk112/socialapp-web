import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreatePostRequest, UpdatePostRequest, SharePostRequest,
  Post, ReactionType,
  Comment, CreateCommentRequest, UpdateCommentRequest
} from '../models/post.model';
import { ApiClient } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly api = inject(ApiClient);

  // ── Posts ────────────────────────────────────────────────────────────────
  getFeed(page = 0, size = 20): Observable<Post[]> {
    return this.api.get<Post[]>('/feed', { page, size });
  }

  createPost(request: CreatePostRequest): Observable<Post> {
    return this.api.post<Post>('/posts', request);
  }

  getPost(id: string): Observable<Post> {
    return this.api.get<Post>(`/posts/${id}`);
  }

  updatePost(id: string, request: UpdatePostRequest): Observable<Post> {
    return this.api.put<Post>(`/posts/${id}`, request);
  }

  deletePost(id: string, requesterId: string): Observable<void> {
    return this.api.delete<void>(`/posts/${id}`, { params: { requesterId } });
  }

  sharePost(id: string, request: SharePostRequest): Observable<Post> {
    return this.api.post<Post>(`/posts/${id}/share`, request);
  }

  // ── Reactions ────────────────────────────────────────────────────────────
  react(postId: string, userId: string, type: ReactionType, add: boolean): Observable<Post> {
    const endpoint = type === 'LIKE' ? 'like' : 'dislike';
    if (add) {
      return this.api.post<Post>(`/posts/${postId}/${endpoint}`, null, { userId });
    } else {
      return this.api.delete<Post>(`/posts/${postId}/${endpoint}`, { params: { userId } });
    }
  }

  // ── Comments ─────────────────────────────────────────────────────────────
  getComments(postId: string, page = 0, size = 50): Observable<Comment[]> {
    return this.api.get<Comment[]>(`/posts/${postId}/comments`, { page, size });
  }

  addComment(postId: string, request: CreateCommentRequest): Observable<Comment> {
    return this.api.post<Comment>(`/posts/${postId}/comments`, request);
  }

  updateComment(commentId: string, request: UpdateCommentRequest): Observable<Comment> {
    return this.api.put<Comment>(`/comments/${commentId}`, request);
  }

  deleteComment(commentId: string, requesterId: string): Observable<void> {
    return this.api.delete<void>(`/comments/${commentId}`, { params: { requesterId } });
  }

  reactToComment(commentId: string, userId: string, type: ReactionType, add: boolean): Observable<Comment> {
    const endpoint = type === 'LIKE' ? 'like' : 'dislike';
    if (add) {
      return this.api.post<Comment>(`/comments/${commentId}/${endpoint}`, null, { userId });
    } else {
      return this.api.delete<Comment>(`/comments/${commentId}/${endpoint}`, { params: { userId } });
    }
  }
}
