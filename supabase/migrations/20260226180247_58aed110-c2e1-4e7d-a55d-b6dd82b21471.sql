
-- Journal entries table
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  title text,
  content text NOT NULL,
  mood text,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their journal" ON public.journal_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Activity feed table
CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  activity_type text NOT NULL,
  activity_data jsonb DEFAULT '{}'::jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own activities" ON public.activity_feed FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view club members activities" ON public.activity_feed FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM book_club_members m1
    JOIN book_club_members m2 ON m1.club_id = m2.club_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = activity_feed.user_id
  )
);

-- Trigger for journal updated_at
CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
