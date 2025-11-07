import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userBooks, readingStats, recentAnnotations } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build enhanced system prompt with user context
    let systemPrompt = `You are an AI book agent assistant with deep expertise in literature, reading analysis, and personalized recommendations. You can:
1. Provide intelligent book recommendations based on reading history and preferences
2. Summarize books, chapters, or specific sections
3. Discuss themes, characters, plot analysis, and literary techniques
4. Answer questions about books and literature
5. Help with reading goals and progress tracking
6. Analyze reading patterns and provide insights

Act as a personal reading assistant who understands the user's reading journey. Be conversational, insightful, and proactive in your suggestions.`;

    if (userBooks && userBooks.length > 0) {
      systemPrompt += `\n\n📚 User's Reading Library (${userBooks.length} books):\n`;
      userBooks.forEach((book: any) => {
        const progress = book.reading_progress ? ` (${book.reading_progress}% complete)` : '';
        const status = book.is_completed ? ' ✓' : '';
        systemPrompt += `- "${book.title}"${book.author ? ` by ${book.author}` : ''}${book.series ? ` (${book.series} series)` : ''}${progress}${status}\n`;
      });
    }

    if (readingStats) {
      systemPrompt += `\n\n📊 Reading Statistics:
- Total reading time: ${readingStats.totalTime} minutes
- Total pages read: ${readingStats.totalPages} pages
- Reading sessions: ${readingStats.sessionCount}
- Average reading speed: ${readingStats.totalPages > 0 ? Math.round((readingStats.totalPages / readingStats.totalTime) * 60) : 0} pages/hour`;
    }

    if (recentAnnotations && recentAnnotations.length > 0) {
      systemPrompt += `\n\n💭 Recent Highlights & Notes:`;
      recentAnnotations.forEach((annotation: any) => {
        systemPrompt += `\n- "${annotation.selected_text}"${annotation.note ? ` (Note: ${annotation.note})` : ''}`;
      });
    }

    systemPrompt += `\n\nUse this comprehensive context to provide highly personalized, context-aware recommendations and insights. Reference specific books they've read, their reading patterns, and their annotations when relevant.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Book chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
