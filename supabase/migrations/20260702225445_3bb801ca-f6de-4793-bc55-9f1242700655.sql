
-- 1. activity_feed: restrict club-member view to public activities
DROP POLICY IF EXISTS "Users can view club members activities" ON public.activity_feed;
CREATE POLICY "Users can view club members activities"
ON public.activity_feed
FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM public.book_club_members m1
      JOIN public.book_club_members m2 ON m1.club_id = m2.club_id
      WHERE m1.user_id = auth.uid() AND m2.user_id = activity_feed.user_id
    )
  )
);

-- 2. book_club_books: add explicit WITH CHECK
DROP POLICY IF EXISTS "Admins can manage club books" ON public.book_club_books;
CREATE POLICY "Admins can manage club books"
ON public.book_club_books
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.book_club_members
    WHERE club_id = book_club_books.club_id
      AND user_id = auth.uid()
      AND role = ANY (ARRAY['owner'::text, 'admin'::text])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.book_club_members
    WHERE club_id = book_club_books.club_id
      AND user_id = auth.uid()
      AND role = ANY (ARRAY['owner'::text, 'admin'::text])
  )
);

-- 3. Storage: enforce book ownership on UPDATE/DELETE for book-covers
DROP POLICY IF EXISTS "Users can update their own book covers" ON storage.objects;
CREATE POLICY "Users can update their own book covers"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'book-covers'
  AND ((storage.foldername(name))[1])::uuid IN (
    SELECT id FROM public.books WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'book-covers'
  AND ((storage.foldername(name))[1])::uuid IN (
    SELECT id FROM public.books WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete their own book covers" ON storage.objects;
CREATE POLICY "Users can delete their own book covers"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'book-covers'
  AND ((storage.foldername(name))[1])::uuid IN (
    SELECT id FROM public.books WHERE user_id = auth.uid()
  )
);

-- 4. Public bucket listing: remove broad SELECT policies on book-covers.
-- Public URLs still work through Storage's public endpoint (bypasses RLS).
DROP POLICY IF EXISTS "Anyone can view book covers" ON storage.objects;
DROP POLICY IF EXISTS "Public covers are viewable by anyone" ON storage.objects;

-- 5. Lock down SECURITY DEFINER trigger functions from API roles
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Keep get_public_reviews callable (intentional public RPC)
-- Keep is_club_member callable by authenticated (used inside RLS policies)
REVOKE ALL ON FUNCTION public.is_club_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_reviews(uuid) TO anon, authenticated;
