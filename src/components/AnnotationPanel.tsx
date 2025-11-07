import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Edit2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Annotation {
  id: string;
  page_number: number;
  selected_text: string;
  note: string | null;
  highlight_color: string;
  created_at: string;
}

interface AnnotationPanelProps {
  bookId: string;
  currentPage: number;
  onClose: () => void;
}

export const AnnotationPanel = ({ bookId, currentPage, onClose }: AnnotationPanelProps) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchAnnotations();
  }, [bookId]);

  const fetchAnnotations = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("annotations")
      .select("*")
      .eq("book_id", bookId)
      .eq("user_id", user.id)
      .order("page_number", { ascending: true });

    if (!error && data) {
      setAnnotations(data);
    }
  };

  const deleteAnnotation = async (id: string) => {
    const { error } = await supabase
      .from("annotations")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete annotation",
      });
    } else {
      setAnnotations(prev => prev.filter(a => a.id !== id));
      toast({
        title: "Success",
        description: "Annotation deleted",
      });
    }
  };

  const updateAnnotation = async (id: string, note: string) => {
    const { error } = await supabase
      .from("annotations")
      .update({ note })
      .eq("id", id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update annotation",
      });
    } else {
      setAnnotations(prev => prev.map(a => 
        a.id === id ? { ...a, note } : a
      ));
      setEditingId(null);
      toast({
        title: "Success",
        description: "Annotation updated",
      });
    }
  };

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-card border-l shadow-lg z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Annotations</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        {annotations.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No annotations yet</p>
            <p className="text-xs mt-1">Select text to create highlights and notes</p>
          </div>
        ) : (
          <div className="space-y-4">
            {annotations.map((annotation) => (
              <div
                key={annotation.id}
                className={`p-3 rounded-lg border ${
                  annotation.page_number === currentPage ? "border-primary" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span className="text-xs font-medium">Page {annotation.page_number}</span>
                  <div className="flex gap-1">
                    {editingId === annotation.id ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateAnnotation(annotation.id, editNote)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(annotation.id);
                          setEditNote(annotation.note || "");
                        }}
                      >
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAnnotation(annotation.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div 
                  className="text-sm p-2 rounded mb-2"
                  style={{ backgroundColor: annotation.highlight_color + "40" }}
                >
                  "{annotation.selected_text}"
                </div>

                {editingId === annotation.id ? (
                  <Textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Add a note..."
                    className="text-xs"
                    rows={3}
                  />
                ) : (
                  annotation.note && (
                    <p className="text-xs text-muted-foreground">{annotation.note}</p>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
