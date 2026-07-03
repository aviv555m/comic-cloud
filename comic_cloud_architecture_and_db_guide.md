# Comic Cloud - Architecture, Database, and History Log

This document serves as a master reference guide for Comic Cloud. It details how the dual-database structure works, where critical files are located, and provides a comprehensive history of the bugs and errors encountered and resolved during development.

---

## 1. The Database Structure

Comic Cloud uses an **Offline-First, Dual-Database** architecture. This means the app *never* reads directly from the remote cloud server for the UI. Instead, the UI always reads from the local device database, ensuring instant load times even without internet.

### A. The Local Device Database (IndexedDB)
The local device uses two mechanisms inside IndexedDB to store your data:

1. **`localforage` (Metadata & Sync Queue)**
   - **`local_db_books`, `local_db_profiles`, etc.** All row data from Supabase is downloaded and cached here. (Previously, this used `localStorage`, which caused crashes due to a 5MB limit. It now uses IndexedDB, allowing unlimited storage).
   - **`local_db_sync_queue`**: An array of operations (`insert`, `update`, `delete`) waiting to be sent to the remote server. When you perform an action offline, it gets added here.

2. **`comic_cloud_local_db` (File Blobs)**
   - **`offline_files` store**: This holds the raw binary data (Blobs) for your heavy PDF, EPUB, CBZ, and cover image files. It uses the `bookId` as the key.

### B. The Remote Database (Supabase PostgreSQL)
When the device is online, the app connects to your remote Supabase project to back up your metadata. 

**Key Tables & Constraints:**
| Table | Has `updated_at`? | Has `user_id`? | Purpose |
|-------|-------------------|----------------|---------|
| `books` | ✅ Yes | ✅ Yes | Stores book metadata (`title`, `author`, `file_url` pointing to your Node server, `series`). |
| `profiles` | ✅ Yes | ❌ No (uses `id`) | Stores user profile data. |
| `reading_sessions` | ❌ No | ✅ Yes | Tracks reading time/duration. Crucial: Do NOT inject `updated_at` here or sync will fail with a `PGRST204` error. |
| `book_reviews` | ✅ Yes | ✅ Yes | Stores text reviews and ratings. |
| `annotations` | ✅ Yes | ✅ Yes | Stores highlights and notes for EPUBs/PDFs. |
| `tags` | ✅ Yes | ✅ Yes | Custom user tags. |
| `book_tags` | ❌ No | ❌ No | Junction table linking books to tags. |
| `reading_list_books` | ❌ No | ❌ No | Junction table linking books to lists. |

**Conflict Resolution Strategy:**
The app uses **Last-Write-Wins (LWW)** based on the `updated_at` timestamp. When `cloneRemoteData` pulls data from Supabase, it compares it to the local IndexedDB. The local device only accepts the remote row if the remote `updated_at` timestamp is newer.

---

## 2. Key Files & Infrastructure Map

- **`src/lib/local-supabase.ts`**: The absolute core of the app. It exports a fake `supabase` client (`MockQueryBuilder`) that React components use. It intercepts queries, routes them to IndexedDB, and manages the `sync_queue` and `cloneRemoteData` logic.
- **`src/App.tsx`**: The entry point. Handles the mandatory version checker against GitHub releases.
- **`cc_nginx.conf` & `vite.config.ts`**: The Node server config. Supabase Storage is avoided to save money. Instead, `vite.config.ts` exposes an `/api/upload` endpoint, saving files to `/uploads/`. `cc_nginx.conf` proxies the Vite server to the internet.
- **`src/pages/Reader.tsx`**: The main reader wrapper with self-healing fallback logic (if a local file is missing, it will attempt to fetch a signed URL from Supabase as a fallback).
- **`src/components/EpubReader.tsx`**: Uses `epub.js` for EPUB rendering and handles color themes/pagination.

---

## 3. Exhaustive Log of Errors, Problems, & Fixes

