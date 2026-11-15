import { PostMention } from '../../shared/utils/rich-text';

export type ReactionType = 'LIKE' | 'DISLIKE';
export type PostType = 'POST' | 'REPOST' | 'QUOTE';

export interface PostMedia {
  id: string;
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface Post {
  id: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  imageUrl?: string;
  /** attached images (immutable after create); missing = [] */
  media?: PostMedia[];
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  originalPostId?: string | null;
  originalAuthorUsername?: string | null;
  originalContent?: string | null;
  /** Missing in old payloads: treat as 'POST' / 0 / false */
  type?: PostType;
  repostsCount?: number;
  quotesCount?: number;
  viewerReposted?: boolean;
  /** viewer-specific; missing (e.g. SSE live posts) = false */
  bookmarked?: boolean;
  originalAuthorId?: string | null;
  /** Full original (one level only, its own `original` is null) for REPOST and QUOTE; null if deleted / plain post */
  original?: Post | null;
  createdAt: string;
  updatedAt?: string;
  userReaction?: ReactionType | null;
  /** normalised lower-case, without '#' */
  hashtags?: string[];
  /** resolved mentions only */
  mentions?: PostMention[];
}

export type FeedScope = 'all' | 'following';

/** Keyset-paginated feed page; nextCursor === null means last page */
export interface FeedPage {
  items: Post[];
  nextCursor: string | null;
}

export interface CreatePostRequest {
  content: string;
  imageUrl?: string;
  /** ids of uploaded media (POST /media), max 4 */
  mediaIds?: string[];
}

export interface UpdatePostRequest {
  content: string;
  imageUrl?: string;
}

export interface QuotePostRequest {
  comment: string;
  mediaIds?: string[];
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  likesCount: number;
  dislikesCount: number;
  userReaction?: ReactionType | null;
  parentCommentId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateCommentRequest {
  content: string;
  parentCommentId?: string | null;
}

export interface UpdateCommentRequest {
  content: string;
}

/** Shape of the SSE new-post event payload */
export interface PostCreatedSseEvent {
  postId: string;
  authorId: string;
  authorUsername: string;
  authorAvatarUrl?: string;
  content: string;
  imageUrl?: string;
  media?: PostMedia[];
  // present when the new post is a repost / quote of another post
  originalPostId?: string | null;
  originalAuthorUsername?: string | null;
  originalContent?: string | null;
  type?: PostType;
  originalAuthorId?: string | null;
  /** nested original (viewerReposted false / userReaction null); id may arrive as `id` or `postId` */
  original?: (Partial<Post> & { postId?: string }) | null;
  hashtags?: string[];
  mentions?: PostMention[];
}
