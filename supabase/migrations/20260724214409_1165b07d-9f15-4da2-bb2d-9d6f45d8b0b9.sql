CREATE INDEX IF NOT EXISTS idx_books_user_created ON public.books (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_user_start ON public.reading_sessions (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_book_reviews_user ON public.book_reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_book_tags_book ON public.book_tags (book_id);