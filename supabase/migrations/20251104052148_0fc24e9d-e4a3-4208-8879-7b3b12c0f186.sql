-- Add reading mode preference and completion status to books table
ALTER TABLE public.books 
ADD COLUMN IF NOT EXISTS reading_mode text DEFAULT 'page' CHECK (reading_mode IN ('page', 'scroll')),
ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reading_progress numeric DEFAULT 0 CHECK (reading_progress >= 0 AND reading_progress <= 100);

-- Update RLS policies to allow guest (unauthenticated) users to read public books
DROP POLICY IF EXISTS "Anyone can view public books" ON public.books;

CREATE POLICY "Anyone can view public books"
ON public.books
FOR SELECT
TO public
USING (is_public = true);

-- Storage policies for public access
DROP POLICY IF EXISTS "Public book files are readable by anyone" ON storage.objects;
DROP POLICY IF EXISTS "Public covers are viewable by anyone" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own book covers" ON storage.objects;

-- Allow unauthenticated users to read public book files
CREATE POLICY "Public book files are readable by anyone"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'book-files' AND (storage.foldername(name))[1] IN (
  SELECT id::text FROM public.books WHERE is_public = true
));

-- Allow anyone to view book covers
CREATE POLICY "Public covers are viewable by anyone"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'book-covers');

-- Allow users to upload custom covers for their books
CREATE POLICY "Users can upload their own book covers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-covers' 
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.books WHERE user_id = auth.uid()
  )
);