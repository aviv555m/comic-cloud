-- Allow users to view profiles of users they share a book club with (for activity feed, discussions)
CREATE POLICY "Users can view club members profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM book_club_members m1
    JOIN book_club_members m2 ON m1.club_id = m2.club_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id
  )
);