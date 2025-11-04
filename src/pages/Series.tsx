import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { BookCard } from "@/components/BookCard";
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
  file_type: string;
  is_public: boolean;
}

const Series = () => {
  const { seriesName } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
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
  }, [seriesName]);

  const fetchSeriesBooks = async () => {
    setLoading(true);
    try {
      const decodedSeries = decodeURIComponent(seriesName || "");
      
      let query = supabase
        .from("books")
        .select("*")
        .eq("series", decodedSeries)
        .order("title", { ascending: true });

      // If user is logged in, show their books + public books
      // If not logged in, only show public books
      if (!user) {
        query = query.eq("is_public", true);
      }

      const { data, error } = await query;

      if (error) throw error;
      setBooks(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch series books",
      });
    } finally {
      setLoading(false);
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
            {decodeURIComponent(seriesName || "")}
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
                fileType={book.file_type}
                isPublic={book.is_public}
                onClick={() => navigate(`/reader/${book.id}`)}
                onCoverGenerated={fetchSeriesBooks}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Series;