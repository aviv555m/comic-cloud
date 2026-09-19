import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { originalSupabase } from "@/lib/local-supabase";
import { Navigation } from "@/components/Navigation";
import { BookCard } from "@/components/BookCard";
import { BookDetailsDialog } from "@/components/BookDetailsDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BookOpen } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface Book {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  cover_url: string | null;
  file_url: string;
  file_type: string;
  is_public: boolean;
  is_completed?: boolean;
  reading_progress?: number;
  last_page_read?: number;
  total_pages?: number | null;
  file_size?: number | null;
  created_at?: string;
  user_id?: string;
}

const Series = () => {
  const { seriesName } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  // Books inside a series had no way to reach details, editing or visibility:
  // those live in this dialog, which only the main library page opened.
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (seriesName) {
      fetchSeriesBooks();
    }
  }, [seriesName, user]);

  // Re-read when the background sync merges newer book rows, as the library page
  // does. Without this the page kept showing whatever the local copy held at load
  // time, e.g. a book made private on another device still showed as public.
  useEffect(() => {
    const handleSync = (e: Event) => {
      if ((e as CustomEvent).detail?.table === "books" && seriesName) fetchSeriesBooks();
    };
    window.addEventListener("local-db-synced", handleSync);
    return () => window.removeEventListener("local-db-synced", handleSync);
  }, [seriesName, user]);

  // The page fetches once before the session resolves (public books, read over the
  // network) and again once it does (all your books, read locally). The slow public
  // response used to land last and overwrite the full list, so a series showed only
  // its public volumes. Only the most recent request may update the page.
  const latestFetchRef = useRef(0);

  const fetchSeriesBooks = async () => {
    const fetchId = ++latestFetchRef.current;
    const isStale = () => fetchId !== latestFetchRef.current;
    setLoading(true);
    try {
      // useParams already decodes the segment. Decoding a second time corrupts a
      // series whose name contains '%' — decodeURIComponent throws "URI malformed"
      // on it, which surfaced as an empty page.
      const decodedSeries = seriesName || "";

      // If user is logged in, show their books in this series
      // If not logged in, only show public books
      if (user) {
        // Filtered here rather than with .ilike so this page groups books exactly the
        // way the library grid does. A server-side exact match disagreed with the
        // library's own grouping whenever the stored name differed by case or
        // surrounding whitespace, leaving a series that shows "2 books" on its card
        // reading "0 books in this series" once opened.
        const { data, error } = await supabase
          .from("books")
          .select("*")
          .eq("user_id", user.id)
          .order("title", { ascending: true });

        if (error) throw error;
        const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase();
        const target = normalize(decodedSeries);
        if (isStale()) return;
        setBooks(((data || []) as Book[]).filter(b => normalize(b.series) === target));
      } else {
        // The local mirror is cloned per-user, so a signed-out visitor's copy is empty.
        // Read public books from the backend and fall back to the mirror only when offline.
        let publicBooks: Book[] | null = null;

        if (navigator.onLine) {
          const remote = await originalSupabase
            .from("books")
            .select("*")
            .ilike("series", decodedSeries)
            .eq("is_public", true)
            .order("title", { ascending: true });

          if (!remote.error) publicBooks = remote.data as Book[];
        }

        if (!publicBooks) {
          const { data, error } = await supabase
            .from("books")
            .select("*")
            .ilike("series", decodedSeries)
            .eq("is_public", true)
            .order("title", { ascending: true });

          if (error) throw error;
          publicBooks = data || [];
        }

        if (isStale()) return;
        setBooks(publicBooks);
      }
    } catch (error: any) {
      if (isStale()) return;
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch series books",
      });
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {user && <Navigation userEmail={user.email} />}
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold mb-2">
            {seriesName || ""}
          </h1>
          <p className="text-muted-foreground">
            {books.length} {books.length === 1 ? "book" : "books"} in this series
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">Loading series...</p>
            </div>
          </div>
        ) : books.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No books found</h3>
              <p className="text-muted-foreground">
                This series doesn't have any books yet
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {books.map((book) => (
              <BookCard
                key={book.id}
                id={book.id}
                title={book.title}
                author={book.author || undefined}
                series={book.series || undefined}
                coverUrl={book.cover_url || undefined}
                fileUrl={book.file_url}
                fileType={book.file_type}
                isPublic={book.is_public}
                isCompleted={book.is_completed}
                readingProgress={book.reading_progress}
                lastPageRead={book.last_page_read}
                canEdit={!!user}
                onClick={() => navigate(`/reader/${book.id}`)}
                onCoverGenerated={fetchSeriesBooks}
                onDelete={() => fetchSeriesBooks()}
                onLongPress={user ? () => setSelectedBook(book) : undefined}
                onOpenDetails={user ? () => setSelectedBook(book) : undefined}
                onUpdate={() => fetchSeriesBooks()}
              />
            ))}
          </div>
        )}
      </main>

      {selectedBook && user && (
        <BookDetailsDialog
          open={!!selectedBook}
          onOpenChange={(open) => !open && setSelectedBook(null)}
          book={{
            ...selectedBook,
            is_completed: selectedBook.is_completed ?? false,
            reading_progress: selectedBook.reading_progress ?? 0,
            last_page_read: selectedBook.last_page_read ?? null,
            total_pages: selectedBook.total_pages ?? null,
            file_size: selectedBook.file_size ?? null,
            created_at: selectedBook.created_at ?? new Date().toISOString(),
            user_id: selectedBook.user_id ?? user.id,
          }}
          canEdit={selectedBook.user_id === undefined || selectedBook.user_id === user.id}
          onUpdate={() => fetchSeriesBooks()}
          onDelete={() => {
            setSelectedBook(null);
            fetchSeriesBooks();
          }}
        />
      )}
    </div>
  );
};

export default Series;