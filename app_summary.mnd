# Comic Cloud App Features & Technical Summary

This document summarizes the core features, architectural additions, and bugs resolved during this session for **Comic Cloud** (Vite + Capacitor Android app).

---

## 1. Architecture & Backend (Local Server Integration)
- **Local Node Backend**:
  - Acts as a local Supabase alternative to store large book files (PDF, EPUB, Manga) locally instead of incurring expensive Supabase Storage charges.
  - Implements a file upload streaming endpoint at `/api/upload` that writes files directly to the server's filesystem under the `/uploads/` directory.
- **Nginx Web Server Routing**:
  - Re-configured Nginx on the server (`https://cc.displayname.top`) to proxy `/api/upload` requests to the Node backend and serve files from `/uploads/` statically.
- **Systemd Service (`comic-cloud.service`)**:
  - Switched the dev server to be managed under systemd (`systemctl --user status comic-cloud`) to run persistently in the background on Node version `v24.16.0`.

---

## 2. Offline-First Client Framework (`local-supabase.ts`)
- **IndexedDB Database Store**:
  - Implemented in [local-supabase.ts](file:///home/user/omnireader/src/lib/local-supabase.ts) to cache all application records (books, profiles, reading sessions, reviews, etc.) locally on the device.
- **Client Supabase Proxy**:
  - Replaced the direct remote Supabase client imports with a local proxy client.
  - Queries (`from(table).select(...)`, `.update(...)`, `.insert(...)`, `.delete(...)`) run immediately against IndexedDB, ensuring instantaneous load times and full offline capability.
- **Mock Query Builder**:
  - Supports modern filters including `.eq()`, `.order()`, `.limit()`, `.neq()`, `.or()`, and `.not()` to replicate PostgreSQL behavior client-side.

---

## 3. Advanced Syncing & Conflict Resolution
- **Queue Synchronization (`queueSync`)**:
  - Local database mutations (inserts, updates, deletes) are queued in IndexedDB. When connection is established, changes are synced to the remote Supabase database.
- **Last-Write-Wins (LWW) Merging**:
  - When merging remote data into local IndexedDB via `mergeRemoteData`, timestamps (`updated_at`) are evaluated.
  - Local records are only overwritten if the remote record has a newer `updated_at` value. This protects your offline reading progress from being lost.
- **Schema Mismatch Avoidance (Conditional updated_at)**:
  - Updates only inject `updated_at` timestamps if the table schema supports the column (e.g. `books`, `profiles`).
  - This avoids `PGRST204` database sync errors on tables lacking the column (e.g. `reading_sessions`).

---

## 4. Self-Healing Files & Remote Fallbacks
- **Proactive File Upload Sync**:
  - When the app is online, `cloneRemoteData` scans all local books. If a book has a local file blob in IndexedDB but is missing on the server filesystem, it uploads the blob in the background.
- **On-Demand HEAD Verification & Cache-Buster Retry**:
  - When loading a book in the reader page, the app issues a `HEAD` request to verify the file on the server.
  - If the file returns `404` or an SPA HTML redirect fallback, the reader:
    1. Checks the device's local IndexedDB cache, uploads the file to `/api/upload` if found, and appends a `healed` query parameter to force-retry the loader.
    2. Falls back to generating a remote signed URL directly from Supabase Storage if the local file blob is unavailable on the current device (backward compatibility for legacy books).

---

## 5. Mobile & UI Optimizations
- **Accidental Click Prevention (Book Scrolling)**:
  - Modified [BookCard.tsx](file:///home/user/omnireader/src/components/BookCard.tsx) touch event handlers (`onTouchStart`, `onTouchMove`, `onTouchEnd`) with a drag distance threshold (`wasDraggedRef`).
  - Clicks are ignored if the user scrolled or dragged, preventing books from opening accidentally while scrolling library pages on phones.
- **Mobile Tap Highlights**:
  - Injected `-webkit-tap-highlight-color: transparent` globally to remove gray box tap flashes in mobile WebViews.
- **Infinite Authentication Loop Guard**:
  - Injected guards in the client proxy `onAuthStateChange` to prevent infinite event firing loops that froze the browser when synchronizing auth state.
