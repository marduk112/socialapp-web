import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreatePostRequest, UpdatePostRequest, QuotePostRequest,
  Post, FeedPage, FeedScope, ReactionType,
  Comment, CreateCommentRequest, UpdateCommentRequest
} from '../models/post.model';
import { ApiClient } from './api-client.service';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly api = inject(ApiClient);

  // ── Posts ────────────────────────────────────────────────────────────────
  getFeed(scope: FeedScope = 'all', cursor?: string | null, size = 20): Observable<FeedPage> {
    const params: { [param: string]: string | number } = { scope, size };
    if (cursor) params['cursor'] = cursor;
    return this.api.get<FeedPage>('/feed', params);
  }

  getHashtagPosts(tag: string, cursor?: string | null, size = 20): Observable<FeedPage> {
    const params: { [param: string]: string | number } = { size };
    if (cursor) params['cursor'] = cursor;
    return this.api.get<FeedPage>(`/hashtags/${encodeURIComponent(tag)}/posts`, params);
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

  deletePost(id: string): Observable<void> {
    return this.api.delete<void>(`/posts/${id}`);
  }

  /** 201 with the new REPOST item, or 200 with the existing one if already reposted */
  repost(id: string): Observable<Post> {
    return this.api.post<Post>(`/posts/${id}/repost`, null);
  }

  /** id = the ORIGINAL post id */
  undoRepost(id: string): Observable<void> {
    return this.api.delete<void>(`/posts/${id}/repost`);
  }

  quote(id: string, request: QuotePostRequest): Observable<Post> {
    return this.api.post<Post>(`/posts/${id}/quote`, request);
  }

  // ── Reactions ────────────────────────────────────────────────────────────
  react(postId: string, type: ReactionType, add: boolean): Observable<Post> {
    const endpoint = type === 'LIKE' ? 'like' : 'dislike';
    if (add) {
      return this.api.post<Post>(`/posts/${postId}/${endpoint}`, null);
    } else {
      return this.api.delete<Post>(`/posts/${postId}/${endpoint}`);
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

  deleteComment(commentId: string): Observable<void> {
    return this.api.delete<void>(`/comments/${commentId}`);
  }

  reactToComment(commentId: string, type: ReactionType, add: boolean): Observable<Comment> {
    const endpoint = type === 'LIKE' ? 'like' : 'dislike';
    if (add) {
      return this.api.post<Comment>(`/comments/${commentId}/${endpoint}`, null);
    } else {
      return this.api.delete<Comment>(`/comments/${commentId}/${endpoint}`);
    }
  }
}
