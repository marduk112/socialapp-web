export type ReactionType = 'LIKE' | 'DISLIKE';

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  content: string;
  imageUrl?: string;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  originalPostId?: string | null;
  originalAuthorUsername?: string | null;
  originalContent?: string | null;
  createdAt: string;
  updatedAt?: string;
  userReaction?: ReactionType | null;
}

export interface CreatePostRequest {
  authorId: string;
  authorUsername: string;
  content: string;
  imageUrl?: string;
}

export interface UpdatePostRequest {
  requesterId: string;
  content: string;
  imageUrl?: string;
}

export interface SharePostRequest {
  authorId: string;
  authorUsername: string;
  comment?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCommentRequest {
  authorId: string;
  authorUsername: string;
  content: string;
}

export interface UpdateCommentRequest {
  requesterId: string;
  content: string;
}

/** Shape of the SSE new-post event payload */
export interface PostCreatedSseEvent {
  postId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  imageUrl?: string;
}
