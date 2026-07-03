import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Trash2, Edit2, AlertTriangle } from "lucide-react";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { parseStorageReference } from "@/lib/storage-paths";

interface CollectionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectionName: string;
  isManga: boolean;
  onSuccess: () => void;
}

export const CollectionEditDialog = ({ open, onOpenChange, collectionName, isManga, onSuccess }: CollectionEditDialogProps) => {
  const [newName, setNewName] = useState(collectionName);
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { removeBookOffline } = useOfflineBooks();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverFile(file);
      setCoverPreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      // If name changed, update all books in the collection
      if (newName.trim() !== collectionName) {
        if (isManga) {
          const { error } = await supabase
            .from('books')
            .update({ title: newName.trim() })
            .eq('file_type', 'manga')
            .eq('title', collectionName);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('books')
            .update({ series: newName.trim() })
            .eq('series', collectionName);
          if (error) throw error;
        }
      }

      // If new cover, upload it and update all books in the collection
      if (coverFile) {
        const fileExt = coverFile.name.split('.').pop();
        const fileName = `collections/${crypto.randomUUID()}.${fileExt || 'jpg'}`;

        const { error: uploadError } = await supabase.storage
          .from('book-covers')
          .upload(fileName, coverFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: coverData } = supabase.storage
          .from('book-covers')
          .getPublicUrl(fileName);
        const coverUrl = coverData.publicUrl;

        if (isManga) {
          const { error } = await supabase
            .from('books')
            .update({ cover_url: coverUrl })
            .eq('file_type', 'manga')
            .eq('title', collectionName);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('books')
            .update({ cover_url: coverUrl })
            .eq('series', collectionName);
          if (error) throw error;
        }
      }

      toast({ title: "Collection updated successfully" });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Failed to update collection",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOnlyCollection = async () => {
    if (isManga) {
      toast({
        variant: "destructive",
        title: "Cannot disband manga",
        description: "Manga series are based on the book title. You can only delete the books."
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('books')
        .update({ series: null })
        .eq('series', collectionName);
        
      if (error) throw error;
      
      toast({ title: "Collection disbanded", description: "Books are now standalone." });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm(`Are you absolutely sure you want to delete the collection "${collectionName}" AND all books inside it? This cannot be undone.`)) {
      return;
    }
    
    setLoading(true);
    try {
      // First, get all books to delete their files
      const query = supabase.from('books').select('*');
      if (isManga) {
        query.eq('file_type', 'manga').eq('title', collectionName);
      } else {
        query.eq('series', collectionName);
      }
      
      const { data: booksToDelete } = await query;
      
      if (booksToDelete && booksToDelete.length > 0) {
        for (const book of booksToDelete) {
          // Remove offline
          try {
            await removeBookOffline(book.id);
          } catch (e) {}

          // Remove file
          const fileRef = parseStorageReference(book.file_url, 'book-files');
          if (fileRef) {
            await supabase.storage.from('book-files').remove([fileRef.relativePath]);
          }

          // Remove cover
          const coverRef = parseStorageReference(book.cover_url, 'book-covers');
          if (coverRef) {
            await supabase.storage.from('book-covers').remove([coverRef.relativePath]);
          }
        }
      }

      // Finally, delete the database records
      const deleteQuery = supabase.from('books').delete();
      if (isManga) {
        deleteQuery.eq('file_type', 'manga').eq('title', collectionName);
      } else {
        deleteQuery.eq('series', collectionName);
      }
      
      const { error } = await deleteQuery;
      if (error) throw error;
      
      toast({ title: "Collection and books deleted" });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
      toast({ variant: "destructive", title: "Error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-white/10" onClick={e => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-5 h-5 text-violet-500" />
            Edit Collection
          </DialogTitle>
          <DialogDescription>
            Update the details for "{collectionName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Collection Name</Label>
            <Input 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)} 
              placeholder="Collection name..."
              className="bg-muted/50 border-white/10"
            />
          </div>

          <div className="space-y-2">
            <Label>Cover Image (Updates all books in collection)</Label>
            <div className="flex items-center gap-4">
              {coverPreview ? (
                <div className="relative w-16 h-24 rounded overflow-hidden">
                  <img src={coverPreview} alt="Preview" className="object-cover w-full h-full" />
                </div>
              ) : (
                <div className="w-16 h-24 rounded bg-muted/50 border border-dashed border-white/20 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="border-t border-white/10 pt-4 mt-4 space-y-3">
            <Label className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Danger Zone
            </Label>
            
            {!isManga && (
              <Button 
                variant="outline" 
                className="w-full text-orange-500 border-orange-500/30 hover:bg-orange-500/10"
                onClick={handleDeleteOnlyCollection}
                disabled={loading}
              >
                Disband Collection (Keep Books)
              </Button>
            )}
            
            <Button 
              variant="destructive" 
              className="w-full"
              onClick={handleDeleteAll}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Collection & ALL Books
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
