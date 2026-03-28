# Frontend — LLM Instructions

Angular 19, standalone components, Angular Material 19, TypeScript 5.6.

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

## SSE (Server-Sent Events)

`FeedSseService` connects to `GET /api/v1/feed/stream`.

SSE event names (must match backend exactly):
- `"connected"` — heartbeat on subscribe
- `"new-post"` — new post payload (`PostCreatedSseEvent`)

SSE callbacks **must** run inside `ngZone.run()` to trigger Angular change detection.

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

## Routes

```typescript
''              → redirect to 'feed'
'feed'          → FeedComponent
'login'         → LoginComponent  (guarded: redirectIfAuthenticated)
'create-profile'→ CreateProfileComponent
'users/:profileId' → UserProfileComponent
'**'            → redirect to 'feed'
```

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
