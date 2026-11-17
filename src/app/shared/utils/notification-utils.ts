import { Notification } from '../../core/models/notification.model';

/** Human sentence (without the actor name) for a notification. */
export function notificationText(n: Notification): string {
  switch (n.type) {
    case 'FOLLOW': return 'started following you';
    case 'LIKE': return n.commentId ? 'liked your comment' : 'liked your post';
    case 'COMMENT': return 'commented on your post';
    case 'REPLY': return 'replied to your comment';
    case 'MENTION': return 'mentioned you in a post';
    case 'REPOST': return 'reposted your post';
    case 'QUOTE': return 'quoted your post';
  }
}

/** Router commands a notification leads to: posts open /posts/:id, everything else the actor's profile. */
export function notificationLink(n: Notification): string[] {
  if (n.type !== 'FOLLOW' && n.postId) return ['/posts', n.postId];
  return ['/users', n.actorId];
}

/** Live items first (those already persisted are dropped), then the persisted ones. */
export function mergeNotifications(live: Notification[], persisted: Notification[]): Notification[] {
  const ids = new Set(persisted.map(n => n.id));
  return [...live.filter(n => !ids.has(n.id)), ...persisted];
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
