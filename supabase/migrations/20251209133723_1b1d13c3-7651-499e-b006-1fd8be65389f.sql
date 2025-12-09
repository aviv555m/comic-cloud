-- The user_subscriptions table and first storage policy were created
-- Now add the remaining storage policies with unique names

-- Allow users to view their own book files (with unique policy name)
CREATE POLICY "Users can read their own book files"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to update their own book files
CREATE POLICY "Users can modify their own book files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to delete their own book files
CREATE POLICY "Users can remove their own book files"
ON storage.objects FOR DELETE
USING (bucket_id = 'book-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow access to public books' files via the book's is_public flag
CREATE POLICY "Anyone can view files from public books"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'book-files' 
  AND EXISTS (
    SELECT 1 FROM public.books 
    WHERE books.is_public = true 
    AND books.file_url LIKE '%' || storage.objects.name
  )
);