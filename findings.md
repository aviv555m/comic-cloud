# Findings

## 1. High: cover and metadata generation are silently disabled
The local Supabase proxy explicitly returns `{ skipped: true }` for `extract-metadata` and `generate-cover`, but the UI still treats both calls as successful. That means uploads without a manual cover never get generated covers, and the “Generate Cover” action in the book details dialog can show a success toast while doing nothing.

Relevant code:
- [`src/lib/local-supabase.ts:1635-1642`](/home/user/omnireader/src/lib/local-supabase.ts#L1635-L1642)
- [`src/components/UploadDialog.tsx:207-218`](/home/user/omnireader/src/components/UploadDialog.tsx#L207-L218)
- [`src/components/BookDetailsDialog.tsx:196-206`](/home/user/omnireader/src/components/BookDetailsDialog.tsx#L196-L206)

Current status:
- Partially addressed in code. The local proxy now returns an explicit error for `extract-metadata` and `generate-cover`, and the UI no longer reports fake success for those paths.
- Automatic cover generation is still unavailable until a real local-server implementation exists.

## 2. High: series identity is not normalized, so collections can split or disappear
Library grouping uses the raw `series` string as the map key, and the Series page fetches with a case-insensitive exact match on the decoded route value. Any mismatch in casing or whitespace between rows will create duplicate collections or an empty Series page even though the books exist.

Relevant code:
- [`src/pages/Library.tsx:373-412`](/home/user/omnireader/src/pages/Library.tsx#L373-L412)
- [`src/pages/Series.tsx:60-84`](/home/user/omnireader/src/pages/Series.tsx#L60-L84)

Current status:
- Addressed in the primary series flows. Library, Series, PublicLibrary, Reader sibling lookup, MangaBrowser, offline series-card creation, and collection editing now normalize series identity before grouping or matching.

## 3. Medium: cover rendering is inconsistent across screens
Only `BookCard` goes through the cover fallback/resolution logic. Other views render `cover_url` directly, so a cover that depends on the local proxy, a fallback URL, or another recovery path can appear in one place and fail in others.

Relevant code:
- [`src/components/ContinueReading.tsx:26-35`](/home/user/omnireader/src/components/ContinueReading.tsx#L26-L35)
- [`src/pages/PublicLibrary.tsx:187-194`](/home/user/omnireader/src/pages/PublicLibrary.tsx#L187-L194)
- [`src/components/OfflineLibrary.tsx:168-176`](/home/user/omnireader/src/components/OfflineLibrary.tsx#L168-L176)

Current status:
- Broadened beyond the original three call sites. The resolved-cover component is now also used in Statistics, ReadingLists, and ShareProgressCard so book covers recover through the same local-server and legacy fallback logic across more surfaces.

## 4. High: the clone path still leaves most uploaded assets broken on the server
Recent runtime logs show clone replaying `HEAD` checks against `https://cc.displayname.top/uploads/book-files/...` and `book-covers/...` for hundreds of rows, with 404s for nearly all of them. That means the self-healing pass is not restoring the old asset set, so metadata sync succeeds while the actual files remain missing on the server. In the current database snapshot, 325 of 329 books still point at server URLs that do not resolve.

Relevant evidence:
- Runtime log: repeated `HEAD .../uploads/book-files/... 404`
- Runtime log: repeated `GET .../uploads/book-covers/... 404`
- Local database snapshot: 325 of 329 books still reference missing server-hosted assets

Relevant code:
- [`src/lib/local-supabase.ts:615-736`](/home/user/omnireader/src/lib/local-supabase.ts#L615-L736)
- [`src/lib/local-supabase.ts:1530-1605`](/home/user/omnireader/src/lib/local-supabase.ts#L1530-L1605)

Current verification snapshot (2026-07-04):
- `data/comic-cloud-db.json` contains `329` book rows.
- `328` rows reference a `/uploads/book-files/...` server file path; `312` of those paths currently do not exist under `public/uploads`.
- `14` rows reference a `/uploads/book-covers/...` server cover path; `13` of those paths do not exist under `public/uploads`.
- The local upload directory currently contains `16` book files and `1` cover file.
- Direct legacy Supabase checks for representative missing paths return `Object not found`, so those assets are missing from legacy storage too.
- Breakdown of missing server files:
  - `301` missing `cbz` chapter files
  - `11` missing `pdf` files
  - `0` missing `epub` files
  - the single `manga` series card itself is not missing

Current status:
- A new on-demand recovery path now exists for missing manga chapter files. When a `cbz` chapter is opened and its local-server asset is gone, the reader can rebuild the CBZ from the saved source series and chapter title, upload it back to local storage, and update the row with recovery metadata.
- New manga chapter saves now persist `source_chapter_url` and `source_series_url` so future recovery does not depend on title matching alone.
- A batch repair script now exists at [`scripts/recover-missing-manga-assets.mjs`](/home/user/omnireader/scripts/recover-missing-manga-assets.mjs), with an npm entrypoint `npm run recover:manga-assets`.
- Verified batch recovery on current data:
  - restored `Ch. 231 - Our Purpose [Offline]` to `200 OK`
  - restored `Ch. 232 - Defensive Tactics [Offline]` to `200 OK`
  - restored `Ch. 235 - A Hero's Tale [Offline]` to `200 OK`
  - restored an additional `10` missing chapter files in batch, including `Ch. 160 - Magic Combat [Offline]`, with `source_chapter_url` and `source_series_url` persisted back to the local server DB

Implication:
- Cross-device sync is still not correct because the local server database points at assets that are absent on disk.
- The current self-healing logic can only recover files that still exist on some device's IndexedDB cache or still exist in legacy Supabase storage. It cannot restore assets that are gone from both places.
- The new manga rebuild path closes a large recoverable subset of the missing assets, but the missing `pdf` files remain unrecoverable without another copy of the original uploads.
