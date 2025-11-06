-- Create annotations table for highlights and notes
CREATE TABLE public.annotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  page_number INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  note TEXT,
  highlight_color TEXT NOT NULL DEFAULT '#FFFF00',
  position_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create reading sessions table for statistics
CREATE TABLE public.reading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  pages_read INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for annotations
CREATE POLICY "Users can view their own annotations"
ON public.annotations
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own annotations"
ON public.annotations
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own annotations"
ON public.annotations
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own annotations"
ON public.annotations
FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for reading_sessions
CREATE POLICY "Users can view their own reading sessions"
ON public.reading_sessions
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reading sessions"
ON public.reading_sessions
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reading sessions"
ON public.reading_sessions
FOR UPDATE
USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_annotations_book_user ON public.annotations(book_id, user_id);
CREATE INDEX idx_annotations_page ON public.annotations(page_number);
CREATE INDEX idx_reading_sessions_user_time ON public.reading_sessions(user_id, start_time DESC);
CREATE INDEX idx_reading_sessions_book ON public.reading_sessions(book_id);

-- Trigger for updated_at on annotations
CREATE TRIGGER update_annotations_updated_at
BEFORE UPDATE ON public.annotations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();