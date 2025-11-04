import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { BookCard } from "@/components/BookCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Search, BookOpen, ArrowLeft } from "lucide-react";
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

const PublicLibrary = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [groupedBySeries, setGroupedBySeries] = useState<{ [key: string]: Book[] }>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    fetchPublicBooks();

    return () => subscription.unsubscribe();
  }, []);

  const fetchPublicBooks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBooks(data || []);

      // Group books by series
      const grouped: { [key: string]: Book[] } = {};
      data?.forEach((book) => {
        if (book.series) {
          if (!grouped[book.series]) {
            grouped[book.series] = [];
          }
          grouped[book.series].push(book);
        }
      });
      setGroupedBySeries(grouped);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch public books",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredBooks = books.filter((book) => {
    const query = searchQuery.toLowerCase();
    return (
      book.title.toLowerCase().includes(query) ||
      book.author?.toLowerCase().includes(query) ||
      book.series?.toLowerCase().includes(query)
    );
  });

  const seriesWithMultipleBooks = Object.entries(groupedBySeries).filter(
    ([_, books]) => books.length > 1
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      {user && <Navigation userEmail={user.email} />}
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="w-full sm:w-auto">
              {user && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/")}
                  className="mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to My Library
                </Button>
              )}
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">Public Library</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Discover {books.length} {books.length === 1 ? "book" : "books"} shared by the community
              </p>
            </div>
          </div>

          <div className="relative max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search public books..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Series sections */}
        {!searchQuery && seriesWithMultipleBooks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Series</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {seriesWithMultipleBooks.map(([seriesName, seriesBooks]) => (
                <div
                  key={seriesName}
                  className="glass-card p-4 cursor-pointer hover:shadow-lg transition-smooth"
                  onClick={() => navigate(`/series/${encodeURIComponent(seriesName)}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-24 shrink-0">
                      {seriesBooks[0].cover_url ? (
                        <img
                          src={seriesBooks[0].cover_url}
                          alt={seriesName}
                          className="w-full h-full object-cover rounded"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-muted to-secondary/50 rounded flex items-center justify-center">
                          <BookOpen className="w-8 h-8 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{seriesName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {seriesBooks.length} {seriesBooks.length === 1 ? "book" : "books"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">Loading public library...</p>
            </div>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {searchQuery ? "No books found" : "No public books yet"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery
                  ? "Try a different search term"
                  : "Be the first to share a book with the community!"}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredBooks.map((book) => (
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
                onCoverGenerated={fetchPublicBooks}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default PublicLibrary;
