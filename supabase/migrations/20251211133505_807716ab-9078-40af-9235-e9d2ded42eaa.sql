
-- Reading Lists
CREATE TABLE public.reading_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'list',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reading_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reading lists" ON public.reading_lists
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reading lists" ON public.reading_lists
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading lists" ON public.reading_lists
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reading lists" ON public.reading_lists
  FOR DELETE USING (auth.uid() = user_id);

-- Reading List Books Junction
CREATE TABLE public.reading_list_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES public.reading_lists(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(list_id, book_id)
);

ALTER TABLE public.reading_list_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view books in their lists" ON public.reading_list_books
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.reading_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can add books to their lists" ON public.reading_list_books
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.reading_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can update books in their lists" ON public.reading_list_books
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.reading_lists WHERE id = list_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can remove books from their lists" ON public.reading_list_books
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.reading_lists WHERE id = list_id AND user_id = auth.uid())
  );

-- Tags
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tags" ON public.tags
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tags" ON public.tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tags" ON public.tags
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tags" ON public.tags
  FOR DELETE USING (auth.uid() = user_id);

-- Book Tags Junction
CREATE TABLE public.book_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(book_id, tag_id)
);

ALTER TABLE public.book_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tags on their books" ON public.book_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.tags WHERE id = tag_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can add tags to their books" ON public.book_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.tags WHERE id = tag_id AND user_id = auth.uid())
  );

CREATE POLICY "Users can remove tags from their books" ON public.book_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.tags WHERE id = tag_id AND user_id = auth.uid())
  );

-- Reading Challenges
CREATE TABLE public.reading_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('books', 'pages', 'minutes', 'streak')),
  goal_value INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.reading_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own challenges" ON public.reading_challenges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own challenges" ON public.reading_challenges
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own challenges" ON public.reading_challenges
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own challenges" ON public.reading_challenges
  FOR DELETE USING (auth.uid() = user_id);

-- Book Reviews
CREATE TABLE public.book_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(book_id, user_id)
);

ALTER TABLE public.book_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reviews" ON public.book_reviews
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public reviews" ON public.book_reviews
  FOR SELECT USING (is_public = true);

CREATE POLICY "Users can create their own reviews" ON public.book_reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews" ON public.book_reviews
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews" ON public.book_reviews
  FOR DELETE USING (auth.uid() = user_id);

-- Add columns to books table
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS started_reading_at TIMESTAMPTZ;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS finished_reading_at TIMESTAMPTZ;

-- Triggers for updated_at
CREATE TRIGGER update_reading_lists_updated_at
  BEFORE UPDATE ON public.reading_lists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reading_challenges_updated_at
  BEFORE UPDATE ON public.reading_challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_book_reviews_updated_at
  BEFORE UPDATE ON public.book_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
