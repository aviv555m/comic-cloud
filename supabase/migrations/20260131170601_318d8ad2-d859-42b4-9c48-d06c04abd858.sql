-- Drop the existing policy that exposes user_id
DROP POLICY IF EXISTS "Anyone can view public reviews" ON public.book_reviews;

-- Create a function to get reviews without exposing user_id directly
CREATE OR REPLACE FUNCTION public.get_public_reviews(book_uuid uuid)
RETURNS TABLE (
  id uuid,
  book_id uuid,
  rating integer,
  review text,
  created_at timestamptz,
  reviewer_name text
) 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    br.id,
    br.book_id,
    br.rating,
    br.review,
    br.created_at,
    COALESCE(p.username, 'Anonymous') as reviewer_name
  FROM book_reviews br
  LEFT JOIN profiles p ON br.user_id = p.id
  WHERE br.is_public = true AND br.book_id = book_uuid;
$$;

-- Create a view for public reviews that masks user_id
CREATE OR REPLACE VIEW public.public_book_reviews AS
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