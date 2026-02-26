
# Adding 5 New Features to Bookshelf

## 1. Reading Journal / Notes Page
A daily reflections page where users can write entries linked to books, with mood tags and a timeline view.

**Database changes:**
- Create `journal_entries` table with columns: id, user_id, book_id (nullable), title, content, mood (text), entry_date, created_at, updated_at
- RLS policies: users can only CRUD their own entries

**Frontend:**
- New `src/pages/Journal.tsx` page with timeline view, mood tag picker, and book linking
- Add route `/journal` to App.tsx
- Add to Navigation and MobileNavDrawer

---

## 2. 3D Bookshelf Visualization
A visual bookshelf showing book spines on a wooden shelf using `@react-three/fiber` and `@react-three/drei`.

**Dependencies:**
- `three@^0.164.0`, `@react-three/fiber@^8.18.0`, `@react-three/drei@^9.122.0`

**Frontend:**
- New `src/pages/Bookshelf3D.tsx` page with a 3D canvas rendering book spines grouped by series/genre
- Books pulled from existing `books` table (no DB changes needed)
- Add route `/bookshelf` to App.tsx and navigation

---

## 3. Social Activity Feed
A feed showing friends' reading activity, reviews, achievements, and milestones.

**Database changes:**
- Create `activity_feed` table: id, user_id, activity_type (text: 'finished_book', 'review', 'achievement', 'milestone'), activity_data (jsonb), created_at
- RLS: users can insert their own; members of same book clubs can view each other's activities
- Create a trigger or edge function to auto-log activities when books are finished, reviews posted, or achievements earned

**Frontend:**
- New `src/pages/Feed.tsx` with a scrollable timeline of activity cards
- Add route `/feed` to App.tsx and navigation

---

## 4. Year in Review / Reading Wrapped
A beautiful annual summary page with stats, heatmap calendar, top books, and a shareable card.

**Frontend only (no DB changes -- uses existing `reading_sessions`, `books`, `book_reviews` tables):**
- New `src/pages/YearInReview.tsx` with sections: total books/pages, reading heatmap calendar, top-rated books, favorite genres, longest streak, and a shareable summary card (using html2canvas or DOM-to-image for export)
- Add route `/year-in-review` to App.tsx and navigation

---

## 5. Book Quotes / Highlights Collection
A dedicated page to browse, search, tag, and share saved highlights from books.

**Frontend only (uses existing `annotations` table which already has `selected_text`, `note`, `book_id`):**
- New `src/pages/Quotes.tsx` page with search, filter by book, and shareable quote card generation
- Add route `/quotes` to App.tsx and navigation

---

## Navigation Updates
- Add all 5 new items to `MobileNavDrawer.tsx` navItems array and desktop Navigation dropdown
- Icons: PenLine (Journal), BookCopy (Bookshelf), Activity (Feed), Sparkles (Year in Review), Quote (Quotes)

## Route Registration
Add 5 new routes in `App.tsx`:
- `/journal` -> Journal
- `/bookshelf` -> Bookshelf3D
- `/feed` -> Feed
- `/year-in-review` -> YearInReview
- `/quotes` -> Quotes

## Technical Details

### Database Migration SQL
```sql
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
CREATE POLICY "Users can manage their journal" ON public.journal_entries FOR ALL USING (auth.uid() = user_id);

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
```

### Implementation Order
1. Database migration (journal + activity feed tables)
2. Journal page
3. Quotes/Highlights page (no DB changes)
4. Year in Review page (no DB changes)
5. Social Feed page
6. 3D Bookshelf page (install deps)
7. Update navigation and routes
