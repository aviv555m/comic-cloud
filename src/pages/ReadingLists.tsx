import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Plus, List, Trash2, Edit2, BookOpen, ArrowLeft, ChevronRight } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface ReadingList {
  id: string;
  name: string;
  description: string | null;
  color: string;
  book_count?: number;
}

interface Book {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
}

const LIST_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#64748b"
];

const ReadingLists = () => {
  const [user, setUser] = useState<User | null>(null);
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editList, setEditList] = useState<ReadingList | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState(LIST_COLORS[0]);
  const [selectedList, setSelectedList] = useState<ReadingList | null>(null);
  const [listBooks, setListBooks] = useState<Book[]>([]);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchLists(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchLists = async (userId: string) => {
    setLoading(true);
    const { data: listsData } = await supabase
      .from("reading_lists")
      .select("*")
      .eq("user_id", userId)
      .order("position");

    if (listsData) {
      // Get book counts
      const listsWithCounts = await Promise.all(
        listsData.map(async (list) => {
          const { count } = await supabase
            .from("reading_list_books")
            .select("*", { count: "exact", head: true })
            .eq("list_id", list.id);
          return { ...list, book_count: count || 0 };
        })
      );
      setLists(listsWithCounts);
    }
    setLoading(false);
  };

  const createList = async () => {
    if (!user || !newName.trim()) return;

    const { error } = await supabase.from("reading_lists").insert({
      user_id: user.id,
      name: newName.trim(),
      description: newDescription.trim() || null,
      color: newColor,
      position: lists.length,
    });

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to create list" });
      return;
    }

    toast({ title: "List created" });
    setCreateOpen(false);
    resetForm();
    fetchLists(user.id);
  };

  const updateList = async () => {
    if (!user || !editList || !newName.trim()) return;

    const { error } = await supabase
      .from("reading_lists")
      .update({
        name: newName.trim(),
        description: newDescription.trim() || null,
        color: newColor,
      })
      .eq("id", editList.id);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to update list" });
      return;
    }

    toast({ title: "List updated" });
    setEditList(null);
    resetForm();
    fetchLists(user.id);
  };

  const deleteList = async (listId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from("reading_lists")
      .delete()
      .eq("id", listId);

    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete list" });
      return;
    }

    toast({ title: "List deleted" });
    setSelectedList(null);
    fetchLists(user.id);
  };

  const fetchListBooks = async (listId: string) => {
    const { data } = await supabase
      .from("reading_list_books")
      .select("book_id, books(*)")
      .eq("list_id", listId)
      .order("position");

    setListBooks(data?.map((item: any) => item.books).filter(Boolean) || []);
  };

  const openListDetails = (list: ReadingList) => {
    setSelectedList(list);
    fetchListBooks(list.id);
  };

  const openEditDialog = (list: ReadingList) => {
    setEditList(list);
    setNewName(list.name);
    setNewDescription(list.description || "");
    setNewColor(list.color);
  };

  const resetForm = () => {
    setNewName("");
    setNewDescription("");
    setNewColor(LIST_COLORS[0]);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation userEmail={user.email} />

      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Reading Lists</h1>
              <p className="text-muted-foreground">Organize your books into custom collections</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New List
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <BookOpen className="w-12 h-12 animate-pulse text-muted-foreground" />
          </div>
        ) : lists.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <List className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No reading lists yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first list to organize your books
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create List
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <Card
                key={list.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => openListDetails(list)}
              >
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: list.color }}
                  >
                    <List className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{list.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {list.book_count} {list.book_count === 1 ? "book" : "books"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardHeader>
                {list.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {list.description}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog
        open={createOpen || !!editList}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setEditList(null);
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editList ? "Edit List" : "Create Reading List"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g., Want to Read"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="What's this list for?"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex flex-wrap gap-2">
                {LIST_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={`w-8 h-8 rounded-full transition-transform ${
                      newColor === color ? "ring-2 ring-offset-2 ring-primary scale-110" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button
              onClick={editList ? updateList : createList}
              disabled={!newName.trim()}
              className="w-full"
            >
              {editList ? "Save Changes" : "Create List"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* List Details Dialog */}
      <Dialog open={!!selectedList} onOpenChange={(open) => !open && setSelectedList(null)}>
        <DialogContent className="max-w-2xl">
          {selectedList && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: selectedList.color }}
                  >
                    <List className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <DialogTitle>{selectedList.name}</DialogTitle>
                    {selectedList.description && (
                      <p className="text-sm text-muted-foreground">{selectedList.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(selectedList);
                        setSelectedList(null);
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => deleteList(selectedList.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="max-h-[400px]">
                {listBooks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No books in this list yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {listBooks.map((book) => (
                      <div
                        key={book.id}
                        className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted cursor-pointer"
                        onClick={() => navigate(`/reader/${book.id}`)}
                      >
                        {book.cover_url ? (
                          <img
                            src={book.cover_url}
                            alt={book.title}
                            className="w-10 h-14 object-cover rounded"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{book.title}</p>
                          {book.author && (
                            <p className="text-sm text-muted-foreground">{book.author}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ReadingLists;
