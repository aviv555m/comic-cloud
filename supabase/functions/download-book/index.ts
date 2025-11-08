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
    const { url, userId } = await req.json();
    
    if (!url || !userId) {
      throw new Error("URL and userId are required");
    }

    console.log("Downloading book from URL:", url);

    // Download the file with browser-like headers to avoid being blocked
    const fileResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      }
    });
    
    if (!fileResponse.ok) {
      console.error(`Failed to download from ${url}: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`Failed to download file: ${fileResponse.statusText} (${fileResponse.status}). The server may be blocking automated downloads or the file may require authentication.`);
    }

    const contentType = fileResponse.headers.get("content-type") || "";
    const arrayBuffer = await fileResponse.arrayBuffer();
    const fileBlob = new Blob([arrayBuffer]);

    // Determine file type
    let fileType = "pdf";
    let extension = "pdf";
    
    if (contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      fileType = "pdf";
      extension = "pdf";
    } else if (contentType.includes("epub") || url.toLowerCase().endsWith(".epub")) {
      fileType = "epub";
      extension = "epub";
    } else if (url.toLowerCase().endsWith(".cbz")) {
      fileType = "cbz";
      extension = "cbz";
    } else if (url.toLowerCase().endsWith(".cbr")) {
      fileType = "cbr";
      extension = "cbr";
    } else if (contentType.includes("text") || url.toLowerCase().endsWith(".txt")) {
      fileType = "txt";
      extension = "txt";
    }

    // Generate filename
    const timestamp = Date.now();
    const fileName = `${timestamp}.${extension}`;
    const filePath = `${userId}/${fileName}`;

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upload to Supabase Storage
    console.log("Uploading to storage:", filePath);
    const { error: uploadError } = await supabase.storage
      .from('book-files')
      .upload(filePath, fileBlob, {
        contentType: contentType || `application/${extension}`,
        upsert: false
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw uploadError;
    }

    // Get file URL
    const { data: { publicUrl } } = supabase.storage
      .from('book-files')
      .getPublicUrl(filePath);

    // Extract title from URL
    const urlParts = url.split('/');
    const lastPart = urlParts[urlParts.length - 1];
    const titleFromUrl = lastPart.split('.')[0].replace(/[_-]/g, ' ');

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: publicUrl,
        fileName,
        fileType,
        title: titleFromUrl,
        fileSize: arrayBuffer.byteLength
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error("Download error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
