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

    // Extract file path from URL
    const filePath = book.file_url.split('/book-files/')[1];
    
    // Get signed URL to download file
    const { data: urlData, error: urlError } = await supabaseClient.storage
      .from('book-files')
      .createSignedUrl(filePath, 300);

    if (urlError) throw urlError;

    // Download the file
    const response = await fetch(urlData.signedUrl);
    const arrayBuffer = await response.arrayBuffer();

    let metadata: any = {
      title: book.title,
      author: null,
      series: null,
    };

    // Basic metadata extraction based on file type
    if (book.file_type === 'pdf') {
      // For PDFs, we'd need a PDF parser library
      // For now, we'll use filename-based extraction
      const filename = filePath.split('/').pop()?.replace('.pdf', '') || '';
      metadata = extractFromFilename(filename);
    } else if (book.file_type === 'epub') {
      // For EPUB, we could parse the content.opf file
      // For simplicity, using filename extraction
      const filename = filePath.split('/').pop()?.replace('.epub', '') || '';
      metadata = extractFromFilename(filename);
    } else {
      const filename = filePath.split('/').pop() || '';
      metadata = extractFromFilename(filename);
    }

    // Only update metadata if the user didn't provide values
    // Preserve user-provided title, author, and series
    const updateData: any = {};
    
    // Only update if the current value is the auto-generated filename title
    // and the extracted metadata has a better value
    if (metadata.author && !book.author) {
      updateData.author = metadata.author;
    }
    if (metadata.series && !book.series) {
      updateData.series = metadata.series;
    }
    
    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseClient
        .from('books')
        .update(updateData)
        .eq('id', bookId);

      if (updateError) throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, metadata }),
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

function extractFromFilename(filename: string): any {
  // Common patterns for light novels and manga
  // Example: "So I'm a Spider, So What - Volume 05"
  // Example: "[Author] Series Name - Volume 01"
  
  let title = filename;
  let author = null;
  let series = null;

  // Extract author from brackets
  const authorMatch = filename.match(/^\[([^\]]+)\]/);
  if (authorMatch) {
    author = authorMatch[1].trim();
    filename = filename.replace(authorMatch[0], '').trim();
  }

  // Extract series and volume
  const volumeMatch = filename.match(/(.+?)(?:\s*-\s*)?(?:Volume|Vol\.?|Chapter|Ch\.?)\s*(\d+)/i);
  if (volumeMatch) {
    series = volumeMatch[1].trim();
    title = filename; // Keep full title with volume number
  } else {
    // If no volume pattern, treat as series name
    series = filename.trim();
  }

  return { title, author, series };
}
