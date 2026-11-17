export type NotificationType = 'FOLLOW' | 'LIKE' | 'COMMENT' | 'REPLY' | 'MENTION' | 'REPOST' | 'QUOTE';

export interface Notification {
  id: string;
  type: NotificationType;
  actorId: string;
  actorUsername: string;
  actorAvatarUrl: string | null;
  /** The post to open (for comment/reply/like-on-comment: the post the comment belongs to); null for FOLLOW */
  postId: string | null;
  commentId: string | null;
  snippet: string | null;
  read: boolean;
  createdAt: string;
}

/** Keyset-paginated page, newest first; nextCursor === null means last page */
export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
}
