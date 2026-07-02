# Comic Cloud — AI Agent Instructions

> **READ THIS ENTIRE FILE BEFORE TOUCHING ANY CODE.**
> Failure to follow these rules will break the app for real users on real devices.

---

## 1. Project Overview

Comic Cloud is a **Capacitor + Vite + React** reading app (PDF, EPUB, Manga, TXT). It runs as:
- A **web app** served from `https://cc.displayname.top` via Nginx + Vite dev server.
- A **native Android APK** built with Capacitor and Gradle.

The app uses an **offline-first architecture**. All data lives in the browser's IndexedDB first, then syncs to a remote Supabase database in the background. Book files are stored on a **local Node server filesystem** (not Supabase Storage) to avoid storage costs.

---

## 2. Critical Files — Know Before You Edit

| File | Purpose | Danger Level |
|------|---------|--------------|
| `src/lib/local-supabase.ts` | THE core of the app. IndexedDB storage, MockQueryBuilder, sync queue, auth proxy, storage proxy, file upload, conflict resolution. | 🔴 EXTREME — one bad edit breaks everything |
| `src/pages/Reader.tsx` | Book reader with PDF/EPUB/Comic/TXT support, self-healing file validation, progress saving. | 🔴 HIGH |
| `src/App.tsx` | Root component, version checker, update enforcement UI. Contains hardcoded version string. | 🟡 MEDIUM |
| `src/components/BookCard.tsx` | Library book cards with mobile touch handling and drag detection. | 🟡 MEDIUM |
| `vite.config.ts` | Vite config AND the `/api/upload` middleware endpoint. This is the file upload server. | 🔴 HIGH |
| `cc_nginx.conf` | Nginx config for the production server. Routes `/uploads/` and `/api/` correctly. | 🔴 HIGH |
| `~/.config/systemd/user/comic-cloud.service` | Systemd service that runs the Vite dev server persistently. | 🟡 MEDIUM |

---

## 3. Architecture Rules — DO NOT VIOLATE

### 3.1 The Supabase Proxy Pattern
- The app imports `supabase` from `@/integrations/supabase/client.ts`, which re-exports from `local-supabase.ts`.
- **ALL database queries go through the MockQueryBuilder** in `local-supabase.ts`. They run against IndexedDB locally and are queued for remote sync.
- `originalSupabase` is the real remote Supabase client. It is used ONLY for:
  - Auth operations (login, signup, session management)
  - Edge Function invocations
  - Remote data cloning (`cloneRemoteData`)
  - Storage signed URL fallbacks
- **NEVER import `supabase` directly from `@supabase/supabase-js` in component files.** Always use the proxy.

### 3.2 Offline-First Data Flow
```
User Action → MockQueryBuilder → IndexedDB (instant) → queueSync → Remote Supabase (background)
App Load → cloneRemoteData → Remote Supabase → mergeRemoteData (LWW) → IndexedDB
```

### 3.3 File Storage Flow
```
Upload: Phone → IndexedDB blob + /api/upload → Server /uploads/ directory
Read:   Reader → HEAD check server → If missing: upload from IndexedDB OR fallback to Supabase Storage signed URL
Sync:   cloneRemoteData → scan all books → HEAD check each → upload missing blobs from IndexedDB
```

### 3.4 Conflict Resolution (Last-Write-Wins)
- `mergeRemoteData` compares `updated_at` timestamps.
- Local records are ONLY overwritten if the remote `updated_at` is strictly newer.
- The MockQueryBuilder `update` operation injects `updated_at: new Date().toISOString()` **only if the existing row already has an `updated_at` field**. Not all tables have this column (e.g., `reading_sessions` does NOT).

---

## 4. Update Enforcement Rules

- Only make app updates **mandatory** (with `[mandatory]` or `[critical]` in the GitHub release body) if it is a must-have critical update:
  - Database schema changes
  - Severe security fixes
  - Major backend changes that would break client communication
- For non-critical visual adjustments, minor features, or layout additions, **default to optional updates** (no `[mandatory]` tag).

---

## 5. Version Bump Procedure — FOLLOW EXACTLY

When releasing a new version, you MUST update the version string in **exactly 3 places**:

1. `src/App.tsx` → `const currentTag = "v1.0.XX"` (line ~100)
2. `src/App.tsx` → `<span>v1.0.XX</span>` in the mandatory update UI (line ~142)
3. `src/lib/local-supabase.ts` → `const CURRENT_VERSION = "v1.0.XX"` (line ~41)

Then follow this exact build & deploy sequence:
```bash
npm run build
npx cap sync
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 && cd android && ./gradlew assembleRelease
cp android/app/build/outputs/apk/release/app-release.apk comic-cloud-release.apk
# Create GitHub release with APK asset attached
git add . && git commit -m "Bump to v1.0.XX: <description>" && git pull --rebase origin main && git push origin main
```

After pushing, **restart the systemd service** if `vite.config.ts` or server middleware changed:
```bash
systemctl --user restart comic-cloud
```

---

## 6. Strict Do / Don't Rules

