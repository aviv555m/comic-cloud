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
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });
    
    if (!fileResponse.ok) {
      console.error(`Failed to download from ${url}: ${fileResponse.status} ${fileResponse.statusText}`);
      throw new Error(`Failed to download file: ${fileResponse.statusText} (${fileResponse.status})`);
    }

    const contentType = fileResponse.headers.get("content-type") || "";
    const contentDisposition = fileResponse.headers.get("content-disposition") || "";
    const arrayBuffer = await fileResponse.arrayBuffer();
    
    // Check if we got HTML instead of a book file (common error)
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 100));
    const textStart = new TextDecoder().decode(firstBytes).toLowerCase();
    if (textStart.includes('<!doctype') || textStart.includes('<html')) {
      throw new Error("Received HTML page instead of book file. The download link may be invalid.");
    }

    const fileBlob = new Blob([arrayBuffer]);

    // Determine file type from URL, content-type, and content-disposition
    let fileType = "epub";
    let extension = "epub";
    const lowerUrl = url.toLowerCase();
    
    // Try to get filename from content-disposition
    let filename = "";
    if (contentDisposition) {
      const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (match) {
        filename = match[1].replace(/['"]/g, '').toLowerCase();
      }
    }
    
    // Determine type from multiple sources
    if (contentType.includes("pdf") || lowerUrl.endsWith(".pdf") || filename.endsWith(".pdf")) {
      fileType = "pdf";
      extension = "pdf";
    } else if (contentType.includes("epub") || lowerUrl.endsWith(".epub") || filename.endsWith(".epub")) {
      fileType = "epub";
      extension = "epub";
    } else if (lowerUrl.endsWith(".cbz") || filename.endsWith(".cbz")) {
      fileType = "cbz";
      extension = "cbz";
    } else if (lowerUrl.endsWith(".cbr") || filename.endsWith(".cbr")) {
      fileType = "cbr";
      extension = "cbr";
    } else if (contentType.includes("zip") && lowerUrl.includes("epub")) {
      // Some servers return application/zip for epub
      fileType = "epub";
      extension = "epub";
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
    console.log("Uploading to storage:", filePath, "type:", fileType, "size:", arrayBuffer.byteLength);
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

    console.log("Download successful:", { fileType, size: arrayBuffer.byteLength });

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
