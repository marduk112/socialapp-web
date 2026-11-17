# socialapp-web

[![CI](https://github.com/marduk112/socialapp-web/actions/workflows/ci.yml/badge.svg)](https://github.com/marduk112/socialapp-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Angular frontend of [SocialApp](https://github.com/marduk112/SocialApp).

- **Angular 22**, standalone components, **zoneless** change detection, **signals**, Angular Material
- Live feed and notifications over **Server-Sent Events**, keyset-paginated timelines, hashtags and mentions, reposts and quotes, images, bookmarks
- Search (posts and people), "who to follow", trending hashtags
- **Playwright e2e** suite (85 tests) running against the real backend and infrastructure

Conventions and pitfalls are documented in [CLAUDE.md](CLAUDE.md).

## Run

```bash
npm ci
npm start          # http://localhost:4200, proxies /api to http://localhost:8080
```

The backend is [socialapp-api](https://github.com/marduk112/socialapp-api); its infrastructure comes from the [SocialApp](https://github.com/marduk112/SocialApp) repository (`docker compose up -d`).

## Build and test

```bash
npm run build
npm run e2e        # needs the backend and infrastructure running
```

Requires Node `^22.22.3 || ^24.15.0 || >=26`.

## License

[MIT](LICENSE)
