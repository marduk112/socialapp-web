# Frontend — LLM Instructions

Angular 22, standalone components, Angular Material 22, TypeScript 6.0.

Dev server: `localhost:4200` | Backend API: `localhost:8080`

## App structure

```
src/app/
├── core/
│   ├── guards/        auth.guard.ts
│   ├── models/        user.model.ts, post.model.ts
│   └── services/
│       ├── current-user.service.ts   # Signal-based, localStorage persistence
│       ├── feed-sse.service.ts        # Signal-based + native EventSource
│       ├── post.service.ts            # HttpClient wrapper
│       ├── user.service.ts
│       └── social-graph.service.ts
├── features/
│   ├── auth/          login.component.ts, create-profile.component.ts
│   ├── feed/          feed.component.ts
│   └── user-profile/  user-profile.component.ts
├── shared/components/
│   ├── comment-section/
│   ├── follow-button/
│   ├── post-card/
│   ├── reaction-bar/
│   └── user-card/
├── app.config.ts
├── app.routes.ts
└── app.component.ts
```

## Angular Signals — rules

- `FeedComponent` and `UserProfileComponent` use Signals exclusively for state.
- **No RxJS** for component-level state management. Use `signal()` / `computed()` / `effect()`.
- RxJS (`Observable`) is acceptable only in service HTTP calls (HttpClient).
- `ChangeDetectionStrategy.OnPush` on feature components — signals handle change detection.

### FeedComponent key signals

```typescript
private _posts = signal<Post[]>([])
loading = signal(false)
allPosts = computed(() => {
  const live = feedSseService.livePosts()      // real-time from SSE
  const persisted = _posts()                   // from HTTP /feed
  const persistedIds = new Set(persisted.map(p => p.id))
  return [...live.filter(p => !persistedIds.has(p.id)), ...persisted]
})
```

**Never break this merge logic** — it prevents duplicate posts when SSE delivers a post that also appears in the paginated response.

### Timeline scopes and pagination

- Two tabs: **"For you"** (`scope=all`, default) and **"Following"** (`scope=following` = followed users + own posts).
- `PostService.getFeed(scope, cursor?, size=20)` → `FeedPage { items, nextCursor }` (keyset pagination; `nextCursor === null`
  = last page). "Load more" appends the next page, filtering ids already shown.
- `setScope()` resets list/cursor, calls `FeedSseService.reconnect(scope)` and reloads. `loadGeneration` makes responses that
  arrive after a scope switch get ignored — `loadFeed()` must therefore also reset `loadingMore`.
- Follows reach the Feed projection asynchronously (Kafka + outbox, ~0.3–1 s), so a just-made follow is not instantly
  reflected in the Following timeline.

## SSE (Server-Sent Events)

`FeedSseService` connects to `GET /api/v1/feed/stream?access_token=<jwt>&scope=all|following`
(`connect(scope)`, `reconnect(scope)` = disconnect + clear live posts + connect). The token is a query param because
`EventSource` cannot send headers; the server filters by scope.

SSE event names (must match backend exactly):
- `"connected"` — heartbeat on subscribe
- `"new-post"` — new post payload (`PostCreatedSseEvent`)

The app is **zoneless** (`provideZonelessChangeDetection()` in `app.config.ts`, no `zone.js` dependency or polyfill): change detection is driven by signals, bound listeners and `markForCheck`, so a callback only updates the UI if it sets a signal (or marks the view). All state here is signals; never mutate a plain field in an async callback and expect a refresh. The `ngZone.run(...)` wrappers around SSE callbacks and `router.navigate` are kept (harmless and compatible with zoneless per angular.dev); new code does not need them.

```typescript
this.eventSource.addEventListener('new-post', (e) => {
  this.ngZone.run(() => {
    const event = JSON.parse(e.data) as PostCreatedSseEvent
    this._livePosts.update(posts => [event as Post, ...posts])
  })
})
```

## Authentication flow

1. `UserService.login()` → POST `/api/v1/users/login`
2. Response: `User` object
3. `CurrentUserService.setUser(user)` → persists to `localStorage`
4. `Router.navigate(['/feed'])` — **must be called explicitly**, do not rely on guards alone

`CurrentUserService`:
```typescript
user = signal<User | null>(...)  // readonly
setUser(u): void    // saves to localStorage
clearUser(): void   // clears localStorage, called on logout
```

## Angular injection context (NG0203)

**Never call `inject()` outside of constructor, field initializer, or factory function.**

This applies to Angular Material services (e.g. `_HighContrastModeDetector`). If you see NG0203, the likely cause is injecting a service inside `ngOnInit`, `ngAfterViewInit`, or inside a callback/timer.

