import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useExistingSeries = (userId: string | undefined) => {
  const [series, setSeries] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSeries = async () => {
      if (!userId) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('books')
          .select('series')
          .eq('user_id', userId)
          .not('series', 'is', null)
          .neq('series', '');

        if (error) throw error;

        // Get unique series names
        const uniqueSeries = [...new Set(data?.map(b => b.series).filter(Boolean))] as string[];
        setSeries(uniqueSeries.sort());
      } catch (error) {
        console.error('Error fetching series:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSeries();
  }, [userId]);

  return { series, loading };
};
