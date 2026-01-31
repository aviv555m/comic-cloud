-- Drop the security definer view and recreate as invoker
DROP VIEW IF EXISTS public.public_book_reviews;

-- Create a regular view (defaults to SECURITY INVOKER)
CREATE VIEW public.public_book_reviews 
WITH (security_invoker = true) AS
SELECT 
  br.id,
  br.book_id,
  br.rating,
  br.review,
  br.created_at,
  COALESCE(p.username, 'Anonymous Reader') as reviewer_name
FROM book_reviews br
LEFT JOIN profiles p ON br.user_id = p.id
WHERE br.is_public = true;

-- Grant select on the view to authenticated and anon users
GRANT SELECT ON public.public_book_reviews TO anon, authenticated;