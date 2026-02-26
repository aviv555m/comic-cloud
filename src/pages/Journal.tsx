import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, PenLine, BookOpen, Trash2, Loader2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { User } from "@supabase/supabase-js";

const MOODS = [
  { value: "inspired", emoji: "✨", label: "Inspired" },
  { value: "thoughtful", emoji: "🤔", label: "Thoughtful" },
  { value: "excited", emoji: "🔥", label: "Excited" },
  { value: "calm", emoji: "😌", label: "Calm" },
  { value: "confused", emoji: "😕", label: "Confused" },
  { value: "emotional", emoji: "😢", label: "Emotional" },
  { value: "motivated", emoji: "💪", label: "Motivated" },
  { value: "nostalgic", emoji: "🌅", label: "Nostalgic" },
];

interface JournalEntry {
  id: string;
  title: string | null;
  content: string;
  mood: string | null;
  entry_date: string;
  book_id: string | null;
  created_at: string;
}

interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
}

const Journal = () => {
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mood, setMood] = useState<string>("");
  const [bookId, setBookId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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
    const [entriesRes, booksRes] = await Promise.all([
      supabase.from("journal_entries").select("*").eq("user_id", userId).order("entry_date", { ascending: false }),
      supabase.from("books").select("id, title, author, cover_url").eq("user_id", userId).order("title"),
    ]);
    if (entriesRes.data) setEntries(entriesRes.data);
    if (booksRes.data) setBooks(booksRes.data);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !content.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("journal_entries").insert({
      user_id: user.id,
      title: title.trim() || null,
      content: content.trim(),
      mood: mood || null,
      book_id: bookId || null,
    });
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to save entry" });
    } else {
      toast({ title: "Saved!", description: "Journal entry added" });
      setTitle(""); setContent(""); setMood(""); setBookId("");
      setDialogOpen(false);
      fetchData(user.id);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await supabase.from("journal_entries").delete().eq("id", id);
    setEntries(entries.filter(e => e.id !== id));
    toast({ title: "Deleted", description: "Journal entry removed" });
  };

  const getMoodEmoji = (m: string | null) => MOODS.find(x => x.value === m)?.emoji || "";
  const getBook = (id: string | null) => books.find(b => b.id === id);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <PenLine className="w-6 h-6 text-primary" /> Reading Journal
              </h1>
              <p className="text-muted-foreground">Reflect on your reading journey</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> New Entry</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>New Journal Entry</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)} />
                <Textarea placeholder="Write your thoughts..." value={content} onChange={e => setContent(e.target.value)} rows={6} />
                <div className="flex flex-wrap gap-2">
                  {MOODS.map(m => (
                    <button
                      key={m.value}
                      onClick={() => setMood(mood === m.value ? "" : m.value)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${mood === m.value ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border hover:bg-accent/20"}`}
                    >
                      {m.emoji} {m.label}
                    </button>
                  ))}
                </div>
                <Select value={bookId} onValueChange={setBookId}>
                  <SelectTrigger><SelectValue placeholder="Link to a book (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No book</SelectItem>
                    {books.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSave} disabled={!content.trim() || saving} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Save Entry
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <Card className="text-center py-16">
            <CardContent>
              <PenLine className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No journal entries yet</h3>
              <p className="text-muted-foreground mb-4">Start writing about your reading experiences</p>
              <Button onClick={() => setDialogOpen(true)}>Write your first entry</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 md:left-8 top-0 bottom-0 w-0.5 bg-border" />
            <div className="space-y-6">
              {entries.map(entry => {
                const book = getBook(entry.book_id);
                return (
                  <div key={entry.id} className="relative pl-10 md:pl-16">
                    {/* Timeline dot */}
                    <div className="absolute left-2.5 md:left-6.5 top-6 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                    <Card className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {getMoodEmoji(entry.mood)} {entry.title || "Untitled Entry"}
                            </CardTitle>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(entry.entry_date), "MMMM d, yyyy")}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(entry.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{entry.content}</p>
                        {book && (
                          <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-muted/50">
                            <BookOpen className="w-4 h-4 text-primary shrink-0" />
                            <span className="text-xs font-medium truncate">{book.title}</span>
                            {book.author && <span className="text-xs text-muted-foreground">by {book.author}</span>}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Journal;
