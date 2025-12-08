import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { BookCard } from "@/components/BookCard";
import { UploadDialog } from "@/components/UploadDialog";
import { AddFromUrlDialog } from "@/components/AddFromUrlDialog";
import { OfflineLibrary } from "@/components/OfflineLibrary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { BookDetailsDialog } from "@/components/BookDetailsDialog";
import { ReadingGoals } from "@/components/ReadingGoals";
import { ContinueReading } from "@/components/ContinueReading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Plus, Search, BookOpen, Upload, Link, CloudOff, Library as LibraryIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  file_url: string;
  file_type: string;
  is_public: boolean;
  is_completed: boolean;
  reading_progress: number;
  last_page_read: number | null;
  total_pages: number | null;
  file_size: number | null;
  created_at: string;
}

const Library = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [readingStats, setReadingStats] = useState({
    currentStreak: 0,
    todayMinutes: 0,
    weeklyMinutes: 0,
  });
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
      
      // Fetch reading stats for goals widget
      fetchReadingStats(userId);
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

  const fetchReadingStats = async (userId: string) => {
    try {
      const { data: sessions } = await supabase
        .from("reading_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("start_time", { ascending: false });

      if (!sessions) return;

      const today = new Date().toDateString();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Today's reading time
      const todayMinutes = sessions
        .filter(s => new Date(s.start_time).toDateString() === today)
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

      // Weekly reading time
      const weeklyMinutes = sessions
        .filter(s => new Date(s.start_time) >= weekAgo)
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

      // Calculate current streak
      const dates = sessions
        .map(s => new Date(s.start_time).toDateString())
        .filter((date, i, self) => self.indexOf(date) === i)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

      let currentStreak = 0;
      const todayStr = new Date().toDateString();
      const yesterdayStr = new Date(Date.now() - 86400000).toDateString();

      if (dates[0] === todayStr || dates[0] === yesterdayStr) {
        currentStreak = 1;
        for (let i = 1; i < dates.length; i++) {
          const prev = new Date(dates[i - 1]).getTime();
          const curr = new Date(dates[i]).getTime();
          if (Math.round((prev - curr) / 86400000) === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      setReadingStats({ currentStreak, todayMinutes, weeklyMinutes });
    } catch (error) {
      console.error("Error fetching reading stats:", error);
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
      
      <OfflineIndicator />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">My Library</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                {books.length} {books.length === 1 ? "book" : "books"} in your collection
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="gap-2 w-full sm:w-auto">
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

          <Tabs defaultValue="library" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="library" className="gap-2">
                <LibraryIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Library</span>
              </TabsTrigger>
              <TabsTrigger value="offline" className="gap-2">
                <CloudOff className="w-4 h-4" />
                <span className="hidden sm:inline">Offline</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="library">
              {/* Continue Reading Section */}
              {books.find(b => b.reading_progress > 0 && b.reading_progress < 100) && (
                <div className="mb-6">
                  <ContinueReading 
                    book={books
                      .filter(b => b.reading_progress > 0 && b.reading_progress < 100)
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
                <div className="lg:col-span-3">
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
                <div className="hidden lg:block">
                  <ReadingGoals
                    currentStreak={readingStats.currentStreak}
                    todayMinutes={readingStats.todayMinutes}
                    weeklyMinutes={readingStats.weeklyMinutes}
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
                      fileUrl={book.file_url}
                      fileType={book.file_type}
                      isPublic={book.is_public}
                      isCompleted={book.is_completed}
                      readingProgress={book.reading_progress}
                      lastPageRead={book.last_page_read || 0}
                      canEdit={true}
                      onClick={() => setSelectedBook(book)}
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
                      fileUrl={book.file_url}
                      fileType={book.file_type}
                      isPublic={book.is_public}
                      isCompleted={book.is_completed}
                      readingProgress={book.reading_progress}
                      lastPageRead={book.last_page_read || 0}
                      canEdit={true}
                      onClick={() => setSelectedBook(book)}
                      onCoverGenerated={() => user && fetchBooks(user.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
            </TabsContent>

            <TabsContent value="offline">
              <OfflineLibrary />
            </TabsContent>
          </Tabs>
        </div>
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

      {selectedBook && (
        <BookDetailsDialog
          open={!!selectedBook}
          onOpenChange={(open) => !open && setSelectedBook(null)}
          book={selectedBook}
          canEdit={true}
          onUpdate={() => user && fetchBooks(user.id)}
          onDelete={() => user && fetchBooks(user.id)}
        />
      )}
    </div>
  );
};

export default Library;
