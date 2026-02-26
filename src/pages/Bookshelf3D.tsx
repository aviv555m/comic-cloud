import { useState, useEffect, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BookCopy, Loader2 } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Text, RoundedBox } from "@react-three/drei";
import type { User } from "@supabase/supabase-js";

interface BookData {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  cover_url: string | null;
  is_completed: boolean | null;
}

// Single book spine
const BookSpine = ({ book, position }: { book: BookData; position: [number, number, number] }) => {
  const colors = [
    "#c2785c", "#8b6f47", "#4a6741", "#4a5568", "#6b4c6e",
    "#7c4e3c", "#2d5a7b", "#8b4513", "#556b2f", "#4e3b5e",
  ];
  const color = colors[book.title.charCodeAt(0) % colors.length];
  const height = 2.2 + (book.title.length % 5) * 0.15;

  return (
    <group position={position}>
      <RoundedBox args={[0.4, height, 1.6]} radius={0.02} position={[0, height / 2, 0]}>
        <meshStandardMaterial color={color} roughness={0.7} metalness={0.1} />
      </RoundedBox>
      <Text
        position={[0.21, height / 2, 0]}
        rotation={[0, Math.PI / 2, Math.PI / 2]}
        fontSize={0.12}
        color="white"
        maxWidth={1.4}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
      >
        {book.title.length > 20 ? book.title.substring(0, 18) + "…" : book.title}
      </Text>
    </group>
  );
};

// Single shelf
const Shelf = ({ books, yOffset, label }: { books: BookData[]; yOffset: number; label: string }) => {
  return (
    <group position={[0, yOffset, 0]}>
      {/* Shelf plank */}
      <RoundedBox args={[books.length * 0.5 + 1, 0.15, 2]} radius={0.02} position={[0, -0.08, 0]}>
        <meshStandardMaterial color="#8B6914" roughness={0.8} metalness={0.05} />
      </RoundedBox>
      {/* Label */}
      <Text
        position={[0, -0.35, 1.1]}
        fontSize={0.15}
        color="hsl(28, 80%, 52%)"
        anchorX="center"
      >
        {label}
      </Text>
      {/* Books */}
      {books.map((book, i) => (
        <BookSpine
          key={book.id}
          book={book}
          position={[(i - books.length / 2) * 0.5 + 0.25, 0, 0]}
        />
      ))}
    </group>
  );
};

const Scene = ({ books }: { books: BookData[] }) => {
  // Group by series or "Standalone"
  const groups: Record<string, BookData[]> = {};
  books.forEach(b => {
    const key = b.series || "Standalone";
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  const shelves = Object.entries(groups).slice(0, 5); // Max 5 shelves

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} castShadow />
      <pointLight position={[-3, 5, -2]} intensity={0.3} />

      {shelves.map(([label, shelfBooks], i) => (
        <Shelf key={label} books={shelfBooks.slice(0, 15)} yOffset={i * -3.2} label={label} />
      ))}

      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={20}
        target={[0, -(shelves.length - 1) * 1.6, 0]}
      />
    </>
  );
};

const Bookshelf3D = () => {
  const [user, setUser] = useState<User | null>(null);
  const [books, setBooks] = useState<BookData[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchBooks(session.user.id);
      } else {
        navigate("/auth");
      }
    });
  }, [navigate]);

  const fetchBooks = async (userId: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("books")
      .select("id, title, author, series, cover_url, is_completed")
      .eq("user_id", userId)
      .order("series")
      .limit(75);
    if (data) setBooks(data);
    setLoading(false);
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
              <BookCopy className="w-6 h-6 text-primary" /> 3D Bookshelf
            </h1>
            <p className="text-muted-foreground">Your library in 3D — drag to rotate, scroll to zoom</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <BookCopy className="w-12 h-12 mx-auto mb-4" />
            <p>No books in your library yet. Upload some books first!</p>
          </div>
        ) : (
          <div className="w-full h-[70vh] rounded-xl border bg-gradient-to-b from-muted/30 to-muted/10 overflow-hidden">
            <Canvas camera={{ position: [0, 2, 8], fov: 50 }}>
              <Suspense fallback={null}>
                <Scene books={books} />
              </Suspense>
            </Canvas>
          </div>
        )}
      </main>
    </div>
  );
};

export default Bookshelf3D;
