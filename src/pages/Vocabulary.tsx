import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  BookOpen, 
  Search, 
  Trash2, 
  GraduationCap,
  Loader2,
  Volume2,
  RotateCcw,
  Check,
  X
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface VocabularyWord {
  id: string;
  word: string;
  definition: string | null;
  context: string | null;
  book_id: string | null;
  page_number: number | null;
  mastery_level: number | null;
  next_review_at: string | null;
  created_at: string;
}

const Vocabulary = () => {
  const [user, setUser] = useState<User | null>(null);
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showDefinition, setShowDefinition] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchVocabulary(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchVocabulary = async (userId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vocabulary")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setWords(data);
    }
    setLoading(false);
  };

  const deleteWord = async (id: string) => {
    const { error } = await supabase.from("vocabulary").delete().eq("id", id);
    if (error) {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete word" });
    } else {
      setWords(words.filter((w) => w.id !== id));
      toast({ title: "Word removed" });
    }
  };

  const updateMastery = async (id: string, correct: boolean) => {
    const word = words.find((w) => w.id === id);
    if (!word) return;

    const newLevel = correct
      ? Math.min((word.mastery_level || 0) + 1, 5)
      : Math.max((word.mastery_level || 0) - 1, 0);

    // Calculate next review based on mastery level (spaced repetition)
    const daysUntilReview = Math.pow(2, newLevel); // 1, 2, 4, 8, 16, 32 days
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + daysUntilReview);

    await supabase
      .from("vocabulary")
      .update({
        mastery_level: newLevel,
        next_review_at: nextReview.toISOString(),
      })
      .eq("id", id);

    setWords(words.map((w) =>
      w.id === id
        ? { ...w, mastery_level: newLevel, next_review_at: nextReview.toISOString() }
        : w
    ));

    // Move to next card
    if (currentCardIndex < reviewWords.length - 1) {
      setCurrentCardIndex(currentCardIndex + 1);
      setShowDefinition(false);
    } else {
      setFlashcardMode(false);
      toast({ title: "Review complete!", description: "Great job studying your vocabulary!" });
    }
  };

  const speakWord = (word: string) => {
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  };

  const filteredWords = words.filter((w) =>
    w.word.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const reviewWords = words.filter((w) => {
    if (!w.next_review_at) return true;
    return new Date(w.next_review_at) <= new Date();
  });

  const masteryLabels = ["New", "Learning", "Familiar", "Practiced", "Known", "Mastered"];
  const masteryColors = ["bg-gray-500", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-green-500", "bg-emerald-500"];

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
              <h1 className="text-2xl font-bold">Vocabulary</h1>
              <p className="text-muted-foreground">{words.length} words saved</p>
            </div>
          </div>
          {reviewWords.length > 0 && !flashcardMode && (
            <Button onClick={() => { setFlashcardMode(true); setCurrentCardIndex(0); setShowDefinition(false); }}>
              <GraduationCap className="w-4 h-4 mr-2" />
              Review ({reviewWords.length})
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : flashcardMode && reviewWords.length > 0 ? (
          // Flashcard mode
          <div className="max-w-lg mx-auto">
            <Card className="min-h-[300px] flex flex-col">
              <CardHeader className="text-center">
                <CardDescription>
                  Card {currentCardIndex + 1} of {reviewWords.length}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col items-center justify-center">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <h2 className="text-3xl font-bold">{reviewWords[currentCardIndex].word}</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => speakWord(reviewWords[currentCardIndex].word)}
                    >
                      <Volume2 className="w-5 h-5" />
                    </Button>
                  </div>

                  {showDefinition ? (
                    <div className="space-y-4">
                      <p className="text-lg">{reviewWords[currentCardIndex].definition || "No definition"}</p>
                      {reviewWords[currentCardIndex].context && (
                        <p className="text-sm text-muted-foreground italic">
                          "{reviewWords[currentCardIndex].context}"
                        </p>
                      )}
                      <div className="flex gap-4 justify-center pt-4">
                        <Button
                          variant="outline"
                          onClick={() => updateMastery(reviewWords[currentCardIndex].id, false)}
                          className="gap-2"
                        >
                          <X className="w-4 h-4" />
                          Didn't Know
                        </Button>
                        <Button
                          onClick={() => updateMastery(reviewWords[currentCardIndex].id, true)}
                          className="gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Got It
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setShowDefinition(true)}
                      className="mt-4"
                    >
                      Show Definition
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <Button
              variant="ghost"
              onClick={() => setFlashcardMode(false)}
              className="w-full mt-4"
            >
              Exit Review
            </Button>
          </div>
        ) : words.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No words saved yet</h3>
              <p className="text-muted-foreground">
                When reading, select text and choose "Add to Vocabulary" to save new words
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search words..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Word list */}
            <div className="grid gap-3">
              {filteredWords.map((word) => (
                <Card key={word.id}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{word.word}</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => speakWord(word.word)}
                          >
                            <Volume2 className="w-3 h-3" />
                          </Button>
                          <Badge
                            className={`${masteryColors[word.mastery_level || 0]} text-white text-xs`}
                          >
                            {masteryLabels[word.mastery_level || 0]}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{word.definition || "No definition"}</p>
                        {word.context && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            "{word.context}"
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteWord(word.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Vocabulary;
