import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Plus, List } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReadingList {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  userId: string;
}

const LIST_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#64748b"
];

export const AddToListDialog = ({
  open,
  onOpenChange,
  bookId,
  userId,
}: AddToListDialogProps) => {
  const [lists, setLists] = useState<ReadingList[]>([]);
  const [bookLists, setBookLists] = useState<string[]>([]);
  const [newListName, setNewListName] = useState("");
  const [selectedColor, setSelectedColor] = useState(LIST_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      fetchLists();
    }
  }, [open, bookId, userId]);

  const fetchLists = async () => {
    const { data: allLists } = await supabase
      .from("reading_lists")
      .select("*")
      .eq("user_id", userId)
      .order("position");

    const { data: bookListsData } = await supabase
      .from("reading_list_books")
      .select("list_id")
      .eq("book_id", bookId);

    setLists(allLists || []);
    setBookLists(bookListsData?.map((bl) => bl.list_id) || []);
  };

  const createList = async () => {
    if (!newListName.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("reading_lists")
      .insert({
        user_id: userId,
        name: newListName.trim(),
        color: selectedColor,
        position: lists.length,
      })
      .select()
      .single();

    setCreating(false);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create list",
      });
      return;
    }

    setLists([...lists, data]);
    setNewListName("");
    toggleBookInList(data.id);
  };

  const toggleBookInList = async (listId: string) => {
    const isInList = bookLists.includes(listId);

    if (isInList) {
      const { error } = await supabase
        .from("reading_list_books")
        .delete()
        .eq("book_id", bookId)
        .eq("list_id", listId);

      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to remove from list",
        });
        return;
      }

      setBookLists(bookLists.filter((id) => id !== listId));
      toast({ title: "Removed from list" });
    } else {
      const { error } = await supabase.from("reading_list_books").insert({
        book_id: bookId,
        list_id: listId,
      });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add to list",
        });
        return;
      }

      setBookLists([...bookLists, listId]);
      toast({ title: "Added to list" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Reading List</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {lists.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No lists yet. Create your first one below!
              </p>
            ) : (
              lists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => toggleBookInList(list.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: list.color }}
                  >
                    <List className="w-4 h-4 text-white" />
                  </div>
                  <span className="flex-1 font-medium">{list.name}</span>
                  {bookLists.includes(list.id) && (
                    <Check className="w-5 h-5 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Create new list</p>
          <Input
            placeholder="List name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createList()}
          />
          <div className="flex flex-wrap gap-2">
            {LIST_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(color)}
                className={`w-6 h-6 rounded-full transition-transform ${
                  selectedColor === color
                    ? "ring-2 ring-offset-2 ring-primary scale-110"
                    : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <Button
            onClick={createList}
            disabled={!newListName.trim() || creating}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create List
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
