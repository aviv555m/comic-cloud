import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId } = await req.json();
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get book details
    const { data: book, error: bookError } = await supabaseClient
      .from('books')
      .select('*')
      .eq('id', bookId)
      .single();

    if (bookError) throw bookError;

    // Check if cover already exists
    if (book.cover_url) {
      return new Response(
        JSON.stringify({ success: true, coverUrl: book.cover_url }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate cover using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const prompt = `Create a professional book cover for "${book.title}"${
      book.author ? ` by ${book.author}` : ''
    }${book.series ? ` from the series ${book.series}` : ''}. 
    The cover should be visually striking with a modern design, suitable for the genre. 
    Include elegant typography and atmospheric imagery. Aspect ratio 2:3 (portrait book cover).`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`Failed to generate cover: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error('No image generated');
    }

    // Convert base64 to blob
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Upload to storage
    const fileName = `${book.user_id}/${bookId}_cover.png`;
    const { error: uploadError } = await supabaseClient.storage
      .from('book-covers')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('book-covers')
      .getPublicUrl(fileName);

    // Update book with cover URL
    const { error: updateError } = await supabaseClient
      .from('books')
      .update({ cover_url: publicUrl })
      .eq('id', bookId);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ success: true, coverUrl: publicUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
