# varasi-web

Next.js 15 dashboard for Varasi. Dark-first **Green Smoke** palette, bilingual
**EN (ltr) / FA (rtl)**, MapLibre GL maps streaming COG tiles from the catalog.

## Design
- **Palette** — Green Smoke ramp, dark identity (`--bg #14150E`, accent `#A8AE79`).
- **Type** — Vazirmatn (UI/body, covers Latin + Persian) + JetBrains Mono (telemetry:
  coordinates, MGRS tiles, dates, IDs).
- **Signature** — ground-station telemetry: hairline olive grid, monospace chips,
  map-as-hero with a floating glass control rail. Direction-aware shell (sidebar
  flips to the right in Persian).

## Architecture
- Single origin: `next.config` rewrites `/api/*` and `/catalog/*` to the Go
  control-plane (`CONTROL_PLANE_URL`). The browser never talks to eoAPI directly.
- Auth: JWT in `localStorage`, attached as `Authorization` by `lib/api.ts` and by
  MapLibre `transformRequest` for tile/data requests.
- Data: `@tanstack/react-query`. i18n: lightweight `LocaleProvider` (no next-intl).

## Pages
`/login`, `/` dashboard (map hero + stats + scene rail), `/library` (filter grid + map),
`/watch-areas` (list + map), `/jobs`, `/projects` (live), and roadmap placeholders
for `/detection` `/alerts` `/analytics` `/settings`.

## Develop
```bash
npm install
npm run dev          # http://localhost:3000  (needs control-plane on :8080)
```
Container: `docker compose up -d web` (builds standalone image, serves on :3000).