Correct:
```typescript
class MyComponent {
  private router = inject(Router)           // field initializer — OK
  constructor(private svc: MyService) {}    // constructor — OK
}
```

Wrong:
```typescript
ngOnInit() {
  this.svc = inject(MyService)  // NOT OK — outside injection context
}
```

## Post limit and rich text

- Post / edit / share-comment content is limited to 500 Unicode code points (`shared/utils/post-limit.ts`, counted via
  `[...text].length`, not `.length`). `ui-char-counter` shows `n/500` (warn >450, error >500, host `data-state`);
  buttons are disabled when empty/over limit; pasted text is never truncated.
- `ui-rich-text` + `shared/utils/rich-text.ts` (`tokenizeRichText`) render `#hashtag` -> `/tags/:tag` (lower-cased) and
  `@name` -> `/users/:id` (only if `name` is in the post's `mentions`). Never `[innerHTML]`. Rules must match the backend:
  hashtag `#[\p{L}\p{N}_]{1,50}` not preceded by `[\p{L}\p{N}_&/]` and containing a letter; mention
  `@[\p{L}\p{N}_.-]{3,30}` (trailing `.`/`-` trimmed) not preceded by `[\p{L}\p{N}_.@-]`.
## Reposts and quotes

- `Post` has `type` (`POST|REPOST|QUOTE`), `repostsCount`, `quotesCount`, `viewerReposted`, `original` (one level; all optional,
  fall back to `POST`/0/false). `PostService.repost/undoRepost/quote` (the old `share` is gone); `undoRepost(id)` takes the ORIGINAL id.
- `ui-post-card`: `REPOST` = banner "<reposter> reposted" + the FULL card of `original` (reactions, counts, menus, comments all act
  on the original, via `actionTarget()` in `shared/utils/post-state.ts`); `QUOTE` = quote text + quieter embedded card of `original`
  (or "Original post unavailable"); a REPOST without `original` renders nothing. Repost menu: Repost/Undo repost + Quote (inline
  composer, required, `ui-char-counter`, submit disabled when blank/over 500).
- Feed/tag state updates go through `patchPost` / `removePost` / `prependUnique` (update every item whose id or `original.id` matches;
  new items are deduped by id against the SSE copy; `allPosts` merge unchanged). Repost/undo requests are guarded per original id.
- SSE `new-post` carries `type`, `originalAuthorId`, nested `original` (mapped in `FeedSseService`).
- Test ids: `repost-btn`, `repost-action`, `undo-repost-action`, `quote-action`, `quote-input`, `quote-submit`, `quote-counter`,
  `repost-banner`, `quote-embed`, `quote-unavailable`, `repost-count`, `quote-count`. E2E: `e2e/reposts-quotes.spec.ts` (serial).
- Quote composer: `PostQuoteEvent.done(success)` — the card keeps the composer open with the text while the request is in flight
  (`quoting()` disables submit) and closes/clears only on `done(true)`; every `(quote)` handler MUST call `done` on success AND error.
- Comments: `shared/utils/post-comments.ts` (`PostComments`, create in a field initializer) = comment sections keyed by the original
  id; used by `TagFeedComponent` (`FeedComponent` still has its own inline copy). Test ids: `post-comment-toggle`, `comment-count`.
- No unit-test runner is set up (no spec files); coverage is via E2E (`e2e/hashtags-mentions.spec.ts`).

## Post images

- `MediaService` (`upload(file)` = multipart `POST /media` -> `{id,url,width,height}`; `validate(file)` = client pre-check: jpeg/png/gif/webp, <= 5 MB).
  `Post.media?: PostMedia[]` (missing = []; immutable after create, no edit UI); `createPost/quote` take optional `mediaIds` (max 4).
- `ui-media-picker` (shared/components/media-picker): hidden file input + "Add image", uploads each file immediately, per-item state
  `data-state` uploading|ready|failed, remove button. Owner reads `readyIds()` / `blocked()` (template ref or `viewChild`) and calls `clear()`
  on success only (failure keeps previews + text). Used by the feed composer (`compose-card`) and the quote composer (`quote-form`);
  test ids `media-input`, `media-add-btn`, `media-preview`, `media-remove`, `media-error` repeat per composer, so scope them in E2E.
- `ui-post-media` (shared/components/post-media): grid (1 / 2 / 2x2), lazy `<img>` with width/height when known, `(error)` hides the image,
  click opens `ui-media-lightbox` (Material dialog, Escape closes). Test ids `post-media`, `post-media-img`, `media-lightbox`. Shown for the
  card target (REPOST = original) and, compact, inside quote embeds (own media is `mat-card-content > ui-post-media`). `FeedSseService` maps `media`.
- E2E: `e2e/media.spec.ts` (serial), helpers `uploadImage`, `IMAGES` in `e2e/support/api.ts`.

## Notifications

- `NotificationService` (core/services, root): HTTP `list/unreadCount/markRead` + its own EventSource on
  `/notifications/stream?access_token=` (events `connected`, `notification`), opened by an `effect` on the token (closed + state reset
  on logout/user switch; retries with backoff only when the browser gave up, i.e. readyState CLOSED). Signals `unread`, `latest`
  (live items, newest first, deduped by id). `unread` is refetched on every `connected` (covers missed events; `max()` with live
  increments that raced the request) and incremented by live events. Marking read = HTTP `markRead(ids?)` + `readLocally(ids|null, unreadDecrement)`.
- Bell in `app.component.ts` (only when logged in; own `.bell-badge` span, 99+ cap, hidden at 0): menu fetches the latest 10 on open and
  merges them with `latest` (`mergeNotifications`, deduped by id). Rows = `ui-notification-item` (`data-unread` true/false).
  Sentences/links live in `shared/utils/notification-utils.ts` (`notificationText`, `notificationLink`: FOLLOW/no postId -> `/users/:actorId`, else `/posts/:postId`).
- Clicking a notification marks it read optimistically and navigates. The page uses the same load-generation / dedupe / never-stuck-disabled rules as the feed.
- Test ids: `notif-bell`, `notif-badge`, `notif-menu`, `notif-item` (+`data-unread`), `notif-mark-all` (menu AND page), `notif-see-all`,
  `notifications-page`, `notif-load-more`, `notifications-empty`, `post-detail`, `post-not-found`. E2E: `e2e/notifications.spec.ts` (serial).
- E2E pitfalls: notifications are async (outbox -> Kafka) so use `expect.poll` on `unreadCount`, never sleeps; wait for the
  `notifications/stream` response before a live-SSE action; absence ("self actions never notify") is proven with a later foreign action as barrier.

## Bookmarks (private)

- `BookmarkService` (`add/remove` = `PUT/DELETE /posts/{id}/bookmark`, idempotent 204; `list(cursor?, size=20)` = `GET /bookmarks` -> `FeedPage`).
  `Post.bookmarked?` is viewer-specific; missing (SSE live posts) = false.
- `ui-post-card` bookmark button (`bookmark-btn`, `data-bookmarked`, aria-label "Save post"/"Remove bookmark") emits `(bookmark)`;
  every page wires it to `PostBookmarks.toggle(post)` (`shared/utils/post-bookmarks.ts`, create in a field initializer): optimistic
  `patchPost`, reverted + snackbar on error, in-flight guard per target id (double click = one request). Target = `actionTarget(post)`
  (original inside a REPOST), same as likes. `FeedComponent` passes an updater that patches `_posts` AND the SSE live posts
  (`FeedSseService.updateLivePosts`), leaving the `allPosts` merge intact. User profile renders no post cards (nothing to wire).
- `/bookmarks` -> `BookmarksComponent` (authGuard): keyset "Load more" (dedupe by id, `loadGeneration`, `loadingMore` reset), an
  un-bookmarked card is removed after the server confirmed. Toolbar link `nav-bookmarks`. Test ids: `bookmarks-page`, `bookmarks-empty`
  ("No saved posts yet."), `bookmarks-load-more`. E2E: `e2e/bookmarks.spec.ts` (serial). The last "Load more" vanishes: use `dispatchEvent('click')`.

## Who to follow

- `SocialGraphService.getSuggestions(limit = 5)` -> `GET /social/suggestions`. `ui-who-to-follow` (shared/components/who-to-follow) is rendered
  in `FeedComponent` under the compose card (logged-in only); hidden while empty or on error. Row = avatar, profile link, reason
  ("Followed by N people you follow" | "Popular on SocialApp"), `ui-follow-button` (follow/unfollow in place; the row stays until reload).
- Test ids: `who-to-follow`, `suggestion`. E2E: `e2e/who-to-follow.spec.ts`, helper `getSuggestions` in `e2e/support/api.ts`.

## Search

- `SearchService` (`searchPosts(q, cursor?, size)` -> `GET /search/posts`, `searchUsers(q, limit)` -> `GET /search/users`).
  Toolbar box (`app.component.ts`, logged-in only, test id `search-input`): Enter -> `/search?q=`; a lone `#tag` -> `/tags/<tag>`.
- `/search?q=` -> `SearchComponent` (authGuard): tabs Posts (`search-tab-posts`; post cards with the same handlers as
  `TagFeedComponent`, keyset "Load more", `loadGeneration`) and People (`search-tab-people`; rows `person` link to `/users/:id`).
  Both lists load on every `q` change. Test ids: `search-page`, `search-title`, `search-blank`, `search-posts-empty`,
  `search-people-empty`, `load-more`. E2E: `e2e/search.spec.ts`, helpers `searchPosts`/`searchUsers`/`getStatus` in `e2e/support/api.ts`.
- The post-card action handlers are now copied in Feed, Tag and Search components; extract a shared helper before adding a fourth.

## Trending

- `TrendsService.getTrendingHashtags(hours = 24, limit = 10)` -> `GET /trends/hashtags`. `ui-trending` (shared/components/trending) is rendered in
  `FeedComponent` under `ui-who-to-follow` (logged-in only); hidden while empty or on error. Row = `#tag` link to `/tags/:tag` + "N post(s)".
  Test ids: `trending`, `trend` (NOT `hashtag-link`, which post cards use). E2E: `e2e/trends.spec.ts` (API ranking with `hours=1&limit=20`,
  because other specs keep adding tags; the UI ordering/plural test mocks the endpoint with `page.route`), helper `getTrends`.

## Routes

```typescript
''              → redirect to 'feed'
'feed'          → FeedComponent          (authGuard)
'login'         → LoginComponent         (redirectIfAuthenticatedGuard)
'create-profile'→ CreateProfileComponent (redirectIfAuthenticatedGuard)
'users/:profileId' → UserProfileComponent (authGuard)
'tags/:tag'     → TagFeedComponent       (authGuard; GET /hashtags/{tag}/posts, cursor Load more, no SSE)
'search'        → SearchComponent        (authGuard; ?q=, tabs Posts/People)
'posts/:id'     → PostDetailComponent    (authGuard; GET /posts/{id}, comments open by default, 404 -> "Post not found.")
'notifications' → NotificationsComponent (authGuard; keyset Load more + live items prepended)
'bookmarks'     → BookmarksComponent     (authGuard; keyset Load more, GET /bookmarks)
'settings'      → SettingsComponent      (authGuard)
'**'            → redirect to 'feed'
```

`authGuard` (user AND token present, else `/login`); a 401 from the API additionally clears the session via `authInterceptor`.

## E2E (Playwright)

`npm run e2e` (needs docker infra + backend running; the dev server is started by `playwright.config.ts`). Pitfalls learned:
- After a tab/scope switch wait for the **SSE stream response** (`page.waitForResponse(/feed\/stream.*scope=X/)`), not for the
  "Live updates active" text — it can still show the previous stream's state and a post created next would be missed.
- Never `click()` an element that disappears because of the click (e.g. last "Load more"): Playwright retries on the vanished
  element until the test timeout. Use `dispatchEvent('click')` and wait for the network response instead.
- "For you" is the global feed with page size 20; assertions on specific posts there are only safe right after creating them.
  Specs that seed many posts run serially (`test.describe.configure({ mode: 'serial' })`).
- `following-feed.spec.ts` asserts on the first page of the GLOBAL "For you" feed, so `playwright.config.ts` runs it in its own project `global-feed` AFTER the main `chromium` project (`dependencies`): no other worker creates posts meanwhile. Other specs that assert on the global feed should go there too. (If a main-project test fails, `global-feed` is skipped: fix that first.)
- `playwright.config.ts` keeps `trace: 'retain-on-failure'` + `screenshot: 'only-on-failure'` (see `test-results/`, `npx playwright show-trace`).
- After `Escape` on a mat-menu wait for its items to be gone (`toHaveCount(0)`) before reopening: the closing panel is still in the DOM
  and a test-id locator would match two items (strict mode violation).
- Generate unique names/tags/texts ONLY with `uniqueSuffix()` (`e2e/support/api.ts`: timestamp + worker index + counter, fixed width). `Date.now()` plus a random
  suffix collided (`registerUsers()` creates 5 accounts per millisecond -> sporadic 409 "username taken", e.g. notifications "25 notifications").
- Right after registration a user's Neo4j node appears asynchronously: `follow()` in `e2e/support/api.ts` retries on 404.

## Build setup

- Builders are `@angular/build:application` / `:dev-server` (the old `@angular-devkit/build-angular` is gone, as are `@angular/animations` and
  `@angular/platform-browser-dynamic`: Material 22 does not need them, and `provideAnimations()` was removed). There is no `test` target (no unit specs).
- Production budget: initial bundle warns at 600 kB (was 500 kB; the bundle is ~562 kB raw / 130 kB transferred after dropping animations), errors at 1 MB.

## Running

```bash
npm install
npm start          # dev server at localhost:4200
npm run build      # production build
```

## API base URL

Configured in `src/environments/environment.ts`:
```typescript
export const environment = {
  apiUrl: 'http://localhost:8080'
}
```
