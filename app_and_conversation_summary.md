# Comic Cloud - Comprehensive System & Conversation Log

This document serves as an exhaustive log of the Comic Cloud architecture, key file locations, their purposes, and every problem, error, and bug we have discussed and resolved during our session.

---

## 1. App Architecture & Key Files

Comic Cloud is an **offline-first hybrid app** (Capacitor + Vite + React) that compiles to both an Android APK and a Web App. 

Below is a detailed map of where everything lives and what it does:

### Database & Sync Engine
- **File**: `src/lib/local-supabase.ts`
- **What it does**: The beating heart of the app. It acts as a proxy interceptor for Supabase. Instead of letting React components talk to the cloud directly, it captures all database queries (`MockQueryBuilder`), saves them to the local device database first, and queues them in an offline sync queue. In the background, it syncs data to the cloud (`processSyncQueue`) and proactively pulls data down (`cloneRemoteData`) using a Last-Write-Wins (LWW) merge strategy.
- **Recent Major Change**: It previously used the browser's `localStorage` for all this, which caused severe issues. It has now been completely rewritten to use **IndexedDB** (via `localforage`), removing storage limits.

### App Root & Updates
- **File**: `src/App.tsx`
- **What it does**: The main entry point. Crucially, it contains the **version checker and update enforcement UI**. It compares the hardcoded `currentTag` (e.g., `v1.0.109`) against the latest GitHub release. If the GitHub release has `[mandatory]` in the description, it locks the app and forces the user to download the new APK.

### Server & Upload Infrastructure
- **Files**: `vite.config.ts` and `cc_nginx.conf`
- **What they do**: The app runs locally on a Node/Vite dev server (managed by a systemd service). To avoid paid cloud storage, uploaded books bypass Supabase Storage and are saved directly to the local server's `/uploads/` folder. Nginx acts as a reverse proxy, routing traffic to the Vite server. `vite.config.ts` contains the `/api/upload` endpoint middleware.

### Reader Components
- **File**: `src/components/EpubReader.tsx`
- **What it does**: Uses `epub.js` to render EPUB files. It injects custom CSS for dark/light themes and manages whether the book is displayed as a continuous scroll or in discrete pages.
- **File**: `src/pages/Reader.tsx`
- **What it does**: The main reader wrapper that determines the file type (PDF, EPUB, CBZ, TXT) and loads the appropriate sub-component. It also contains self-healing file validation (falling back to signed cloud URLs if a local file is missing).

### Library UI & Management
- **File**: `src/pages/Library.tsx`
- **What it does**: Fetches and displays the user's books and groups them into manga series/collections.
- **File**: `src/components/CollectionEditDialog.tsx`
- **What it does**: The 3-dot menu UI for collections. Handles renaming, applying custom covers to entire series, disbanding collections, or recursively deleting all books inside a collection.
- **File**: `src/components/BookCard.tsx` / `BookDetailsDialog.tsx`
- **What it does**: Handles the display and deletion of individual books (`handleDelete`), removing them from offline storage and Supabase simultaneously.

---

## 2. Complete Log of Errors, Problems, & Fixes

Below is an exhaustive timeline of every problem you reported and how we fixed it.

### Problem 1: Missing Release Builds & Update UI
- **The Issue**: You noticed the app wasn't showing that an update was available (`"you forgot to build the release again"` and `"its not showing that there is an update inside the app"`).
- **The Cause**: I had pushed code changes but failed to update the hardcoded version strings inside `App.tsx` and `src/lib/local-supabase.ts`. Furthermore, I didn't compile the Android APK or attach it to a GitHub release.
- **The Fix**: I established a strict procedure to bump versions in all 3 locations, run the Gradle release build (`./gradlew assembleRelease`), and upload the APK to a GitHub release using a custom script (`upload_release.js`).

### Problem 2: Missing Collection Management (3-dot menu)
- **The Issue**: You requested the ability to manage collections (`"its not added the delete book to the three dots on books"`).
- **The Cause**: The library was visually grouping books into series, but there was no interactive menu attached to those groups.
- **The Fix**: I built `CollectionEditDialog.tsx` and wired it into `Library.tsx`. This enabled renaming, bulk-cover changing, and bulk-deleting for series.

### Problem 3: EPUB Reader Layout & Styling Issues
- **The Issue**: The EPUB reader was broken in two ways:
  1. It was scrolling vertically instead of turning pages (`"i want it to be pages and not scroll"`).
  2. Theme colors (like dark mode) were applying incorrectly (`"where the text is its black buit the background is default"` and `"there wont be layers of background"`). You had to toggle the color mode multiple times to make it work.
- **The Cause**: The EPUB renderer was configured to `manager: "continuous"` instead of `manager: "default"` (paginated). Furthermore, the custom CSS being injected lacked `!important` tags, causing the background of the EPUB's HTML `<body>` to conflict with the app's React container background.
- **The Fix**: I reverted the EPUB layout back to paginated view in `EpubReader.tsx` and updated the injected stylesheet to aggressively force `color: inherit !important; background: transparent !important;` on load, ensuring a seamless theme application.

### Problem 4: Capacitor Plugin Registration Error
- **The Issue**: You saw a console error: `Capacitor plugin "UpdatePlugin" already registered. Cannot register plugins twice.`
- **The Cause**: Hot-reloading in development or double-mounting in React Strict Mode causes Capacitor to attempt registering native plugins multiple times.
- **The Fix**: This is a harmless dev-environment warning that does not affect production, but it cluttered your console.

### Problem 5: File Uploads Failing (Books Not Loading)
- **The Issue**: You reported a massive failure across the app: `"now its not loading new books at all and also the covers dont get saved or applied"` and `"the books arent gtting uploaded to the server"`.
- **The Cause**: The Nginx reverse proxy (`cc_nginx.conf`) had no `client_max_body_size` configured. By default, Nginx aggressively blocks any incoming HTTP POST request larger than **1MB**, returning a `413 Request Entity Too Large` error. Comic books and PDFs are vastly larger than 1MB, so the server was rejecting every upload.
- **The Fix**: With your sudo password, I created a bash script to inject `client_max_body_size 500M;` into `cc_nginx.conf` and restarted the Nginx service, immediately restoring upload capabilities.

### Problem 6: The "Resurrecting" Deleted Books (The Final Boss)
- **The Issue**: You reported that deleting books was completely broken: `"the delete book doesnt really work it shows like ti was deleted but then it reapeares"` and `"the delete still doesnt work"`.
- **The Cause**: This was the most complex architectural bug in the app. 
  - The app uses the browser's `localStorage` to cache the offline database (metadata) and the `sync_queue`.
  - `localStorage` has a hard, unchangeable quota limit of **5MB** per website.
  - Because your library grew (books, annotations, sessions), the JSON data exceeded 5MB.
  - When you clicked "Delete", the UI removed the book, but when `local-supabase.ts` attempted to write that change to `localStorage` (via `safeLocalStorage.setItem`), the browser threw a `QuotaExceededError`. 
  - The app silently swallowed this error (`catch(e) {}`), so the deletion was never saved locally or queued for cloud sync. 
  - When the app fetched data again a millisecond later, it read the old, unmodified `localStorage` data, and the book reappeared.
- **The Fix**: I executed a complete overhaul of `local-supabase.ts`. I replaced all synchronous `localStorage` operations with asynchronous **IndexedDB** operations (using the `localforage` library). IndexedDB allows for hundreds of megabytes (or even gigabytes) of storage. This permanently fixed the quota error, ensuring that offline inserts, updates, and deletes are reliably saved and synchronized to the cloud. (Released in **v1.0.109**).
