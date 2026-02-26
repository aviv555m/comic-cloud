import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Quote, Search, Download, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface Annotation {
  id: string;
  selected_text: string;
  note: string | null;
  page_number: number;
  book_id: string;
  highlight_color: string;
  created_at: string;
}

interface Book {
  id: string;
  title: string;
  author: string | null;
}

const Quotes = () => {
  const [user, setUser] = useState<User | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBook, setFilterBook] = useState("all");
  const navigate = useNavigate();
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchData(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchData = async (userId: string) => {
    setLoading(true);
    const [annotationsRes, booksRes] = await Promise.all([
      supabase.from("annotations").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("books").select("id, title, author").eq("user_id", userId),
    ]);
    if (annotationsRes.data) setAnnotations(annotationsRes.data);
    if (booksRes.data) setBooks(booksRes.data);
    setLoading(false);
  };

  const getBook = (id: string) => books.find(b => b.id === id);

  const filtered = annotations.filter(a => {
    const matchesSearch = !searchQuery || 
      a.selected_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.note && a.note.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesBook = filterBook === "all" || a.book_id === filterBook;
    return matchesSearch && matchesBook;
  });

  const exportQuoteAsText = (a: Annotation) => {
    const book = getBook(a.book_id);
    const text = `"${a.selected_text}"\n\n— ${book?.title || "Unknown"}${book?.author ? ` by ${book.author}` : ""}\nPage ${a.page_number}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Quote copied to clipboard" });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Quote className="w-6 h-6 text-primary" /> Highlights & Quotes
            </h1>
            <p className="text-muted-foreground">Your favorite passages from books</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search quotes..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
          <Select value={filterBook} onValueChange={setFilterBook}>
            <SelectTrigger className="w-full sm:w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Books</SelectItem>
              {books.map(b => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <Quote className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {annotations.length === 0 ? "No highlights yet" : "No matching quotes"}
              </h3>
              <p className="text-muted-foreground">
                {annotations.length === 0 ? "Highlight text while reading to save your favorite passages" : "Try a different search or filter"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.map(a => {
              const book = getBook(a.book_id);
              return (
                <Card key={a.id} ref={cardRef} className="group hover:shadow-md transition-shadow overflow-hidden">
                  <div className="h-1" style={{ backgroundColor: a.highlight_color }} />
                  <CardContent className="pt-5">
                    <blockquote className="text-sm italic leading-relaxed border-l-2 border-primary/30 pl-4 mb-3">
                      "{a.selected_text}"
                    </blockquote>
                    {a.note && (
                      <p className="text-xs text-muted-foreground mb-3 bg-muted/50 p-2 rounded">
                        📝 {a.note}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <BookOpen className="w-3 h-3" />
                        <span className="font-medium">{book?.title || "Unknown"}</span>
                        <span>• p.{a.page_number}</span>
                      </div>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs" onClick={() => exportQuoteAsText(a)}>
                        <Download className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-6">
            {filtered.length} quote{filtered.length !== 1 ? "s" : ""} found
          </p>
        )}
      </main>
    </div>
  );
};

export default Quotes;
