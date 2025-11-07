import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { BookCard } from "@/components/BookCard";
import { UploadDialog } from "@/components/UploadDialog";
import { AddFromUrlDialog } from "@/components/AddFromUrlDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Plus, Search, BookOpen, Upload, Link } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@supabase/supabase-js";

interface Book {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  cover_url: string | null;
  file_type: string;
  is_public: boolean;
  is_completed: boolean;
  reading_progress: number;
}

const Library = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Check auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchBooks(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          fetchBooks(session.user.id);
        } else {
          navigate("/auth");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchBooks = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setBooks(data || []);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to fetch books",
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

  // Group books by series
  const groupedBySeries = filteredBooks.reduce((acc, book) => {
    if (book.series) {
      if (!acc[book.series]) {
        acc[book.series] = [];
      }
      acc[book.series].push(book);
    }
    return acc;
  }, {} as Record<string, Book[]>);

  // Books without a series
  const standaloneBooks = filteredBooks.filter((book) => !book.series);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <Navigation userEmail={user.email} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">My Library</h1>
              <p className="text-muted-foreground">
                {books.length} {books.length === 1 ? "book" : "books"} in your collection
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="gap-2">
                  <Plus className="w-5 h-5" />
                  Add Book
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setUploadOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload from Device
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUrlDialogOpen(true)}>
                  <Link className="w-4 h-4 mr-2" />
                  Add from URL
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search by title, author, or series..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <BookOpen className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
              <p className="text-muted-foreground">Loading your library...</p>
            </div>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center max-w-md">
              <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">
                {searchQuery ? "No books found" : "Your library is empty"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {searchQuery
                  ? "Try a different search term"
                  : "Start building your digital bookshelf by uploading your first book"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setUploadOpen(true)} size="lg">
                  <Plus className="mr-2 w-5 h-5" />
                  Upload Your First Book
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Series Sections */}
            {Object.entries(groupedBySeries).map(([seriesName, seriesBooks]) => (
              <div key={seriesName} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">{seriesName}</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(`/series/${encodeURIComponent(seriesName)}`)}
                  >
                    View All ({seriesBooks.length})
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {seriesBooks.slice(0, 6).map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author || undefined}
                      series={book.series || undefined}
                      coverUrl={book.cover_url || undefined}
                      fileType={book.file_type}
                      isPublic={book.is_public}
                      isCompleted={book.is_completed}
                      readingProgress={book.reading_progress}
                      canEdit={true}
                      onClick={() => navigate(`/reader/${book.id}`)}
                      onCoverGenerated={() => user && fetchBooks(user.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Standalone Books */}
            {standaloneBooks.length > 0 && (
              <div className="space-y-4">
                {Object.keys(groupedBySeries).length > 0 && (
                  <h2 className="text-2xl font-semibold">Other Books</h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {standaloneBooks.map((book) => (
                    <BookCard
                      key={book.id}
                      id={book.id}
                      title={book.title}
                      author={book.author || undefined}
                      series={book.series || undefined}
                      coverUrl={book.cover_url || undefined}
                      fileType={book.file_type}
                      isPublic={book.is_public}
                      isCompleted={book.is_completed}
                      readingProgress={book.reading_progress}
                      canEdit={true}
                      onClick={() => navigate(`/reader/${book.id}`)}
                      onCoverGenerated={() => user && fetchBooks(user.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploadComplete={() => user && fetchBooks(user.id)}
        userId={user.id}
      />

      <AddFromUrlDialog
        open={urlDialogOpen}
        onOpenChange={setUrlDialogOpen}
        onSuccess={() => user && fetchBooks(user.id)}
      />
    </div>
  );
};

export default Library;
