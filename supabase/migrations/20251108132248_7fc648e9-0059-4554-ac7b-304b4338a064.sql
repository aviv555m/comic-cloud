-- Make book-files bucket public so public books can be accessed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'book-files';