### ✅ DO:
- Read `app_summary.md` before starting any work to understand the full architecture.
- Test that `npm run build` succeeds before committing. A broken build = broken app for all users.
- Preserve all existing IndexedDB table names and data structures. Changing them wipes user data.
- Keep the self-healing file logic in `Reader.tsx`. It is the safety net that makes PDFs load.
- Use `getServerUrl()` for all server API calls. It resolves to `window.location.origin` locally and `https://cc.displayname.top` remotely.
- Check if a column exists on a row before injecting it (e.g., `'updated_at' in row`).
- Handle SPA fallbacks: the server returns `200 OK` with `text/html` for missing files instead of `404`. Always check `content-type` headers.

### ❌ DON'T:
- **DON'T** add `updated_at` to tables that don't have it in the remote Supabase schema. This causes `PGRST204` errors.
- **DON'T** import `supabase` from `@supabase/supabase-js` directly. Use the proxy from `@/integrations/supabase/client`.
- **DON'T** remove the `wasDraggedRef` touch handling in `BookCard.tsx`. Without it, books open accidentally while scrolling on phones.
- **DON'T** remove the `-webkit-tap-highlight-color: transparent` CSS. Without it, the phone UI flashes gray on every tap.
- **DON'T** remove the auth loop guard in `local-supabase.ts`. Without it, `onAuthStateChange` fires infinitely and freezes the browser.
- **DON'T** change the IndexedDB database name or store names. This will delete all cached user data on every device.
- **DON'T** remove the `originalSupabase` Storage signed URL fallback in `Reader.tsx`. Some books only exist in remote Supabase Storage (legacy uploads).
- **DON'T** run `npm run dev` manually as a background task. The systemd service `comic-cloud.service` handles this. Use `systemctl --user restart comic-cloud` instead.
- **DON'T** use `cd` as a standalone command. Always pass `Cwd` to `run_command`.

---

## 7. Common Pitfalls & How to Avoid Them

| Pitfall | What Happens | How to Avoid |
|---------|-------------|--------------|
| SPA 404 fallback | Server returns `200 OK` with `text/html` for missing files. PDF.js tries to parse HTML as PDF → `getHexString` errors. | Always check `content-type` header, not just status code. |
| `updated_at` on wrong table | Supabase returns `PGRST204: Could not find column`. Sync loop fails silently. | Only inject `updated_at` if `'updated_at' in row`. |
| Multiple `cloneRemoteData` calls | Auth events fire multiple times → clone runs in parallel → race conditions. | There is already a `cloneInProgress` guard. Don't remove it. |
| Stale Vite process | Old process holds port 8081. New process can't start. | Kill stale processes before restarting: `systemctl --user restart comic-cloud`. |
| Missing `getServerUrl()` export | Build fails with "not exported" error. | Function is defined late in `local-supabase.ts`. Make sure the `export` keyword is present. |

---

## 8. Server & Infrastructure

- **Server**: Ubuntu Linux, user `user`, sudo password stored by user.
- **Node**: v24.16.0 via nvm at `/home/user/.nvm/versions/node/v24.16.0/bin/node`.
- **Vite Dev Server**: Runs on port `8081`, managed by `systemctl --user` as `comic-cloud.service`.
- **Nginx**: Reverse proxies `cc.displayname.top` to `localhost:8081`. Config at `/home/user/omnireader/cc_nginx.conf`.
- **Cloudflare Tunnel**: `cloudflared` service exposes the server to the internet.
- **GitHub Repo**: `aviv555m/comic-cloud` on branch `main`.
- **Supabase Project**: `cmybkhvdwtmaxhhhgkul.supabase.co`.

---

## 9. Key Supabase Tables

| Table | Has `updated_at`? | Has `user_id`? | Notes |
|-------|-------------------|----------------|-------|
| `books` | ✅ Yes | ✅ Yes | Main book metadata. `file_url` points to server path. |
| `profiles` | ✅ Yes | ❌ (uses `id`) | User profile. Filter by `id`, not `user_id`. |
| `reading_sessions` | ❌ No | ✅ Yes | Reading time tracking. Do NOT inject `updated_at`. |
| `book_reviews` | ✅ Yes | ✅ Yes | User reviews. |
| `annotations` | ✅ Yes | ✅ Yes | Highlights and notes. |
| `tags` | ✅ Yes | ✅ Yes | User-defined tags. |
| `book_tags` | ❌ No | ❌ No | Junction table. No `user_id` filter. |
| `reading_list_books` | ❌ No | ❌ No | Junction table. No `user_id` filter. |

---

## 10. Testing Checklist Before Any Release

- [ ] `npm run build` succeeds without errors
- [ ] Version strings updated in all 3 places
- [ ] Open web app → library loads with books
- [ ] Open a PDF book → renders correctly (no `getHexString` errors)
- [ ] Open an EPUB book → renders correctly
- [ ] Reading progress is preserved when reopening a book
- [ ] Console shows `[Clone] Remote data clone completed!` without errors
- [ ] No `PGRST204` errors in console
- [ ] No infinite `[Auth Sync]` loops in console
