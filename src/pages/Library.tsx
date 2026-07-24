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
import { AdvancedFilters, FilterState } from "@/components/AdvancedFilters";
import { ImportBooksDialog } from "@/components/ImportBooksDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Plus, BookOpen, Upload, Link, CloudOff, Library as LibraryIcon, FileDown } from "lucide-react";
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
  user_id: string;
}

interface TagType {
  id: string;
  name: string;
  color: string;
}

const Library = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    sortBy: "created_at",
    sortOrder: "desc",
    fileTypes: [],
    readingStatus: [],
    minRating: null,
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [tags, setTags] = useState<TagType[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bookTags, setBookTags] = useState<Record<string, string[]>>({});
  const [bookRatings, setBookRatings] = useState<Record<string, number>>({});
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
        fetchTags(session.user.id);
      } else {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          fetchBooks(session.user.id);
          fetchTags(session.user.id);
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
      
      // Fetch book tags
      fetchBookTags(userId);
      
      // Fetch book ratings
      fetchBookRatings(userId);
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

  const fetchTags = async (userId: string) => {
    const { data } = await supabase
      .from("tags")
      .select("*")
      .eq("user_id", userId);
    setTags(data || []);
  };

  const fetchBookTags = async (userId: string) => {
    const { data } = await supabase
      .from("book_tags")
      .select("book_id, tag_id")
      .in("tag_id", (await supabase.from("tags").select("id").eq("user_id", userId)).data?.map(t => t.id) || []);
    
    const mapping: Record<string, string[]> = {};
    data?.forEach(bt => {
      if (!mapping[bt.book_id]) mapping[bt.book_id] = [];
      mapping[bt.book_id].push(bt.tag_id);
    });
    setBookTags(mapping);
  };

  const fetchBookRatings = async (userId: string) => {
    const { data } = await supabase
      .from("book_reviews")
      .select("book_id, rating")
      .eq("user_id", userId);
    
    const mapping: Record<string, number> = {};
    data?.forEach(r => {
      if (r.rating) mapping[r.book_id] = r.rating;
    });
    setBookRatings(mapping);
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

  const handleImport = async (importedBooks: { title: string; author: string; rating?: number }[]) => {
    if (!user) return;
    
    // For now, just show a message - actual book files need to be uploaded separately
    toast({
      title: "Books imported",
      description: `${importedBooks.length} books added to your reading history. Upload the book files to start reading.`,
    });
  };

  // Filter and sort books
  const filteredBooks = books
    .filter((book) => {
      const query = filters.search.toLowerCase();
      const matchesSearch = 
        book.title.toLowerCase().includes(query) ||
        book.author?.toLowerCase().includes(query) ||
        book.series?.toLowerCase().includes(query);

      const matchesFileType = 
        filters.fileTypes.length === 0 || 
        filters.fileTypes.includes(book.file_type.toLowerCase());

      const matchesStatus = 
        filters.readingStatus.length === 0 ||
        (filters.readingStatus.includes("completed") && book.is_completed) ||
        (filters.readingStatus.includes("reading") && book.reading_progress > 0 && !book.is_completed) ||
        (filters.readingStatus.includes("not_started") && book.reading_progress === 0 && !book.is_completed);

      const matchesTags = 
        selectedTags.length === 0 ||
        selectedTags.some(tagId => bookTags[book.id]?.includes(tagId));

      const matchesRating = 
        !filters.minRating ||
        (bookRatings[book.id] && bookRatings[book.id] >= filters.minRating);

      return matchesSearch && matchesFileType && matchesStatus && matchesTags && matchesRating;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (filters.sortBy) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "author":
          comparison = (a.author || "").localeCompare(b.author || "");
          break;
        case "reading_progress":
          comparison = a.reading_progress - b.reading_progress;
          break;
        case "updated_at":
        case "created_at":
        default:
          comparison = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          break;
      }
      return filters.sortOrder === "asc" ? comparison : -comparison;
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
      
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="flex flex-col gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2">My Library</h1>
              <p className="text-sm text-muted-foreground">
                {books.length} {books.length === 1 ? "book" : "books"} in your collection
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="lg" className="gap-2 w-full sm:w-auto h-11 sm:h-10">
                  <Plus className="w-5 h-5" />
                  Add Book
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setUploadOpen(true)} className="py-3 sm:py-2">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload from Device
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setUrlDialogOpen(true)} className="py-3 sm:py-2">
                  <Link className="w-4 h-4 mr-2" />
                  Add from URL
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setImportDialogOpen(true)} className="py-3 sm:py-2">
                  <FileDown className="w-4 h-4 mr-2" />
                  Import from Goodreads
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs defaultValue="library" className="w-full">
            <TabsList className="mb-3 sm:mb-4 w-full sm:w-auto grid grid-cols-2 sm:inline-flex">
              <TabsTrigger value="library" className="gap-2 h-10 sm:h-9">
                <LibraryIcon className="w-4 h-4" />
                <span>Library</span>
              </TabsTrigger>
              <TabsTrigger value="offline" className="gap-2 h-10 sm:h-9">
                <CloudOff className="w-4 h-4" />
                <span>Offline</span>
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
              {/* Reading Goals - Mobile (collapsible) */}
              <div className="lg:hidden mb-4">
                <ReadingGoals
                  currentStreak={readingStats.currentStreak}
                  todayMinutes={readingStats.todayMinutes}
                  weeklyMinutes={readingStats.weeklyMinutes}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
                <div className="lg:col-span-3">
                  <AdvancedFilters
                    filters={filters}
                    onFiltersChange={setFilters}
                    availableTags={tags}
                    selectedTags={selectedTags}
                    onTagsChange={setSelectedTags}
                  />
                </div>
                {/* Reading Goals - Desktop */}
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
                {filters.search || filters.fileTypes.length > 0 || selectedTags.length > 0 
                  ? "No books found" 
                  : "Your library is empty"}
              </h3>
              <p className="text-muted-foreground mb-6">
                {filters.search || filters.fileTypes.length > 0 || selectedTags.length > 0
                  ? "Try adjusting your filters"
                  : "Start building your digital bookshelf by uploading your first book"}
              </p>
              {!filters.search && filters.fileTypes.length === 0 && selectedTags.length === 0 && (
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

      <ImportBooksDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImport}
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
