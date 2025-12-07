import { WifiOff, Wifi } from "lucide-react";
import { useOfflineBooks } from "@/hooks/useOfflineBooks";
import { Badge } from "@/components/ui/badge";

export const OfflineIndicator = () => {
  const { isOnline } = useOfflineBooks();

  if (isOnline) return null;

  return (
    <Badge 
      variant="secondary" 
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 bg-amber-500/90 text-white border-0 shadow-lg animate-pulse"
    >
      <WifiOff className="w-4 h-4" />
      Offline Mode
    </Badge>
  );
};
