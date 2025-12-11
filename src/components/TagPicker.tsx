import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TagPickerProps {
  bookId: string;
  userId: string;
}

interface TagType {
  id: string;
  name: string;
  color: string;
}

const TAG_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6366f1", "#64748b"
];

export const TagPicker = ({ bookId, userId }: TagPickerProps) => {
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [bookTags, setBookTags] = useState<TagType[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0]);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTags();
  }, [bookId, userId]);

  const fetchTags = async () => {
    // Fetch all user tags
    const { data: tags } = await supabase
      .from("tags")
      .select("*")
      .eq("user_id", userId);

    // Fetch tags for this book
    const { data: bookTagsData } = await supabase
      .from("book_tags")
      .select("tag_id, tags(*)")
      .eq("book_id", bookId);

    setAllTags(tags || []);
    setBookTags(
      bookTagsData?.map((bt: any) => bt.tags).filter(Boolean) || []
    );
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;

    const { data, error } = await supabase
      .from("tags")
      .insert({
        user_id: userId,
        name: newTagName.trim(),
        color: selectedColor,
      })
      .select()
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message.includes("duplicate")
          ? "Tag already exists"
          : "Failed to create tag",
      });
      return;
    }

    setAllTags([...allTags, data]);
    setNewTagName("");
    addTagToBook(data.id);
  };

  const addTagToBook = async (tagId: string) => {
    const { error } = await supabase
      .from("book_tags")
      .insert({ book_id: bookId, tag_id: tagId });

    if (error) {
      if (!error.message.includes("duplicate")) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to add tag",
        });
      }
      return;
    }

    const tag = allTags.find((t) => t.id === tagId);
    if (tag) {
      setBookTags([...bookTags, tag]);
    }
  };

  const removeTagFromBook = async (tagId: string) => {
    const { error } = await supabase
      .from("book_tags")
      .delete()
      .eq("book_id", bookId)
      .eq("tag_id", tagId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to remove tag",
      });
      return;
    }

    setBookTags(bookTags.filter((t) => t.id !== tagId));
  };

  const availableTags = allTags.filter(
    (t) => !bookTags.find((bt) => bt.id === t.id)
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {bookTags.map((tag) => (
          <Badge
            key={tag.id}
            style={{ backgroundColor: tag.color }}
            className="text-white gap-1 pr-1"
          >
            {tag.name}
            <button
              onClick={() => removeTagFromBook(tag.id)}
              className="ml-1 hover:bg-white/20 rounded p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 gap-1 text-xs">
              <Tag className="w-3 h-3" />
              Add Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-3">
              {availableTags.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    Existing tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {availableTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{ backgroundColor: tag.color }}
                        className="text-white cursor-pointer hover:opacity-80"
                        onClick={() => {
                          addTagToBook(tag.id);
                          setOpen(false);
                        }}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Create new tag</p>
                <Input
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => e.key === "Enter" && createTag()}
                />
                <div className="flex flex-wrap gap-1">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        selectedColor === color
                          ? "ring-2 ring-offset-2 ring-primary scale-110"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={createTag}
                  disabled={!newTagName.trim()}
                  className="w-full"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Create & Add
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
