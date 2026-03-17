import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const user = userData.user;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user's books for context
    const { data: books } = await supabaseClient
      .from("books")
      .select("title, author, series, is_completed, reading_progress")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    // Fetch user's reviews for taste profile
    const { data: reviews } = await supabaseClient
      .from("book_reviews")
      .select("rating, books(title, author)")
      .eq("user_id", user.id)
      .order("rating", { ascending: false })
      .limit(10);

    // Fetch existing recommendations to avoid duplicates
    const { data: existing } = await supabaseClient
      .from("book_recommendations")
      .select("recommended_title")
      .eq("user_id", user.id);

    const existingTitles = existing?.map(r => r.recommended_title.toLowerCase()) || [];
    const userBookTitles = books?.map(b => b.title.toLowerCase()) || [];
    const excludeTitles = [...existingTitles, ...userBookTitles];

    const bookList = books?.map(b => {
      const status = b.is_completed ? "completed" : `${b.reading_progress || 0}% read`;
      return `- "${b.title}"${b.author ? ` by ${b.author}` : ''}${b.series ? ` (${b.series})` : ''} [${status}]`;
    }).join("\n") || "No books yet";

    const reviewList = reviews?.map(r => {
      const book = (r as any).books;
      return `- "${book?.title}" rated ${r.rating}/5`;
    }).join("\n") || "No reviews yet";

    const prompt = `Based on this reader's library and preferences, recommend exactly 5 books they would enjoy. 

Their library:
${bookList}

Their top-rated books:
${reviewList}

Books to EXCLUDE (already recommended or owned): ${excludeTitles.join(", ")}

Return ONLY a valid JSON array with exactly 5 objects, each having:
- "title": string
- "author": string  
- "reason": string (1-2 sentences explaining why they'd enjoy this)
- "confidence": number between 0.6 and 0.95

Example format:
[{"title":"Book Name","author":"Author Name","reason":"Because you enjoyed X, you'll love this similar work.","confidence":0.85}]

Return ONLY the JSON array, no other text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a book recommendation engine. Always respond with valid JSON arrays only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      throw new Error("AI recommendation failed");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON, handling potential markdown code blocks
    let recommendations;
    try {
      const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
      recommendations = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse recommendations");
    }

    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      throw new Error("No recommendations generated");
    }

    // Insert into database
    const inserts = recommendations.slice(0, 5).map((rec: any) => ({
      user_id: user.id,
      recommended_title: rec.title,
      recommended_author: rec.author,
      reason: rec.reason,
      source_type: "ai_analysis",
      confidence_score: rec.confidence || 0.75,
    }));

    const { error: insertError } = await supabaseClient
      .from("book_recommendations")
      .insert(inserts);

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save recommendations");
    }

    return new Response(JSON.stringify({ success: true, count: inserts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("generate-recommendations error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
