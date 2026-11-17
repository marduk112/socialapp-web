import { Post } from '../../core/models/post.model';

/** The post the action bar / menus act on: the original inside a REPOST item, otherwise the item itself. */
export function actionTarget(p: Post): Post {
  return p.type === 'REPOST' && p.original ? p.original : p;
}

/** Applies `fn` to every loaded item whose id is `id` and to every nested `original` whose id is `id`. */
export function patchPost(posts: Post[], id: string, fn: (p: Post) => Post): Post[] {
  return posts.map(p => {
    let next = p.id === id ? fn(p) : p;
    const o = next.original;
    if (o && o.id === id) next = { ...next, original: fn(o) };
    return next;
  });
}

/** Removes a deleted post, reposts of it, and detaches it from quotes that embedded it. */
export function removePost(posts: Post[], id: string): Post[] {
  return posts
    .filter(p => p.id !== id && !(p.type === 'REPOST' && p.original?.id === id))
    .map(p => p.type === 'QUOTE' && p.original?.id === id ? { ...p, original: null } : p);
}

/** Puts a freshly created item on top unless an item with the same id is already loaded. */
export function prependUnique(posts: Post[], item: Post): Post[] {
  return posts.some(p => p.id === item.id) ? posts : [item, ...posts];
}