### Problem 1: Missing Release Builds & Update UI
- **The Issue**: "you forgot to build the release again" and "its not showing that there is an update inside the app".
- **The Cause**: Code was pushed to GitHub, but the hardcoded version strings (`v1.0.XX`) inside `App.tsx` and `local-supabase.ts` weren't bumped. Because the GitHub release tag didn't exceed the app's internal version, the mandatory update screen didn't trigger.
- **The Fix**: Created an automated bash script (`upload_release.js`) to enforce a strict release pipeline: bump version -> compile APK (`./gradlew assembleRelease`) -> push to GitHub Releases.

### Problem 2: Missing Collection Management (3-dot menu)
- **The Issue**: "its not added the delete book to the three dots on books"
- **The Cause**: The library visually grouped books into series, but the series header lacked any interactive management UI.
- **The Fix**: Built `CollectionEditDialog.tsx` and wired it into `Library.tsx`. This enabled renaming the series, applying a single custom cover to all books in the series, disbanding the collection, or recursively deleting all books inside it.

### Problem 3: EPUB Reader Layout & Styling Issues
- **The Issue**: 
  1. It was scrolling vertically instead of turning pages.
  2. Theme colors (like dark mode) were applying incorrectly ("where the text is its black buit the background is default").
- **The Cause**: `epub.js` was initialized with `manager: "continuous"` instead of `manager: "default"` (paginated). Furthermore, the custom CSS stylesheet being injected into the EPUB's internal iframe lacked CSS specificity.
- **The Fix**: Reverted the manager to paginated view in `EpubReader.tsx` and updated the injected stylesheet to aggressively force `color: inherit !important; background: transparent !important;` on load, allowing the React container's theme to shine through instantly.

### Problem 4: Capacitor Plugin Registration Error
- **The Issue**: Console error: `Capacitor plugin "UpdatePlugin" already registered. Cannot register plugins twice.`
- **The Cause**: React Strict Mode double-mounting or Vite hot-reloading causes Capacitor to attempt registering native Android plugins multiple times in a single session.
- **The Fix**: This is a harmless dev-environment warning that does not affect production APKs, but it was noted in the logs.

### Problem 5: File Uploads Failing (Books Not Loading)
- **The Issue**: "now its not loading new books at all and also the covers dont get saved or applied" and "the books arent gtting uploaded to the server".
- **The Cause**: The Nginx reverse proxy (`cc_nginx.conf`) had no `client_max_body_size` configured. Nginx aggressively blocks any incoming HTTP POST request larger than **1MB** with a `413 Request Entity Too Large` error. Because comic books and PDFs are vastly larger than 1MB, the server was rejecting every upload.
- **The Fix**: Injected `client_max_body_size 500M;` into `cc_nginx.conf` and restarted the Nginx systemd service, completely resolving upload failures.

### Problem 6: The "Resurrecting" Deleted Books (The Final Boss)
- **The Issue**: "the delete book doesnt really work it shows like ti was deleted but then it reapeares" and "the delete still doesnt work".
- **The Cause**: This was the most critical architectural flaw in the app's history. 
  - The offline database proxy (`local-supabase.ts`) was using the browser's `localStorage` to cache the entire `books` table and the `sync_queue`.
  - `localStorage` has a hard, unchangeable quota limit of **5MB** per domain.
  - As the library grew (metadata, annotations, sessions), the JSON data exceeded 5MB.
  - When the user clicked "Delete Book", the UI removed the book, but when the app attempted to save that deletion to `localStorage` (via `safeLocalStorage.setItem`), the browser threw a `QuotaExceededError`. 
  - The app's `catch(e) {}` block silently swallowed this error. Thus, the deletion was never saved locally and never queued for cloud sync. 
  - When the app fetched data again a millisecond later, it read the old, unmodified `localStorage` data, and the deleted book instantly reappeared.
- **The Fix**: Executed a complete overhaul of `local-supabase.ts`. Replaced all synchronous `localStorage` operations with asynchronous **IndexedDB** operations (using the `localforage` library). IndexedDB allows for hundreds of megabytes of storage. This permanently bypassed the 5MB quota error, ensuring that offline inserts, updates, and deletes are now reliably saved and synchronized to the cloud without silently failing.
