-- Revert book-files bucket to private for proper security
-- Public bucket access bypasses RLS entirely, exposing all files
-- Use signed URLs (already implemented in download-book function) for access control
UPDATE storage.buckets 
SET public = false 
WHERE id = 'book-files';